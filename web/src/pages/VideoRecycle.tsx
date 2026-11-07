import { useEffect, useMemo, useState } from 'react';
import { ago, api } from '../api';
import { Icon, type IconName } from '../icons';
import { useSession } from '../session';
import { Badge, Check, Copy, Empty, Field, Input, Link, MergeHint, Modal, Select, Spinner, Textarea, act, confirmAsk, toast, useLoad } from '../ui';
import { ChannelAvatar } from './Social';
import { useT } from '../i18n';

/**
 * Video-Studio: Content-Recycling (tab "Recycling" of a finished job), the Autopilot (feeds →
 * shorts → planner) and the workflow step "Video recyceln". The AI writes, people decide: every
 * piece stays a suggestion until someone clicks „Übernehmen“.
 */

type Tone = 'gray' | 'green' | 'red' | 'blue' | 'yellow' | 'purple';
export const RECYCLE_KINDS: [string, string, IconName][] = [
  ['blog', 'Blog-Beitrag', 'blog'],
  ['newsletter', 'Newsletter', 'email'],
  ['linkedin', 'LinkedIn-Beitrag', 'social'],
  ['x_thread', 'X-Thread', 'hash'],
  ['instagram', 'Instagram-Caption', 'instagram'],
  ['facebook', 'Facebook-Beitrag', 'social'],
  ['youtube', 'YouTube-Beschreibung & 10 Titel', 'play'],
  ['shownotes', 'Podcast-Shownotes', 'mic'],
  ['community', 'Community-Beitrag', 'community'],
  ['lesson', 'Lektion-Teaser', 'courses'],
];
const ICON = Object.fromEntries(RECYCLE_KINDS.map(([k, , i]) => [k, i])) as Record<string, IconName>;
const PLATFORMS: Record<string, string[]> = { linkedin: ['linkedin', 'linkedin-page'], x_thread: ['x'], instagram: ['instagram', 'instagram-standalone'], facebook: ['facebook'] };
const STATUS: Record<string, [string, Tone]> = { generating: ['Wird geschrieben …', 'blue'], ready: ['Vorschlag', 'yellow'], applied: ['Übernommen', 'green'], failed: ['Fehlgeschlagen', 'red'] };
const DAYS: [string, string][] = [
  ['mon', 'Mo'],
  ['tue', 'Di'],
  ['wed', 'Mi'],
  ['thu', 'Do'],
  ['fri', 'Fr'],
  ['sat', 'Sa'],
  ['sun', 'So'],
];

interface Kind {
  key: string;
  label: string;
  available: boolean;
  reason: string;
}
interface Item {
  id: string;
  job_id: string;
  kind: string;
  label: string;
  status: string;
  content: any;
  text: string;
  error: string | null;
  edited: number;
  origin: string;
  applied_label: string | null;
  applied_url: string | null;
  applied_at: string | null;
  updated_at: string;
}
interface Targets {
  funnels: { id: string; name: string }[];
  groups: { id: string; name: string }[];
  courses: { id: string; title: string; lessons: { id: string; title: string }[] }[];
  channels: any[];
}
interface RecycleData {
  kinds: Kind[];
  ai: string | null;
  languages: Record<string, string>;
  items: Item[];
  targets?: Targets;
  public_base: boolean;
  youtube: boolean;
}

function usePoll(active: boolean, reload: () => unknown, ms = 3000) {
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => void reload(), ms);
    return () => clearInterval(t);
  }, [active, reload, ms]);
}

function AiHint({ text }: { text: string }) {
  const tt = useT('x_ai');
  const session = useSession();
  return (
    <p className="vs-warn">
      {tt('{text} Recycling schreibt mit dem KI-Assistenten.', { text: text })}
      {session.user.role === 'admin' ? <Link to="settings/ai">{tt('KI-Assistent einrichten')}</Link> : <span>{tt('Bitte die Agentur, ihn einzurichten.')}</span>}
    </p>
  );
}

// --- Recycling tab ---------------------------------------------------------------------------------

export function Recycling({ job }: { job: any }) {
  const tt = useT('x_ai');
  const r = useLoad(() => api.get<RecycleData>(`/api/video-studio/jobs/${job.id}/recycle`), [job.id]);
  const d = r.data;
  const generating = !!d?.items.some((i) => i.status === 'generating');
  usePoll(generating, r.reload);
  const [pick, setPick] = useState<string[] | null>(null);
  const [lang, setLang] = useState('auto');
  const [edit, setEdit] = useState<Item | null>(null);
  const focus = useMemo(() => new URLSearchParams(location.search).get('item'), []);
  useEffect(() => {
    if (focus && d) document.getElementById(`item-${focus}`)?.scrollIntoView({ block: 'center' });
  }, [focus, !!d]);
  if (job.status !== 'completed') return <Empty>{tt('Recycling geht, sobald der Job fertig ist.')}</Empty>;
  if (r.error) return <Empty>{r.error}</Empty>;
  if (!d) return <Spinner />;
  const avail = d.kinds.filter((k) => k.available).map((k) => k.key);
  const done = new Set(d.items.map((i) => i.kind));
  const chosen = pick ?? avail.filter((k) => !done.has(k));
  const start = async (kinds: string[]) => {
    const res = await act(() => api.post(`/api/video-studio/jobs/${job.id}/recycle`, { kinds, language: lang }), tt('Die KI schreibt – das dauert ein, zwei Minuten'));
    if (res) {
      setPick([]);
      await r.reload();
    }
  };
  const toggle = (k: string, on: boolean) => setPick(on ? [...chosen, k] : chosen.filter((x) => x !== k));
  return (
    <div className="vr">
      <div className="card vr-start" data-tour="vr-start">
        <h2>
          <Icon name="sparkles" /> {tt('Aus diesem Video machen …')}
        </h2>
        <p className="muted small">
          {tt('Der KI-Assistent schreibt aus dem Transkript und den besten Clips. Nichts wird veröffentlicht, bevor du bei einem Inhalt auf')} <strong>{tt('Übernehmen')}</strong> {tt('klickst. Jeder Inhalt zählt als ein KI-Aufruf.')}
        </p>
        {d.ai && <AiHint text={d.ai} />}
        <div className="vr-kinds">
          {d.kinds.map((k) => (
            <label key={k.key} className={`vr-kind${k.available ? '' : ' off'}${chosen.includes(k.key) ? ' on' : ''}`} title={k.reason ? tt(k.reason) : undefined}>
              <input type="checkbox" disabled={!k.available} checked={chosen.includes(k.key)} onChange={(e) => toggle(k.key, e.target.checked)} />
              <Icon name={ICON[k.key] ?? 'sparkles'} />
              <span>
                {tt(k.label)}
                {done.has(k.key) && k.available && <small className="muted">{tt('schon erzeugt')}</small>}
                {!k.available && <small className="muted">{tt(k.reason)}</small>}
              </span>
            </label>
          ))}
        </div>
        <div className="vs-inline">
          <Select value={lang} onChange={setLang} options={Object.entries(d.languages)} />
          <button className="btn" disabled={!!d.ai || !chosen.length || generating} onClick={() => start(chosen)}>
            <Icon name="sparkles" /> {!chosen.length ? tt('Inhalte auswählen') : chosen.length === 1 ? tt('1 Inhalt erzeugen') : tt('{length} Inhalte erzeugen', { length: chosen.length })}
          </button>
          {generating && <span className="muted small">{tt('läuft – die Liste aktualisiert sich selbst')}</span>}
        </div>
        {!d.public_base && <p className="muted small vr-note">{tt('Clips in Blog, Newsletter und Lektion verlinken auf HyperLevel – damit Leser sie sehen, muss HyperLevel öffentlich per https erreichbar sein.')}</p>}
      </div>
      {d.items.length ? (
        <div className="vr-items" data-tour="vr-items">
          {d.items.map((i) => (
            <RecycleItem key={i.id} item={i} data={d} focus={focus === i.id} onEdit={() => setEdit(i)} onChange={r.reload} onRegenerate={() => start([i.kind])} />
          ))}
        </div>
      ) : (
        <Empty>{tt('Noch nichts erzeugt. Inhalte oben auswählen und erzeugen lassen.')}</Empty>
      )}
      {edit && <EditItem item={edit} onClose={() => setEdit(null)} onSaved={() => (setEdit(null), r.reload())} />}
    </div>
  );
}

function RecycleItem({ item, data, focus, onEdit, onChange, onRegenerate }: { item: Item; data: RecycleData; focus: boolean; onEdit: () => void; onChange: () => void; onRegenerate: () => void }) {
  const tt = useT('x_ai');
  const busy = item.status === 'generating';
  const [label, tone] = STATUS[item.status] ?? [item.status, 'gray'];
  const regen = () => {
    if ((item.edited || item.status === 'applied') && !confirmAsk(item.status === 'applied' ? tt('Neu erzeugen? Das Übernommene bleibt, wo es ist; hier steht danach der neue Text.') : tt('Neu erzeugen? Deine Änderungen werden ersetzt.'))) return;
    onRegenerate();
  };
  const del = async () => {
    if (confirmAsk(tt('„{label}“ aus dem Recycling entfernen? Bereits Übernommenes bleibt bestehen.', { label: tt(item.label) })) && (await act(() => api.del(`/api/video-studio/recycle/${item.id}`), tt('Entfernt')))) onChange();
  };
  return (
    <div className={`card vr-item${focus ? ' focus' : ''}`} id={`item-${item.id}`}>
      <div className="vr-item-head">
        <span className="vs-job-icon">
          <Icon name={ICON[item.kind] ?? 'sparkles'} />
        </span>
        <div className="vr-item-title">
          <strong>{tt(item.label)}</strong>
          <span className="muted small">
            {ago(item.updated_at)}
            {item.origin && item.origin !== 'manuell' ? tt(' · über {origin}', { origin: item.origin }) : ''}
            {item.edited ? tt(' · bearbeitet') : ''}
          </span>
        </div>
        <Badge tone={tone}>{tt(label)}</Badge>
      </div>
      {busy ? (
        <div className="vr-busy">
          <Spinner /> <span className="muted small">{tt('Die KI schreibt …')}</span>
        </div>
      ) : item.text ? (
        <Preview item={item} />
      ) : null}
      {item.status === 'failed' && item.error && <p className="vs-error-text small">{item.error}</p>}
      {(item.status === 'ready' || item.status === 'applied') && <Apply item={item} data={data} onDone={onChange} />}
      <div className="vr-item-actions">
        <button className="btn small secondary" onClick={onEdit} disabled={busy}>
          <Icon name="edit" /> {tt('Bearbeiten')}
        </button>
        {item.text && <Copy text={item.text} />}
        <button className="btn small ghost" onClick={regen} disabled={busy || !!data.ai}>
          <Icon name="refresh" /> {tt('Neu erzeugen')}
        </button>
        <button className="btn small ghost" onClick={del} disabled={busy} title={tt('Entfernen')} aria-label={tt('Entfernen')}>
          <Icon name="trash" />
        </button>
      </div>
    </div>
  );
}

function Preview({ item }: { item: Item }) {
  const tt = useT('x_ai');
  const [more, setMore] = useState(false);
  const c = item.content ?? {};
  if (item.kind === 'x_thread')
    return (
      <ol className="vr-thread">
        {(c.tweets ?? []).map((t: string, i: number) => (
          <li key={i}>
            <span>{t}</span>
            <small className={t.length > 280 ? 'vs-error-text' : 'muted'}>{t.length}/280</small>
          </li>
        ))}
      </ol>
    );
  return (
    <>
      <div className={`vr-text${more ? ' open' : ''}`}>{item.text}</div>
      {item.text.length > 360 && (
        <button className="btn small ghost vs-more" onClick={() => setMore(!more)}>
          {more ? tt('Weniger anzeigen') : tt('Ganzen Text anzeigen')}
        </button>
      )}
    </>
  );
}

function Apply({ item, data, onDone }: { item: Item; data: RecycleData; onDone: () => void }) {
  const tt = useT('x_ai');
  const t: Targets = data.targets ?? { funnels: [], groups: [], courses: [], channels: [] };
  const platforms = PLATFORMS[item.kind];
  const channels = platforms ? t.channels.filter((c) => platforms.includes(c.identifier)) : [];
  const [funnel, setFunnel] = useState(t.funnels[0]?.id ?? '');
  const [embed, setEmbed] = useState('auto');
  const [sel, setSel] = useState<string[]>(() => channels.map((c) => c.id));
  const [group, setGroup] = useState(t.groups[0]?.id ?? '');
  const [course, setCourse] = useState(t.courses[0]?.id ?? '');
  const lessons = t.courses.find((c) => c.id === course)?.lessons ?? [];
  const [lesson, setLesson] = useState('');
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const go = async (body: Record<string, unknown>, ask?: string) => {
    if (ask && !confirmAsk(tt(ask))) return;
    setBusy(true);
    const r = await act(() => api.post<Item>(`/api/video-studio/recycle/${item.id}/apply`, body));
    setBusy(false);
    if (r) {
      toast(tt(r.applied_label ?? 'Übernommen'));
      setMore(false);
      onDone();
    }
  };
  const again = item.status === 'applied';
  const btn = (text: string, onClick: () => void, disabled = false) => (
    <button className={`btn small${again ? ' secondary' : ''}`} disabled={busy || disabled} onClick={onClick}>
      <Icon name="ok" /> {again ? tt('{text} (nochmal)', { text: tt(text) }) : tt(text)}
    </button>
  );
  let body: React.ReactNode = null;
  switch (item.kind) {
    case 'blog':
      body = t.funnels.length ? (
        <div className="vs-inline">
          <Select value={funnel} onChange={setFunnel} options={t.funnels.map((f) => [f.id, f.name] as [string, string])} />
          <Select value={embed} onChange={setEmbed} options={[['auto', data.youtube ? tt('YouTube-Video einbetten') : tt('Besten Clip einbetten')], ...(data.youtube ? [['clip', tt('Besten Clip einbetten')] as [string, string]] : []), ['none', tt('Ohne Video')]]} />
          {btn('Als Blog-Entwurf anlegen', () => go({ funnel_id: funnel, embed }), !funnel)}
        </div>
      ) : (
        <p className="muted small">{tt('Noch keine Website mit Blog – unter Websites & Funnels eine Website anlegen.')}</p>
      );
      break;
    case 'newsletter':
      body = <div className="vs-inline">{btn('Als Kampagnen-Entwurf anlegen', () => go({}))}</div>;
      break;
    case 'linkedin':
    case 'x_thread':
    case 'instagram':
    case 'facebook':
      body = channels.length ? (
        <div className="vr-channels">
          <div className="social-pick">
            {channels.map((c) => {
              const on = sel.includes(c.id);
              return (
                <button key={c.id} type="button" className={`social-chip pick${on ? ' on' : ''}`} onClick={() => setSel(on ? sel.filter((x) => x !== c.id) : [...sel, c.id])}>
                  <ChannelAvatar c={c} size={22} /> {c.name}
                </button>
              );
            })}
          </div>
          {item.kind === 'instagram' && !data.public_base && <p className="muted small">{tt('Instagram bekommt den besten Clip als Reel – dafür muss HyperLevel per https erreichbar sein.')}</p>}
          {btn('Als Entwurf in den Social Planner', () => go({ integration_ids: sel }), !sel.length || (item.kind === 'instagram' && !data.public_base))}
        </div>
      ) : (
        <p className="muted small">{tt('Kein passender Kanal (')}{platforms?.join(', ')}{tt(') im Social Planner dieses Sub-Accounts – Text kopieren oder dort verbinden.')}</p>
      );
      break;
    case 'youtube':
      body = <div className="vs-inline">{btn('Ins YouTube-Studio übernehmen', () => go({}))}</div>;
      break;
    case 'shownotes':
      body = <div className="vs-inline">{btn('Als Dokument im Projekt speichern', () => go({}), !data.public_base)}</div>;
      break;
    case 'community':
      body = t.groups.length ? (
        <div className="vs-inline">
          <Select value={group} onChange={setGroup} options={t.groups.map((g) => [g.id, g.name] as [string, string])} />
          {btn('In der Community posten', () => go({ group_id: group }, 'Der Beitrag erscheint sofort für die Mitglieder der Gruppe. Jetzt posten?'), !group)}
        </div>
      ) : (
        <p className="muted small">{tt('Noch keine Community-Gruppe.')}</p>
      );
      break;
    case 'lesson':
      body = t.courses.length ? (
        <div className="vs-inline">
          <Select value={course} onChange={(v) => (setCourse(v), setLesson(''))} options={t.courses.map((c) => [c.id, c.title] as [string, string])} />
          <Select value={lesson} onChange={setLesson} placeholder={tt('Lektion wählen')} options={lessons.map((l) => [l.id, l.title] as [string, string])} />
          {btn('Clip in die Lektion', () => go({ course_id: course, lesson_id: lesson }), !lesson)}
        </div>
      ) : (
        <p className="muted small">{tt('Noch keine Kurs-Lektion.')}</p>
      );
      break;
  }
  return (
    <div className="vr-apply">
      {again && (
        <p className="vr-done">
          <Icon name="ok" /> {item.applied_label ? tt(item.applied_label) : null} · {ago(item.applied_at)}
          {item.applied_url && <Link to={item.applied_url}>{tt('Öffnen')}</Link>}
          {!more && (
            <button type="button" className="btn small ghost vr-again" onClick={() => setMore(true)}>
              {tt('Nochmal übernehmen')}
            </button>
          )}
        </p>
      )}
      {(!again || more) && body}
    </div>
  );
}

// --- editing -------------------------------------------------------------------------------------------

const lines = (v: unknown) => (Array.isArray(v) ? v.join('\n') : '');
const chapterLines = (v: unknown) => (Array.isArray(v) ? v.map((c: any) => `${c.time} ${c.title}`).join('\n') : '');
const toLines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
const toChapters = (s: string) =>
  toLines(s)
    .map((l) => l.match(/^((?:\d{1,2}:)?\d{1,2}:\d{2})\s+(.+)$/))
    .filter(Boolean)
    .map((m) => ({ time: m![1], title: m![2] }));

function EditItem({ item, onClose, onSaved }: { item: Item; onClose: () => void; onSaved: () => void }) {
  const tt = useT('x_ai');
  const [c, setC] = useState<any>(() => ({ ...item.content }));
  const set = (patch: any) => setC((x: any) => ({ ...x, ...patch }));
  const text = (key: string, label: string, rows = 0, hint?: string) => (
    <Field label={tt(label)} hint={hint ?? (rows ? tt('{length} Zeichen', { length: String(c[key] ?? '').length }) : undefined)}>
      {rows ? <Textarea value={c[key]} onChange={(v) => set({ [key]: v })} rows={rows} /> : <Input value={c[key]} onChange={(v) => set({ [key]: v })} />}
    </Field>
  );
  const listField = (key: string, label: string, rows = 4, hint = 'eine Zeile je Eintrag') => (
    <Field label={tt(label)} hint={tt(hint)}>
      <Textarea value={c[`_${key}`] ?? lines(c[key])} onChange={(v) => set({ [`_${key}`]: v, [key]: toLines(v) })} rows={rows} />
    </Field>
  );
  const chapters = (label = 'Kapitel') => (
    <Field label={tt(label)} hint={tt('je Zeile „00:00 Titel“ – das erste Kapitel beginnt bei 00:00')}>
      <Textarea value={c._chapters ?? chapterLines(c.chapters)} onChange={(v) => set({ _chapters: v, chapters: toChapters(v) })} rows={6} />
    </Field>
  );
  const tags = (key = 'hashtags', label = 'Hashtags') => (
    <Field label={tt(label)} hint={tt('mit Leerzeichen trennen')}>
      <Input value={c[`_${key}`] ?? (c[key] ?? []).join(' ')} onChange={(v) => set({ [`_${key}`]: v, [key]: v.split(/[\s,]+/).filter(Boolean) })} />
    </Field>
  );
  let form: React.ReactNode = null;
  switch (item.kind) {
    case 'blog':
      form = (
        <>
          {text('title', 'Titel')}
          {text('excerpt', 'Kurzbeschreibung', 2)}
          {text('markdown', 'Text (Markdown, Zwischenüberschriften mit ##)', 16)}
          <div className="grid2">
            {text('seo_title', 'SEO-Titel', 0, `${String(c.seo_title ?? '').length}/60`)}
            {tags('tags', 'Tags')}
          </div>
          {text('seo_description', 'Meta-Beschreibung', 2, `${String(c.seo_description ?? '').length}/155`)}
        </>
      );
      break;
    case 'newsletter':
      form = (
        <>
          <div className="grid2">
            {text('subject', 'Betreff', 0, `${String(c.subject ?? '').length}/60`)}
            {text('preheader', 'Vorschautext')}
          </div>
          {text('headline', 'Überschrift')}
          {text('intro', 'Einleitung (nach „Hallo Vorname,“)', 4)}
          <h3>{tt('Die wichtigsten Punkte')}</h3>
          {(c.takeaways ?? []).map((t: any, i: number) => (
            <div className="vr-takeaway" key={i}>
              <Input value={t.title} onChange={(v) => set({ takeaways: c.takeaways.map((x: any, j: number) => (j === i ? { ...x, title: v } : x)) })} placeholder={tt('Punkt {v}', { v: i + 1 })} />
              <Textarea value={t.text} onChange={(v) => set({ takeaways: c.takeaways.map((x: any, j: number) => (j === i ? { ...x, text: v } : x)) })} rows={2} />
            </div>
          ))}
          <div className="grid2">
            {text('cta_label', 'Button-Text')}
            {text('cta_url', 'Button-Link (leer = Video)')}
          </div>
        </>
      );
      break;
    case 'linkedin':
    case 'facebook':
      form = text('text', 'Text', 14, tt('{n} / {max} Zeichen', { n: String(c.text ?? '').length, max: item.kind === 'linkedin' ? 3000 : 5000 }));
      break;
    case 'x_thread':
      form = (
        <>
          {(c.tweets ?? []).map((t: string, i: number) => (
            <Field key={i} label={tt('Post {v}', { v: i + 1 })} hint={<span className={t.length > 280 ? 'vs-error-text' : undefined}>{t.length}/280</span>}>
              <div className="vr-tweet">
                <Textarea value={t} onChange={(v) => set({ tweets: c.tweets.map((x: string, j: number) => (j === i ? v : x)) })} rows={3} />
                <button type="button" className="btn small ghost" aria-label={tt('Post entfernen')} onClick={() => set({ tweets: c.tweets.filter((_: string, j: number) => j !== i) })}>
                  <Icon name="trash" />
                </button>
              </div>
            </Field>
          ))}
          <button type="button" className="btn small secondary" onClick={() => set({ tweets: [...(c.tweets ?? []), ''] })}>
            {tt('+ Post')}
          </button>
        </>
      );
      break;
    case 'instagram':
      form = (
        <>
          {text('caption', 'Caption', 10, tt('{n} / 2200 Zeichen inkl. Hashtags', { n: String(c.caption ?? '').length }))}
          {tags()}
        </>
      );
      break;
    case 'youtube':
      form = (
        <>
          {listField('titles', 'Titel-Ideen', 10)}
          {text('intro', 'Einleitung der Beschreibung', 4)}
          {chapters()}
          {tags()}
        </>
      );
      break;
    case 'shownotes':
      form = (
        <>
          {text('title', 'Titel')}
          {text('summary', 'Zusammenfassung', 5)}
          {chapters()}
          {listField('key_points', 'Kernaussagen')}
          {listField('quotes', 'Zitate', 3)}
        </>
      );
      break;
    case 'community':
      form = (
        <>
          {text('title', 'Titel')}
          {text('body', 'Text (Markdown)', 12)}
        </>
      );
      break;
    case 'lesson':
      form = (
        <>
          {text('title', 'Überschrift')}
          {text('teaser', 'Teaser', 4)}
        </>
      );
      break;
  }
  const save = async () => {
    const content = Object.fromEntries(Object.entries(c).filter(([k]) => !k.startsWith('_')));
    if (await act(() => api.patch(`/api/video-studio/recycle/${item.id}`, { content }), tt('Gespeichert'))) onSaved();
  };
  return (
    <Modal
      title={tt('{label} bearbeiten', { label: tt(item.label) })}
      wide
      onClose={onClose}
      footer={
        <button className="btn" onClick={save}>
          {tt('Speichern')}
        </button>
      }
    >
      <div className="vr-edit">{form}</div>
    </Modal>
  );
}

// --- clip thumbnails (for newsletter images) ---------------------------------------------------------

const queue: (() => Promise<void>)[] = [];
const tried = new Set<string>();
let pumping = false;
const once = <T,>(el: HTMLVideoElement, ok: string, ms = 15000) =>
  new Promise<T | void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    el.addEventListener(ok, () => (clearTimeout(t), resolve()), { once: true });
    el.addEventListener('error', () => (clearTimeout(t), reject(new Error('video'))), { once: true });
  });

/** Grabs a frame of a clip in the browser (one clip at a time) and stores it as its thumbnail. */
export function captureThumb(clipId: string, src: string, onDone?: () => void) {
  if (tried.has(clipId) || typeof document === 'undefined') return;
  tried.add(clipId);
  queue.push(async () => {
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    v.playsInline = true;
    v.src = src;
    try {
      await once(v, 'loadedmetadata');
      v.currentTime = Math.min(1.5, (Number.isFinite(v.duration) ? v.duration : 3) / 3);
      await once(v, 'seeked');
      if (!v.videoWidth) return;
      const w = 360;
      const h = Math.min(800, Math.round((w * v.videoHeight) / v.videoWidth));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(v, 0, 0, w, h);
      await api.post(`/api/video-studio/clips/${clipId}/thumb`, { data: canvas.toDataURL('image/jpeg', 0.82) });
      onDone?.();
    } finally {
      v.removeAttribute('src');
      v.load();
    }
  });
  void pump();
}
async function pump() {
  if (pumping) return;
  pumping = true;
  while (queue.length) {
    try {
      await queue.shift()!();
    } catch {
      /* no frame – the newsletter then links the clip as text */
    }
  }
  pumping = false;
}

// --- Autopilot ----------------------------------------------------------------------------------------

export function Autopilot({ publicBase, layouts, subtitles }: { publicBase: boolean; layouts: [string, string][]; subtitles: [string, string][] }) {
  const tt = useT('x_ai');
  const ap = useLoad(() => api.get<any>('/api/video-studio/autopilot'), []);
  const social = useLoad(() => api.get<any>('/api/social').catch(() => ({ configured: false, channels: [] })), []);
  const funnels = useLoad(() => api.get<any[]>('/api/funnels').catch(() => []), []);
  const [s, setS] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (ap.data && !s) setS(ap.data.settings);
  }, [ap.data]);
  usePoll(!!s?.enabled, ap.reload, 30_000);
  if (ap.error) return <Empty>{ap.error}</Empty>;
  if (!ap.data || !s) return <Spinner />;
  const set = (patch: any) => setS((x: any) => ({ ...x, ...patch }));
  const state = ap.data.state ?? {};
  const kinds: Kind[] = ap.data.kinds ?? [];
  const channels: any[] = (social.data?.channels ?? []).filter((c: any) => !c.disabled);
  const websites = (funnels.data ?? []).filter((f: any) => f.kind === 'website');
  const save = async (patch: any = {}) => {
    setBusy(true);
    const r = await act(() => api.put<any>('/api/video-studio/autopilot', { ...s, ...patch }), tt('Gespeichert'));
    setBusy(false);
    if (r) {
      setS(r.settings);
      ap.reload();
    }
  };
  const check = async () => {
    setBusy(true);
    const r = await act(() => api.post('/api/video-studio/autopilot/check'), tt('Quellen geprüft'));
    setBusy(false);
    if (r) ap.reload();
  };
  const setMode = (mode: string) => {
    if (mode === 'auto' && !confirmAsk(tt('Automatisch einplanen: Clips und Social-Texte gehen ohne Freigabe zu den Zeiten raus. Blog und Newsletter bleiben Entwürfe. Einschalten?'))) return;
    set({ mode });
  };
  const feeds: any[] = s.feeds ?? [];
  const setFeed = (i: number, patch: any) => set({ feeds: feeds.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const toggle = (key: string, v: string, on: boolean) => set({ [key]: on ? [...(s[key] ?? []), v] : (s[key] ?? []).filter((x: string) => x !== v) });
  return (
    <div className="vs-layout vr-ap">
      <div className="card vr-ap-form" data-tour="vs-autopilot">
        <div className="vs-head-row">
          <h2>
            <Icon name="rss" /> {tt('Autopilot')}
          </h2>
          <Check checked={s.enabled} onChange={(v) => set({ enabled: v })} label={<strong>{s.enabled ? tt('Aktiv') : tt('Aus')}</strong>} />
        </div>
        <p className="muted small">{tt('Neue Videos eines YouTube-Kanals oder Podcasts werden automatisch zu Shorts. Die besten Clips und die Recycling-Inhalte landen im Social Planner – verteilt auf die nächsten Tage.')}</p>
        {ap.data.ai && <AiHint text={ap.data.ai} />}

        <h3>{tt('Quellen')}</h3>
        {feeds.map((f, i) => (
          <div className="vr-feed" key={f.id ?? i}>
            <Select value={f.type} onChange={(v) => setFeed(i, { type: v })} options={[['youtube', tt('YouTube-Kanal')], ['podcast', tt('Podcast (RSS)')]]} />
            <Input value={f.url} onChange={(v) => setFeed(i, { url: v })} placeholder={f.type === 'podcast' ? 'https://…/feed.xml' : tt('Kanal-ID UC… oder https://www.youtube.com/channel/UC…')} />
            <Input value={f.label} onChange={(v) => setFeed(i, { label: v })} placeholder="Name" />
            <button type="button" className="btn small ghost" aria-label={tt('Quelle entfernen')} onClick={() => set({ feeds: feeds.filter((_, j) => j !== i) })}>
              <Icon name="trash" />
            </button>
          </div>
        ))}
        {feeds.length < 5 && (
          <button type="button" className="btn small secondary vr-add" onClick={() => set({ feeds: [...feeds, { type: 'youtube', url: '', label: '' }] })}>
            {tt('+ Quelle')}
          </button>
        )}
        <p className="muted small">
          {tt('YouTube: die Kanal-ID steht unter „Teilen → Kanal-ID kopieren“ (@Namen gehen nicht). Podcasts brauchen Video-Folgen oder einen YouTube-Link – reine Audio-Folgen werden übersprungen. Beim ersten Abruf merkt sich der Autopilot die vorhandenen Videos; verarbeitet werden nur neue.')}
        </p>

        <h3>{tt('Freigabe')}</h3>
        <div className="vr-modes">
          <label className={`vr-mode${s.mode !== 'auto' ? ' on' : ''}`}>
            <input type="radio" name="ap-mode" checked={s.mode !== 'auto'} onChange={() => setMode('approve')} />
            <span>
              <span className="vr-mode-title">
                <strong>{tt('Entwürfe zur Freigabe')}</strong> <Badge tone="green">{tt('empfohlen')}</Badge>
              </span>
              <small className="muted">{tt('Alles landet als Entwurf im Social Planner; ihr gebt es in Postiz frei.')}</small>
            </span>
          </label>
          <label className={`vr-mode${s.mode === 'auto' ? ' on' : ''}`}>
            <input type="radio" name="ap-mode" checked={s.mode === 'auto'} onChange={() => setMode('auto')} />
            <span>
              <strong>{tt('Automatisch einplanen')}</strong>
              <small className="muted">{tt('Clips und Social-Texte gehen ohne Freigabe zu den Zeiten raus.')}</small>
            </span>
          </label>
        </div>

        <h3>{tt('Clips')}</h3>
        <div className="grid2">
          <Field label={tt('Beste Clips je Video')}>
            <Select value={String(s.top_n)} onChange={(v) => set({ top_n: Number(v) })} options={Array.from({ length: 11 }, (_, i) => [String(i), i === 0 ? tt('keine') : String(i)] as [string, string])} />
          </Field>
          <Field label={tt('Höchstens Videos pro Tag')}>
            <Select value={String(s.max_per_day)} onChange={(v) => set({ max_per_day: Number(v) })} options={['1', '2', '3', '5', '10']} />
          </Field>
          <Field label={tt('Clips je Job (OpenShorts)')}>
            <Select value={String(s.options?.clips ?? '')} onChange={(v) => set({ options: { ...s.options, clips: v ? Number(v) : undefined } })} options={[['', 'KI entscheidet'], ...Array.from({ length: 10 }, (_, i) => [String(i + 1), String(i + 1)] as [string, string])]} />
          </Field>
          <Field label={tt('Untertitel')}>
            <Select value={s.options?.subtitles ?? 'default'} onChange={(v) => set({ options: { ...s.options, subtitles: v } })} options={subtitles} />
          </Field>
          <Field label={tt('Layout')}>
            <Select value={s.options?.layout ?? 'auto'} onChange={(v) => set({ options: { ...s.options, layout: v } })} options={layouts} />
          </Field>
          <Field label={tt('Uhrzeiten')} hint={tt('z. B. 10:00, 17:30 – ein Beitrag je Zeit')}>
            <Input value={s._times ?? (s.times ?? []).join(', ')} onChange={(v) => set({ _times: v, times: v.split(/[\s,;]+/).filter(Boolean) })} />
          </Field>
        </div>
        <Field label={tt('Wochentage')}>
          <div className="vr-days">
            {DAYS.map(([k, l]) => {
              const on = (s.days ?? []).includes(k);
              return (
                <button key={k} type="button" className={`social-chip pick${on ? ' on' : ''}`} onClick={() => toggle('days', k, !on)}>
                  {tt(l)}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label={tt('Kanäle')} hint={tt('Clips gehen an Kanäle mit Video (YouTube Shorts, TikTok, Instagram …), Texte an die passende Plattform')}>
          {channels.length ? (
            <div className="social-pick">
              {channels.map((c) => {
                const on = (s.integration_ids ?? []).includes(c.id);
                return (
                  <button key={c.id} type="button" className={`social-chip pick${on ? ' on' : ''}`} onClick={() => toggle('integration_ids', c.id, !on)} title={c.label}>
                    <ChannelAvatar c={c} size={22} /> {c.name} <span className="muted small">{c.label}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="muted small">{social.data?.configured ? tt('Noch keine Kanäle im Social Planner.') : tt('Der Social Planner ist nicht verbunden – Clips bleiben dann im Video-Studio.')}</p>
          )}
        </Field>
        {!publicBase && <p className="vs-warn">{tt('Postiz holt die Clips bei HyperLevel ab – dafür muss HyperLevel öffentlich per https erreichbar sein.')}</p>}

        <h3>{tt('Recycling')}</h3>
        <div className="vr-kinds">
          {kinds.map((k) => {
            const on = (s.recycle ?? []).includes(k.key);
            return (
              <label key={k.key} className={`vr-kind${k.available ? '' : ' off'}${on ? ' on' : ''}`} title={k.reason ? tt(k.reason) : undefined}>
                <input type="checkbox" disabled={!k.available} checked={on} onChange={(e) => toggle('recycle', k.key, e.target.checked)} />
                <Icon name={ICON[k.key] ?? 'sparkles'} />
                <span>{tt(k.label)}</span>
              </label>
            );
          })}
        </div>
        <Field label={tt('Blog-Entwürfe in')} hint={tt('Newsletter und Social-Texte werden immer als Entwurf übernommen; YouTube, Shownotes, Community und Lektion warten im Tab „Recycling“ des Jobs.')}>
          <Select value={s.funnel_id ?? ''} onChange={(v) => set({ funnel_id: v || null })} placeholder={tt('– Blog nicht übernehmen –')} options={websites.map((f: any) => [f.id, f.name] as [string, string])} />
        </Field>

        <h3>{tt('Benachrichtigen')}</h3>
        <div className="vs-inline">
          <Check checked={s.notify_push} onChange={(v) => set({ notify_push: v })} label={tt('Push ans Team')} />
          <Check checked={s.notify_email} onChange={(v) => set({ notify_email: v })} label={tt('E-Mail an die Firmenadresse')} />
        </div>
        <div className="vs-inline vr-ap-actions">
          <button className="btn" disabled={busy} onClick={() => save()}>
            {tt('Speichern')}
          </button>
          <button className="btn secondary" disabled={busy || !ap.data.settings.enabled} onClick={check}>
            <Icon name="refresh" /> {tt('Jetzt prüfen')}
          </button>
        </div>
      </div>
      <div className="card vr-ap-state">
        <h2>{tt('Stand')}</h2>
        <p className="muted small">{state.last_run ? tt('Zuletzt geprüft {ago} · alle 10 Minuten', { ago: ago(state.last_run) }) : tt('Noch nicht geprüft.')}</p>
        {(ap.data.settings.feeds ?? []).map((f: any) => {
          const fs = state.feeds?.[f.id] ?? {};
          return (
            <div className="vr-feed-state" key={f.id}>
              <Icon name={f.type === 'podcast' ? 'mic' : 'play'} />
              <span>
                <strong>{f.label}</strong>
                <span className="muted small">
                  {fs.last_checked ? tt('geprüft {ago}', { ago: ago(fs.last_checked) }) : tt('noch nicht geprüft')}
                  {fs.last_item ? tt(' · zuletzt „{last_item}“', { last_item: fs.last_item }) : ''}
                </span>
                {fs.last_error && <span className="small vs-error-text">{fs.last_error}</span>}
              </span>
            </div>
          );
        })}
        <h3>{tt('Protokoll')}</h3>
        {state.log?.length ? (
          <ul className="vr-log">
            {state.log.map((l: any, i: number) => (
              <li key={i}>
                <span className="muted small">{ago(l.at)}</span> {l.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">{tt('Hier steht, was der Autopilot getan hat – neue Videos, eingeplante Clips, Hinweise.')}</p>
        )}
      </div>
    </div>
  );
}

// --- workflow step ---------------------------------------------------------------------------------------

export function RecycleStep({ step, set }: { step: any; set: (patch: any) => void }) {
  const tt = useT('x_ai');
  const kinds: string[] = step.kinds ?? [];
  return (
    <>
      <Field label={tt('Job')} hint={tt('Nach dem Auslöser „Shorts fertig“ passt {{event.jobId}}')}>
        <Input value={step.job_id ?? '{{event.jobId}}'} onChange={(v) => set({ job_id: v })} />
      </Field>
      <Field label={tt('… oder Video-Link (Platzhalter erlaubt)')} hint={tt('Ohne fertigen Job: erst Shorts, dann Recycling')}>
        <Input value={step.url} onChange={(v) => set({ url: v })} placeholder="{{contact.custom.video_url}}" />
      </Field>
      <Field label={tt('Inhalte')} hint={tt('Nichts gewählt = alles, was im Sub-Account passt')}>
        <div className="vr-kinds">
          {RECYCLE_KINDS.map(([k, l, icon]) => (
            <label key={k} className={`vr-kind${kinds.includes(k) ? ' on' : ''}`}>
              <input type="checkbox" checked={kinds.includes(k)} onChange={(e) => set({ kinds: e.target.checked ? [...kinds, k] : kinds.filter((x) => x !== k) })} />
              <Icon name={icon} />
              <span>{tt(l)}</span>
            </label>
          ))}
        </div>
      </Field>
      <p className="muted small">{tt('Der KI-Assistent schreibt die Inhalte (zählt aufs KI-Limit). Sie warten im Video-Studio im Tab „Recycling“ auf die Freigabe – veröffentlicht wird nichts automatisch.')}</p>
      <MergeHint />
    </>
  );
}
