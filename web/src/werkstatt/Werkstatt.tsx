import { useEffect, useRef, useState } from 'react';
import { api, ago, currentLocation, dt } from '../api';
import { Icon } from '../icons';
import { useSession } from '../session';
import { Badge, Empty, Field, Link, Modal, PageHead, Spinner, Tabs, Textarea, act, navigate, useLoad, useRoute } from '../ui';
import { useWerkstattNotes, type Notice } from './Nav';
import { BuildView, StatusBadge, useBuild, useWerkstattMe, type Build, type WerkstattMe } from './Build';
import { PluginDetail, PluginsTab } from './Plugins';
import { AgencyTab, CoreTab, FlagsTab, PolicyTab } from './Admin';
import { NAMES, openBuild, usd } from './shared';
import { ModelGateNotice } from './badges';
import { useT } from '../i18n';

/**
 * The Werkstatt: where wishes get built. Tabs: Aufträge (builds), Plugins (mine / examples / import), and for admins
 * Freigaben, alle Plugins, Richtlinien, Funktionen (feature flags) and Kernfeatures. Routes: werkstatt/<tab>,
 * werkstatt/plugins/<id> (one plugin), werkstatt/<build id>.
 */

const TABS = ['builds', 'plugins', 'approvals', 'agency', 'policy', 'flags', 'core'];

export function WerkstattPage() {
  const tt = useT('x_ai');
  const route = useRoute();
  const [, a, b] = route;
  const me = useWerkstattMe();
  const admin = !!me.data?.admin;
  const tab = !a ? 'builds' : TABS.includes(a) ? a : 'build';
  const tabs: [string, string][] = [
    ['builds', tt('Aufträge')],
    ['plugins', tt('Meine Plugins')],
    ...(admin ? ([['approvals', me.data?.pending_approvals ? tt('Freigaben ({n})', { n: me.data.pending_approvals }) : tt('Freigaben')], ['agency', tt('Alle Plugins')], ['policy', tt('Richtlinien')], ['flags', tt('Funktionen')], ['core', tt('Kernfeatures')]] as [string, string][]) : []),
  ];
  return (
    <>
      <PageHead title={tt(NAMES.werkstatt)} sub={tt('Hier werden Wünsche gebaut – erst nur für dich, später für alle.')}>
        <Link to="marktplatz" className="btn secondary">
          <Icon name="store" size={14} /> {tt(NAMES.marktplatz)}
        </Link>
        <button className="btn" data-tour="wk-new" onClick={() => openBuild()}>
          <Icon name="hammer" size={14} /> {tt(NAMES.build)}
        </button>
      </PageHead>
      {me.data && <MeBar me={me.data} />}
      {me.data?.can_build && !me.data.ai_problem && me.data.model_gate && !me.data.model_gate.ok && <ModelGateNotice gate={me.data.model_gate} />}
      <NoticesStrip />
      {tab !== 'build' && !(tab === 'plugins' && b) && <Tabs tabs={tabs} value={tab} onChange={(k) => navigate(`werkstatt/${k === 'builds' ? '' : k}`.replace(/\/$/, ''))} />}
      {tab === 'builds' && <BuildsTab me={me.data} />}
      {tab === 'build' && a && <BuildPage id={a} me={me.data} />}
      {tab === 'plugins' && (b ? <PluginDetail id={b} /> : <PluginsTab me={me.data} />)}
      {admin && tab === 'approvals' && <ApprovalsTab />}
      {admin && tab === 'agency' && <AgencyTab />}
      {admin && tab === 'policy' && <PolicyTab />}
      {admin && tab === 'flags' && <FlagsTab />}
      {admin && tab === 'core' && <CoreTab />}
    </>
  );
}

/** Who may build, the AI budget of this sub-account – and why a button is off. */
function MeBar({ me }: { me: WerkstattMe }) {
  const tt = useT('x_ai');
  const pct = me.budget.limit_usd > 0 ? Math.min(100, Math.round((me.budget.used_usd / me.budget.limit_usd) * 100)) : 100;
  return (
    <div className="wk-me card" data-tour="wk-budget">
      <div className="grow">
        <strong>{tt('KI-Budget dieses Monats')}</strong>
        <div className="wk-meter" role="progressbar" aria-label={tt('Fortschritt')} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${pct}%` }} className={pct >= 90 ? 'hot' : ''} />
        </div>
        <span className="muted small">
          {tt('{usd} von {usd2} verbraucht · Bauen darf:', { usd: usd(me.budget.used_usd), usd2: usd(me.budget.limit_usd) })} {tt({ admins: 'nur Admins', team: 'das Team', everyone: 'jede Person' }[me.who as 'admins'] ?? '')}
          {me.approval ? tt(' · mit Freigabe durch einen Admin') : ''}
        </span>
      </div>
      {!me.can_build && <p className="muted small">{me.reason}</p>}
      {me.can_build && me.ai_problem && (
        <p className="muted small">
          {me.ai_problem} {me.ai_hint}
        </p>
      )}
      {me.can_build && !me.ai_problem && <p className="muted small">{tt('KI: {label} · {model}', { label: me.ai.label, model: me.ai.model })}</p>}
      {me.can_build && !me.ai_problem && me.model_gate?.ok && <ModelGateNotice gate={me.model_gate} />}
      {me.server_logic !== 'script' && <p className="muted small">{tt('Server-Logik:')} {me.server_logic === 'declarative' ? tt('nur deklarative Schritte (ohne Skripte)') : 'ausgeschaltet'}.</p>}
    </div>
  );
}

/** Opens a link from a note or notification: in the right sub-account (an admin may be looking at another one). */
function useOpenLink() {
  const session = useSession();
  return (url: string) => {
    const u = new URL(url, location.origin);
    const loc = u.searchParams.get('loc');
    u.searchParams.delete('loc');
    const path = `${u.pathname}${u.search}`;
    if (loc && loc !== currentLocation()) session.switchLocation(loc, path.replace(/^\/app\//, ''));
    else navigate(path);
  };
}

/** What happened to your orders since you last looked (plan ready, approved, finished …). */
function NoticesStrip() {
  const tt = useT('x_ai');
  const { notices, unread, reload } = useWerkstattNotes();
  const open = useOpenLink();
  const fresh = notices.filter((n) => !n.read_at).slice(0, 5);
  if (!unread) return null;
  const go = async (n: Notice) => {
    await api.post('/api/werkstatt/notices/read', { ids: [n.id] }).catch(() => {});
    reload();
    open(n.url);
  };
  return (
    <div className="card wk-notes-strip" data-tour="wk-notices">
      <div className="row" style={{ alignItems: 'center' }}>
        <strong className="grow">{tt('Neu für dich')}</strong>
        <button className="btn ghost small" onClick={async () => (await api.post('/api/werkstatt/notices/read', {}).catch(() => {}), reload())}>
          {tt('Alle gelesen')}
        </button>
      </div>
      <ul>
        {fresh.map((n) => (
          <li key={n.id}>
            <a href={n.url} onClick={(e) => (e.preventDefault(), void go(n))}>
              <strong>{n.title}</strong>
            </a>
            {n.body && <div className="muted small">{n.body}</div>}
            <span className="muted small">{ago(n.created_at)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function useAutoReload(reload: () => unknown, busy: boolean, ms = 2500) {
  const r = useRef(reload);
  r.current = reload;
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => void r.current(), ms);
    return () => clearInterval(t);
  }, [busy, ms]);
}

function BuildRow({ b, admin }: { b: Build; admin?: boolean }) {
  const tt = useT('x_ai');
  const open = useOpenLink();
  // An admin sees the orders of every sub-account here: opening one switches to its sub-account first.
  const foreign = !!b.location_id && b.location_id !== currentLocation();
  return (
    <a
      href={`/app/werkstatt/${b.id}`}
      className="wk-row card"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.button !== 0) return;
        e.preventDefault();
        open(foreign ? `/app/werkstatt/${b.id}?loc=${b.location_id}` : `/app/werkstatt/${b.id}`);
      }}
    >
      <div className="grow">
        <strong>{b.title}</strong>
        <div className="muted small">
          {b.kind === 'change' ? tt('Änderung') : b.stage_label ? tt('Stufe {stage} · {stage_label}', { stage: b.stage, stage_label: tt(b.stage_label) }) : tt('wird analysiert')} · {ago(b.created_at)}
          {admin && b.user ? ` · ${b.user}${b.location ? ` (${b.location})` : ''}` : ''}
        </div>
      </div>
      <span className="muted small">{usd(b.cost_usd)}</span>
      <StatusBadge b={b} />
    </a>
  );
}

function BuildsTab({ me }: { me?: WerkstattMe }) {
  const tt = useT('x_ai');
  const l = useLoad(() => api.get<Build[]>('/api/werkstatt/builds'), []);
  const busy = !!l.data?.some((b) => ['planning', 'building'].includes(b.status));
  useAutoReload(l.reload, busy);
  if (l.loading && !l.data) return <Spinner />;
  const list = l.data ?? [];
  if (!list.length)
    return (
      <Empty tour="wk-empty" action={<button className="btn" onClick={() => openBuild()}>{tt(NAMES.build)}</button>}>
        {tt('Noch keine Aufträge. Beschreibe, was du dir wünschst – die KI schlägt einen Plan vor und baut ihn nach deiner Bestätigung.')}
        {me && !me.can_build ? ` (${me.reason})` : ''}
      </Empty>
    );
  return (
    <div className="wk-list" data-tour="wk-builds">
      {list.map((b) => (
        <BuildRow key={b.id} b={b} admin={me?.admin} />
      ))}
    </div>
  );
}

/** One order: plan, confirmation, log. Admins also approve or reject here. */
function BuildPage({ id, me }: { id: string; me?: WerkstattMe }) {
  const tt = useT('x_ai');
  const r = useBuild(id);
  // Deep link from the email or the push buttons: ?action=approve|reject opens the decision dialog (never decides by itself).
  const [deciding, setDeciding] = useState<'approve' | 'reject' | null>(() => {
    const a = new URLSearchParams(location.search).get('action');
    return a === 'approve' || a === 'reject' ? a : null;
  });
  const b = r.data;
  useEffect(() => {
    if (new URLSearchParams(location.search).has('action')) history.replaceState(history.state, '', location.pathname);
  }, []);
  if (r.loading && !b) return <Spinner />;
  if (!b) return <Empty>{tt('Auftrag nicht gefunden.')}</Empty>;
  const canDecide = !!me?.admin && b.status === 'awaiting_approval';
  return (
    <div className="wk-build">
      <p>
        <Link to="werkstatt">{tt('← Alle Aufträge')}</Link>
      </p>
      <h2 style={{ marginTop: 0 }}>{b.title}</h2>
      <p className="muted small">
        {b.user}
        {b.location ? ` · ${b.location}` : ''} · {dt(b.created_at)}
        {b.wish_id && (
          <>
            {' · '}
            <Link to={`wishes/${b.wish_id}`}>{tt('Wunsch ansehen')}</Link>
          </>
        )}
      </p>
      <details className="wk-text">
        <summary>{tt('Wunsch im Wortlaut')}</summary>
        <p style={{ whiteSpace: 'pre-wrap' }}>{b.text}</p>
      </details>
      <div className="card">
        <BuildView b={b} me={me} onChange={() => void r.reload()} />
      </div>
      {canDecide && (
        <div className="card wk-approve" data-tour="wk-approve">
          <h3 style={{ marginTop: 0 }}>{tt('Freigabe')}</h3>
          <p className="muted small">{tt('Gebaut wird mit den Rechten der Auftraggeberin bzw. des Auftraggebers, nur in')} {b.location || tt('ihrem Sub-Account')}{tt('. Plan, Berechtigungen und Kosten siehst du oben.')}</p>
          <div className="actions">
            <button className="btn danger" onClick={() => setDeciding('reject')}>
              {tt('Ablehnen')}
            </button>
            <button className="btn" onClick={() => setDeciding('approve')}>
              <Icon name="ok" size={14} /> {tt('Freigeben und bauen')}
            </button>
          </div>
        </div>
      )}
      {me?.admin && deciding && b.status !== 'awaiting_approval' && <DecideInfo b={b} onClose={() => setDeciding(null)} />}
      {canDecide && deciding && <DecideModal b={b} what={deciding} onClose={() => setDeciding(null)} onDone={() => (setDeciding(null), void r.reload(), window.dispatchEvent(new Event('pghl:notes')))} />}
    </div>
  );
}

function DecideInfo({ b, onClose }: { b: Build; onClose: () => void }) {
  const tt = useT('x_ai');
  return (
    <Modal title={tt('Schon entschieden')} onClose={onClose} footer={<button className="btn" onClick={onClose}>OK</button>}>
      <p>{tt('Dieser Auftrag wartet nicht mehr auf eine Freigabe: {status_label}.', { status_label: tt(b.status_label) })}</p>
    </Modal>
  );
}

/** Approve or decline: shows what is about to happen and asks for a note. ✕ and Esc close it. */
function DecideModal({ b, what, onClose, onDone }: { b: Build; what: 'approve' | 'reject'; onClose: () => void; onDone: () => void }) {
  const tt = useT('x_ai');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    const r = await act(() => api.post(`/api/werkstatt/builds/${b.id}/${what}`, { note }), what === 'approve' ? tt('Freigegeben – der Bau startet') : tt('Abgelehnt'));
    setBusy(false);
    if (r) onDone();
  };
  const est = b.plan?.estimate?.typical_usd;
  return (
    <Modal
      title={what === 'approve' ? tt('„{title}“ freigeben?', { title: b.title }) : tt('„{title}“ ablehnen?', { title: b.title })}
      onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={onClose}>
            {tt('Abbrechen')}
          </button>
          <button className={`btn${what === 'reject' ? ' danger' : ''}`} disabled={busy} onClick={go}>
            {what === 'approve' ? tt('Freigeben und bauen') : tt('Ablehnen')}
          </button>
        </>
      }
    >
      <p>
        {b.user}
        {b.location ? ` (${b.location})` : ''} {tt('möchte „{title}“ bauen lassen', { title: b.title })}{est ? tt(' – geschätzte KI-Kosten {usd}', { usd: usd(est) }) : ''}.
      </p>
      {what === 'approve' ? <p className="muted small">{tt('Gebaut wird mit den Rechten der Auftraggeberin bzw. des Auftraggebers, nur in deren Sub-Account. Die Berechtigungen hat sie bzw. er im Plan bestätigt.')}</p> : <p className="muted small">{tt('Die Person wird benachrichtigt – schreib ihr gern kurz, warum.')}</p>}
      <Field label={what === 'approve' ? tt('Notiz (optional)') : tt('Begründung')}>
        <Textarea value={note} onChange={setNote} rows={3} />
      </Field>
    </Modal>
  );
}

interface AgencyData {
  builds: Build[];
  spent: { location_id: string; location: string; spent_usd: number; limit_usd: number }[];
}

/** Admins: orders waiting for approval first, then the last builds of the whole agency. */
function ApprovalsTab() {
  const tt = useT('x_ai');
  const l = useLoad(() => api.get<AgencyData>('/api/werkstatt/agency'), []);
  useAutoReload(l.reload, !!l.data?.builds.some((b) => ['planning', 'building'].includes(b.status)));
  if (l.loading && !l.data) return <Spinner />;
  const d = l.data;
  if (!d) return null;
  const waiting = d.builds.filter((b) => b.status === 'awaiting_approval');
  const rest = d.builds.filter((b) => b.status !== 'awaiting_approval');
  return (
    <>
      <h3>{tt('Warten auf Freigabe')}</h3>
      {waiting.length ? waiting.map((b) => <BuildRow key={b.id} b={b} admin />) : <p className="muted">{tt('Nichts offen.')}</p>}
      <h3>{tt('Letzte Aufträge der Agentur')}</h3>
      {rest.length ? rest.map((b) => <BuildRow key={b.id} b={b} admin />) : <p className="muted">{tt('Noch keine Aufträge.')}</p>}
      <h3>{tt('KI-Budget je Sub-Account')}</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{tt('Sub-Account')}</th>
              <th>{tt('Verbraucht')}</th>
              <th>{tt('Budget')}</th>
            </tr>
          </thead>
          <tbody>
            {d.spent.map((s) => (
              <tr key={s.location_id}>
                <td>{s.location}</td>
                <td>{usd(s.spent_usd)}</td>
                <td>
                  {usd(s.limit_usd)} {s.spent_usd >= s.limit_usd && <Badge tone="red">{tt('aufgebraucht')}</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
