import { useEffect, useState, type ReactNode } from 'react';
import {
  DENSITIES,
  DEPT_LEVELS,
  DEPT_PALETTES,
  FONT_SIZES,
  ICON_PACKS,
  LOCK_KEYS,
  LOCK_LABELS,
  MODES,
  MODULE_SECTIONS,
  PREF_KEYS,
  PROFILES,
  SIDEBAR_MODES,
  hiddenForProfile,
  type LockKey,
  type Locks,
  type Prefs,
} from '../../../server/services/appearance-model';
import { api } from '../api';
import type { Branding } from '../session';
import { Check, Field, Input, Select, Spinner, act, useLoad } from '../ui';
import { THEME_LIST, themeById } from './themes';
import { isHex } from './color';
import { PRODUCT_ICON } from './brand-icon';
import { useT } from '../i18n';

/**
 * Agentur → White-Label, the look part: logos (light/dark), the square mark for the narrow sidebar, favicon,
 * app name next to the logo – and the agency's default look for its logins with a lock per group
 * ("Nutzer dürfen … ändern"). For a client (locationId) every field falls back to the agency's value.
 */

type LogoKey = 'logo_url' | 'logo_dark_url' | 'mark_url' | 'mark_dark_url' | 'favicon_url';
const SLOTS: { key: LogoKey; title: string; hint: string; on: 'light' | 'dark'; accept: string }[] = [
  { key: 'logo_url', title: 'Logo', hint: 'Breites Logo für die Seitenleiste (PNG, SVG, WebP).', on: 'light', accept: 'image/png,image/svg+xml,image/webp,image/jpeg' },
  { key: 'logo_dark_url', title: 'Logo für dunkle Seitenleisten', hint: 'Zum Beispiel die weiße Version. Fehlt es, gilt das Logo oben.', on: 'dark', accept: 'image/png,image/svg+xml,image/webp,image/jpeg' },
  { key: 'mark_url', title: 'Zeichen (quadratisch)', hint: 'Für die schmale Seitenleiste mit nur Symbolen – am besten 128 × 128.', on: 'light', accept: 'image/png,image/svg+xml,image/webp,image/jpeg' },
  { key: 'mark_dark_url', title: 'Zeichen für dunkle Seitenleisten', hint: 'Fehlt es, gilt das Zeichen oben.', on: 'dark', accept: 'image/png,image/svg+xml,image/webp,image/jpeg' },
  { key: 'favicon_url', title: 'Favicon', hint: 'Symbol im Browser-Tab (PNG, SVG, WebP). Ohne Favicon dient das Zeichen.', on: 'light', accept: 'image/png,image/svg+xml,image/webp' },
];

/** The check label of a lock group for the agency ("users may change …"). */
const LOCK_FREE: Record<LockKey, string> = {
  theme: 'Nutzer dürfen Theme und Hell/Dunkel ändern',
  accent: 'Nutzer dürfen die Akzentfarbe ändern',
  dept: 'Nutzer dürfen die Bereichsfarben ändern',
  sidebar: 'Nutzer dürfen die Seitenleiste (voll/schmal) ändern',
  icons: 'Nutzer dürfen das Icon-Pack ändern',
  density: 'Nutzer dürfen Dichte und Schriftgröße ändern',
  modules: 'Nutzer dürfen die sichtbaren Bereiche ändern',
};

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });

/** The logo slots of the branding form (uploads go through the checked logo endpoint: no scripts in SVG). */
export function LogoSet({ v, fb, set, client }: { v: Branding; fb: Partial<Branding>; set: (p: Partial<Branding>) => void; client: boolean }) {
  const tt = useT('x_misc');
  const upload = async (file: File, key: LogoKey) => {
    const data = await readAsDataUrl(file);
    const res = await act(() => api.post('/api/agency/branding/logo', { name: file.name, data }));
    if (res) set({ [key]: res.url });
  };
  return (
    <div data-tour="branding-logos">
      <div className="ap-logo-grid">
        {SLOTS.map((s) => {
          const own = v[s.key];
          const shown = own || (client ? fb[s.key] : '') || '';
          return (
            <div key={s.key} className="ap-logo-slot">
              <h3>{tt(s.title)}</h3>
              <div className={`ap-logo-stage ${s.on}`}>{shown ? <img src={shown} alt="" /> : <span className="small" style={{ opacity: 0.6 }}>{tt('kein Bild')}</span>}</div>
              <input type="file" accept={s.accept} aria-label={tt('{title} hochladen', { title: tt(s.title) })} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], s.key)} />
              <Input value={own} onChange={(x) => set({ [s.key]: x })} placeholder={tt('oder Adresse https://…')} aria-label={tt('{title}: Adresse', { title: tt(s.title) })} />
              <div className="muted small">
                {tt(s.hint)}
                {client && !own && fb[s.key] ? tt(' (Agentur-Bild)') : ''}
              </div>
              {own && (
                <button className="btn small secondary" onClick={() => set({ [s.key]: '' })}>
                  {client ? tt('Agentur-Bild verwenden') : tt('Entfernen')}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <Field label={tt('Name neben dem Logo')} hint={tt('Wird die App-Bezeichnung neben dem Logo angezeigt?')}>
        <Select
          value={v.show_name ?? ''}
          onChange={(x) => set({ show_name: x })}
          options={[
            ...(client ? [['', tt('Wie die Agentur')] as [string, string]] : []),
            [client ? 'yes' : '', tt('Name anzeigen')],
            ['no', tt('Nicht anzeigen (nur das Logo)')],
          ]}
        />
      </Field>
    </div>
  );
}

/** Live mock of the sidebar (full and narrow) with the logos and the name as they will appear. */
export function LogoPreview({ shown }: { shown: Branding }) {
  const tt = useT('x_misc');
  const name = shown.name || 'HyperLevel';
  const wide = shown.logo_dark_url || shown.logo_url;
  const mark = shown.mark_dark_url || shown.mark_url;
  // No logo yet: the HyperLevel icon, as in the real sidebar (never an initial).
  const icon = <img src={PRODUCT_ICON} alt="" style={{ width: 24, height: 24, flex: 'none' }} />;
  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 12 }} data-tour="branding-live">
      <div className="ap-live" style={{ flex: '1 1 180px', gridTemplateColumns: '120px 1fr' }} aria-label={tt('Vorschau der Seitenleiste')}>
        <div className="ap-live-side" style={{ alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 700, fontSize: 13, minWidth: 0 }}>
            {wide ? <img src={wide} alt="" style={{ height: 22, width: 'auto', maxWidth: 84, flex: 'none' }} /> : mark ? <img src={mark} alt="" style={{ width: 24, height: 24, flex: 'none' }} /> : icon}
            {shown.show_name !== 'no' && <span style={{ background: 'none', width: 'auto', height: 'auto', display: 'inline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'inherit' }}>{name}</span>}
          </div>
          <i style={{ width: 80 }} />
          <i style={{ width: 64 }} />
          <i style={{ width: 72 }} />
        </div>
        <div className="ap-live-main">
          <b>Dashboard</b>
          <button className="btn small" type="button">
            {tt('Aktion')}
          </button>
        </div>
      </div>
      <div className="ap-live" style={{ flex: '0 0 96px', gridTemplateColumns: '48px 1fr', height: 150 }} aria-label={tt('Vorschau der schmalen Seitenleiste')}>
        <div className="ap-live-side">{mark || wide ? <img src={mark || wide} alt="" style={{ width: 28, height: 28, flex: 'none', objectFit: mark ? 'contain' : 'cover', objectPosition: 'left' }} /> : icon}<i style={{ width: 22 }} /><i style={{ width: 22 }} /><i style={{ width: 22 }} /></div>
        <div className="ap-live-main" />
      </div>
    </div>
  );
}

type Defaults = Partial<Prefs>;
interface Draft {
  defaults: Defaults;
  locks: Locks;
}

export function BrandingLook({ locationId }: { locationId?: string }) {
  const tt = useT('x_misc');
  const url = locationId ? `/api/agency/locations/${locationId}/branding/look` : '/api/agency/branding/look';
  const look = useLoad<{ defaults: Defaults; locks: Locks; agency?: Draft }>(() => api.get(url), [url]);
  const [draft, setDraft] = useState<Draft | null>(null);
  useEffect(() => {
    if (look.data) setDraft({ defaults: { ...look.data.defaults }, locks: { ...look.data.locks } });
  }, [look.data]);
  if (!draft || !look.data) return <Spinner />;
  const client = !!locationId;
  const inherited = look.data.agency?.defaults ?? {};
  const setD = <K extends keyof Prefs>(k: K, v: Prefs[K] | undefined) => setDraft((d) => (d ? { ...d, defaults: { ...d.defaults, [k]: v } } : d));
  const unset = client ? tt('wie Agentur') : tt('nicht vorgegeben');
  const sel = <K extends 'theme' | 'mode' | 'dept' | 'dept_palette' | 'sidebar' | 'icons' | 'density' | 'font'>(k: K, raw: [string, string][]) => {
    const options = raw.map(([v, l]) => [v, tt(l)] as [string, string]);
    return <Select value={(draft.defaults[k] as string) ?? ''} onChange={(x) => setD(k, (x || undefined) as Prefs[K] | undefined)} options={[['', `– ${unset}${client && inherited[k] ? `: ${options.find((o) => o[0] === inherited[k])?.[1] ?? ''}` : ''} –`], ...options]} />;
  };
  const lockState = (k: LockKey): string => (draft.locks[k] === undefined ? '' : draft.locks[k] ? 'lock' : 'free');
  const lockControl = (k: LockKey) =>
    client ? (
      <Select value={lockState(k)} onChange={(x) => setDraft((d) => d && { ...d, locks: { ...d.locks, [k]: x === '' ? undefined : x === 'lock' } })} options={[['', tt('Wie Agentur')], ['free', tt('Nutzer dürfen ändern')], ['lock', tt('Festgelegt')]]} />
    ) : (
      <Check checked={!draft.locks[k]} onChange={(v) => setDraft((d) => d && { ...d, locks: { ...d.locks, [k]: !v } })} label={tt(LOCK_FREE[k])} />
    );
  const row = (k: LockKey, content: ReactNode) => (
    <div className="card" style={{ marginBottom: 10 }} key={k} data-tour={`look-${k}`}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>{tt(LOCK_LABELS[k])}</h3>
        <div style={{ minWidth: 220 }}>{lockControl(k)}</div>
      </div>
      {content}
    </div>
  );
  const accent = draft.defaults.accent;
  const hidden = new Set(draft.defaults.hidden ?? []);
  const save = async () => {
    const defaults = Object.fromEntries(PREF_KEYS.filter((k) => k !== 'asked').map((k) => [k, draft.defaults[k] === undefined ? null : draft.defaults[k]]));
    const locks = Object.fromEntries(LOCK_KEYS.map((k) => [k, draft.locks[k] === undefined ? (client ? null : false) : draft.locks[k]]));
    const r = await act(() => api.patch(url, { defaults, locks }), tt('Darstellung gespeichert'));
    if (r) look.setData(r);
  };
  return (
    <div className="card" data-tour="branding-look" style={{ marginTop: 14 }}>
      <h2>{client ? tt('Darstellung für diesen Kunden') : tt('Standard-Darstellung der Logins')}</h2>
      <p className="muted small">
        {tt('Was neue Nutzer sehen, bis sie selbst etwas wählen. Mit „festgelegt“ können Kunden-Logins diese Gruppe nicht ändern; Agentur-Admins sind nie gesperrt.')} {client ? tt('Leere Felder gelten wie bei der Agentur.') : ''}
      </p>
      {row(
        'theme',
        <div className="grid2">
          <Field label={tt('Theme')}>{sel('theme', THEME_LIST.map((t) => [t.id, t.name]))}</Field>
          <Field label={tt('Hell / Dunkel')}>{sel('mode', MODES.map((m) => [m, m === 'light' ? 'Hell' : m === 'dark' ? 'Dunkel' : 'Wie das System']))}</Field>
        </div>,
      )}
      {row(
        'accent',
        <Field label={tt('Akzentfarbe')} hint={accent ? undefined : tt('Ohne Vorgabe gilt {v}.', { v: client ? tt('die Farbe der Agentur') : tt('die Markenfarbe oben (Standard-Theme) bzw. die des gewählten Themes') })}>
          <div className="actions">
            <input type="color" value={isHex(accent) ? accent : themeById(draft.defaults.theme ?? inherited.theme ?? 'gohigh').light.accent} onChange={(e) => setD('accent', e.target.value)} aria-label={tt('Standard-Akzentfarbe')} style={{ width: 54 }} />
            {accent && (
              <button className="btn small secondary" onClick={() => setD('accent', undefined)}>
                {tt('Keine Vorgabe')}
              </button>
            )}
          </div>
        </Field>,
      )}
      {row(
        'dept',
        <div className="grid3">
          <Field label={tt('Intensität')}>{sel('dept', DEPT_LEVELS.map((l) => [l, { off: 'Aus', subtle: 'Dezent', clear: 'Klar', vibrant: 'Vibrant' }[l]!]))}</Field>
          <Field label={tt('Palette')}>{sel('dept_palette', DEPT_PALETTES.map((p) => [p, { harmonic: 'Harmonisch', rainbow: 'Regenbogen', muted: 'Gedeckt' }[p]!]))}</Field>
          <Field label={tt('In Bereichsfarbe tönen')}>
            <Select value={draft.defaults.dept_tint === undefined ? '' : draft.defaults.dept_tint ? '1' : '0'} onChange={(x) => setD('dept_tint', x === '' ? undefined : x === '1')} options={[['', `– ${unset} –`], ['1', tt('Ja')], ['0', tt('Nein')]]} />
          </Field>
        </div>,
      )}
      {row('sidebar', <Field label={tt('Seitenleiste')}>{sel('sidebar', SIDEBAR_MODES.map((m) => [m, m === 'full' ? 'Voll' : 'Nur Symbole']))}</Field>)}
      {row('icons', <Field label={tt('Icon-Pack')}>{sel('icons', ICON_PACKS.map((p) => [p, { line: 'Linien', fine: 'Fein', bold: 'Kräftig', square: 'Eckig', duotone: 'Duotone', solid: 'Gefüllt' }[p]!]))}</Field>)}
      {row(
        'density',
        <div className="grid2">
          <Field label={tt('Dichte')}>{sel('density', DENSITIES.map((d) => [d, { compact: 'Kompakt', normal: 'Normal', comfortable: 'Komfortabel' }[d]!]))}</Field>
          <Field label={tt('Schriftgröße')}>{sel('font', FONT_SIZES.map((f) => [f, { small: 'Klein', normal: 'Normal', large: 'Groß' }[f]!]))}</Field>
        </div>,
      )}
      {row(
        'modules',
        <>
          <p className="muted small">{tt('Ausgeblendete Bereiche verschwinden aus Menü, Suche, Strg K und Dashboard der Logins. Das ist nur eine Ansicht – die Berechtigungen (Einstellungen → Team) bleiben unverändert.')}</p>
          <Field label={tt('Starter-Profil')}>
            <Select
              value={draft.defaults.profile ?? ''}
              onChange={(x) => setDraft((d) => d && { ...d, defaults: { ...d.defaults, profile: x || undefined, hidden: x ? hiddenForProfile(x) : undefined } })}
              options={[['', `– ${unset} –`], ...PROFILES.map((p) => [p.id, tt(p.label)] as [string, string])]}
            />
          </Field>
          <details>
            <summary>{tt('Einzeln wählen ({size} ausgeblendet)', { size: hidden.size })}</summary>
            {MODULE_SECTIONS.map((s) => (
              <div key={s.id} className="ap-mod-sec">
                <h3>{tt(s.label)}</h3>
                <div className="ap-mods">
                  {s.modules.map(([id, label]) => (
                    <Check
                      key={id}
                      checked={!hidden.has(id)}
                      onChange={(v) => {
                        const next = new Set(hidden);
                        if (v) next.delete(id);
                        else next.add(id);
                        setDraft((d) => d && { ...d, defaults: { ...d.defaults, hidden: [...next], profile: undefined } });
                      }}
                      label={tt(label)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </details>
        </>,
      )}
      <p>
        <button className="btn" onClick={save} data-tour="branding-look-save">
          {tt('Darstellung speichern')}
        </button>
      </p>
    </div>
  );
}
