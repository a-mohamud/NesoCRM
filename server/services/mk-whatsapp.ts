import type { App } from '../core/app.js';
import { bad } from '../core/http.js';
import type { TemplateInfo } from './meta.js';
import { tApp } from '../i18n/index.js';

/**
 * WhatsApp template campaigns: a campaign on the "whatsapp" channel sends one approved Meta template to its audience (outside the
 * 24-hour window only templates may be sent). The template's category decides the rules: MARKETING is advertising and needs a valid
 * WhatsApp consent of every contact (the send gate), UTILITY is a service message and does not, AUTHENTICATION (one-time codes) is
 * never sent as a campaign. Values for the template's placeholders may contain merge fields ({{contact.first_name|du}}).
 */

export interface WaTemplateCfg {
  name: string;
  language: string;
  /** Read from Meta when the campaign is checked; never taken from the browser. */
  category?: string;
  values: Record<string, string>;
}

const KEY = /^(header|body|button)\.[\w.]{1,60}$/;

export const isMarketing = (cfg: Pick<WaTemplateCfg, 'category'> | null | undefined) => String(cfg?.category ?? 'MARKETING').toUpperCase() === 'MARKETING';

/** The setting from the browser, cleaned. `null` removes it. */
export function cleanWaTemplate(input: unknown): WaTemplateCfg | null {
  if (input === null || input === undefined || input === false) return null;
  if (typeof input !== 'object') throw bad('WhatsApp-Vorlage: ungültige Angaben');
  const o = input as Record<string, any>;
  const name = String(o.name ?? '').trim().slice(0, 512);
  if (!name) throw bad('WhatsApp-Vorlage: Name fehlt');
  const values: Record<string, string> = {};
  if (o.values && typeof o.values === 'object') {
    for (const [k, v] of Object.entries(o.values as Record<string, unknown>).slice(0, 30)) {
      if (!KEY.test(k)) continue;
      values[k] = String(v ?? '').slice(0, 1024);
    }
  }
  return { name, language: String(o.language ?? '').trim().slice(0, 20), values };
}

/**
 * Checks the template against the approved ones of the sub-account (Meta) and returns the setting with the real category.
 * Throws a German error for everything that would fail on the way: not connected, unknown or unapproved template, missing values.
 */
export async function resolveWaTemplate(app: App, locationId: string, cfg: WaTemplateCfg | null): Promise<WaTemplateCfg & { category: string; info: TemplateInfo }> {
  if (!cfg) throw bad('WhatsApp-Vorlage fehlt');
  const t = tApp();
  const list: ((loc: string, fresh?: boolean) => Promise<TemplateInfo[]>) | undefined = app.services.metaTemplates;
  if (!list) throw bad('WhatsApp ist nicht eingerichtet (Einstellungen → Kanäle)');
  const find = (l: TemplateInfo[]) => l.find((x) => x.name === cfg.name && (!cfg.language || x.language === cfg.language));
  const info = find(await list(locationId)) ?? find(await list(locationId, true));
  if (!info) throw bad(t('WhatsApp-Vorlage „{name}“{lang} nicht gefunden oder noch nicht freigegeben', { name: cfg.name, lang: cfg.language ? ` (${cfg.language})` : '' }));
  if (!info.supported) throw bad(t('WhatsApp-Vorlage „{name}“: {reason}', { name: cfg.name, reason: info.reason ? t(info.reason) : t('wird hier nicht unterstützt') }));
  const category = String(info.category ?? '').toUpperCase();
  if (category === 'AUTHENTICATION') throw bad('Authentifizierungs-Vorlagen (Einmalcodes) lassen sich nicht als Kampagne senden');
  for (const s of info.slots) {
    const v = String(cfg.values[s.key] ?? '').trim();
    if (!v) throw bad(t('WhatsApp-Vorlage: bitte „{field}“ ausfüllen', { field: t(s.label) }));
    if (s.kind !== 'text' && !v.includes('{{') && !/^https:\/\/\S+$/.test(v)) throw bad(t('WhatsApp-Vorlage: „{field}“ muss ein https-Link sein', { field: t(s.label) }));
  }
  return { ...cfg, language: info.language, category, info };
}
