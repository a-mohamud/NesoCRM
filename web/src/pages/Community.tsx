import { useEffect, useState } from 'react';
import { Icon } from '../icons';
import { ago, api, currentLocation, d, dt, name } from '../api';
import { act, Badge, Check, CodeBox, confirmAsk, Empty, Field, Input, Link, Modal, navigate, PageHead, pressable, Select, Spinner, Tabs, TagInput, Textarea, useLoad } from '../ui';
import { ImagePicker, MarkdownEditor } from './ContentKit';
import { useCourses } from './Courses';
import { lazyPages } from '../lazy';
import { MoreFields } from '../areas/fields';
import { communityMoreValues } from '../areas/marketing-fields';
import { SortableGrid } from '../sortable/Sortable';
import { tr, useT } from '../i18n';

const { JoinTab } = lazyPages(() => import('./CommunityJoin'), 'JoinTab');
const { StatsTab } = lazyPages(() => import('./CommunityStats'), 'StatsTab');
const { GrowthTab } = lazyPages(() => import('./CommunityGrowth'), 'GrowthTab');
const { EngageTab } = lazyPages(() => import('./CommunityEngage'), 'EngageTab');
const { MessagesTab } = lazyPages(() => import('./CommunityMessages'), 'MessagesTab');
const { ImportModal } = lazyPages(() => import('./CommunityImport'), 'ImportModal');

/**
 * Community (Seiten → Community): groups with channels in the member portal. Moderation (posts,
 * comments, reports, bans), events, leaderboard, access rules, word filter, rate limits, points and
 * levels. Members write in the portal; the team can post and answer from here.
 */

export const useGroups = () => useLoad(() => api.get<any[]>('/api/community/groups'), []);

const MODE_LABEL: Record<string, string> = { all: 'Alle im Mitgliederbereich', courses: 'Teilnehmer bestimmter Kurse', tags: 'Kontakte mit bestimmten Tags', join: 'Beitritt über die Community-Seite' };
const fileUrl = (u: string) => `${u}${u.includes('?') ? '&' : '?'}locationId=${encodeURIComponent(currentLocation())}`;
const toLocalInput = (iso?: string) => {
  if (!iso) return '';
  const dd = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dd.getFullYear()}-${pad(dd.getMonth() + 1)}-${pad(dd.getDate())}T${pad(dd.getHours())}:${pad(dd.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : '');

function accessText(g: any, courses: any[]) {
  const a = g.access ?? {};
  const t = tr('x_community');
  if (a.mode === 'courses') return `${t('Kurse:')} ${(a.course_ids ?? []).map((id: string) => courses.find((c) => c.id === id)?.title ?? '?').join(', ') || '–'}`;
  if (a.mode === 'tags') return `Tags: ${(a.tags ?? []).join(', ') || '–'}`;
  if (a.mode === 'join') return t(MODE_LABEL.join);
  return t(MODE_LABEL.all);
}

// --- list page ------------------------------------------------------------------------------
function NewGroup({ onClose }: { onClose: () => void }) {
  const tt = useT('x_community');
  const [f, setF] = useState({ name: '', description: '' });
  const create = async () => {
    const r = await act(() => api.post('/api/community/groups', f));
    if (r) navigate(`community/${r.id}`);
  };
  return (
    <Modal
      title={tt('Neue Gruppe')}
      onClose={onClose}
      footer={
        <button className="btn" disabled={!f.name.trim()} onClick={create}>
          {tt('Anlegen')}
        </button>
      }
    >
      <Field tour="community-name" label="Name" hint={tt('Startet mit den Kanälen Allgemein, Vorstellungsrunde und Ankündigungen (nur Team). Zugang: alle im Mitgliederbereich – änderbar.')}>
        <Input value={f.name} onChange={(v) => setF({ ...f, name: v })} autoFocus placeholder={tt('z. B. Mastermind')} />
      </Field>
      <Field label={tt('Beschreibung (optional)')}>
        <Textarea value={f.description} onChange={(v) => setF({ ...f, description: v })} rows={3} />
      </Field>
    </Modal>
  );
}

function DigestSettings() {
  const tt = useT('x_community');
  const s = useLoad(() => api.get('/api/community/settings'), []);
  const [v, setV] = useState<any>(null);
  useEffect(() => {
    if (s.data) setV(s.data);
  }, [s.data]);
  if (!v) return <Spinner />;
  return (
    <div className="grid2 course-settings">
      <div className="card">
        <h2>{tt('Mitgliederbereich')}</h2>
        <Field label={tt('Community-Adresse')}>
          <CodeBox text={v.portal_url} />
        </Field>
        <p className="muted small">{tt('Mitglieder melden sich wie bei den Kursen mit ihrer E-Mail an (Login-Link). Wer nur über eine Gruppe Zugang hat (Tag oder Kurs), kann sich ebenfalls anmelden.')}</p>
      </div>
      <div className="card">
        <h2>{tt('Tägliche Zusammenfassung')}</h2>
        <Check checked={v.digest_enabled} onChange={(x) => setV({ ...v, digest_enabled: x })} label={tt('Mitgliedern einmal am Tag ihre ungelesenen Benachrichtigungen mailen')} />
        <Field label={tt('Ab Uhrzeit')} hint={tt('In der Zeitzone des Sub-Accounts. Versand über Einstellungen → E-Mail & SMS (SMTP); Mitglieder können sie im Profil abbestellen.')}>
          <Select value={String(v.digest_hour)} onChange={(x) => setV({ ...v, digest_hour: Number(x) })} options={Array.from({ length: 24 }, (_, h) => [String(h), `${String(h).padStart(2, '0')}:00 Uhr`] as [string, string])} />
        </Field>
        <button className="btn" onClick={() => act(() => api.put('/api/community/settings', { digest_enabled: v.digest_enabled, digest_hour: v.digest_hour }), tt('Gespeichert'))}>
          {tt('Speichern')}
        </button>
      </div>
    </div>
  );
}

export function Community({ tab: initial }: { tab?: string }) {
  const tt = useT('x_community');
  const groups = useGroups();
  const courses = useCourses();
  const [tab, setTab] = useState(initial === 'reports' || initial === 'settings' ? initial : 'groups');
  const [modal, setModal] = useState(false);
  const open = (groups.data ?? []).reduce((n, g) => n + (g.open_reports || 0), 0);
  return (
    <>
      <PageHead title="Community" sub={tt('Gruppen mit Kanälen, Beiträgen, Terminen und Rangliste im Mitgliederbereich')}>
        <button className="btn" data-tour="community-new" onClick={() => setModal(true)}>
          {tt('+ Neue Gruppe')}
        </button>
      </PageHead>
      <Tabs tabs={[['groups', tt('Gruppen')], ['reports', `${tt('Meldungen')}${open ? ` (${open})` : ''}`], ['settings', tt('Einstellungen')]]} value={tab} onChange={setTab} />
      {tab === 'reports' ? (
        <Reports onChange={groups.reload} />
      ) : tab === 'settings' ? (
        <DigestSettings />
      ) : groups.loading && !groups.data ? (
        <Spinner />
      ) : groups.data?.length ? (
        <SortableGrid id="community-list" className="course-grid" data-tour="community-list">
          {groups.data.map((g) => (
            <div key={g.id} className="card course-card" {...pressable(() => navigate(`community/${g.id}`))}>
              <div className="course-cover cm-cover-admin" style={g.cover_image ? { backgroundImage: `url("${g.cover_image}")` } : undefined}>
                {!g.cover_image && <Icon name="community" size={34} />}
                <Badge tone={g.status === 'active' ? 'green' : 'gray'}>{g.status === 'active' ? tt('Aktiv') : tt('Archiviert')}</Badge>
              </div>
              <div className="course-body">
                <h3>{g.name}</h3>
                <div className="muted small">{accessText(g, courses.data ?? [])}</div>
                <div className="small">
                  <Icon name="contacts" size={14} /> {tt('{members} Mitglieder · {posts} Beiträge', { members: g.members, posts: g.posts })}
                  {g.upcoming_events ? tt(' · {upcoming_events} Termine', { upcoming_events: g.upcoming_events }) : ''}
                </div>
                {g.open_reports > 0 && <Badge tone="red">{tt('{open_reports} offene Meldungen', { open_reports: g.open_reports })}</Badge>}
              </div>
            </div>
          ))}
        </SortableGrid>
      ) : (
        <Empty action={<button className="btn" onClick={() => setModal(true)}>{tt('Erste Gruppe anlegen')}</button>}>
          {tt('Noch keine Community. Lege eine Gruppe an – Mitglieder schreiben Beiträge, kommentieren, sammeln Punkte und sehen eure Termine im Mitgliederbereich.')}
        </Empty>
      )}
      {modal && <NewGroup onClose={() => setModal(false)} />}
    </>
  );
}

// --- reports ---------------------------------------------------------------------------------------
function Reports({ groupId, onChange }: { groupId?: string; onChange?: () => void }) {
  const tt = useT('x_community');
  const [status, setStatus] = useState('open');
  const list = useLoad(() => api.get<any[]>(`/api/community/reports?status=${status}${groupId ? `&group_id=${groupId}` : ''}`), [status, groupId]);
  const [view, setView] = useState('');
  const decide = async (r: any, action: string) => {
    if (action === 'delete' && !confirmAsk(tt('Endgültig löschen?'))) return;
    if (await act(() => api.patch(`/api/community/reports/${r.id}`, { action }), action === 'dismiss' ? tt('Meldung verworfen') : action === 'hide' ? tt('Ausgeblendet') : tt('Gelöscht'))) {
      void list.reload();
      onChange?.();
    }
  };
  return (
    <>
      <div className="row" style={{ marginBottom: 12, alignItems: 'center' }}>
        <div style={{ width: 200 }}>
          <Select value={status} onChange={setStatus} options={[['open', tt('Offen')], ['resolved', tt('Erledigt')], ['dismissed', tt('Verworfen')], ['all', tt('Alle')]]} />
        </div>
        <span className="muted small">{tt('Mitglieder melden Beiträge und Kommentare im Mitgliederbereich. Ab der eingestellten Zahl an Meldungen wird automatisch ausgeblendet, bis du entscheidest.')}</span>
      </div>
      {list.loading && !list.data ? (
        <Spinner />
      ) : list.data?.length ? (
        list.data.map((r) => (
          <div key={r.id} className="card cm-report-card">
            <div className="row" style={{ alignItems: 'center' }}>
              <Icon name="shield" />
              <strong className="grow">
                {r.kind === 'post' ? tt('Beitrag') : tt('Kommentar')} {tt('in „{group_name}“', { group_name: r.group_name })}
              </strong>
              <Badge tone={r.status === 'open' ? 'red' : 'gray'}>{r.status === 'open' ? 'offen' : r.status === 'resolved' ? 'erledigt' : 'verworfen'}</Badge>
              {r.target?.status === 'hidden' && <Badge tone="yellow">{tt('ausgeblendet')}</Badge>}
            </div>
            <p className="muted small" style={{ margin: '6px 0' }}>
              {tt('Gemeldet von')} {r.contact_id ? <Link to={`contacts/${r.contact_id}`}>{name(r)}</Link> : tt('gelöschtem Kontakt')} · {ago(r.created_at)}
              {r.reason ? tt(' · Grund: „{reason}“', { reason: r.reason }) : ''}
            </p>
            {r.target ? (
              <blockquote className="cm-quote">
                <strong>{r.target.author_name}</strong>
                {r.target.title ? ` – ${r.target.title}` : ''}
                <div>{String(r.target.body ?? '').slice(0, 400)}</div>
              </blockquote>
            ) : (
              <p className="muted small">{tt('Inhalt wurde inzwischen gelöscht.')}</p>
            )}
            {r.status === 'open' && r.target && (
              <div className="actions">
                <button className="btn small secondary" onClick={() => setView(r.target.post_id)}>
                  {tt('Ansehen')}
                </button>
                <button className="btn small secondary" onClick={() => decide(r, 'dismiss')}>
                  {tt('In Ordnung (Meldung verwerfen)')}
                </button>
                <button className="btn small secondary" onClick={() => decide(r, 'hide')}>
                  {tt('Ausblenden')}
                </button>
                <button className="btn small danger" onClick={() => decide(r, 'delete')}>
                  {tt('Löschen')}
                </button>
              </div>
            )}
          </div>
        ))
      ) : (
        <Empty>{status === 'open' ? tt('Keine offenen Meldungen. 🎉') : tt('Nichts gefunden.')}</Empty>
      )}
      {view && <PostModal postId={view} onClose={() => setView('')} onChanged={() => void list.reload()} />}
    </>
  );
}

// --- posts -------------------------------------------------------------------------------------------
function TeamPost({ group, onClose, onDone }: { group: any; onClose: () => void; onDone: () => void }) {
  const tt = useT('x_community');
  const [f, setF] = useState({ channel_id: group.channels[0]?.id ?? '', title: '', body: '', pinned: false, notify: false });
  const save = async () => (await act(() => api.post(`/api/community/groups/${group.id}/posts`, f), tt('Beitrag veröffentlicht'))) && onDone();
  return (
    <Modal
      title={tt('Beitrag als Team')}
      onClose={onClose}
      wide
      footer={
        <button className="btn" disabled={!f.title.trim()} onClick={save}>
          {tt('Veröffentlichen')}
        </button>
      }
    >
      <div className="grid2">
        <Field label={tt('Kanal')}>
          <Select value={f.channel_id} onChange={(v) => setF({ ...f, channel_id: v })} options={group.channels.map((c: any) => [c.id, `${c.emoji ? `${c.emoji} ` : ''}${c.name}`])} />
        </Field>
        <Field label={tt('Titel')}>
          <Input value={f.title} onChange={(v) => setF({ ...f, title: v })} autoFocus />
        </Field>
      </div>
      <Field label={tt('Text')} hint={tt('@handle erwähnt ein Mitglied (das Handle steht im Mitglieder-Tab).')}>
        <MarkdownEditor value={f.body} onChange={(v) => setF({ ...f, body: v })} rows={10} />
      </Field>
      <Check checked={f.pinned} onChange={(v) => setF({ ...f, pinned: v })} label={tt('Oben anheften')} />
      <Check checked={f.notify} onChange={(v) => setF({ ...f, notify: v })} label={tt('Alle Mitglieder der Gruppe benachrichtigen (Glocke + tägliche E-Mail)')} />
    </Modal>
  );
}

function PostModal({ postId, onClose, onChanged }: { postId: string; onClose: () => void; onChanged: () => void }) {
  const tt = useT('x_community');
  const p = useLoad(() => api.get(`/api/community/posts/${postId}`), [postId]);
  const [reply, setReply] = useState('');
  const [parent, setParent] = useState('');
  const changed = () => (void p.reload(), onChanged());
  const setComment = async (c: any, status: string) => (await act(() => api.patch(`/api/community/comments/${c.id}`, { status }))) && changed();
  const delComment = async (c: any) => confirmAsk(tt('Kommentar (mit Antworten) löschen?')) && (await act(() => api.del(`/api/community/comments/${c.id}`), tt('Gelöscht'))) && changed();
  const send = async () => {
    if (await act(() => api.post(`/api/community/posts/${postId}/comments`, { body: reply, parent_id: parent || undefined }), tt('Antwort veröffentlicht'))) {
      setReply('');
      setParent('');
      changed();
    }
  };
  const post = p.data;
  const top = (post?.comments ?? []).filter((c: any) => !c.parent_id);
  const kids = (id: string) => (post?.comments ?? []).filter((c: any) => c.parent_id === id);
  const comment = (c: any) => (
    <div key={c.id} className={`cm-admin-comment${c.status === 'hidden' ? ' hidden' : ''}${c.parent_id ? ' reply' : ''}`}>
      <div className="row" style={{ alignItems: 'center', gap: 6 }}>
        <strong>{c.author_name}</strong>
        {!c.contact_id && <Badge tone="blue">{tt('Team')}</Badge>}
        {c.status === 'hidden' && <Badge tone="yellow">{tt('ausgeblendet')}</Badge>}
        <span className="muted small grow">{dt(c.created_at)}{c.like_count ? ` · ♥ ${c.like_count}` : ''}</span>
        {!c.parent_id && (
          <button className="btn small ghost" onClick={() => setParent(c.id)}>
            {tt('Antworten')}
          </button>
        )}
        <button className="btn small ghost" onClick={() => setComment(c, c.status === 'hidden' ? 'visible' : 'hidden')}>
          {c.status === 'hidden' ? tt('Einblenden') : tt('Ausblenden')}
        </button>
        <button className="btn small ghost" onClick={() => delComment(c)}>
          {tt('Löschen')}
        </button>
      </div>
      <div className="cm-text">{c.body}</div>
    </div>
  );
  return (
    <Modal title={post?.title ?? tt('Beitrag')} onClose={onClose} wide>
      {!post ? (
        <Spinner />
      ) : (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>
            {post.author_name} {post.by_team ? tt('(Team)') : post.contact ? <Link to={`contacts/${post.contact.id}`}>{tt('· Kontakt öffnen')}</Link> : ''} · {post.channel_name ?? ''} {tt('{dt} · ♥ {like_count} · {comment_count} Kommentare', { dt: dt(post.created_at), like_count: post.like_count, comment_count: post.comment_count })}
          </p>
          {post.status === 'hidden' && <p className="notice-warn">{tt('Ausgeblendet')}{post.hidden_reason ? ` (${post.hidden_reason})` : ''} {tt('– Mitglieder sehen den Beitrag nicht.')}</p>}
          {post.body && <div className="cm-text">{post.body}</div>}
          {post.images?.length > 0 && (
            <div className="cm-admin-images">
              {post.images.map((u: string) => (
                <a key={u} href={fileUrl(u)} target="_blank" rel="noreferrer">
                  <img src={fileUrl(u)} alt="" />
                </a>
              ))}
            </div>
          )}
          <h3 style={{ margin: '16px 0 6px' }}>{tt('Kommentare')}</h3>
          {top.length ? top.map((c: any) => [comment(c), ...kids(c.id).map(comment)]) : <p className="muted">{tt('Noch keine.')}</p>}
          <hr />
          <Field label={parent ? tt('Antwort an {v}', { v: post.comments.find((c: any) => c.id === parent)?.author_name ?? '' }) : tt('Als Team antworten')}>
            <Textarea value={reply} onChange={setReply} rows={3} />
          </Field>
          <div className="actions">
            <button className="btn" disabled={!reply.trim()} onClick={send}>
              {tt('Antworten')}
            </button>
            {parent && (
              <button className="btn ghost" onClick={() => setParent('')}>
                {tt('Antwort auf den Beitrag statt Kommentar')}
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

function Posts({ group, onChange }: { group: any; onChange: () => void }) {
  const tt = useT('x_community');
  const [f, setF] = useState({ channel_id: '', status: '', q: '' });
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
  const list = useLoad(() => api.get<any[]>(`/api/community/groups/${group.id}/posts${qs ? `?${qs}` : ''}`), [group.id, qs]);
  const [writing, setWriting] = useState(false);
  const [view, setView] = useState('');
  const refresh = () => (void list.reload(), onChange());
  const patch = async (p: any, body: any, ok: string) => (await act(() => api.patch(`/api/community/posts/${p.id}`, body), ok)) && refresh();
  const del = async (p: any) => confirmAsk(tt('Beitrag „{title}“ mit allen Kommentaren löschen? Die Punkte dafür verfallen.', { title: p.title })) && (await act(() => api.del(`/api/community/posts/${p.id}`), tt('Gelöscht'))) && refresh();
  return (
    <>
      <div className="row" style={{ marginBottom: 12, alignItems: 'center' }}>
        <button className="btn" onClick={() => setWriting(true)}>
          {tt('+ Beitrag als Team')}
        </button>
        <div style={{ width: 190 }}>
          <Select value={f.channel_id} onChange={(v) => setF({ ...f, channel_id: v })} placeholder={tt('Alle Kanäle')} options={group.channels.map((c: any) => [c.id, c.name])} />
        </div>
        <div style={{ width: 160 }}>
          <Select value={f.status} onChange={(v) => setF({ ...f, status: v })} placeholder={tt('Alle')} options={[['visible', tt('Sichtbar')], ['hidden', tt('Ausgeblendet')]]} />
        </div>
        <div className="grow" style={{ maxWidth: 280 }}>
          <Input value={f.q} onChange={(v) => setF({ ...f, q: v })} placeholder={tt('Suchen…')} />
        </div>
      </div>
      {list.loading && !list.data ? (
        <Spinner />
      ) : list.data?.length ? (
        list.data.map((p) => (
          <div key={p.id} className={`card cm-admin-post${p.status === 'hidden' ? ' hidden' : ''}`}>
            <div className="row" style={{ alignItems: 'center', gap: 8 }}>
              <strong>{p.author_name}</strong>
              {p.by_team ? <Badge tone="blue">{tt('Team')}</Badge> : p.contact && <Link to={`contacts/${p.contact.id}`}>{tt('Kontakt')}</Link>}
              <span className="muted small grow">
                {p.channel_name} · {ago(p.created_at)}
              </span>
              {p.pinned ? <Badge tone="purple">{tt('Angeheftet')}</Badge> : null}
              {p.status === 'hidden' && <Badge tone="yellow">{tt('Ausgeblendet')}</Badge>}
              {p.reports > 0 && <Badge tone="red">{tt('{reports} Meldungen', { reports: p.reports })}</Badge>}
            </div>
            <h3 className="cm-admin-title" onClick={() => setView(p.id)}>
              {p.title}
            </h3>
            {p.body && <p className="muted cm-clamp">{String(p.body).replace(/[*_#>`~]+/g, '')}</p>}
            <div className="row" style={{ alignItems: 'center', gap: 6 }}>
              <span className="muted small grow">
                {tt('♥ {like_count} · {comment_count} Kommentare', { like_count: p.like_count, comment_count: p.comment_count })}{p.images.length ? tt(' · {length} Bild(er)', { length: p.images.length }) : ''}
              </span>
              <button className="btn small secondary" onClick={() => setView(p.id)}>
                {tt('Öffnen')}
              </button>
              <button className="btn small ghost" onClick={() => patch(p, { pinned: !p.pinned }, p.pinned ? tt('Gelöst') : tt('Angeheftet'))}>
                {p.pinned ? tt('Lösen') : tt('Anheften')}
              </button>
              <button className="btn small ghost" onClick={() => patch(p, { status: p.status === 'hidden' ? 'visible' : 'hidden' }, p.status === 'hidden' ? tt('Wieder sichtbar') : tt('Ausgeblendet'))}>
                {p.status === 'hidden' ? tt('Einblenden') : tt('Ausblenden')}
              </button>
              <button className="btn small ghost" onClick={() => del(p)}>
                {tt('Löschen')}
              </button>
            </div>
          </div>
        ))
      ) : (
        <Empty action={<button className="btn" onClick={() => setWriting(true)}>{tt('Ersten Beitrag schreiben')}</button>}>{tt('Noch keine Beiträge')}{f.channel_id || f.status || f.q ? tt(' mit diesem Filter') : ''}.</Empty>
      )}
      {writing && <TeamPost group={group} onClose={() => setWriting(false)} onDone={() => (setWriting(false), refresh())} />}
      {view && <PostModal postId={view} onClose={() => setView('')} onChanged={refresh} />}
    </>
  );
}

// --- channels ------------------------------------------------------------------------------------------
function Channels({ group, reload }: { group: any; reload: () => void }) {
  const tt = useT('x_community');
  const [rows, setRows] = useState<any[]>(group.channels);
  const [add, setAdd] = useState({ name: '', emoji: '', category: '' });
  useEffect(() => setRows(group.channels), [group.channels]);
  const set = (i: number, patch: any) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch, dirty: true } : r)));
  const save = async (c: any) => (await act(() => api.patch(`/api/community/groups/${group.id}/channels/${c.id}`, { name: c.name, emoji: c.emoji, category: c.category, description: c.description, admin_only: !!c.admin_only }), tt('Kanal gespeichert'))) && reload();
  const move = async (i: number, dir: number) => {
    const a = [...rows];
    [a[i], a[i + dir]] = [a[i + dir], a[i]];
    setRows(a);
    (await act(() => api.post(`/api/community/groups/${group.id}/channels/reorder`, { ids: a.map((c) => c.id) }))) && reload();
  };
  const remove = async (c: any) => {
    const others = rows.filter((x) => x.id !== c.id);
    const to = confirmAsk(tt('Kanal „{name}“ löschen? Seine Beiträge werden nach „{name2}“ verschoben.', { name: c.name, name2: others[0]?.name }));
    if (to && (await act(() => api.del(`/api/community/groups/${group.id}/channels/${c.id}?move_to=${others[0].id}`), tt('Kanal gelöscht')))) reload();
  };
  const create = async () => {
    if (await act(() => api.post(`/api/community/groups/${group.id}/channels`, add), tt('Kanal angelegt'))) {
      setAdd({ name: '', emoji: '', category: '' });
      reload();
    }
  };
  return (
    <div className="card">
      <p className="muted small" style={{ marginTop: 0 }}>
        {tt('Kanäle ordnen die Beiträge (z. B. Allgemein, Fragen, Erfolge). Kategorien gruppieren Kanäle in der Seitenleiste. „Nur Team“ = Mitglieder lesen und kommentieren, schreiben aber keine Beiträge.')}
      </p>
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th style={{ width: 70 }}>{tt('Emoji')}</th>
              <th>Name</th>
              <th>{tt('Kategorie')}</th>
              <th>{tt('Beschreibung')}</th>
              <th>{tt('Nur Team')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((c, i) => (
              <tr key={c.id}>
                <td>
                  <Input value={c.emoji} onChange={(v) => set(i, { emoji: v })} maxLength={8} aria-label={tt('Emoji Kanal {v}', { v: i + 1 })} />
                </td>
                <td>
                  <Input value={c.name} onChange={(v) => set(i, { name: v })} aria-label={tt('Name Kanal {v}', { v: i + 1 })} />
                </td>
                <td>
                  <Input value={c.category} onChange={(v) => set(i, { category: v })} placeholder="–" aria-label={tt('Kategorie Kanal {v}', { v: i + 1 })} />
                </td>
                <td>
                  <Input value={c.description} onChange={(v) => set(i, { description: v })} placeholder="optional" aria-label={tt('Beschreibung Kanal {v}', { v: i + 1 })} />
                </td>
                <td>
                  <input type="checkbox" checked={!!c.admin_only} onChange={(e) => set(i, { admin_only: e.target.checked ? 1 : 0 })} aria-label={tt('Nur Team schreibt in Kanal {v}', { v: i + 1 })} />
                </td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                  <button className="icon-btn" disabled={!i} onClick={() => move(i, -1)} aria-label="hoch">
                    ↑
                  </button>
                  <button className="icon-btn" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label="runter">
                    ↓
                  </button>
                  <button className="btn small" disabled={!c.dirty} onClick={() => save(c)}>
                    {tt('Speichern')}
                  </button>{' '}
                  <button className="btn small ghost" disabled={rows.length <= 1} onClick={() => remove(c)}>
                    {tt('Löschen')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 12, alignItems: 'flex-end' }}>
        <div style={{ width: 80 }}>
          <Field label={tt('Emoji')}>
            <Input value={add.emoji} onChange={(v) => setAdd({ ...add, emoji: v })} maxLength={8} placeholder="💡" />
          </Field>
        </div>
        <div className="grow">
          <Field label={tt('Neuer Kanal')}>
            <Input value={add.name} onChange={(v) => setAdd({ ...add, name: v })} placeholder={tt('z. B. Fragen')} />
          </Field>
        </div>
        <div style={{ width: 180 }}>
          <Field label={tt('Kategorie')}>
            <Input value={add.category} onChange={(v) => setAdd({ ...add, category: v })} placeholder="optional" />
          </Field>
        </div>
        <div className="field">
          <button className="btn" disabled={!add.name.trim()} onClick={create}>
            {tt('+ Kanal')}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- members & leaderboard -----------------------------------------------------------------------------
function Members({ group, onChange }: { group: any; onChange: () => void }) {
  const tt = useT('x_community');
  const [q, setQ] = useState('');
  const list = useLoad(() => api.get<any[]>(`/api/community/groups/${group.id}/members${q ? `?q=${encodeURIComponent(q)}` : ''}`), [group.id, q]);
  const [ban, setBan] = useState<any>(null);
  const [moving, setMoving] = useState(false);
  const [form, setForm] = useState({ reason: '', hide_content: false });
  const doBan = async () => {
    if (await act(() => api.post(`/api/community/groups/${group.id}/members/${ban.contact_id}/ban`, form), tt('Gesperrt'))) {
      setBan(null);
      void list.reload();
      onChange();
    }
  };
  const unban = async (m: any) => (await act(() => api.del(`/api/community/groups/${group.id}/members/${m.contact_id}/ban`), tt('Sperre aufgehoben'))) && list.reload();
  return (
    <>
      <div className="row" style={{ marginBottom: 12, alignItems: 'center' }}>
        <div style={{ width: 280 }}>
          <Input value={q} onChange={setQ} placeholder={tt('Mitglied suchen…')} />
        </div>
        <button className="btn secondary" data-tour="community-import-open" onClick={() => setMoving(true)}>
          {tt('Importieren / Exportieren')}
        </button>
        <span className="muted small">{tt('Mitglieder erscheinen hier, sobald sie die Gruppe zum ersten Mal öffnen. Wer Zugang hat, regelt „Einstellungen“.')}</span>
      </div>
      {moving && <ImportModal group={group} onClose={() => setMoving(false)} onDone={() => (void list.reload(), onChange())} />}
      {list.loading && !list.data ? (
        <Spinner />
      ) : list.data?.length ? (
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>{tt('Mitglied')}</th>
                <th>{tt('Level')}</th>
                <th>{tt('Punkte')}</th>
                <th>{tt('Beiträge / Kommentare')}</th>
                <th>{tt('Dabei seit')}</th>
                <th>{tt('Zuletzt da')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data.map((m) => (
                <tr key={m.contact_id}>
                  <td>
                    <Link to={`contacts/${m.contact_id}`}>{m.display_name || name(m)}</Link>
                    <div className="muted small">
                      @{m.handle} · {m.email}
                    </div>
                  </td>
                  <td>
                    <Badge tone="blue">{m.level}</Badge> <span className="small">{m.level_name}</span>
                  </td>
                  <td>{m.points}</td>
                  <td>
                    {m.posts} / {m.comments}
                  </td>
                  <td className="muted">{d(m.joined_at)}</td>
                  <td className="muted">{m.last_seen_at ? ago(m.last_seen_at) : '–'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {m.banned_at ? (
                      <>
                        <Badge tone="red">{tt('gesperrt')}{m.ban_reason ? `: ${m.ban_reason}` : ''}</Badge>{' '}
                        <button className="btn small secondary" onClick={() => unban(m)}>
                          {tt('Entsperren')}
                        </button>
                      </>
                    ) : (
                      <button className="btn small ghost" onClick={() => (setForm({ reason: '', hide_content: false }), setBan(m))}>
                        {tt('Sperren')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>{tt('Noch niemand dabei.')}</Empty>
      )}
      {ban && (
        <Modal
          title={tt('{v} sperren', { v: ban.display_name || name(ban) })}
          onClose={() => setBan(null)}
          footer={
            <button className="btn danger" onClick={doBan}>
              {tt('Sperren')}
            </button>
          }
        >
          <p className="muted" style={{ marginTop: 0 }}>
            {tt('Gesperrte Mitglieder sehen die Gruppe nicht mehr (andere Gruppen und Kurse bleiben). Du kannst die Sperre jederzeit aufheben.')}
          </p>
          <Field label={tt('Grund (nur für das Team)')}>
            <Input value={form.reason} onChange={(v) => setForm({ ...form, reason: v })} autoFocus />
          </Field>
          <Check checked={form.hide_content} onChange={(v) => setForm({ ...form, hide_content: v })} label={tt('Alle Beiträge und Kommentare des Mitglieds ausblenden')} />
        </Modal>
      )}
    </>
  );
}

function Leaderboard({ group }: { group: any }) {
  const tt = useT('x_community');
  const [period, setPeriod] = useState('month');
  const list = useLoad(() => api.get<any[]>(`/api/community/groups/${group.id}/leaderboard?period=${period}`), [group.id, period]);
  return (
    <div className="card">
      <div className="seg" style={{ marginBottom: 12 }}>
        {[
          ['week', tt('7 Tage')],
          ['month', tt('30 Tage')],
          ['all', tt('Gesamt')],
        ].map(([k, l]) => (
          <button key={k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>
            {l}
          </button>
        ))}
      </div>
      {list.data?.length ? (
        <table className="t">
          <thead>
            <tr>
              <th>#</th>
              <th>{tt('Mitglied')}</th>
              <th>{tt('Level')}</th>
              <th>{tt('Punkte im Zeitraum')}</th>
              <th>{tt('Gesamt')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((r) => (
              <tr key={r.contact_id}>
                <td>{r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</td>
                <td>
                  <Link to={`contacts/${r.contact_id}`}>{r.display_name || tt('Mitglied')}</Link> <span className="muted small">@{r.handle}</span>
                </td>
                <td>
                  {r.level} · {r.level_name}
                </td>
                <td>
                  <strong>{r.points}</strong>
                </td>
                <td className="muted">{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : list.loading ? (
        <Spinner />
      ) : (
        <Empty>{tt('Noch keine Punkte in diesem Zeitraum.')}</Empty>
      )}
    </div>
  );
}

// --- events --------------------------------------------------------------------------------------------
function EventEditor({ group, event, onClose, onDone }: { group: any; event: any; onClose: () => void; onDone: () => void }) {
  const tt = useT('x_community');
  const [f, setF] = useState({ title: event?.title ?? '', starts: toLocalInput(event?.starts_at), ends: toLocalInput(event?.ends_at), link: event?.link ?? '', description: event?.description ?? '', notify: false });
  const save = async () => {
    const body = { title: f.title, starts_at: fromLocalInput(f.starts), ends_at: fromLocalInput(f.ends), link: f.link, description: f.description, notify: f.notify };
    const r = await act(() => (event ? api.patch(`/api/community/events/${event.id}`, body) : api.post(`/api/community/groups/${group.id}/events`, body)), tt('Termin gespeichert'));
    if (r) onDone();
  };
  return (
    <Modal
      title={event ? tt('Termin bearbeiten') : tt('Neuer Termin')}
      onClose={onClose}
      footer={
        <button className="btn" disabled={!f.title.trim() || !f.starts} onClick={save}>
          {tt('Speichern')}
        </button>
      }
    >
      <Field label={tt('Titel')}>
        <Input value={f.title} onChange={(v) => setF({ ...f, title: v })} autoFocus placeholder={tt('z. B. Live-Q&A')} />
      </Field>
      <div className="grid2">
        <Field label={tt('Beginn')}>
          <Input type="datetime-local" value={f.starts} onChange={(v) => setF({ ...f, starts: v })} />
        </Field>
        <Field label={tt('Ende')} hint={tt('leer = 1 Stunde')}>
          <Input type="datetime-local" value={f.ends} onChange={(v) => setF({ ...f, ends: v })} />
        </Field>
      </div>
      <Field label={tt('Link (Zoom, Jitsi, Google Meet …)')} hint={tt('Muss mit https:// beginnen. Mitglieder sehen „Teilnehmen“.')}>
        <Input value={f.link} onChange={(v) => setF({ ...f, link: v })} placeholder="https://meet.jit.si/…" />
      </Field>
      <Field label={tt('Beschreibung (optional, Markdown)')}>
        <Textarea value={f.description} onChange={(v) => setF({ ...f, description: v })} rows={3} />
      </Field>
      {!event && <Check checked={f.notify} onChange={(v) => setF({ ...f, notify: v })} label={tt('Mitglieder der Gruppe benachrichtigen')} />}
    </Modal>
  );
}

function Events({ group, onChange }: { group: any; onChange: () => void }) {
  const tt = useT('x_community');
  const [past, setPast] = useState(false);
  const list = useLoad(() => api.get<any[]>(`/api/community/groups/${group.id}/events${past ? '?past=1' : ''}`), [group.id, past]);
  const [edit, setEdit] = useState<any>(undefined);
  const refresh = () => (void list.reload(), onChange());
  return (
    <>
      <div className="row" style={{ marginBottom: 12, alignItems: 'center' }}>
        <button className="btn" onClick={() => setEdit(null)}>
          {tt('+ Termin')}
        </button>
        <div className="seg">
          <button className={!past ? 'on' : ''} onClick={() => setPast(false)}>
            {tt('Kommend')}
          </button>
          <button className={past ? 'on' : ''} onClick={() => setPast(true)}>
            {tt('Vergangen')}
          </button>
        </div>
        <span className="muted small">{tt('Termine stehen im Kalender der Gruppe, mit „Teilnehmen“-Link und Kalender-Datei (.ics).')}</span>
      </div>
      {list.data?.length ? (
        list.data.map((e) => (
          <div key={e.id} className="card row" style={{ alignItems: 'center' }}>
            <Icon name="calendars" />
            <div className="grow">
              <strong>{e.title}</strong>
              <div className="muted small">
                {dt(e.starts_at)} – {new Date(e.ends_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                {e.link ? ` · ${e.link}` : ''}
              </div>
            </div>
            <button className="btn small secondary" onClick={() => setEdit(e)}>
              {tt('Bearbeiten')}
            </button>
            <button className="btn small ghost" onClick={async () => confirmAsk(tt('Termin „{title}“ löschen?', { title: e.title })) && (await act(() => api.del(`/api/community/events/${e.id}`), tt('Gelöscht'))) && refresh()}>
              {tt('Löschen')}
            </button>
          </div>
        ))
      ) : list.loading ? (
        <Spinner />
      ) : (
        <Empty>{past ? tt('Keine vergangenen Termine.') : tt('Keine Termine geplant.')}</Empty>
      )}
      {edit !== undefined && <EventEditor group={group} event={edit} onClose={() => setEdit(undefined)} onDone={() => (setEdit(undefined), refresh())} />}
    </>
  );
}

// --- settings --------------------------------------------------------------------------------------------
function GroupSettings({ group, onSaved }: { group: any; onSaved: () => void }) {
  const tt = useT('x_community');
  const [g, setG] = useState<any>(group);
  const courses = useCourses();
  const tags = useLoad(() => api.get<any[]>('/api/tags'), []);
  useEffect(() => setG(group), [group]);
  const a = g.access;
  const s = g.settings;
  const setA = (patch: any) => setG({ ...g, access: { ...a, ...patch } });
  const setS = (patch: any) => setG({ ...g, settings: { ...s, ...patch } });
  const more = communityMoreValues(s);
  const setLevel = (i: number, patch: any) => setS({ levels: s.levels.map((l: any, j: number) => (j === i ? { ...l, ...patch } : l)) });
  const save = async () => (await act(() => api.patch(`/api/community/groups/${group.id}`, { name: g.name, slug: g.slug, description: g.description, cover_image: g.cover_image, status: g.status, access: g.access, settings: g.settings }), tt('Gespeichert'))) && onSaved();
  return (
    <div className="grid2 course-settings">
      <div className="card">
        <h2>{tt('Gruppe')}</h2>
        <Field label="Name">
          <Input value={g.name} onChange={(v) => setG({ ...g, name: v })} />
        </Field>
        <Field label={tt('Adresse')} hint={group.url}>
          <Input value={g.slug} onChange={(v) => setG({ ...g, slug: v })} />
        </Field>
        <Field label={tt('Beschreibung')} hint={tt('Markdown; steht im Mitgliederbereich bei „Über die Gruppe“.')}>
          <Textarea value={g.description} onChange={(v) => setG({ ...g, description: v })} rows={4} />
        </Field>
        <Field label={tt('Titelbild')}>
          <ImagePicker value={g.cover_image} onChange={(v) => setG({ ...g, cover_image: v })} />
        </Field>
        <Field label="Status">
          <Select value={g.status} onChange={(v) => setG({ ...g, status: v })} options={[['active', tt('Aktiv')], ['archived', tt('Archiviert (für Mitglieder unsichtbar)')]]} />
        </Field>
      </div>
      <div className="card">
        <h2>{tt('Zugang')}</h2>
        <Field label={tt('Wer sieht die Gruppe?')}>
          <Select value={a.mode} onChange={(v) => setA({ mode: v })} options={Object.entries(MODE_LABEL).map(([k, v]) => [k, tt(v)] as [string, string])} />
        </Field>
        {a.mode === 'join' && <p className="muted small">{tt('Mitglieder kommen über die öffentliche Seite herein. Stufen, Preise, Fragen und Freigabe stellst du im Tab „Beitritt“ ein.')}</p>}
        {a.mode === 'courses' && (
          <Field label={tt('Teilnehmer dieser Kurse')}>
            {(courses.data ?? []).length ? (
              <div className="check-list">
                {(courses.data ?? []).map((c) => (
                  <Check key={c.id} checked={a.course_ids.includes(c.id)} onChange={(on) => setA({ course_ids: on ? [...a.course_ids, c.id] : a.course_ids.filter((x: string) => x !== c.id) })} label={c.title} />
                ))}
              </div>
            ) : (
              <span className="muted small">{tt('Noch keine Kurse.')}</span>
            )}
          </Field>
        )}
        {a.mode === 'tags' && (
          <Field label={tt('Kontakte mit einem dieser Tags')} hint={tt('z. B. community – über Formular, Kauf oder Workflow vergeben. Diese Kontakte können sich auch ohne Kurs im Mitgliederbereich anmelden.')}>
            <TagInput value={a.tags} onChange={(v) => setA({ tags: v })} suggestions={(tags.data ?? []).map((t) => t.name)} />
          </Field>
        )}
        {a.mode === 'all' && <p className="muted small">{tt('Jeder, der sich im Mitgliederbereich anmelden kann (aktiver Kurszugang oder Zugang zu einer anderen Gruppe per Tag/Kurs).')}</p>}
        <MoreFields id="community-moderation" label={tt('Moderation')} values={more.moderation}>
          <h2>{tt('Moderation')}</h2>
          <Field label={tt('Wortfilter')} hint={tt('Ganze Wörter, Groß-/Kleinschreibung egal; wort* trifft alle Wörter, die so anfangen.')}>
            <TagInput value={s.word_filter} onChange={(v) => setS({ word_filter: v })} placeholder={tt('Wort + Enter')} />
          </Field>
          <Field label={tt('Treffer')}>
            <Select value={s.filter_mode} onChange={(v) => setS({ filter_mode: v })} options={[['mask', tt('Mit *** ersetzen')], ['block', tt('Beitrag ablehnen')]]} />
          </Field>
          <div className="grid3">
            <Field label={tt('Beiträge / Stunde')} hint={tt('je Mitglied, 0 = frei')}>
              <Input type="number" min={0} value={s.posts_per_hour} onChange={(v) => setS({ posts_per_hour: Number(v) })} />
            </Field>
            <Field label={tt('Kommentare / Stunde')} hint={tt('je Mitglied, 0 = frei')}>
              <Input type="number" min={0} value={s.comments_per_hour} onChange={(v) => setS({ comments_per_hour: Number(v) })} />
            </Field>
            <Field label={tt('Auto-Ausblenden ab')} hint={tt('Meldungen, 0 = nie')}>
              <Input type="number" min={0} value={s.auto_hide_reports} onChange={(v) => setS({ auto_hide_reports: Number(v) })} />
            </Field>
          </div>
        </MoreFields>
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <MoreFields id="community-points" label={tt('Punkte & Levels')} values={more.points}>
          <div className="card">
            <h2>{tt('Punkte & Levels')}</h2>
            <div className="grid3">
              <Field label={tt('Punkte pro Beitrag')}>
                <Input type="number" min={0} value={s.points.post} onChange={(v) => setS({ points: { ...s.points, post: Number(v) } })} />
              </Field>
              <Field label={tt('Punkte pro Kommentar')}>
                <Input type="number" min={0} value={s.points.comment} onChange={(v) => setS({ points: { ...s.points, comment: Number(v) } })} />
              </Field>
              <Field label={tt('Punkte pro erhaltenem „Gefällt mir“')}>
                <Input type="number" min={0} value={s.points.like} onChange={(v) => setS({ points: { ...s.points, like: Number(v) } })} />
              </Field>
            </div>
            <div className="cm-levels">
              {s.levels.map((l: any, i: number) => (
                <div key={i} className="cm-level">
                  <span className="muted small">{tt('Level {v}', { v: i + 1 })}</span>
                  <Input value={l.name} onChange={(v) => setLevel(i, { name: v })} aria-label={tt('Name Level {v}', { v: i + 1 })} />
                  <Input type="number" min={0} disabled={i === 0} value={l.points} onChange={(v) => setLevel(i, { points: Number(v) })} aria-label={tt('Punkte Level {v}', { v: i + 1 })} />
                </div>
              ))}
            </div>
            <h3 style={{ margin: '14px 0 6px' }}>{tt('Kurs freischalten bei Level (optional)')}</h3>
            {s.level_unlocks.map((u: any, i: number) => (
              <div key={i} className="row" style={{ alignItems: 'center', marginBottom: 6 }}>
                <div style={{ width: 160 }}>
                  <Select value={String(u.level)} onChange={(v) => setS({ level_unlocks: s.level_unlocks.map((x: any, j: number) => (j === i ? { ...x, level: Number(v) } : x)) })} options={s.levels.map((l: any, j: number) => [String(j + 1), `ab ${l.name}`] as [string, string])} />
                </div>
                <div className="grow">
                  <Select value={u.course_id} onChange={(v) => setS({ level_unlocks: s.level_unlocks.map((x: any, j: number) => (j === i ? { ...x, course_id: v } : x)) })} placeholder={tt('Kurs wählen…')} options={(courses.data ?? []).map((c) => [c.id, c.title])} />
                </div>
                <button className="icon-btn" onClick={() => setS({ level_unlocks: s.level_unlocks.filter((_: any, j: number) => j !== i) })} aria-label={tt('Entfernen')}>
                  ✕
                </button>
              </div>
            ))}
            <button className="btn small secondary" onClick={() => setS({ level_unlocks: [...s.level_unlocks, { level: Math.min(3, s.levels.length), course_id: '' }] })}>
              {tt('+ Freischaltung')}
            </button>
            <p className="muted small">{tt('Wer das Level erreicht, bekommt Zugang zum Kurs (Quelle „Community-Level“). Außerdem startet der Workflow-Auslöser „Level erreicht“.')}</p>
          </div>
        </MoreFields>
      </div>
      <div className="actions" style={{ gridColumn: '1 / -1' }}>
        <button className="btn" onClick={save}>
          {tt('Speichern')}
        </button>
        <button className="btn danger" onClick={async () => confirmAsk(tt('Gruppe „{name}“ mit allen Beiträgen, Punkten und Terminen löschen?', { name: group.name })) && (await act(() => api.del(`/api/community/groups/${group.id}`), tt('Gruppe gelöscht'))) && navigate('community')}>
          {tt('Gruppe löschen')}
        </button>
      </div>
    </div>
  );
}

export function CommunityGroup({ id }: { id: string }) {
  const tt = useT('x_community');
  const g = useLoad(() => api.get(`/api/community/groups/${id}`), [id]);
  const [tab, setTab] = useState('posts');
  if (g.error) return <Empty action={<Link to="community" className="btn">{tt('Zur Community')}</Link>}>{g.error}</Empty>;
  if (!g.data) return <Spinner />;
  const group = g.data;
  const reload = () => void g.reload();
  return (
    <>
      <PageHead
        title={group.name}
        sub={
          <>
            <Badge tone={group.status === 'active' ? 'green' : 'gray'}>{group.status === 'active' ? tt('Aktiv') : tt('Archiviert')}</Badge> {tt('· {members} Mitglieder · {posts} Beiträge ·', { members: group.members, posts: group.posts })}{' '}
            <a href={group.url} target="_blank" rel="noreferrer">
              {tt('im Mitgliederbereich ↗')}
            </a>
          </>
        }
      >
        <Link to="community" className="btn secondary">
          {tt('← Community')}
        </Link>
      </PageHead>
      <Tabs
        tabs={[
          ['posts', tt('Beiträge')],
          ['reports', `${tt('Meldungen')}${group.open_reports ? ` (${group.open_reports})` : ''}`],
          ['channels', tt('Kanäle')],
          ['members', `${tt('Mitglieder')} (${group.members})`],
          ['events', tt('Termine')],
          ['leaderboard', tt('Rangliste')],
          ['join', tt('Beitritt')],
          ['stats', tt('Zahlen')],
          ['growth', tt('Wachstum')],
          ['engage', tt('Aktivierung')],
          ['messages', tt('Nachrichten')],
          ['settings', tt('Einstellungen')],
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'posts' && <Posts group={group} onChange={reload} />}
      {tab === 'reports' && <Reports groupId={group.id} onChange={reload} />}
      {tab === 'channels' && <Channels group={group} reload={reload} />}
      {tab === 'members' && <Members group={group} onChange={reload} />}
      {tab === 'events' && <Events group={group} onChange={reload} />}
      {tab === 'leaderboard' && <Leaderboard group={group} />}
      {tab === 'join' && <JoinTab group={group} onChange={reload} />}
      {tab === 'stats' && <StatsTab group={group} />}
      {tab === 'growth' && <GrowthTab group={group} onChange={reload} />}
      {tab === 'engage' && <EngageTab group={group} onChange={reload} />}
      {tab === 'messages' && <MessagesTab group={group} onChange={reload} />}
      {tab === 'settings' && <GroupSettings group={group} onSaved={reload} />}
    </>
  );
}

// --- used by other pages -------------------------------------------------------------------------------

/** Filters for the community triggers in workflows: group, and the level for „Level erreicht“. */
export function CommunityTriggerFilter({ type, config, set }: { type: string; config: any; set: (patch: any) => void }) {
  const tt = useT('x_community');
  const groups = useGroups();
  return (
    <>
      <Field label={tt('Gruppe')}>
        <Select value={config.group_id} onChange={(v) => set({ group_id: v })} placeholder={tt('jede Gruppe')} options={(groups.data ?? []).map((g) => [g.id, g.name])} />
      </Field>
      {type === 'community.level_reached' && (
        <Field label={tt('Level (leer = jedes)')}>
          <Input type="number" min={1} value={config.level} onChange={(v) => set({ level: v })} placeholder={tt('z. B. 3')} />
        </Field>
      )}
    </>
  );
}

