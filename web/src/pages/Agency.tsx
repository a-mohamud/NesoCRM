import { useState } from 'react';
import { ago, api, d, dt, euro } from '../api';
import { useSession, type Branding } from '../session';
import { useAppInfo } from '../demo';
import { LearnLink } from '../tour/learn';
import { AcademyWelcome } from '../tour/welcome';
// The default tab is in this chunk; every other tab loads when opened (web/src/lazy.tsx).
import { PageSuspense, lazyPages } from '../lazy';
const { AllTasks, ApiAndMcp, AuditLog, MailAccounts } = lazyPages(() => import('./AgencyPlatform'), 'AllTasks', 'ApiAndMcp', 'AuditLog', 'MailAccounts');
import { ProjectsOverview } from './Project';
const { AllContacts, AllDeals } = lazyPages(() => import('./AgencyLists'), 'AllContacts', 'AllDeals');
const { AgencyDocs } = lazyPages(() => import('./Docs'), 'AgencyDocs');
const { SupabaseMirror } = lazyPages(() => import('./SupabaseMirror'), 'SupabaseMirror');
const { SaasAdmin } = lazyPages(() => import('./Saas'), 'SaasAdmin');
const { CloudConsole } = lazyPages(() => import('./CloudConsole'), 'CloudConsole');
const { OAuthApps } = lazyPages(() => import('./OAuthConnect'), 'OAuthApps');
const { MailboxAgencyCard } = lazyPages(() => import('./Mailboxes'), 'MailboxAgencyCard');
const { LoginSettings } = lazyPages(() => import('./LoginSettings'), 'LoginSettings');
const { TodoistSync } = lazyPages(() => import('./TodoistSync'), 'TodoistSync');
const { OpenShortsSetup } = lazyPages(() => import('./VideoStudio'), 'OpenShortsSetup');
const { AgencyIntegrationsHub } = lazyPages(() => import('./Integrations'), 'AgencyIntegrationsHub');
const { AiTools } = lazyPages(() => import('./AiTools'), 'AiTools');
const { AiConnections } = lazyPages(() => import('./AiConnections'), 'AiConnections');
const { ComposioAgencySetup } = lazyPages(() => import('./Composio'), 'ComposioAgencySetup');
const { NangoAgencySetup } = lazyPages(() => import('./Nango'), 'NangoAgencySetup');
const { CogneeAgencySetup } = lazyPages(() => import('./CogneeAgency'), 'CogneeAgencySetup');
const { McpServers } = lazyPages(() => import('./McpServers'), 'McpServers');
const { PartnerLinks } = lazyPages(() => import('./PartnerLinks'), 'PartnerLinks');
const { BrandingLook, LogoPreview, LogoSet } = lazyPages(() => import('../theme/BrandingLook'), 'BrandingLook', 'LogoPreview', 'LogoSet');
import { SignupLink } from '../referrals';
import { Badge, Check, CodeBox, Empty, Field, Input, Modal, PageHead, Select, Spinner, Textarea, act, confirmAsk, navigate, toast, useLoad } from '../ui';
import { SnapshotTemplates } from './SnapshotTemplates';
import { Slot } from '../slots';
import { AgencyTabs } from '../areas/SettingsTabs';
import { MoreFields } from '../areas/fields';
import { DEFAULT_CLIENT_PERMS, PermissionPicker } from './PermissionPicker';
import { useT } from '../i18n';
const { AgencyFeedback } = lazyPages(() => import('./FeedbackAdmin'), 'AgencyFeedback');
const { SystemHealth } = lazyPages(() => import('./SystemHealth'), 'SystemHealth');
const { UmzugAssistent } = lazyPages(() => import('./UmzugAssistent'), 'UmzugAssistent');


export function DomainBadge({ status }: { status?: { status: string; message?: string } }) {
  if (!status) return null;
  const map: Record<string, [string, any]> = {
    active: ['HTTPS aktiv', 'green'],
    pending_dns: ['wartet auf DNS', 'yellow'],
    pending: ['wird eingerichtet', 'blue'],
    unverified: ['nicht bestätigt', 'yellow'],
    error: ['Fehler', 'red'],
  };
  const [label, tone] = map[status.status] ?? [status.status, 'gray'];
  return (
    <span title={status.message}>
      <Badge tone={tone}>{label}</Badge>
    </span>
  );
}

function randomPassword() {
  const a = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint32Array(14)), (n) => a[n % a.length]).join('');
}


function NewClient({ snapshots, onClose, onDone }: { snapshots: any[]; onClose: () => void; onDone: (r: any) => void }) {
  const tt = useT('x_agency');
  const [f, setF] = useState<any>({ name: '', timezone: 'Europe/Berlin', email: '', phone: '', website: '', snapshot_id: '', activate_workflows: false });
  const [login, setLogin] = useState(false);
  const [u, setU] = useState<any>({ email: '', name: '', password: randomPassword(), permissions: DEFAULT_CLIENT_PERMS });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const r = await act(() => api.post('/api/agency/clients', { ...f, user: login ? u : undefined }));
    setBusy(false);
    if (r) onDone({ ...r, password: login ? u.password : undefined });
  };
  return (
    <Modal
      title={tt('Neuer Kunde')}
      onClose={onClose}
      wide
      footer={
        <button className="btn" disabled={!f.name || busy} onClick={save}>
          {tt('Kunde anlegen')}
        </button>
      }
    >
      <div className="grid2">
        <Field label={tt('Firmenname *')}>
          <Input value={f.name} onChange={(v) => setF({ ...f, name: v })} autoFocus />
        </Field>
        <Field label={tt('E-Mail der Firma (bekommt Benachrichtigungen)')}>
          <Input value={f.email} onChange={(v) => setF({ ...f, email: v })} />
        </Field>
      </div>
      <MoreFields id="agency-new-client" values={[f.website, f.timezone !== 'Europe/Berlin' && f.timezone]}>
        <div className="grid2">
          <Field label={tt('Zeitzone')}>
            <Input value={f.timezone} onChange={(v) => setF({ ...f, timezone: v })} />
          </Field>
          <Field label={tt('Webseite')}>
            <Input value={f.website} onChange={(v) => setF({ ...f, website: v })} />
          </Field>
        </div>
      </MoreFields>
      <Field label={tt('Startpaket (Snapshot)')} hint={tt('Kopiert Websites (mit Blog), Funnels, Formulare, Kalender, Workflows, Pipelines, Vorlagen, Kurse und Community-Gruppen – keine Kontakte, Teilnehmer oder Beiträge.')}>
        <Select value={f.snapshot_id} onChange={(v) => setF({ ...f, snapshot_id: v })} placeholder={tt('– leer starten –')} options={snapshots.map((s) => [s.id, `${s.name} (${s.summary.funnels} Seiten-Projekte, ${s.summary.workflows} Workflows)`])} />
      </Field>
      {f.snapshot_id && <Check checked={f.activate_workflows} onChange={(v) => setF({ ...f, activate_workflows: v })} label={tt('Workflows gleich aktivieren (sonst als Entwurf)')} />}
      <hr />
      <Check checked={login} onChange={setLogin} label={tt('Login für den Kunden anlegen')} />
      {login && (
        <>
          <div className="grid3">
            <Field label="E-Mail">
              <Input value={u.email} onChange={(v) => setU({ ...u, email: v })} />
            </Field>
            <Field label="Name">
              <Input value={u.name} onChange={(v) => setU({ ...u, name: v })} />
            </Field>
            <Field label={tt('Passwort')}>
              <Input value={u.password} onChange={(v) => setU({ ...u, password: v })} />
            </Field>
          </div>
          <MoreFields id="agency-new-client-perms" label={tt('Bereiche einschränken')}>
            <Field label={tt('Darf sehen')}>
              <PermissionPicker value={u.permissions} onChange={(v) => setU({ ...u, permissions: v })} />
            </Field>
          </MoreFields>
        </>
      )}
    </Modal>
  );
}

function Clients() {
  const tt = useT('x_agency');
  const session = useSession();
  const overview = useLoad(() => api.get<any[]>('/api/agency/overview'), []);
  const snapshots = useLoad(() => api.get<any[]>('/api/snapshots'), []);
  const [modal, setModal] = useState(false);
  const [done, setDone] = useState<any>(null);
  const [brand, setBrand] = useState<any>(null);
  const open = (id: string) => session.switchLocation(id);
  if (!overview.data) return <Spinner />;
  const list = overview.data;
  return (
    <>
      <div className="row" style={{ marginBottom: 12, justifyContent: 'space-between' }}>
        <span className="muted">
          {tt('{length} Kunden · {n} Kontakte · {n2} Websites/Funnels', { length: list.length, n: list.reduce((n, l) => n + l.contacts, 0), n2: list.reduce((n, l) => n + l.funnels.length, 0) })}
        </span>
        <button className="btn" data-tour="clients-new" onClick={() => setModal(true)}>
          {tt('+ Neuer Kunde')}
        </button>
      </div>
      <div className="table-wrap" data-tour="clients-list">
        <table className="t">
          <thead>
            <tr>
              <th>{tt('Kunde')}</th>
              <th>{tt('Kontakte')}</th>
              <th>{tt('Leads (30 T.)')}</th>
              <th>Pipeline</th>
              <th>{tt('Termine')}</th>
              <th>{tt('Websites & Funnels')}</th>
              <th>{tt('Logins')}</th>
              <th>{tt('Aktiv')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((l) => (
              <tr key={l.id}>
                <td>
                  <strong>{l.name}</strong>
                  {l.unread > 0 && (
                    <>
                      {' '}
                      <Badge tone="blue">{l.unread} ungelesen</Badge>
                    </>
                  )}
                  <div className="muted small">seit {d(l.created_at)}</div>
                </td>
                <td>{l.contacts}</td>
                <td>
                  {l.new_contacts} <span className="muted small">{tt('· {submissions} Formulare', { submissions: l.submissions })}</span>
                </td>
                <td>{euro(l.open_value)}</td>
                <td>{l.appointments}</td>
                <td className="small">
                  {l.funnels.map((f: any) => (
                    <div key={f.id}>
                      <a href={f.url} target="_blank" rel="noreferrer">
                        {f.domain || f.name}
                      </a>{' '}
                      {f.domain && <DomainBadge status={f.domain_status} />}
                    </div>
                  ))}
                  {!l.funnels.length && <span className="muted">–</span>}
                </td>
                <td>{l.users}</td>
                <td className="muted small">{l.last_activity ? ago(l.last_activity) : '–'}</td>
                <td className="actions">
                  <button className="btn small" onClick={() => open(l.id)}>
                    {tt('Öffnen')}
                  </button>
                  <button
                    className="btn small secondary"
                    onClick={async () => {
                      const r = await act(() => api.post('/api/snapshots', { location_id: l.id, name: `${l.name} – Vorlage` }), tt('Snapshot erstellt'));
                      if (r) snapshots.reload();
                    }}
                  >
                    {tt('Als Vorlage')}
                  </button>
                  <button className="btn small secondary" onClick={() => setBrand(l)}>
                    {tt('Branding')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {brand && (
        <Modal title={tt('Branding: {name}', { name: brand.name })} onClose={() => setBrand(null)} wide>
          <BrandingSettings locationId={brand.id} onSaved={() => setBrand(null)} />
        </Modal>
      )}
      {modal && (
        <NewClient
          snapshots={snapshots.data ?? []}
          onClose={() => setModal(false)}
          onDone={(r) => {
            setModal(false);
            setDone(r);
            overview.reload();
            session.reload();
          }}
        />
      )}
      {done && (
        <Modal title={tt('{name} ist angelegt', { name: done.location.name })} onClose={() => setDone(null)} footer={<button className="btn" onClick={() => (setDone(null), open(done.location.id))}>{tt('Zum Kunden wechseln')}</button>}>
          {done.created && (
            <p>
              {tt('Aus dem Snapshot: {length} Websites/Funnels, {length2} Formulare, {length3} Kalender, {length4} Workflows.', { length: done.created.funnels.length, length2: done.created.forms.length, length3: done.created.calendars.length, length4: done.created.workflows.length })}
            </p>
          )}
          {done.user && (
            <>
              <p>{tt('Zugang für den Kunden (jetzt notieren, das Passwort wird nicht noch mal angezeigt):')}</p>
              <CodeBox text={tt('{origin}/app  ·  {email}  ·  {password}', { origin: location.origin, email: done.user.email, password: done.password })} />
            </>
          )}
          <p className="muted">{tt('Nächster Schritt: beim Kunden unter Funnels & Websites die Domain eintragen.')}</p>
        </Modal>
      )}
    </>
  );
}

/** A snapshot made with "Wissen mitnehmen" (agents, notes, wiki, help centre, learnings – server/modules/knowledge-snapshot.ts). */
const hasKnowledge = (s: any) => !!(s?.summary?.agents || s?.summary?.memories || s?.summary?.wiki_pages || s?.summary?.kb_articles || s?.summary?.learnings);

function Snapshots() {
  const tt = useT('x_agency');
  const session = useSession();
  const list = useLoad(() => api.get<any[]>('/api/snapshots'), []);
  const [src, setSrc] = useState(session.locationId);
  const [nameV, setName] = useState('');
  const [apply, setApply] = useState<any>(null);
  const [target, setTarget] = useState('');
  const [activate, setActivate] = useState(false);
  const [knowledge, setKnowledge] = useState(false);
  const [lang, setLang] = useState('');
  const importFile = async (file: File) => {
    const text = await file.text();
    let name = file.name.replace(/\.json$/, '');
    try {
      name = JSON.parse(text).name || name;
    } catch {
      /* the server reports bad files */
    }
    const r = await act(() => api.post('/api/snapshots/import', { name, data: text }), tt('Snapshot importiert'));
    if (r) list.reload();
  };
  return (
    <>
      <SnapshotTemplates />
      <p className="muted">{tt('Ein Snapshot ist ein Startpaket: Websites mit Blog-Beiträgen, Funnels, Formulare, Kalender, Workflows, Pipelines, Vorlagen, Produkte, eigene Felder, Kurse (Module & Lektionen) und die Struktur der Community-Gruppen eines Sub-Accounts – ohne Kontakte, Kursteilnehmer oder Community-Beiträge. Damit legst du neue Kunden in Sekunden an.')}</p>
      <p className="muted">
        <b>{tt('Wissen mitnehmen')}</b> {tt('packt zusätzlich das Gelernte ein: KI-Agenten mit ihren Anweisungen, ihr Gedächtnis und gemerkte Notizen, das Wiki, die Hilfe-Artikel und eine Learnings-Seite aus deinen Zahlen (beste Betreffzeilen, Lead-Quellen, Kanäle). Ideal für ein neues Land oder eine neue Marke – beim Anwenden lässt sich alles übersetzen. Solche Snapshots enthalten internes Wissen: nicht an Kunden weitergeben.')}
      </p>
      <div className="card row" style={{ alignItems: 'flex-end' }} data-tour="snapshots-create">
        <Field label={tt('Aus Sub-Account')}>
          <Select value={src} onChange={setSrc} options={session.locations.map((l) => [l.id, l.name])} />
        </Field>
        <div className="grow">
          <Field label="Name">
            <Input value={nameV} onChange={setName} placeholder={tt('z. B. Handwerker-Website')} />
          </Field>
        </div>
        <button className="btn" style={{ marginBottom: 12 }} onClick={() => act(() => api.post('/api/snapshots', { location_id: src, name: nameV, include_knowledge: knowledge }), tt('Snapshot erstellt')).then(() => (setName(''), list.reload()))}>
          {tt('Snapshot erstellen')}
        </button>
        <div style={{ marginBottom: 12 }}>
          <Check checked={knowledge} onChange={setKnowledge} label={tt('Wissen mitnehmen')} />
        </div>
        <label className="btn secondary" style={{ marginBottom: 12 }}>
          {tt('JSON importieren')}
          <input type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
        </label>
      </div>
      {list.data?.length ? (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="t">
            <thead>
              <tr>
                <th>Name</th>
                <th>{tt('Inhalt')}</th>
                <th>{tt('Erstellt')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.name}</strong>
                    {s.description && <div className="muted small">{s.description}</div>}
                  </td>
                  <td className="small">
                    {tt('{funnels} Websites/Funnels ({pages} Seiten) · {forms} Formulare · {calendars} Kalender · {workflows} Workflows · {pipelines} Pipelines · {templates} Vorlagen', { funnels: s.summary.funnels, pages: s.summary.pages, forms: s.summary.forms, calendars: s.summary.calendars, workflows: s.summary.workflows, pipelines: s.summary.pipelines, templates: s.summary.templates })}
                    {s.summary.blog_posts ? tt(' · {blog_posts} Blog-Beiträge', { blog_posts: s.summary.blog_posts }) : ''}
                    {s.summary.courses ? tt(' · {courses} Kurse ({lessons} Lektionen)', { courses: s.summary.courses, lessons: s.summary.lessons }) : ''}
                    {s.summary.community_groups ? tt(' · {community_groups} Community-Gruppen', { community_groups: s.summary.community_groups }) : ''}
                    {hasKnowledge(s) && (
                      <div className="muted">
                        {tt('Wissen: {agents} KI-Agenten · {memories} Notizen · {wiki_pages} Wiki-Seiten · {kb_articles} Hilfe-Artikel', { agents: s.summary.agents, memories: s.summary.memories, wiki_pages: s.summary.wiki_pages, kb_articles: s.summary.kb_articles })}{s.summary.learnings ? tt(' · Learnings-Seite') : ''}
                      </div>
                    )}
                  </td>
                  <td className="muted">{dt(s.created_at)}</td>
                  <td className="actions">
                    <button className="btn small" onClick={() => (setApply(s), setTarget(''), setLang(''))}>
                      {tt('Anwenden')}
                    </button>
                    <a className="btn small secondary" href={`/api/snapshots/${s.id}/download`}>
                      {tt('Download')}
                    </a>
                    <button className="btn small ghost" onClick={() => confirmAsk(tt('Snapshot löschen?')) && act(() => api.del(`/api/snapshots/${s.id}`)).then(list.reload)}>
                      {tt('Löschen')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>{tt('Noch keine Snapshots. Bau einen Muster-Kunden mit Website & Workflows auf und speichere ihn als Vorlage.')}</Empty>
      )}
      {apply && (
        <Modal
          title={tt('„{name}“ anwenden', { name: apply.name })}
          onClose={() => setApply(null)}
          footer={
            <button
              className="btn"
              disabled={!target}
              onClick={async () => {
                const r = await act(() => api.post(`/api/snapshots/${apply.id}/apply`, { location_id: target, activate_workflows: activate, translate_to: lang }));
                if (r) {
                  const k = hasKnowledge(apply) ? `, ${r.knowledge_agents ?? 0} KI-Agenten, ${r.knowledge_wiki ?? 0} Wiki-Seiten${r.translated ? `, ${r.translated} Texte übersetzt` : ''}` : '';
                  toast(tt('Kopiert: {length} Websites/Funnels, {length2} Formulare, {length3} Workflows{k}', { length: r.funnels.length, length2: r.forms.length, length3: r.workflows.length, k: k }));
                  setApply(null);
                }
              }}
            >
              {tt('Hinzufügen')}
            </button>
          }
        >
          <p className="muted">{tt('Fügt alles als Kopie zum Sub-Account hinzu. Bestehendes bleibt unverändert.')}</p>
          <Field label={tt('Ziel-Sub-Account')}>
            <Select value={target} onChange={setTarget} placeholder={tt('wählen…')} options={session.locations.map((l) => [l.id, l.name])} />
          </Field>
          <Check checked={activate} onChange={setActivate} label={tt('Workflows gleich aktivieren')} />
          {hasKnowledge(apply) && (
            <Field label={tt('Wissen übersetzen in')} hint={tt('Agenten-Anweisungen, Notizen, Wiki, Hilfe-Artikel und Learnings – mit dem KI-Assistenten des Ziel-Sub-Accounts (kostet KI-Guthaben). Leer: unverändert übernehmen.')}>
              <Select value={lang} onChange={setLang} options={[['', '– nicht übersetzen –'], ['Englisch', 'Englisch'], ['Französisch', 'Französisch'], ['Spanisch', 'Spanisch'], ['Italienisch', 'Italienisch'], ['Niederländisch', 'Niederländisch'], ['Polnisch', 'Polnisch'], ['Deutsch', 'Deutsch']]} />
            </Field>
          )}
        </Modal>
      )}
    </>
  );
}

function Domains() {
  const tt = useT('x_agency');
  const data = useLoad(() => api.get('/api/agency/domains'), []);
  if (!data.data) return <Spinner />;
  const { server_ip, agent, domains } = data.data;
  return (
    <>
      <div className="card" data-tour="domains-howto">
        <h2>{tt('So kommt eine Kundendomain online')}</h2>
        <ol>
          <li>{tt('Beim Kunden unter Funnels & Websites → Einstellungen & Domain die Domain eintragen (z. B.')} <code>malerbetrieb-meier.de</code>).</li>
          <li>
            {tt('Beim Domain-Anbieter einen')} <strong>{tt('A-Record')}</strong> auf <code>{server_ip || tt('die Server-IP')}</code> {tt('setzen – für')} <code>@</code> und <code>www</code>.
          </li>
          <li>{tt('Fertig: Innerhalb weniger Minuten richtet der Domain-Agent nginx und das SSL-Zertifikat ein. Der Status steht unten.')}</li>
        </ol>
        {!agent && <p style={{ color: 'var(--red)' }}>{tt('Der Domain-Agent ist auf diesem Server nicht eingerichtet (PGHL_AGENT_TOKEN fehlt) – Domains müssen dann von Hand im Proxy eingetragen werden.')}</p>}
      </div>
      <div className="table-wrap" style={{ marginTop: 12 }} data-tour="domains-list">
        <table className="t">
          <thead>
            <tr>
              <th>{tt('Domain')}</th>
              <th>{tt('Art')}</th>
              <th>{tt('Kunde')}</th>
              <th>Status</th>
              <th>{tt('Geprüft')}</th>
            </tr>
          </thead>
          <tbody>
            {domains.map((x: any) => (
              <tr key={x.domain}>
                <td>
                  <a href={`https://${x.domain}`} target="_blank" rel="noreferrer">
                    {x.domain}
                  </a>
                  {x.alias && <div className="muted small">+ {x.alias}</div>}
                </td>
                <td>{x.kind === 'app' ? tt('Agentur-App') : tt('Website/Funnel')}</td>
                <td>{x.location ?? '–'}</td>
                <td>
                  <DomainBadge status={x} />
                  <div className="muted small">{x.message}</div>
                </td>
                <td className="muted">{x.checked_at ? ago(x.checked_at) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!domains.length && <Empty>{tt('Noch keine eigenen Domains.')}</Empty>}
      </div>
      <p>
        <button className="btn small secondary" onClick={() => data.reload()}>
          {tt('Aktualisieren')}
        </button>
      </p>
    </>
  );
}

function BrandingSettings({ locationId, onSaved }: { locationId?: string; onSaved?: () => void }) {
  const tt = useT('x_agency');
  const session = useSession();
  const url = locationId ? `/api/agency/locations/${locationId}/branding` : '/api/agency/branding';
  const b = useLoad(() => api.get(url), [url]);
  const agency = useLoad(() => (locationId ? api.get('/api/agency/branding') : Promise.resolve(null)), [locationId]);
  const info = useLoad(() => api.get('/api/agency/domains'), []);
  if (!b.data || (locationId && !agency.data)) return <Spinner />;
  const v = b.data;
  const fb = agency.data ?? {};
  const shown = { ...v, name: v.name || fb.name || '', color: v.color || fb.color || '#2563eb', logo_url: v.logo_url || fb.logo_url || '' };
  const set = (p: any) => b.setData({ ...v, ...p });
  // The client's own values over the agency's: what the logins actually see.
  const merged = (locationId ? { ...fb, ...Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '' && x !== undefined && x !== null)) } : v) as Branding;
  return (
    <>
    <div className="row" style={{ alignItems: 'flex-start' }}>
      <div className="card" style={{ flex: '2 1 420px' }} data-tour="branding-form">
        <div className="grid2">
          <Field label={locationId ? tt('App-Name für diesen Kunden') : tt('Name deiner Agentur / App')}>
            <Input value={v.name} onChange={(x) => set({ name: x })} placeholder={fb.name} />
          </Field>
          <Field label={tt('Markenfarbe')}>
            <input type="color" value={shown.color} onChange={(e) => set({ color: e.target.value })} />
            {locationId && v.color && (
              <button className="btn small secondary" onClick={() => set({ color: '' })}>
                {tt('Agentur-Farbe')}
              </button>
            )}
          </Field>
        </div>
        <h3 style={{ margin: '4px 0 8px' }}>{tt('Logos und Favicon')}</h3>
        <LogoSet v={v as Branding} fb={fb} set={set} client={!!locationId} />
        <MoreFields id="agency-branding-login" label={tt('Texte der Login-Seite')} values={[v.login_title, v.login_text, v.support_email]}>
          <Field label={tt('Login: Überschrift')}>
            <Input value={v.login_title} onChange={(x) => set({ login_title: x })} placeholder={tt('Anmelden bei {name}', { name: shown.name })} />
          </Field>
          <Field label={tt('Login: Text')}>
            <Textarea value={v.login_text} onChange={(x) => set({ login_text: x })} rows={2} placeholder={tt('Willkommen in deinem Kundenportal.')} />
          </Field>
          <Field label={tt('Support-E-Mail (auf der Login-Seite)')}>
            <Input value={v.support_email} onChange={(x) => set({ support_email: x })} />
          </Field>
        </MoreFields>
        <Field
          tour="branding-domain"
          label={locationId ? tt('Login-Domain des Kunden (optional)') : tt('Eigene App-Domain')}
          hint={
            locationId ? (
              <>
                {tt('z. B.')} <code>crm.kunde.de</code> {tt('– A-Record auf')} <code>{info.data?.server_ip || tt('die Server-IP')}</code>{tt('. Die Login-Seite dort zeigt das Branding des Kunden.')}
              </>
            ) : (
              <>
                {tt('z. B.')} <code>app.deine-agentur.de</code> {tt('– A-Record auf')} <code>{info.data?.server_ip || tt('die Server-IP')}</code>{tt('. Kunden loggen sich dann dort ein, und Links in Mails (Buchung, Rechnung) nutzen diese Domain, sobald HTTPS aktiv ist.')}
              </>
            )
          }
        >
          <Input value={v.app_domain} onChange={(x) => set({ app_domain: x })} />
        </Field>
        {v.app_domain && <DomainBadge status={v.app_domain_status} />}
        <p>
          <button
            className="btn"
            onClick={async () => {
              const r = await act(() => api.patch(url, v), tt('Branding gespeichert'));
              if (r) {
                b.setData(r);
                if (onSaved) onSaved();
                else session.reload();
              }
            }}
          >
            {tt('Speichern')}
          </button>
        </p>
      </div>
      <div className="card" style={{ flex: '1 1 260px' }} data-tour="branding-preview">
        <h2>{tt('Vorschau')}</h2>
        <LogoPreview shown={{ ...merged, name: shown.name, color: shown.color }} />
        <p className="muted small">{locationId ? tt('Das sehen die Logins dieses Kunden. Leere Felder = dein Agentur-Branding.') : tt('„HyperLevel“ taucht danach nirgends mehr auf – auch nicht für Kunden-Logins.')}</p>
      </div>
    </div>
    <BrandingLook locationId={locationId} />
    </>
  );
}

function Integrations() {
  const tt = useT('x_agency');
  const s = useLoad(() => api.get<any>('/api/agency/social'), []);
  const locs = useLoad(() => api.get<any[]>('/api/agency/overview'), []);
  const [url, setUrl] = useState<string | null>(null);
  const [key, setKey] = useState('');
  if (!s.data || !locs.data) return <Spinner />;
  const v = s.data;
  return (
    <div className="row" style={{ alignItems: 'flex-start' }}>
      <div className="card" style={{ flex: '1 1 340px' }} data-tour="integrations-postiz">
        <h2>{tt('Postiz (Social Planner)')} <SignupLink id="postiz" /></h2>
        <p className="muted small">{tt('Postiz veröffentlicht die Posts. Deine Kunden planen im Social Planner, ohne Postiz zu sehen.')}</p>
        <Field label={tt('Adresse')}>
          <Input value={url ?? v.url} onChange={setUrl} placeholder="https://postiz.deine-domain.de" />
        </Field>
        <Field label={tt('API-Schlüssel')} hint={tt('Postiz → Einstellungen → Public API')}>
          <Input type="password" value={key} onChange={setKey} placeholder={v.key_set ? tt('•••••••• (gespeichert)') : ''} autoComplete="off" />
        </Field>
        <p>
          <button
            className="btn"
            onClick={async () => {
              const r = await act(() => api.patch('/api/agency/social', { url: url ?? v.url, ...(key ? { api_key: key } : {}) }), tt('Verbunden'));
              if (r) (setKey(''), setUrl(null), s.reload());
            }}
          >
            {tt('Speichern & testen')}
          </button>{' '}
          {v.key_set && (v.connected ? <Badge tone="green">verbunden</Badge> : <Badge tone="red">{v.error || tt('nicht erreichbar')}</Badge>)}
        </p>
      </div>
      {v.connected && (
        <div className="card" style={{ flex: '2 1 480px' }}>
          <h2>{tt('Kanäle → Projekte')}</h2>
          <p className="muted small">{tt('Ein Kanal kann mehreren Projekten dienen (z. B. dein X-Account für die Agentur und ein Produkt). Verbindet ein Kunde selbst einen Kanal, wird er automatisch zugeordnet.')}</p>
          {v.channels.length ? (
            <table className="t">
              <tbody>
                {v.channels.map((c: any) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.name}</strong> <span className="muted small">{c.identifier}{c.profile ? ` · ${c.profile}` : ''}</span>
                      {!c.supported && <div className="muted small">{tt('Planen nur in Postiz (Video/Newsletter)')}</div>}
                    </td>
                    <td style={{ width: 280 }}>
                      <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                        {(c.location_ids ?? []).map((id: string) => (
                          <span key={id} className="social-chip" style={{ padding: '2px 8px' }}>
                            {locs.data!.find((l: any) => l.id === id)?.name ?? id}
                            <button
                              className="btn small ghost"
                              style={{ padding: '0 4px' }}
                              aria-label={tt('Zuordnung entfernen')}
                              onClick={async () => (await act(() => api.put(`/api/agency/social/channels/${c.id}`, { location_ids: c.location_ids.filter((x: string) => x !== id) }), tt('Entfernt'))) && s.reload()}
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                      <Select
                        value=""
                        placeholder={tt('+ Projekt zuordnen')}
                        onChange={async (loc) => {
                          if (loc && (await act(() => api.put(`/api/agency/social/channels/${c.id}`, { location_ids: [...(c.location_ids ?? []), loc] }), tt('Zugeordnet')))) s.reload();
                        }}
                        options={locs.data!.filter((l: any) => !(c.location_ids ?? []).includes(l.id)).map((l: any) => [l.id, l.name])}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>{tt('In Postiz sind noch keine Kanäle verbunden.')}</Empty>
          )}
        </div>
      )}
    </div>
  );
}

export function Agency({ tab = 'projects' }: { tab?: string }) {
  const tt = useT('x_agency');
  const cloud = !!useAppInfo()?.cloud?.enabled;
  return (
    <>
      <PageHead title={tt('Agentur')} sub={tt('Alle Projekte und Kunden, Vorlagen, Domains, White-Label, API und Protokoll an einem Ort')}>
        <LearnLink label="learn" />
      </PageHead>
      {tab === 'projects' && <AcademyWelcome />}
      <AgencyTabs
        tabs={[
          ['projects', 'Projekte'],
          ['contacts', 'Kontakte'],
          ['deals', 'Deals'],
          ['tasks', 'Aufgaben'],
          ['docs', 'Dokumente'],
          ['clients', 'Kunden'],
          ['saas', 'SaaS'],
          ...(cloud ? ([['cloud', 'Cloud']] as [string, string][]) : []),
          ['snapshots', 'Snapshots'],
          ['umzug', 'Umzug'],
          ['domains', 'Domains'],
          ['branding', 'White-Label'],
          ['login', 'Anmeldung'],
          ['integrations', 'Integrationen'],
          ['partner-links', 'Partner-Links'],
          ['api', 'API & MCP'],
          ['mcp-servers', 'MCP-Server'],
          ['ai-tools', 'KI-Werkzeuge'],
          ['ai-providers', 'KI-Anbieter (BYOK)'],
          ['feedback', 'Fehler & Wünsche'],
          ['audit', 'Protokoll'],
          ['system', 'System'],
        ]}
        value={tab}
        onChange={(t) => navigate(`agency/${t}`)}
      />
      <PageSuspense key={tab}>
      {tab === 'projects' && <ProjectsOverview />}
      {tab === 'contacts' && <AllContacts />}
      {tab === 'deals' && <AllDeals />}
      {tab === 'tasks' && <AllTasks />}
      {tab === 'docs' && <AgencyDocs />}
      {tab === 'clients' && (
        <>
          <Clients />
          <Slot name="agency.clients" />
        </>
      )}
      {tab === 'saas' && <SaasAdmin />}
      {tab === 'cloud' && cloud && <CloudConsole />}
      {tab === 'snapshots' && <Snapshots />}
      {tab === 'umzug' && <UmzugAssistent embedded />}
      {tab === 'domains' && <Domains />}
      {tab === 'branding' && (
        <>
          <BrandingSettings />
          <Slot name="agency.branding" />
        </>
      )}
      {tab === 'login' && <LoginSettings />}
      {tab === 'integrations' && (
        <AgencyIntegrationsHub>
          <Integrations />
          <OAuthApps />
          <MailAccounts />
          <MailboxAgencyCard />
          <SupabaseMirror />
          <TodoistSync />
          <OpenShortsSetup />
          <ComposioAgencySetup />
          <NangoAgencySetup />
          <CogneeAgencySetup />
        </AgencyIntegrationsHub>
      )}
      {tab === 'partner-links' && <PartnerLinks />}
      {tab === 'api' && <ApiAndMcp />}
      {tab === 'mcp-servers' && <McpServers agency />}
      {tab === 'ai-tools' && <AiTools agency />}
      {tab === 'ai-providers' && <AiConnections agency />}
      {tab === 'feedback' && <AgencyFeedback />}
      {tab === 'audit' && <AuditLog />}
      {tab === 'system' && (
        <>
          <SystemHealth />
          <Slot name="agency.system" />
        </>
      )}
      </PageSuspense>
    </>
  );
}
