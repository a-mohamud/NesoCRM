import { useEffect, useState } from 'react';
import { ago, api, euro } from '../api';
import { can, useSession } from '../session';
import { displayHost } from '../format';
import { act, Badge, Empty, Field, Input, PageHead, pressable, Select, Spinner, Stat, Textarea, useLoad } from '../ui';
import { ClaudeButton, CodexButton, refreshProjects } from '../nav';
import { ProjectDocs } from './Docs';
import { Slot } from '../slots';
import { SortableGrid } from '../sortable/Sortable';
import { fmtNumber, useT } from '../i18n';

export const STATUS: Record<string, [string, any]> = {
  idee: ['Idee', 'gray'],
  entwicklung: ['In Entwicklung', 'yellow'],
  beta: ['Beta', 'purple'],
  live: ['Live', 'green'],
  pausiert: ['Pausiert', 'gray'],
  archiviert: ['Archiviert', 'gray'],
};

export function UptimeDot({ uptime }: { uptime: any }) {
  const tt = useT('x_agency');
  const last = uptime?.last;
  if (!last) return <span className="muted small">{tt('nicht geprüft')}</span>;
  return (
    <span className="small" title={tt('HTTP {v} · {ms} ms · {ago}', { v: last.status || '–', ms: last.ms, ago: ago(last.at) })}>
      <span className={`dot ${last.ok ? 'up' : 'down'}`} />
      {last.ok ? tt('online') : tt('offline')}
      {uptime.week_pct !== null ? tt(' · {pct} % (7 T.)', { pct: fmtNumber(Number(uptime.week_pct), { maximumFractionDigits: 2 }) }) : ''}
    </span>
  );
}

function ListEditor({ items, onChange, fields }: { items: any[]; onChange: (v: any[]) => void; fields: [string, string][] }) {
  const tt = useT('x_agency');
  return (
    <div>
      {items.map((it, i) => (
        <div key={i} className="list-row" style={{ gridTemplateColumns: `${fields.map(() => 'minmax(0, 1fr)').join(' ')} auto` }}>
          {fields.map(([k, ph]) => (
            <Input key={k} value={typeof it === 'string' ? it : it[k]} onChange={(v) => onChange(items.map((x, j) => (j === i ? (fields.length === 1 && typeof x === 'string' ? v : { ...x, [k]: v }) : x)))} placeholder={tt(ph)} />
          ))}
          <button className="btn small ghost" aria-label={tt('Entfernen')} onClick={() => onChange(items.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      <button className="btn small secondary" onClick={() => onChange([...items, fields.length === 1 && fields[0][0] === '' ? '' : Object.fromEntries(fields.map(([k]) => [k, '']))])}>
        {tt('+ Hinzufügen')}
      </button>
    </div>
  );
}

export function Project() {
  const tt = useT('x_agency');
  const session = useSession();
  const p = useLoad(() => api.get<any>('/api/project'), [session.locationId]);
  const [v, setV] = useState<any>(null);
  useEffect(() => setV(p.data ? { ...p.data } : null), [p.data]);
  if (!p.data || !v) return <Spinner />;
  const edit = can(session, 'settings');
  const set = (patch: any) => setV({ ...v, ...patch });
  const s = p.data.stats;
  const loc = session.locations.find((l) => l.id === session.locationId);
  return (
    <>
      <PageHead title={loc?.name ?? tt('Projekt')} sub={v.tagline || tt('Projekt-Steckbrief')}>
        <Badge tone={STATUS[v.status]?.[1]}>{STATUS[v.status] ? tt(STATUS[v.status][0]) : v.status}</Badge>
        <ClaudeButton sessions={p.data.claude_sessions} />
        <CodexButton sessions={p.data.codex_sessions} />
        {v.website && (
          <a className="btn secondary" href={v.website} target="_blank" rel="noreferrer">
            {tt('Website öffnen')}
          </a>
        )}
        {edit && (
          <button className="btn" data-tour="project-save" onClick={async () => (await act(() => api.put('/api/project', v), tt('Gespeichert'))) && (p.reload(), void refreshProjects(session))}>
            {tt('Speichern')}
          </button>
        )}
      </PageHead>
      <SortableGrid id="project.stats" className="stats" data-tour="project-stats">
        <Stat key="contacts" label={tt('Kontakte')} value={s.contacts} />
        <Stat key="deals" label={tt('Offene Deals')} value={s.open_opportunities} sub={euro(s.open_value)} />
        <Stat key="tasks" label={tt('Aufgaben offen')} value={s.open_tasks} sub={s.overdue_tasks ? tt('{overdue_tasks} überfällig', { overdue_tasks: s.overdue_tasks }) : undefined} />
        <Stat key="inbox" label={tt('Ungelesen / Entwürfe')} value={`${s.unread} / ${s.drafts}`} />
        <Stat key="website" tour="project-uptime" label={tt('Website')} value={<UptimeDot uptime={p.data.uptime} />} sub={s.last_activity ? tt('Aktiv {ago}', { ago: ago(s.last_activity) }) : undefined} />
      </SortableGrid>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="card" style={{ flex: '2 1 460px' }}>
          <div className="grid2">
            <Field label="Status" tour="project-status">
              <Select value={v.status} onChange={(x) => set({ status: x })} options={Object.entries(STATUS).map(([k, [l]]) => [k, tt(l)])} />
            </Field>
            <Field label={tt('Kategorie')}>
              <Input value={v.category} onChange={(x) => set({ category: x })} placeholder={tt('z. B. App, Spiel, Marktplatz')} />
            </Field>
          </div>
          <Field label={tt('Kurzbeschreibung')}>
            <Input value={v.tagline} onChange={(x) => set({ tagline: x })} />
          </Field>
          <Field label={tt('Website')} hint={tt('Wird alle 10 Minuten auf Erreichbarkeit geprüft.')} tour="project-website">
            <Input value={v.website} onChange={(x) => set({ website: x })} placeholder="https://…" />
          </Field>
          <Field label={tt('Beschreibung')}>
            <Textarea value={v.description} onChange={(x) => set({ description: x })} rows={5} />
          </Field>
          <Field label={tt('Ziele')} tour="project-goals">
            <Textarea value={v.goals} onChange={(x) => set({ goals: x })} rows={4} placeholder={tt('Was soll bis wann erreicht sein?')} />
          </Field>
          <Field label={tt('Notizen')}>
            <Textarea value={v.notes} onChange={(x) => set({ notes: x })} rows={6} />
          </Field>
        </div>
        <div style={{ flex: '1 1 320px' }}>
          <ProjectDocs />
          <Slot name="project.files" />
          <div className="card" data-tour="project-kpis">
            <h2>{tt('Kennzahlen')}</h2>
            <ListEditor items={v.kpis} onChange={(kpis) => set({ kpis })} fields={[['label', 'Kennzahl'], ['value', 'Ist'], ['target', 'Ziel']]} />
          </div>
          <div className="card">
            <h2>{tt('Links')}</h2>
            <ListEditor items={v.links} onChange={(links) => set({ links })} fields={[['label', 'Name'], ['url', 'https://…']]} />
            {v.links.length > 0 && (
              <p className="small">
                {v.links.filter((l: any) => l.url).map((l: any, i: number) => (
                  <a key={i} href={l.url} target="_blank" rel="noreferrer" style={{ marginRight: 10 }}>
                    {l.label} ↗
                  </a>
                ))}
              </p>
            )}
          </div>
          <div className="card" data-tour="project-claude">
            <h2>{tt('Claude-Sitzungen')}</h2>
            <p className="muted small" style={{ marginTop: -4 }}>{tt('Link aus claude.ai/code einfügen – dann springst du von überall mit einem Klick in die Sitzung zum Projekt.')}</p>
            <ListEditor items={v.claude_sessions ?? []} onChange={(claude_sessions) => set({ claude_sessions })} fields={[['label', 'z. B. Go-to-Market'], ['url', 'https://claude.ai/code/session_…']]} />
          </div>
          <div className="card" data-tour="project-codex">
            <h2>{tt('Codex-Aufgaben')}</h2>
            <p className="muted small" style={{ marginTop: -4 }}>{tt('Link aus chatgpt.com/codex einfügen (Aufgabe oder Umgebung) – der Codex-Knopf öffnet sie von überall, auch über Strg+K.')}</p>
            <ListEditor items={v.codex_sessions ?? []} onChange={(codex_sessions) => set({ codex_sessions })} fields={[['label', 'z. B. Checkout-Bug'], ['url', 'https://chatgpt.com/codex/tasks/task_e_…']]} />
          </div>
          <div className="card" data-tour="project-servers">
            <h2>{tt('Code & Server')}</h2>
            <Field label={tt('Repositories')}>
              <ListEditor items={v.repos} onChange={(repos) => set({ repos })} fields={[['', 'owner/repo']]} />
            </Field>
            <Field label={tt('Server / Deployments')}>
              <ListEditor items={v.servers} onChange={(servers) => set({ servers })} fields={[['name', 'z. B. KVM 8'], ['detail', 'Docker-Projekt, Port …']]} />
            </Field>
          </div>
        </div>
      </div>
    </>
  );
}

export function ProjectsOverview() {
  const tt = useT('x_agency');
  const session = useSession();
  const list = useLoad(() => api.get<any[]>('/api/agency/projects'), []);
  const [filter, setFilter] = useState('');
  if (!list.data) return <Spinner />;
  // Archived projects only show up when asked for.
  const shown = list.data.filter((l) => (filter ? l.profile.status === filter : l.profile.status !== 'archiviert')).sort((a, b) => (b.profile.priority ?? 0) - (a.profile.priority ?? 0) || a.name.localeCompare(b.name));
  if (!list.data.length) return <Empty>{tt('Noch keine Projekte.')}</Empty>;
  return (
    <>
      <div className="row" style={{ marginBottom: 12, maxWidth: 360 }}>
        <Select value={filter} onChange={setFilter} placeholder={tt('Alle Status')} options={Object.entries(STATUS).map(([k, [l]]) => [k, tt(l)])} />
      </div>
      {/* in the order the person dragged them into (web/src/sortable); new projects join at the end, a status filter keeps the rest's order */}
      <SortableGrid id="agency.projects" className="proj-grid" data-tour="agency-projects">
        {shown.map((l) => (
          <div
            key={l.id}
            className="card proj-card"
            {...pressable(() => session.switchLocation(l.id, 'project'))}
          >
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>{l.name}</h3>
              <span className="actions">
                <ClaudeButton sessions={l.profile.claude_sessions} compact />
                <CodexButton sessions={l.profile.codex_sessions} compact />
                <Badge tone={STATUS[l.profile.status]?.[1]}>{STATUS[l.profile.status] ? tt(STATUS[l.profile.status][0]) : l.profile.status}</Badge>
              </span>
            </div>
            {l.profile.tagline && <div className="muted small">{l.profile.tagline}</div>}
            <div className="row small" style={{ justifyContent: 'space-between' }}>
              {l.profile.website ? (
                <a href={l.profile.website} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                  {displayHost(l.profile.website)}
                </a>
              ) : (
                <span className="muted">{tt('keine Website')}</span>
              )}
              <UptimeDot uptime={l.profile.uptime} />
            </div>
            <div className="proj-kpis">
              <div>
                <b>{l.stats.open_opportunities}</b>
                <span>{tt('offene Deals')}</span>
              </div>
              <div>
                <b>{l.stats.open_tasks}</b>
                <span>{tt('Aufgaben')}{l.stats.overdue_tasks ? tt(' ({overdue_tasks} überf.)', { overdue_tasks: l.stats.overdue_tasks }) : ''}</span>
              </div>
              <div>
                <b>{l.stats.unread + l.stats.drafts}</b>
                <span>{tt('Post & Entwürfe')}</span>
              </div>
            </div>
            <div className="muted small">{tt('{contacts} Kontakte ·', { contacts: l.stats.contacts })} {l.stats.last_activity ? tt('aktiv {ago}', { ago: ago(l.stats.last_activity) }) : tt('noch keine Aktivität')}</div>
          </div>
        ))}
      </SortableGrid>
    </>
  );
}
