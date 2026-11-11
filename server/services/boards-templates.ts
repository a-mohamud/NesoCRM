/**
 * Living Boards: templates. Config only – a template is a list of widgets (type, title, config, desktop cell), a name,
 * a symbol and an accent; never code. Five starter boards ship with the app; people can save their own boards as
 * templates for the sub-account and – admins – publish them in the Marktplatz. Anything that comes from outside the
 * sub-account is installed through the normal patch engine (so unknown types, bad config and non-allowed addresses
 * are refused exactly as for any other change) and without the ids of the sub-account it was made in.
 */

import { createHash } from 'node:crypto';
import { cleanAccent, cleanIcon, cleanLine, emptySpec, LIMITS, type BoardState } from './boards-model.js';
import { applyPatch, type Op, type PatchEnv } from './boards-patch.js';
import { cleanConfig, type WidgetRegistry } from './boards-widgets.js';
import { KPI_PRESETS, CHART_PRESETS } from './boards-presets.js';
import { tApp, translator, type STFn } from '../i18n/index.js';

export interface TemplateWidget {
  type: string;
  title?: string;
  config?: Record<string, unknown>;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface TemplateSpec {
  widgets: TemplateWidget[];
}
export interface Starter {
  key: string;
  name: string;
  description: string;
  icon: string;
  accent: string;
  widgets: TemplateWidget[];
}

export const TEMPLATE_CATEGORIES: [string, string][] = [
  ['vertrieb', 'Vertrieb'],
  ['service', 'Service'],
  ['projekte', 'Projekte'],
  ['marketing', 'Marketing'],
  ['agentur', 'Agentur'],
  ['sonstiges', 'Sonstiges'],
];

const w = (type: string, x: number, y: number, ww: number, h: number, config: Record<string, unknown> = {}, title = ''): TemplateWidget => ({ type, x, y, w: ww, h, config, ...(title ? { title } : {}) });
const kpi = (preset: string, x: number, extra: Record<string, unknown> = {}) => w('kpi', x, 0, 3, 2, { preset, ...extra });

export const STARTERS: Starter[] = [
  {
    key: 'solo-cockpit',
    name: 'Solo-Cockpit',
    description: 'Alles für den Tag auf einen Blick: Kennzahlen, deine Aufgaben, Termine, Posteingang und Schnellaktionen.',
    icon: 'house',
    accent: 'blau',
    widgets: [
      kpi('open_pipeline_value', 0),
      kpi('new_contacts', 3),
      kpi('open_tasks', 6),
      kpi('paid_revenue', 9),
      w('tasks', 0, 2, 4, 4, { due: 'today_overdue', mine: true }, 'Meine Aufgaben heute'),
      w('agenda', 4, 2, 4, 4, { days: 7 }),
      w('inbox', 8, 2, 4, 4, { limit: 6 }),
      w('chart', 0, 6, 6, 4, { preset: 'revenue_by_month' }),
      w('actions', 6, 6, 6, 2, { actions: [{ label: 'Neue Aufgabe', kind: 'task' }, { label: 'Neuer Kontakt', kind: 'contact' }, { label: 'Kalender', kind: 'page', page: 'calendars' }, { label: 'Rechnungen', kind: 'page', page: 'invoices' }] }, 'Schnellaktionen'),
      w('notes', 6, 8, 6, 2, { text: ['**Heute im Fokus**', '', '- Wichtigstes Gespräch führen', '- Offene Angebote nachfassen', '- Eine Sache abschließen, die seit Tagen liegt'].join('\n') }, 'Heute im Fokus'),
    ],
  },
  {
    key: 'vertrieb',
    name: 'Vertrieb',
    description: 'Pipeline, Prognose, Win-Rate und die Deals, die Aufmerksamkeit brauchen.',
    icon: 'deal',
    accent: 'grün', // i18n-ignore (accent code)
    widgets: [
      kpi('open_pipeline_value', 0),
      kpi('pipeline_forecast', 3),
      kpi('win_rate', 6),
      kpi('won_revenue', 9),
      w('pipeline', 0, 2, 12, 5, { status: 'open', cards: 3 }),
      w('list', 0, 7, 6, 4, { entity: 'deals', status: 'open', stale_days: 14, sort: 'oldest', limit: 8 }, 'Deals, die liegen bleiben'),
      w('chart', 6, 7, 6, 4, { preset: 'won_by_month' }),
      w('tasks', 0, 11, 6, 4, { due: 'today_overdue', mine: true }, 'Meine Aufgaben'),
      w('list', 6, 11, 6, 4, { entity: 'deals', status: 'open', min_value: 5000, sort: 'value', limit: 8 }, 'Große offene Deals'),
    ],
  },
  {
    key: 'agentur',
    name: 'Agentur-Übersicht',
    description: 'Kunden, Umsatz und Auslastung im Blick: Kontakte, Rechnungen, Abos, Tickets und die neuesten Gespräche.',
    icon: 'company',
    accent: 'violett',
    widgets: [kpi('new_contacts', 0), kpi('open_invoices', 3), kpi('mrr', 6), kpi('tickets_open', 9), w('chart', 0, 2, 6, 4, { preset: 'revenue_by_month' }), w('chart', 6, 2, 6, 4, { preset: 'leads_by_source', viz: 'donut' }), w('list', 0, 6, 6, 4, { entity: 'deals', status: 'open', sort: 'recent', limit: 8 }, 'Aktuelle Deals'), w('inbox', 6, 6, 6, 4, { limit: 7 }), w('tasks', 0, 10, 6, 4, { due: 'overdue', mine: false }, 'Überfällige Aufgaben im Team'), w('list', 6, 10, 6, 4, { entity: 'tickets', ticket_state: 'open', sort: 'priority', limit: 8 })],
  },
  {
    key: 'service',
    name: 'Service',
    description: 'Tickets, Fristen und Zufriedenheit: was offen ist, was brennt und wie es läuft.',
    icon: 'ticket',
    accent: 'orange',
    widgets: [kpi('tickets_open', 0), kpi('ticket_sla', 3), kpi('csat', 6), kpi('unread_conversations', 9), w('list', 0, 2, 6, 5, { entity: 'tickets', ticket_state: 'open', sort: 'priority', limit: 10 }, 'Offene Tickets'), w('chart', 6, 2, 6, 5, { preset: 'tickets_by_week' }), w('inbox', 0, 7, 6, 4, { limit: 6, only_unread: true }), w('chart', 6, 7, 3, 4, { preset: 'tickets_by_kind' }), w('notes', 9, 7, 3, 4, { text: ['**Regeln für dringende Tickets**', '', '1. Innerhalb einer Stunde antworten', '2. Bei Ausfall: Team informieren', '3. Nach der Lösung nachfragen'].join('\n') }, 'Eskalation')],
  },
  {
    key: 'projekte',
    name: 'Projekte',
    description: 'Aufgaben, Termine und Fristen der Projektplanung – wer hat was, was ist überfällig.',
    icon: 'project',
    accent: 'türkis', // i18n-ignore (accent code)
    widgets: [kpi('open_tasks', 0), kpi('overdue_tasks', 3), kpi('tasks_done', 6), kpi('appointments', 9), w('tasks', 0, 2, 6, 5, { due: 'week', mine: false, limit: 10 }, 'Fällig in den nächsten 7 Tagen'), w('chart', 6, 2, 6, 5, { preset: 'tasks_by_user' }), w('agenda', 0, 7, 6, 4, { days: 10 }), w('tasks', 6, 7, 6, 4, { due: 'today_overdue', mine: true }, 'Meine Aufgaben')],
  },
];

export const starterByKey = (key: string) => STARTERS.find((s) => s.key === key);

/**
 * A starter in a language: name, description, widget titles, button labels and the lines of its notes (the German texts
 * are the catalog keys). Boards made from it are records of the sub-account, so the caller passes the sub-account's translator.
 */
export function localizeStarter(s: Starter, t: STFn): Starter {
  const lines = (text: string) => text.split('\n').map((l) => (l.trim() ? t(l) : l)).join('\n');
  return {
    ...s,
    name: t(s.name),
    description: t(s.description),
    widgets: s.widgets.map((x) => {
      const config = { ...(x.config ?? {}) };
      if (x.type === 'notes' && typeof config.text === 'string') config.text = lines(config.text);
      if (x.type === 'actions' && Array.isArray(config.actions)) config.actions = (config.actions as Record<string, unknown>[]).map((a) => ({ ...a, label: t(String(a.label ?? '')) }));
      return { ...x, config, ...(x.title ? { title: t(x.title) } : {}) };
    }),
  };
}

/** The state a new board gets from template widgets, through the patch engine (up to 25 widgets per round). */
export function stateFromTemplate(t: { name: string; icon: string; accent: string; widgets: TemplateWidget[] }, p: PatchEnv): { state: BoardState; errors: string[] } {
  let state: BoardState = { name: cleanLine(t.name, LIMITS.name) || tApp()('Neues Board'), icon: cleanIcon(t.icon), accent: cleanAccent(t.accent) ?? '', spec: emptySpec() };
  const errors: string[] = [];
  const ops: Op[] = t.widgets.slice(0, LIMITS.widgets).map((x) => ({ op: 'add', type: x.type, ...(x.title ? { title: x.title } : {}), config: x.config ?? {}, x: x.x, y: x.y, w: x.w, h: x.h }));
  for (let i = 0; i < ops.length; i += LIMITS.ops) {
    const r = applyPatch(state, ops.slice(i, i + LIMITS.ops), { ...p, strict: p.strict ?? false });
    if (!r.ok) {
      errors.push(...r.errors);
      break;
    }
    state = r.state;
  }
  return { state, errors };
}

/** Template widgets from a board: desktop cells, config without the ids of this sub-account. */
export function templateFromState(state: BoardState, reg: WidgetRegistry, tr: STFn = tApp()): { widgets: TemplateWidget[]; stripped: string[] } {
  const stripped: string[] = [];
  const widgets = state.spec.widgets.map((wd) => {
    const def = reg.get(wd.type);
    const config: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(wd.config)) {
      const f = def?.fields.find((x) => x.key === k);
      if (f?.local) {
        if (v) stripped.push(`${def?.label ? tr(def.label) : wd.type}: ${tr(f.label)}`);
        continue;
      }
      config[k] = v;
    }
    const { x, y, w: ww, h } = wd.layout.lg;
    return { type: wd.type, ...(wd.title ? { title: wd.title } : {}), config, x, y, w: ww, h };
  });
  return { widgets, stripped };
}

export const integrityOf = (t: { name: string; icon: string; accent: string; widgets: TemplateWidget[] }) => createHash('sha256').update(JSON.stringify({ name: t.name, icon: t.icon, accent: t.accent, widgets: t.widgets })).digest('hex');

// --- review of a template before it is shared -----------------------------------------------------------------------------

/** What the report sources of kpi and chart presets belong to, in the person's words. */
const SOURCE_AREA: Record<string, string> = {
  contacts: 'Kontakte & Aufgaben',
  tasks: 'Kontakte & Aufgaben',
  opportunities: 'Opportunities',
  appointments: 'Kalender',
  messages: 'Konversationen',
  conversations: 'Konversationen',
  calls: 'Konversationen',
  invoices: 'Rechnungen & Produkte',
  invoice_items: 'Rechnungen & Produkte',
  subscriptions: 'Rechnungen & Produkte',
  form_submissions: 'Formulare',
  tickets: 'Service',
  csat_responses: 'Service',
};
const ENTITY_AREA: Record<string, string> = { deals: 'Opportunities', contacts: 'Kontakte & Aufgaben', tasks: 'Kontakte & Aufgaben', tickets: 'Service' };

export interface TemplateReview {
  verdict: 'ok' | 'warn' | 'fail';
  checks: { level: 'ok' | 'warn' | 'fail'; text: string }[];
  /** What the board reads (areas), the addresses it embeds and whether it has buttons – what an installer is asked to accept. */
  needs: { key: string; label: string }[];
  areas: string[];
  hosts: string[];
  actions: boolean;
  widgets: number;
}

/** Static review of a template: nothing to run, only config to look at. */
export function reviewTemplate(t: { widgets: TemplateWidget[] }, p: { reg: WidgetRegistry; env: PatchEnv['env']; hostOf: (url: string) => string | null; t?: STFn }): TemplateReview {
  const tr = translator(p.t?.locale);
  const checks: TemplateReview['checks'] = [];
  const areas = new Set<string>();
  const hosts = new Set<string>();
  let actions = false;
  let notes = 0;
  if (!t.widgets.length) checks.push({ level: 'fail', text: tr('Das Board hat keine Widgets.') });
  if (t.widgets.length > LIMITS.widgets) checks.push({ level: 'fail', text: tr('Höchstens {n} Widgets.', { n: LIMITS.widgets }) });
  for (const x of t.widgets) {
    const def = p.reg.get(x.type);
    if (!def) {
      checks.push({ level: 'fail', text: tr('Das Widget „{type}“ gibt es nicht.', { type: x.type }) });
      continue;
    }
    const cfg = cleanConfig(def, x.config ?? {}, { strict: true, where: `„${tr(def.label)}“` });
    for (const e of cfg.errors) checks.push({ level: 'fail', text: e });
    if (!cfg.errors.length) for (const e of def.validate?.(cfg.config, p.env) ?? []) checks.push({ level: 'fail', text: tr(e) });
    if (def.accessLabel) areas.add(def.accessLabel);
    if (def.type === 'kpi' || def.type === 'chart') {
      const preset = (def.type === 'kpi' ? KPI_PRESETS : CHART_PRESETS)[String(cfg.config.preset ?? '')];
      const source = (cfg.config.query as { source?: string } | null)?.source ?? preset?.query.source;
      if (source) areas.add(SOURCE_AREA[source] ?? source);
    }
    if (def.type === 'list') areas.add(ENTITY_AREA[String(cfg.config.entity)] ?? 'Daten des Sub-Accounts');
    if (def.type === 'embed' && cfg.config.url) {
      const h = p.hostOf(String(cfg.config.url));
      if (h) hosts.add(h);
    }
    if (def.type === 'actions' && Array.isArray(cfg.config.actions) && cfg.config.actions.length) actions = true;
    if (def.type === 'notes' && String(cfg.config.text ?? '').trim()) notes++;
    if (def.type === 'plugin' && cfg.config.ref) checks.push({ level: 'ok', text: tr('Nutzt das Plugin-Widget „{ref}“ – es muss beim Installieren schon vorhanden sein.', { ref: String(cfg.config.ref) }) });
  }
  if (notes) checks.push({ level: 'warn', text: tr.plural(notes, { one: '{n} Notiz mit Text wird mitveröffentlicht – bitte prüfe, dass keine Namen, Kontaktdaten oder internen Informationen darin stehen.', other: '{n} Notizen mit Text werden mitveröffentlicht – bitte prüfe, dass keine Namen, Kontaktdaten oder internen Informationen darin stehen.' }) });
  if (hosts.size) checks.push({ level: 'warn', text: tr('Bettet Seiten von {hosts} ein. Wer das Board installiert, sieht sie nur, wenn der Admin die Adresse freigegeben hat.', { hosts: [...hosts].join(', ') }) });
  if (actions) checks.push({ level: 'warn', text: tr('Enthält Schnellaktions-Knöpfe. Automationen und Formulare des Sub-Accounts, in dem das Board installiert wird, müssen neu zugeordnet werden.') });
  const verdict = checks.some((c) => c.level === 'fail') ? 'fail' : checks.some((c) => c.level === 'warn') ? 'warn' : 'ok';
  if (verdict === 'ok') checks.push({ level: 'ok', text: tr('Nur Konfiguration, kein Code. Die Zahlen und Listen holt sich jede Person mit ihren eigenen Rechten.') });
  const needs = [
    // the key stays German: it is what an installer's consent is compared with
    ...[...areas].sort().map((a) => ({ key: `area:${a}`, label: tr('Liest Daten aus „{area}“ (nur, was die Person selbst sehen darf)', { area: tr(a) }) })),
    ...[...hosts].sort().map((h) => ({ key: `host:${h}`, label: tr('Zeigt Seiten von {host}', { host: h }) })),
    ...(actions ? [{ key: 'actions', label: tr('Hat Schnellaktions-Knöpfe') }] : []),
  ];
  return { verdict, checks, needs, areas: [...areas].sort().map((a) => tr(a)), hosts: [...hosts].sort(), actions, widgets: t.widgets.length };
}

/** Cleans what comes in as a template (import, API): shapes and bounds only; the patch engine checks the rest at install. */
export function cleanTemplateInput(v: unknown): { widgets: TemplateWidget[]; errors: string[] } {
  const errors: string[] = [];
  if (!v || typeof v !== 'object' || !Array.isArray((v as any).widgets)) return { widgets: [], errors: ['widgets fehlt'] };
  const list = (v as any).widgets as unknown[];
  if (list.length > LIMITS.widgets) errors.push(tApp()('Höchstens {n} Widgets', { n: LIMITS.widgets }));
  const widgets: TemplateWidget[] = [];
  for (const x of list.slice(0, LIMITS.widgets)) {
    const o = x as Record<string, any>;
    if (!o || typeof o.type !== 'string' || !/^[a-z][a-z0-9_]{1,30}$/.test(o.type)) {
      errors.push('Ein Widget hat keinen gültigen Typ');
      continue;
    }
    const n = (k: string, d: number) => (Number.isFinite(Number(o[k])) ? Math.round(Number(o[k])) : d);
    widgets.push({ type: o.type, ...(o.title ? { title: cleanLine(o.title, LIMITS.title) } : {}), config: o.config && typeof o.config === 'object' && !Array.isArray(o.config) ? o.config : {}, x: n('x', 0), y: n('y', 0), w: n('w', 4), h: n('h', 3) });
  }
  return { widgets, errors };
}
