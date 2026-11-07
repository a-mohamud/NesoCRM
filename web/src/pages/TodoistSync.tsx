import { useState } from 'react';
import { ago, api, dt } from '../api';
import { Badge, Check, Copy, Field, Input, Select, Spinner, act, confirmAsk, useLoad } from '../ui';
import { SignupLink } from '../referrals';
import { useT } from '../i18n';

const MODES: Record<string, [string, string][]> = {
  sections: [
    ['auto', 'Eigener Abschnitt (automatisch)'],
    ['existing', 'Vorhandener Abschnitt …'],
    ['off', 'Nicht abgleichen'],
  ],
  projects: [
    ['auto', 'Eigenes Projekt (automatisch)'],
    ['existing', 'Vorhandenes Projekt …'],
    ['off', 'Nicht abgleichen'],
  ],
};
const COUNT_LABELS: [string, string][] = [
  ['created', 'neu in Todoist'],
  ['pushed', 'geändert in Todoist'],
  ['deleted', 'gelöscht in Todoist'],
  ['imported', 'aus Todoist übernommen'],
  ['pulled', 'aus Todoist geändert'],
  ['closed_here', 'hier erledigt'],
  ['conflicts', 'Konflikte'],
  ['errors', 'Fehler'],
];
const LEVEL_TONE: Record<string, 'gray' | 'yellow' | 'red' | 'purple'> = { info: 'gray', warn: 'yellow', error: 'red', conflict: 'purple' };
const LEVEL_LABEL: Record<string, string> = { info: 'Info', warn: 'Hinweis', error: 'Fehler', conflict: 'Konflikt' };
const LOAD = '__load';

type Pick = { id: string; name: string; inbox?: boolean };

/** Agency → Integrationen: two-way task sync with the owner's personal Todoist. */
export function TodoistSync() {
  const tt = useT('x_integrations');
  const s = useLoad(() => api.get<any>('/api/agency/todoist'), []);
  const [token, setToken] = useState('');
  const [parent, setParent] = useState<string | null>(null);
  const [secret, setSecret] = useState('');
  const [picking, setPicking] = useState<Record<string, boolean>>({});
  const [projects, setProjects] = useState<Pick[] | null>(null);
  const [sections, setSections] = useState<Pick[] | null>(null);
  const [busy, setBusy] = useState(false);
  if (!s.data) return <Spinner />;
  const v = s.data;
  const st = v.state ?? {};
  const bySections = v.layout === 'sections';
  const save = async (patch: any, ok = 'Gespeichert') => {
    const r = await act(() => api.patch('/api/agency/todoist', patch), ok);
    if (r) s.setData(r);
    return r;
  };
  const loadProjects = async () => {
    if (projects) return;
    const list = await act(() => api.get<Pick[]>('/api/agency/todoist/projects'));
    if (list) setProjects(list);
  };
  const loadSections = async () => {
    const list = await act(() => api.get<Pick[]>('/api/agency/todoist/sections'));
    if (list) setSections(list);
  };
  const setMode = async (loc: any, mode: string) => {
    if (mode === 'existing') {
      setPicking({ ...picking, [loc.id]: true });
      return bySections ? loadSections() : loadProjects();
    }
    setPicking({ ...picking, [loc.id]: false });
    const r = await act(() => api.put(`/api/agency/todoist/mapping/${loc.id}`, { mode }), tt('Gespeichert'));
    if (r) s.setData(r);
  };
  const pickExisting = async (loc: any, id: string) => {
    const p = (bySections ? sections : projects)?.find((x) => x.id === id);
    if (!p) return;
    const body = bySections ? { mode: 'existing', section_id: p.id, section_name: p.name } : { mode: 'existing', project_id: p.id, project_name: p.name };
    const r = await act(() => api.put(`/api/agency/todoist/mapping/${loc.id}`, body), tt('Zugeordnet'));
    if (r) (s.setData(r), setPicking({ ...picking, [loc.id]: false }));
  };
  const pickHome = async (id: string) => {
    if (id === LOAD) return loadProjects();
    const p = projects?.find((x) => x.id === id);
    if (await save(id && p ? { home_project_id: p.id, home_project_name: p.name } : { home_project_id: '' })) setSections(null);
  };
  const setEnabled = async (enabled: boolean) => {
    const toCreate = v.locations.filter((l: any) => l.mode === 'auto' && !l.project_id).length;
    if (enabled && !bySections && toCreate > 1 && !confirmAsk(tt('Das legt bis zu {n} neue Projekte in Todoist an{note}. Trotzdem einschalten?', { n: toCreate, note: v.account?.premium === false ? tt(' – im kostenlosen Plan sind nur 5 Projekte erlaubt') : '' }))) return;
    await save({ enabled });
  };
  const runNow = async (full: boolean) => {
    setBusy(true);
    const r = await act(() => api.post('/api/agency/todoist/sync', { full }), tt('Abgeglichen'));
    setBusy(false);
    s.reload();
    return r;
  };
  const counts = st.counts ? COUNT_LABELS.filter(([k]) => st.counts[k]).map(([k, l]) => `${st.counts[k]} ${tt(l)}`) : [];
  const homeOptions: [string, string][] = [
    ['', tt('Automatisch: „{name}“', { name: v.parent_name || 'HyperLevel' })],
    ...(projects ?? (v.home.picked ? [{ id: v.home.id, name: v.home.name }] : [])).map((p: Pick) => [p.id, p.inbox ? tt('{name} (Eingang)', { name: p.name }) : p.name] as [string, string]),
    ...(projects ? [] : [[LOAD, tt('Vorhandenes Projekt wählen …')] as [string, string]]),
  ];
  const targetLabel = (l: any) => {
    if (l.mode === 'off') return '';
    if (bySections) return l.section_id ? `→ ${v.home.name} / ${l.section_name || l.section_id}` : l.mode === 'auto' ? tt('Abschnitt wird beim nächsten Abgleich angelegt (in „{name}“)', { name: v.home.name }) : '';
    return l.project_id ? `→ ${l.project_name || l.project_id}` : l.mode === 'auto' ? (v.parent_name ? tt('Projekt wird beim nächsten Abgleich angelegt (unter „{name}“)', { name: v.parent_name }) : tt('Projekt wird beim nächsten Abgleich angelegt')) : '';
  };
  const pickList = bySections ? sections : projects;

  return (
    <div className="card todoist-card" data-tour="todoist">
      <h2>{tt('Todoist')} <SignupLink id="todoist" /></h2>
      <p className="muted small">
        {tt('Aufgaben in beide Richtungen mit deinem Todoist abgleichen: Titel, Beschreibung (mit Link zurück), Fälligkeit, Erledigt und Löschen. Standard: ein Projekt „HyperLevel“ mit einem Abschnitt je Sub-Account. Alle 3 Minuten Änderungen, einmal am Tag alles; was du hier änderst, geht nach wenigen Sekunden raus.')}
      </p>
      <div className="grid2">
        <Field label={tt('Persönlicher API-Token')} hint={tt('Todoist → Einstellungen → Integrationen → Entwickler → API-Token kopieren (bleibt verschlüsselt hier)')}>
          <Input type="password" value={token} onChange={setToken} placeholder={v.token_set ? tt('•••••••• {token_hint} (gespeichert)', { token_hint: v.token_hint }) : ''} autoComplete="off" />
        </Field>
        <div className="todoist-conn">
          {v.token_set && v.account ? (
            <>
              <Badge tone="green">{tt('verbunden')}</Badge> <strong>{v.account.name || v.account.email}</strong>
              {v.account.premium === false && <Badge>{tt('kostenloser Plan')}</Badge>}
              {v.account.email && v.account.name && <span className="muted small"> · {v.account.email}</span>}
            </>
          ) : (
            <Badge>{tt('nicht verbunden')}</Badge>
          )}
        </div>
      </div>
      <p className="actions">
        <button className="btn" disabled={!token.trim()} onClick={async () => (await save({ token }, 'Verbunden')) && setToken('')}>
          {tt('Speichern & testen')}
        </button>
        {v.token_set && (
          <button
            className="btn ghost"
            onClick={async () => {
              if (!confirmAsk(tt('Todoist trennen? Die Aufgaben bleiben in beiden Systemen, der Abgleich stoppt.'))) return;
              const r = await act(() => api.del('/api/agency/todoist'), tt('Getrennt'));
              if (r) s.setData(r);
            }}
          >
            {tt('Trennen')}
          </button>
        )}
      </p>

      {v.token_set && (
        <>
          <Check checked={v.enabled} onChange={setEnabled} label={tt('Abgleich aktiv')} />
          {!v.enabled && !bySections && <p className="muted small">{tt('Bei „Ein Projekt je Sub-Account“ startet der Abgleich erst, wenn du ihn einschaltest.')}</p>}
          <div className="grid2" style={{ marginTop: 10 }}>
            <Field
              label={tt('Aufbau in Todoist')}
              hint={
                bySections ? (
                  tt('Ein Projekt, darin ein Abschnitt je Sub-Account – passt auch in den kostenlosen Plan (max. 5 Projekte, 20 Abschnitte je Projekt).')
                ) : (
                  <span className={v.account?.premium === false ? 'todoist-err' : ''}>
                    {v.account?.premium === false ? tt('Kostenloser Plan: höchstens 5 Projekte – bei mehr Sub-Accounts „Ein Projekt mit Abschnitten“ nehmen.') : tt('Ein Projekt je Sub-Account unter einem übergeordneten Projekt.')}
                  </span>
                )
              }
            >
              <Select value={v.layout} onChange={(layout) => (setPicking({}), save({ layout }))} options={[['sections', tt('Ein Projekt mit Abschnitten (empfohlen)')], ['projects', tt('Ein Projekt je Sub-Account')]]} />
            </Field>
            {bySections ? (
              <Field label={tt('Todoist-Projekt')} hint={v.home.picked ? tt('Abschnitte werden in diesem Projekt angelegt') : v.home.id ? tt('Angelegt – die Abschnitte liegen in „{name}“', { name: v.home.name }) : tt('Wird beim ersten Abgleich angelegt (oder ein vorhandenes gleichen Namens genommen)')}>
                <Select value={v.home.picked ? v.home.id : ''} onChange={pickHome} options={homeOptions} />
              </Field>
            ) : (
              <Field label={tt('Übergeordnetes Projekt')} hint={tt('Automatische Projekte landen darunter; leer = oberste Ebene')}>
                <Input value={parent ?? v.parent_name} onChange={setParent} onBlur={async () => parent !== null && parent !== v.parent_name && (await save({ parent_name: parent })) && setParent(null)} placeholder="HyperLevel" />
              </Field>
            )}
            {bySections && !v.home.picked && (
              <Field label={tt('Projektname')} hint={v.home.id ? tt('Ein neuer Name benennt das Projekt in Todoist um') : undefined}>
                <Input value={parent ?? v.parent_name} onChange={setParent} onBlur={async () => parent !== null && parent !== v.parent_name && (await save({ parent_name: parent || 'HyperLevel' })) && setParent(null)} placeholder="HyperLevel" />
              </Field>
            )}
            {bySections && (
              <Field label={tt('Aufgaben ohne Abschnitt')} hint={tt('Neue Aufgaben im Projekt, die in keinem Abschnitt liegen')}>
                <Select value={v.unsectioned_location_id ?? ''} onChange={(id) => save({ unsectioned_location_id: id })} options={[['', tt('Ignorieren')], ...v.locations.map((l: any) => [l.id, `→ ${l.name}`] as [string, string])]} />
              </Field>
            )}
            <Field label={tt('Richtung')}>
              <Select value={v.direction} onChange={(direction) => save({ direction })} options={[['both', tt('Beide Richtungen')], ['push', tt('Nur HyperLevel → Todoist')]]} />
            </Field>
            <Field label={tt('Welche Aufgaben')} hint={tt('Bereits verknüpfte Aufgaben bleiben verknüpft')}>
              <Select value={v.scope} onChange={(scope) => save({ scope })} options={[['all', tt('Alle Aufgaben')], ['mine', tt('Nur mir zugewiesene')]]} />
            </Field>
            <Field label={tt('Sub-Accounts ohne eigene Einstellung')}>
              <Select value={v.default_mode} onChange={(default_mode) => save({ default_mode })} options={[['auto', bySections ? tt('Abschnitt automatisch anlegen') : tt('Projekt automatisch anlegen')], ['off', tt('Nicht abgleichen')]]} />
            </Field>
          </div>
          <Check checked={v.label} onChange={(label) => save({ label })} label={<>{tt('Label')} <code>ghp</code> {tt('an Aufgaben, die von hier kommen')}</>} />

          <h3 className="todoist-h">{bySections ? tt('Abschnitt je Sub-Account') : tt('Projekt je Sub-Account')}</h3>
          <div className="todoist-table">
            <table className="t">
              <thead>
                <tr>
                  <th>{tt('Sub-Account')}</th>
                  <th>{bySections ? tt('Abschnitt in Todoist') : tt('Projekt in Todoist')}</th>
                  <th>{tt('Verknüpft')}</th>
                </tr>
              </thead>
              <tbody>
                {v.locations.map((l: any) => (
                  <tr key={l.id}>
                    <td>
                      <strong>{l.name}</strong>
                    </td>
                    <td>
                      <div className="todoist-map">
                        <Select value={picking[l.id] ? 'existing' : l.mode} onChange={(m) => setMode(l, m)} options={(MODES[v.layout] ?? MODES.sections).map(([k, l]) => [k, tt(l)] as [string, string])} />
                        {picking[l.id] &&
                          (pickList ? (
                            <Select value="" placeholder={bySections ? tt('Abschnitt wählen …') : tt('Projekt wählen …')} onChange={(p) => pickExisting(l, p)} options={pickList.map((p) => [p.id, p.inbox ? `${p.name} (Eingang)` : p.name] as [string, string])} />
                          ) : (
                            <span className="muted small">{tt('wird geladen …')}</span>
                          ))}
                      </div>
                      {!picking[l.id] && targetLabel(l) && <div className="muted small">{targetLabel(l)}</div>}
                    </td>
                    <td>{l.linked ? <Badge tone="blue">{tt('{linked} verknüpft', { linked: l.linked })}</Badge> : <span className="muted">–</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {bySections && <p className="muted small">{tt('Wird eine Aufgabe in Todoist in einen anderen Abschnitt verschoben, bleibt sie hier im bisherigen Sub-Account.')}</p>}

          <h3 className="todoist-h">{tt('Status')}</h3>
          {st.limit_error && (
            <p className="todoist-limit small">
              <Badge tone="red">{tt('Limit')}</Badge> {st.limit_error}
            </p>
          )}
          <p className="small">
            {st.last_run ? (
              <>
                {st.last_error ? <Badge tone="red">{tt('Fehler')}</Badge> : <Badge tone="green">ok</Badge>} {tt('Letzter Abgleich {ago}', { ago: ago(st.last_run) })}
                {st.last_full ? tt(' · komplett {ago}', { ago: ago(st.last_full) }) : ''}
                {' · '}
                {tt('{linked} verknüpft', { linked: v.totals.linked })}
                {v.totals.pending ? tt(' · {pending} unterwegs', { pending: v.totals.pending }) : ''}
                {v.totals.failed ? tt(' · {failed} mit Fehlern', { failed: v.totals.failed }) : ''}
                {st.last_error && <span className="todoist-err"> · {st.last_error}</span>}
              </>
            ) : (
              <span className="muted">{tt('Noch nicht abgeglichen.')}</span>
            )}
          </p>
          {counts.length > 0 && !st.last_error && <p className="muted small">{tt('Letzter Lauf:')} {counts.join(', ')}</p>}
          <p className="actions">
            <button className="btn secondary" disabled={!v.enabled || busy} onClick={() => runNow(false)}>
              {busy ? tt('Gleiche ab …') : tt('Jetzt abgleichen')}
            </button>
            <button className="btn ghost" disabled={!v.enabled || busy} onClick={() => runNow(true)}>
              {tt('Komplett abgleichen')}
            </button>
          </p>
          <p className="muted small">
            {tt('In Todoist gelöschte Aufgaben werden hier nicht gelöscht, sondern als erledigt markiert und abgekoppelt. Haben sich beide Seiten geändert, gewinnt die spätere Änderung (steht im Protokoll).')}
          </p>

          <details className="todoist-details">
            <summary>{tt('Webhook (optional, für sofortige Übernahme aus Todoist)')}</summary>
            <p className="muted small">
              {tt('Ohne Webhook holt der Abgleich Änderungen alle 3 Minuten. Für sofortige Übernahme: in der Todoist App Console (Einstellungen → Integrationen → Entwickler → App Console) eine App anlegen, als Webhook-URL die Adresse unten eintragen, die Ereignisse')} <code>{tt('item:*')}</code> {tt('wählen und das Client Secret hier speichern.')}
            </p>
            <div className="grid2">
              <Field label={tt('Webhook-URL')}>
                <div className="actions">
                  <code className="todoist-url">{v.webhook_url}</code>
                  <Copy text={v.webhook_url} />
                </div>
              </Field>
              <Field label={tt('Client Secret')}>
                <Input type="password" value={secret} onChange={setSecret} placeholder={v.webhook_secret_set ? tt('•••••••• (gespeichert)') : ''} autoComplete="off" />
              </Field>
            </div>
            <p className="actions">
              <button className="btn secondary" disabled={!secret.trim()} onClick={async () => (await save({ webhook_secret: secret })) && setSecret('')}>
                {tt('Secret speichern')}
              </button>
              {v.webhook_secret_set && (
                <button className="btn ghost" onClick={() => save({ webhook_secret: '' }, 'Entfernt')}>
                  {tt('Webhook entfernen')}
                </button>
              )}
            </p>
          </details>

          <details className="todoist-details" open={v.log.some((e: any) => e.level === 'error' || e.level === 'conflict') || undefined}>
            <summary>{tt('Protokoll ({length})', { length: v.log.length })}</summary>
            {v.log.length ? (
              <ul className="todoist-log">
                {v.log.map((e: any) => (
                  <li key={e.id}>
                    <Badge tone={LEVEL_TONE[e.level] ?? 'gray'}>{tt(LEVEL_LABEL[e.level] ?? e.level)}</Badge> <span className="muted small">{dt(e.at)}</span> {e.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">{tt('Noch keine Einträge.')}</p>
            )}
          </details>
        </>
      )}
    </div>
  );
}
