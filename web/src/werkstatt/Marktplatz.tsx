import { useEffect, useState } from 'react';
import { api, ago, d as dateOnly } from '../api';
import { Icon } from '../icons';
import { ScreenshotPicker } from '../pages/Feedback';
import { Badge, Check, Empty, Field, Link, Modal, PageHead, Select, Spinner, Textarea, act, confirmAsk, navigate, useLoad, useRoute } from '../ui';
import { PluginFrame } from './PluginFrame';
import { NAMES, PluginIcon, refreshPlugins } from './shared';
import { ConsentModal, RISK, ScopeList, type ScopeInfo } from './scopes';
import { ProMark } from './badges';
import { BoardShelf } from '../boards/Shelf';
import { useT } from '../i18n';

/** The Marktplatz: discover plugins (categories, search), look at them live with sample data, install per sub-account with a consent screen. */

interface Card {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: string;
  category_label: string;
  version: string;
  scopes: ScopeInfo[];
  risk: 'low' | 'medium' | 'high';
  has_ui: boolean;
  has_actions: boolean;
  has_jobs: boolean;
  installs: number;
  rating: number | null;
  reviews: number;
  votes: number;
  screenshots: string[];
  installed: boolean;
  installed_scope: 'private' | 'location' | null;
  enabled: boolean;
  update_available: boolean;
  killed: boolean;
  in_core: boolean;
  core_version: string;
  published_at: string | null;
  owner?: { user: string; location: string };
}
interface Entries {
  page: { title: string } | null;
  panels: { id: string; on: string; title: string }[];
  widgets: { id: string; title: string }[];
  actions: { id: string; label: string }[];
  jobs: { id: string; label: string }[];
}
interface Detail extends Card {
  entries: Entries;
  changelog: { version: string; changelog: string; at: string }[];
  update: { from: string; to: string; changelog: { version: string; changelog: string; at: string }[]; new_scopes: { key: string; label: string; risk: string }[] } | null;
  my_review: { rating: number; body: string } | null;
  can_review: boolean;
}
interface Catalogue {
  plugins: Card[];
  categories: { key: string; label: string; count: number }[];
  can_install: boolean;
}
interface Review {
  id: string;
  rating: number;
  body: string;
  mine: boolean;
  author: string;
  updated_at: string;
}

export function Stars({ value, count }: { value: number | null; count?: number }) {
  const tt = useT('x_ai');
  if (value === null) return <span className="muted small">{tt('noch keine Bewertung')}</span>;
  return (
    <span className="wk-stars" aria-label={tt('{value} von 5 Sternen', { value: value })}>
      <span aria-hidden>{'★'.repeat(Math.round(value))}{'☆'.repeat(5 - Math.round(value))}</span> <span className="muted small">{value.toLocaleString('de-DE')}{count !== undefined ? ` (${count})` : ''}</span>
    </span>
  );
}

export function MarktplatzPage() {
  const route = useRoute();
  return route[1] ? <MarktDetail id={route[1]} /> : <MarktList />;
}

function MarktList() {
  const tt = useT('x_ai');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [sort, setSort] = useState('popular');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQuery(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const l = useLoad(() => api.get<Catalogue>(`/api/marktplatz?${new URLSearchParams({ q: query, category: cat, sort })}`), [query, cat, sort]);
  const d = l.data;
  return (
    <>
      <PageHead title={NAMES.marktplatz} sub={tt('Plugins aus der Agentur und der Community – prüfe sie live mit Beispieldaten und installiere sie für deinen Sub-Account.')}>
        <Link to="werkstatt" className="btn secondary">
          <Icon name="hammer" size={14} /> {NAMES.werkstatt}
        </Link>
      </PageHead>
      <div className="mk-bar" data-tour="mk-search">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt('Plugins suchen …')} aria-label={tt('Plugins suchen')} />
        <Select
          value={sort}
          onChange={setSort}
          options={[
            ['popular', 'Beliebteste'],
            ['rating', 'Beste Bewertung'],
            ['new', 'Neueste'],
          ]}
        />
      </div>
      <div className="chips" data-tour="mk-categories" style={{ marginBottom: 14 }}>
        <button className={`chip${cat === '' ? ' on' : ''}`} onClick={() => setCat('')}>
          {tt('Alle')}
        </button>
        {(d?.categories ?? []).map((c) => (
          <button key={c.key} className={`chip${cat === c.key ? ' on' : ''}`} onClick={() => setCat(c.key)} disabled={!c.count && cat !== c.key}>
            {c.label} <b>{c.count}</b>
          </button>
        ))}
      </div>
      <BoardShelf />
      {l.loading && !d ? (
        <Spinner />
      ) : !d?.plugins.length ? (
        <Empty tour="mk-empty">{query || cat ? tt('Nichts gefunden.') : tt('Im {marktplatz} ist noch nichts veröffentlicht. Admins veröffentlichen Plugins aus der {werkstatt}, sobald sie geprüft sind.', { marktplatz: NAMES.marktplatz, werkstatt: NAMES.werkstatt })}</Empty>
      ) : (
        <div className="mk-grid" data-tour="mk-grid">
          {d.plugins.map((p) => (
            <MarktCard key={p.id} p={p} />
          ))}
        </div>
      )}
    </>
  );
}

function MarktCard({ p }: { p: Card }) {
  const tt = useT('x_ai');
  return (
    <Link to={`marktplatz/${p.id}`} className="card mk-card" tour="mk-card">
      {p.screenshots[0] && <img className="mk-shot" src={p.screenshots[0]} alt="" loading="lazy" />}
      <div className="row" style={{ flexWrap: 'nowrap', gap: 10 }}>
        <span className="wk-ico">
          <PluginIcon name={p.icon} size={20} />
        </span>
        <div className="grow">
          <strong>{p.name}</strong>
          <div className="muted small">{p.category_label}</div>
        </div>
      </div>
      <p className="mk-desc">{p.description}</p>
      <div className="mk-meta">
        <Stars value={p.rating} count={p.reviews} />
        <span className="muted small">{tt('{installs} Installation', { installs: p.installs })}{p.installs === 1 ? '' : 'en'}</span>
      </div>
      <div className="wk-badges">
        {p.installed && <Badge tone="green">installiert</Badge>}
        {p.update_available && <Badge tone="yellow">{tt('Update')}</Badge>}
        {p.in_core && <Badge tone="purple">{NAMES.inCore}</Badge>}
        {p.killed && <Badge tone="red">abgeschaltet</Badge>}
        <Badge tone={RISK[p.risk]?.tone ?? 'gray'}>{tt('Risiko {v}', { v: RISK[p.risk]?.label ?? p.risk })}</Badge>
      </div>
    </Link>
  );
}

// --- detail -----------------------------------------------------------------------------------------------------------------

function MarktDetail({ id }: { id: string }) {
  const tt = useT('x_ai');
  const r = useLoad(() => api.get<Detail>(`/api/marktplatz/${id}`), [id]);
  const reviews = useLoad(() => api.get<Review[]>(`/api/marktplatz/${id}/reviews`).catch(() => [] as Review[]), [id]);
  const mgmt = useLoad(() => api.get<{ can_manage: boolean }>(`/api/plugins/${id}`).catch(() => null), [id]);
  const me = useLoad(() => api.get<{ admin: boolean }>('/api/werkstatt/me'), []);
  const cat = useLoad(() => api.get<Catalogue>('/api/marktplatz'), []);
  const [modal, setModal] = useState<'install' | 'update' | 'shot' | null>(null);
  const [tab, setTab] = useState('');
  const p = r.data;
  if (r.loading && !p) return <Spinner />;
  if (!p) return <Empty action={<Link to="marktplatz">{tt('Zum {marktplatz}', { marktplatz: NAMES.marktplatz })}</Link>}>{r.error || tt('Plugin nicht gefunden.')}</Empty>;
  const admin = !!me.data?.admin;
  const manage = !!mgmt.data?.can_manage || admin;
  const entries = [
    ...(p.entries.page ? [{ key: 'page', label: p.entries.page.title }] : []),
    ...p.entries.widgets.map((w) => ({ key: `widget:${w.id}`, label: `Widget: ${w.title}` })),
    ...p.entries.panels.map((x) => ({ key: `panel:${x.id}`, label: `Panel: ${x.title}` })),
  ];
  const entry = entries.find((e) => e.key === tab)?.key ?? entries[0]?.key;
  const reload = () => {
    void r.reload();
    void reviews.reload();
    void refreshPlugins();
  };
  return (
    <div className="mk-detail">
      <p>
        <Link to="marktplatz">← {NAMES.marktplatz}</Link>
      </p>
      <div className="mk-head">
        <span className="wk-ico big">
          <PluginIcon name={p.icon} size={30} />
        </span>
        <div className="grow">
          <h1 style={{ margin: 0 }}>{p.name}</h1>
          <div className="muted">
            {tt('{category_label} · Version {version}', { category_label: p.category_label, version: p.version })}
            {p.published_at ? tt(' · veröffentlicht {dateOnly}', { dateOnly: dateOnly(p.published_at) }) : ''}
          </div>
          <div className="mk-meta">
            <Stars value={p.rating} count={p.reviews} />
            <span className="muted small">{tt('{installs} Installation', { installs: p.installs })}{p.installs === 1 ? '' : 'en'}</span>
            {p.votes > 0 && <span className="muted small">{tt('{votes} Stimmen aus der Wunschliste', { votes: p.votes })}</span>}
          </div>
        </div>
        <div className="actions" data-tour="mk-install">
          {p.in_core ? (
            <Badge tone="purple">{tt('{inCore} (ab {core_version})', { inCore: NAMES.inCore, core_version: p.core_version })}</Badge>
          ) : p.installed ? (
            <>
              <Badge tone="green">{p.installed_scope === 'private' ? tt('nur für dich installiert') : tt('im Sub-Account installiert')}</Badge>
              {p.update_available && (
                <button className="btn" onClick={() => setModal('update')}>
                  {tt('Update auf {to}', { to: (p.update?.to) ?? '' })}
                </button>
              )}
              <Link to={`werkstatt/plugins/${p.id}`} className="btn secondary">
                {tt('Verwalten')}
              </Link>
            </>
          ) : (
            !p.killed && (
              <button className="btn" onClick={() => setModal('install')}>
                <Icon name="download" size={14} /> {tt('Installieren')}
              </button>
            )
          )}
        </div>
      </div>
      {p.killed && <div className="card notice-card">{tt('Dieses Plugin wurde wegen vieler Fehler abgeschaltet und lässt sich nicht installieren.')}</div>}
      <p style={{ whiteSpace: 'pre-wrap' }}>{p.description}</p>

      {(p.screenshots.length > 0 || manage) && (
        <div className="mk-shots" data-tour="mk-shots">
          {p.screenshots.map((s) => (
            <figure key={s}>
              <img src={s} alt={tt('Bildschirmfoto von {name}', { name: p.name })} loading="lazy" />
              {manage && (
                <button className="icon-btn" aria-label={tt('Bild entfernen')} onClick={() => confirmAsk(tt('Bild entfernen?')) && act(() => api.del(s)).then((x) => x && reload())}>
                  ✕
                </button>
              )}
            </figure>
          ))}
          {manage && (
            <div className="mk-shot-add">
              <button className="btn secondary small" onClick={() => setModal('shot')}>
                <Icon name="imageUp" size={13} /> {tt('Bild hinzufügen')}
              </button>
              {admin && (
                <button className="btn secondary small" onClick={() => act(() => api.post(`/api/marktplatz/${p.id}/screenshots/auto`), tt('Bild aufgenommen')).then((x) => x && reload())}>
                  {tt('Automatisch aufnehmen')}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {entry && (
        <div className="card" data-tour="mk-preview">
          <div className="row" style={{ alignItems: 'center' }}>
            <h3 style={{ margin: 0 }} className="grow">
              {tt('Live-Vorschau mit Beispieldaten')}
            </h3>
            {entries.length > 1 && <Select value={entry} onChange={setTab} options={entries.map((e) => [e.key, e.label] as [string, string])} />}
          </div>
          <p className="muted small">{tt('Das Plugin läuft hier in seiner Sandbox, hat aber keinen Zugriff auf deine Daten – alles unten sind erfundene Beispiele.')}</p>
          <PluginFrame key={`${p.id}:${entry}`} pluginId={p.id} entry={entry} demo height={entry === 'page' ? 340 : undefined} title={p.name} />
        </div>
      )}

      <div className="grid2">
        <div className="card">
          <h3>{tt('Berechtigungen')}</h3>
          <ScopeList scopes={p.scopes} />
        </div>
        <div className="card">
          <h3>{tt('Was ist drin')}</h3>
          <ul className="wk-entries">
            {p.entries.page && <li>{tt('Seite im Menü: {title}', { title: p.entries.page.title })}</li>}
            {p.entries.panels.map((x) => (
              <li key={x.id}>
                {tt('Panel auf der')} {x.on === 'contact' ? tt('Kontakt') : tt('Deal')}{tt('-Seite: {title}', { title: x.title })}
              </li>
            ))}
            {p.entries.widgets.map((x) => (
              <li key={x.id}>{tt('Dashboard-Widget: {title}', { title: x.title })}</li>
            ))}
            {p.entries.actions.map((x) => (
              <li key={x.id}>{tt('Automations-Schritt: {label}', { label: x.label })}</li>
            ))}
            {p.entries.jobs.map((x) => (
              <li key={x.id}>{tt('Geplanter Job: {label}', { label: x.label })}</li>
            ))}
          </ul>
          {p.changelog.length > 0 && (
            <>
              <h4>{tt('Änderungen')}</h4>
              <ul className="wk-entries" data-tour="mk-changelog">
                {p.changelog.map((c) => (
                  <li key={c.version}>
                    <strong>{c.version}</strong> {c.changelog || '–'} <span className="muted small">{dateOnly(c.at)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <ReviewsCard p={p} reviews={reviews.data ?? []} admin={admin} onChange={reload} />
      {admin && <AdminCard p={p} onChange={reload} />}

      {modal === 'install' && <InstallModal p={p} canLocation={!!cat.data?.can_install} onClose={() => setModal(null)} onDone={() => (setModal(null), reload())} />}
      {modal === 'update' && p.update && <UpdateModal p={p} onClose={() => setModal(null)} onDone={() => (setModal(null), reload())} />}
      {modal === 'shot' && <ShotModal id={p.id} onClose={() => setModal(null)} onDone={() => (setModal(null), reload())} />}
    </div>
  );
}

function InstallModal({ p, canLocation, onClose, onDone }: { p: Detail; canLocation: boolean; onClose: () => void; onDone: () => void }) {
  const tt = useT('x_ai');
  const [scope, setScope] = useState(canLocation ? 'location' : 'private');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    const r = await act(() => api.post(`/api/marktplatz/${p.id}/install`, { scope, consent: p.scopes.map((s) => s.key) }), tt('„{name}“ ist installiert', { name: p.name }));
    setBusy(false);
    if (r) onDone();
  };
  return (
    <ConsentModal title={tt('„{name}“ installieren', { name: p.name })} scopes={p.scopes} confirm={tt('Installieren')} busy={busy} onConfirm={go} onClose={onClose}>
      <Field label={tt('Installieren für')} tour="mk-install-scope">
        <Select
          value={scope}
          onChange={setScope}
          options={[
            ...(canLocation ? ([['location', 'den ganzen Sub-Account'] as [string, string]] as [string, string][]) : []),
            ['private', 'nur mich'],
          ]}
        />
      </Field>
      {!canLocation && <p className="muted small">{tt('Für den ganzen Sub-Account brauchst du das Recht „Einstellungen“.')}</p>}
    </ConsentModal>
  );
}

function UpdateModal({ p, onClose, onDone }: { p: Detail; onClose: () => void; onDone: () => void }) {
  const tt = useT('x_ai');
  const u = p.update!;
  const added = u.new_scopes.length > 0;
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    const r = await act(() => api.post(`/api/marktplatz/${p.id}/update`, { consent: p.scopes.map((s) => s.key) }), tt('Auf Version {to} aktualisiert', { to: u.to }));
    setBusy(false);
    if (r) onDone();
  };
  const changes = (
    <>
      <h4>
        {tt('Neu in {to} (bisher {from})', { to: u.to, from: u.from })}
      </h4>
      <ul className="wk-entries">
        {u.changelog.map((c) => (
          <li key={c.version}>
            <strong>{c.version}</strong> {c.changelog || '–'}
          </li>
        ))}
      </ul>
    </>
  );
  if (added)
    return (
      <ConsentModal title={tt('Update auf {to}', { to: u.to })} intro={tt('Die neue Version fragt zusätzliche Berechtigungen an:')} scopes={p.scopes.filter((s) => u.new_scopes.some((n) => n.key === s.key))} confirm={tt('Aktualisieren')} busy={busy} onConfirm={go} onClose={onClose}>
        {changes}
      </ConsentModal>
    );
  return (
    <Modal
      title={tt('Update auf {to}', { to: u.to })}
      onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={onClose}>
            {tt('Abbrechen')}
          </button>
          <button className="btn" disabled={busy} onClick={go}>
            {tt('Aktualisieren')}
          </button>
        </>
      }
    >
      <p className="muted">{tt('Keine neuen Berechtigungen – es gilt, was du schon bestätigt hast.')}</p>
      {changes}
    </Modal>
  );
}

function ShotModal({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const tt = useT('x_ai');
  const [img, setImg] = useState('');
  return (
    <Modal
      title={tt('Bild hinzufügen')}
      onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={onClose}>
            {tt('Abbrechen')}
          </button>
          <button className="btn" disabled={!img} onClick={async () => (await act(() => api.post(`/api/marktplatz/${id}/screenshots`, { image: img }), tt('Bild gespeichert'))) && onDone()}>
            {tt('Speichern')}
          </button>
        </>
      }
    >
      <p className="muted small">{tt('Ein Bildschirmfoto des Plugins in Aktion – höchstens vier eigene Bilder. Keine echten Kundendaten zeigen.')}</p>
      <ScreenshotPicker value={img} onChange={setImg} />
    </Modal>
  );
}

/** „Testen und bewerten“ on the plugin's own page: the rating (and the note) is what the admin sees before publishing. */
export function RatingCard({ pluginId }: { pluginId: string }) {
  const tt = useT('x_ai');
  const l = useLoad(() => api.get<Review[]>(`/api/marktplatz/${pluginId}/reviews`).catch(() => [] as Review[]), [pluginId]);
  const mine = (l.data ?? []).find((r) => r.mine);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  useEffect(() => {
    setRating(mine?.rating ?? 0);
    setText(mine?.body ?? '');
  }, [mine?.id, mine?.rating, mine?.body]);
  return (
    <div className="card" data-tour="wk-rating">
      <h3>{tt('Testen und bewerten')}</h3>
      <p className="muted small">{tt('Probiere das Plugin aus und sag, wie nützlich es ist. Die Bewertung hilft dir bei der Entscheidung, ob es für mehr Menschen freigegeben wird.')}</p>
      <div className="mk-review-form">
        <PickStars value={rating} onChange={setRating} />
        <Textarea value={text} onChange={setText} rows={2} placeholder={tt('Was funktioniert, was fehlt? (optional)')} />
        <div className="actions">
          <button className="btn small" disabled={!rating} onClick={async () => (await act(() => api.put(`/api/marktplatz/${pluginId}/reviews`, { rating, body: text }), tt('Bewertung gespeichert'))) && void l.reload()}>
            {mine ? tt('Bewertung ändern') : tt('Bewerten')}
          </button>
        </div>
      </div>
      {(l.data ?? []).length > 0 && (
        <p className="muted small">
          {tt('{length} Bewertung', { length: (l.data ?? []).length })}{(l.data ?? []).length === 1 ? '' : 'en'}{tt(', Durchschnitt')} <Stars value={Math.round(((l.data ?? []).reduce((a, r) => a + r.rating, 0) / (l.data ?? []).length) * 10) / 10} />
        </p>
      )}
    </div>
  );
}

function PickStars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const tt = useT('x_ai');
  return (
    <span className="wk-stars pick" role="radiogroup" aria-label={tt('Bewertung')}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} className={n <= value ? 'on' : ''} onClick={() => onChange(n)} aria-label={tt('{n} Stern{v}', { n: n, v: n === 1 ? '' : 'e' })}>
          ★
        </button>
      ))}
    </span>
  );
}

function ReviewsCard({ p, reviews, admin, onChange }: { p: Detail; reviews: Review[]; admin: boolean; onChange: () => void }) {
  const tt = useT('x_ai');
  const [rating, setRating] = useState(p.my_review?.rating ?? 0);
  const [text, setText] = useState(p.my_review?.body ?? '');
  return (
    <div className="card" data-tour="mk-reviews">
      <h3>{tt('Bewertungen')}</h3>
      {p.can_review ? (
        <div className="mk-review-form">
          <PickStars value={rating} onChange={setRating} />
          <Textarea value={text} onChange={setText} rows={2} placeholder={tt('Wie nützlich ist das Plugin für dich? (optional)')} />
          <div className="actions">
            <button className="btn small" disabled={!rating} onClick={async () => (await act(() => api.put(`/api/marktplatz/${p.id}/reviews`, { rating, body: text }), tt('Bewertung gespeichert'))) && onChange()}>
              {p.my_review ? tt('Bewertung ändern') : tt('Bewerten')}
            </button>
            {p.my_review && (
              <button className="btn ghost small" onClick={async () => (await act(() => api.del(`/api/marktplatz/${p.id}/reviews`), tt('Bewertung gelöscht'))) && (setRating(0), setText(''), onChange())}>
                {tt('Löschen')}
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className="muted small">{tt('Bewerten kann, wer das Plugin installiert hat.')}</p>
      )}
      {reviews.length === 0 ? (
        <p className="muted">{tt('Noch keine Bewertungen.')}</p>
      ) : (
        <ul className="mk-reviews">
          {reviews.map((x) => (
            <li key={x.id}>
              <Stars value={x.rating} /> <span className="muted small">{x.author || tt('Jemand')} · {ago(x.updated_at)}</span>
              {admin && !x.mine && (
                <button className="btn ghost small" onClick={() => confirmAsk(tt('Bewertung löschen?')) && act(() => api.del(`/api/marktplatz/${p.id}/reviews?review=${x.id}`)).then((r) => r && onChange())}>
                  {tt('Löschen')}
                </button>
              )}
              {x.body && <p>{x.body}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- curation (admins) ------------------------------------------------------------------------------------------------------------

export interface ReviewRow {
  id: string;
  version: string;
  verdict: 'pass' | 'warn' | 'fail';
  summary: string;
  checks: { id: string; label: string; ok: boolean; note: string; source: 'ai' | 'auto' }[];
  model: string;
  kind?: 'review' | 'second_opinion';
  effort?: { label: string; note: string } | null;
  cost_usd: number;
  by: string;
  created_at: string;
}
const VERDICT = { pass: { label: 'Bestanden', tone: 'green' as const }, warn: { label: 'Mit Hinweisen', tone: 'yellow' as const }, fail: { label: 'Durchgefallen', tone: 'red' as const } };

export function ReviewView({ r, compact }: { r: ReviewRow; compact?: boolean }) {
  const tt = useT('x_ai');
  const list = (cs: ReviewRow['checks']) => (
    <ul className="mk-checks">
      {cs.map((c) => (
        <li key={c.id} className={c.ok ? 'ok' : 'bad'}>
          <span aria-hidden>{c.ok ? '✓' : '✗'}</span>
          <span>
            <strong>{c.label}</strong>
            <br />
            <span className="muted small">{c.note}{c.source === 'auto' ? tt(' (automatisch geprüft)') : ''}</span>
          </span>
        </li>
      ))}
    </ul>
  );
  if (compact)
    return (
      <div className="mk-secreview" data-tour="mk-checklist">
        <p>
          <Badge tone={VERDICT[r.verdict].tone}>{VERDICT[r.verdict].label}</Badge> <span className="muted small">{r.model}{r.effort?.label ? tt(' · Denkstufe {label}', { label: r.effort.label }) : ''}</span>
        </p>
        <p className="small">{r.summary}</p>
        {r.checks.some((c) => !c.ok) && list(r.checks.filter((c) => !c.ok))}
        <details>
          <summary className="small">{tt('Alle {length} Punkte der Checkliste', { length: r.checks.length })}</summary>
          {list(r.checks)}
        </details>
      </div>
    );
  return (
    <div className="mk-secreview" data-tour="mk-checklist">
      <p>
        <Badge tone={VERDICT[r.verdict].tone}>{VERDICT[r.verdict].label}</Badge> <span className="muted small">{tt('Version {version} · {ago}', { version: r.version, ago: ago(r.created_at) })}{r.model ? ` · ${r.model}` : ''}{r.effort?.label ? tt(' · Denkstufe {label}', { label: r.effort.label }) : ''}</span>
      </p>
      <p>{r.summary}</p>
      <ul className="mk-checks">
        {r.checks.map((c) => (
          <li key={c.id} className={c.ok ? 'ok' : 'bad'}>
            <span aria-hidden>{c.ok ? '✓' : '✗'}</span>
            <span>
              <strong>{c.label}</strong>
              <br />
              <span className="muted small">{c.note}{c.source === 'auto' ? tt(' (automatisch geprüft)') : ''}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AdminCard({ p, onChange }: { p: Detail; onChange: () => void }) {
  const tt = useT('x_ai');
  const l = useLoad(() => api.get<ReviewRow[]>(`/api/marktplatz/${p.id}/security-reviews`), [p.id]);
  return (
    <div className="card">
      <h3>{tt('Für Admins')}</h3>
      {p.owner && (
        <p className="muted small">
          {tt('Gebaut von {user} ({location}).', { user: p.owner.user, location: p.owner.location })}
        </p>
      )}
      {l.data?.[0] ? <ReviewView r={l.data[0]} /> : <p className="muted">{tt('Keine Sicherheitsprüfung gespeichert.')}</p>}
      <div className="actions">
        <button className="btn danger small" onClick={() => confirmAsk(tt('„{name}“ aus dem {marktplatz} nehmen? Bestehende Installationen laufen weiter.', { name: p.name, marktplatz: NAMES.marktplatz })) && act(() => api.post(`/api/marktplatz/${p.id}/unpublish`), tt('Aus dem Marktplatz genommen')).then((x) => x && (onChange(), navigate('marktplatz')))}>
          {tt('Aus dem {marktplatz} nehmen', { marktplatz: NAMES.marktplatz })}
        </button>
      </div>
    </div>
  );
}

interface PublishCheck {
  version: { id: string; version: string } | null;
  review: ReviewRow | null;
  second_opinion: ReviewRow | null;
  comparison: { agree: boolean; differing: string[] } | null;
  second_state: { pro: boolean; available: boolean; reason: string; required: boolean; model: string; done: boolean } | null;
  license: { pro: boolean };
}

/**
 * Publishing: an AI security review with a checklist first, then (Pro) the second opinion of another top model, then
 * the admin's own approval. A failed review blocks, one with hints needs an explicit "ich habe sie gelesen". Both verdicts
 * show side by side, with what differs.
 */
export function PublishModal({ plugin, onClose, onDone }: { plugin: { id: string; name: string; version: string }; onClose: () => void; onDone: () => void }) {
  const tt = useT('x_ai');
  const [review, setReview] = useState<ReviewRow>();
  const [check, setCheck] = useState<PublishCheck>();
  const [busy, setBusy] = useState(false);
  const [approve, setApprove] = useState(false);
  const [warned, setWarned] = useState(false);
  const load = async () => setCheck(await api.get<PublishCheck>(`/api/marktplatz/${plugin.id}/publish-check`).catch(() => undefined));
  useEffect(() => void load(), [plugin.id]);
  const run = async () => {
    setBusy(true);
    const r = await act(() => api.post<ReviewRow>(`/api/marktplatz/${plugin.id}/security-review`, {}));
    setBusy(false);
    if (r) {
      setReview(r);
      setApprove(false);
      setWarned(false);
      void load();
    }
  };
  const second = async () => {
    setBusy(true);
    const r = await act(() => api.post<PublishCheck>(`/api/marktplatz/${plugin.id}/second-opinion`, {}));
    setBusy(false);
    if (r) {
      setCheck(r);
      setWarned(false);
    }
  };
  const so = check?.second_opinion ?? null;
  const st = check?.second_state ?? null;
  const worst = review?.verdict === 'fail' || so?.verdict === 'fail' ? 'fail' : review?.verdict === 'warn' || so?.verdict === 'warn' ? 'warn' : 'pass';
  const missingSecond = !!st && st.required && st.available && !so;
  const publish = async () => {
    if (!review) return;
    setBusy(true);
    const r = await act(() => api.post(`/api/marktplatz/${plugin.id}/publish`, { review_id: review.id, approve: true, accept_warnings: worst === 'warn' ? warned : undefined }), tt('„{name}“ ist im {marktplatz}', { name: plugin.name, marktplatz: NAMES.marktplatz }));
    setBusy(false);
    if (r) onDone();
  };
  return (
    <Modal
      title={tt('„{name}“ im {marktplatz} veröffentlichen', { name: plugin.name, marktplatz: NAMES.marktplatz })}
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={onClose}>
            {tt('Abbrechen')}
          </button>
          {review && (
            <button className="btn secondary" disabled={busy} onClick={run}>
              {tt('Prüfung wiederholen')}
            </button>
          )}
          {review ? (
            <button className="btn" data-tour="mk-publish-ok" disabled={busy || worst === 'fail' || !approve || (worst === 'warn' && !warned) || missingSecond} onClick={publish}>
              <Icon name="store" size={14} /> {tt('Veröffentlichen')}
            </button>
          ) : (
            <button className="btn" disabled={busy} onClick={run}>
              <Icon name="shieldOk" size={14} /> {busy ? tt('Die KI prüft …') : tt('Sicherheitsprüfung starten')}
            </button>
          )}
        </>
      }
    >
      {!review ? (
        <>
          <p>
            {tt('Bevor ein Plugin für alle sichtbar wird, prüft eine KI es anhand einer Checkliste (Datenabfluss, verbotene Zugriffe, zu viele Berechtigungen, Robustheit). Dazu kommen automatische Prüfungen des Programms – die können das Urteil nur verschlechtern. Danach entscheidest du.')}
          </p>
          <p className="muted small">{tt('Geprüft wird Version {version}. Die Prüfung kostet etwas KI-Budget und läuft nur mit einem Spitzenmodell.', { version: plugin.version })}</p>
          <p className="muted small">
            {tt('Zweitmeinung eines anderen Spitzenmodells')} <ProMark />: {st?.pro === false ? tt('dafür fehlt die Pro-Lizenz.') : st?.available ? tt('bereit ({model}) – du holst sie nach der ersten Prüfung ein.', { model: st.model }) : st?.reason || tt('wird nach der ersten Prüfung angeboten.')}
          </p>
        </>
      ) : (
        <>
          <div className={so ? 'wk-review-cmp' : ''}>
            <div>
              {so && <h4>{tt('Sicherheitsprüfung')}</h4>}
              <ReviewView r={review} compact={!!so} />
            </div>
            {so && (
              <div>
                <h4>
                  {tt('Zweitmeinung')} <ProMark />
                </h4>
                <ReviewView r={so} compact />
              </div>
            )}
          </div>
          {check?.comparison && <p className={check.comparison.agree ? 'muted small' : 'small'}>{check.comparison.agree ? tt('Beide Prüfungen kommen zum selben Ergebnis.') : `Die Prüfungen sehen etwas unterschiedlich: ${check.comparison.differing.length ? tt('abweichend bei {n}.', { n: check.comparison.differing.join(', ') }) : tt('unterschiedliches Urteil.')}`}</p>}
          {st && !so && (
            <div className="card wk-gate ok" data-tour="mk-second-opinion">
              <strong>
                {tt('Zweitmeinung')} <ProMark /> {st.required && st.available ? tt('– vor dem Veröffentlichen nötig') : ''}
              </strong>
              <span className="small">{st.available ? tt('Dieselbe Checkliste, unabhängig beantwortet von {model} – einem anderen Modell als dem, das das Plugin geschrieben und zuerst geprüft hat.', { model: st.model }) : st.reason}</span>
              {st.available && (
                <div className="actions">
                  <button className="btn secondary small" disabled={busy} onClick={second}>
                    {busy ? tt('Das zweite Modell prüft …') : tt('Zweitmeinung einholen')}
                  </button>
                </div>
              )}
            </div>
          )}
          {worst === 'fail' ? (
            <div className="card notice-card">{tt('Durchgefallen – so wird nichts veröffentlicht. Lass das Plugin ändern und prüfe erneut.')}</div>
          ) : (
            <>
              {worst === 'warn' && <Check checked={warned} onChange={setWarned} label={tt('Ich habe die Hinweise gelesen und nehme sie in Kauf.')} />}
              <Check checked={approve} onChange={setApprove} label={tt('Ich gebe das Plugin für den {marktplatz} frei. Es ist danach für alle Sub-Accounts sichtbar und installierbar.', { marktplatz: NAMES.marktplatz })} />
            </>
          )}
        </>
      )}
    </Modal>
  );
}
