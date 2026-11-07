import { useEffect, useState } from 'react';
import { Icon } from '../icons';
import { api, d as day, dt } from '../api';
import { Badge, Field, Input, Link, Spinner, Stat, act, confirmAsk, toast, useLoad } from '../ui';
import { GooglePostsPanel, GoogleReply } from './GoogleBusiness';
import { SignupLink } from '../referrals';
import { ShareLink } from '../QrCode';
import { DraftOnly, ReplySettingsPanel, useReplyCfg } from './ReviewReplies';
import { SortableGrid } from '../sortable/Sortable';
import { fmtNumber, intlLocale, useT } from '../i18n';

/** Google reviews: panel on the Bewertungen page and the connection settings. */

const stars = (n: number) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
const de = (n: number, digits = 1) => n.toLocaleString(intlLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Small trend line: history in the muted ink, the latest value in the accent; every point has a hover title. */
function Sparkline({ points, label, format }: { points: { day: string; v: number }[]; label: string; format: (v: number) => string }) {
  const tt = useT('x_comms');
  if (points.length < 2) return <div className="muted small">{tt('Verlauf ab dem nächsten Abruf')}</div>;
  const w = 160;
  const h = 34;
  const pad = 4;
  const vs = points.map((p) => p.v);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const x = (i: number) => pad + (i / (points.length - 1)) * (w - pad * 2);
  const y = (v: number) => (max === min ? h / 2 : h - pad - ((v - min) / (max - min)) * (h - pad * 2));
  const last = points[points.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label={tt('{label}: {format} am {day} bis {format2} am {day2}', { label: label, format: format(points[0].v), day: day(points[0].day), format2: format(last.v), day2: day(last.day) })}>
      <polyline points={points.map((p, i) => `${x(i)},${y(p.v)}`).join(' ')} fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(points.length - 1)} cy={y(last.v)} r="4" fill="var(--brand)" stroke="var(--panel)" strokeWidth="2" />
      {points.map((p, i) => (
        <circle key={p.day} cx={x(i)} cy={y(p.v)} r="8" fill="transparent">
          <title>{`${day(p.day)}: ${format(p.v)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

function Delta({ value, unit, since, digits = 0 }: { value: number | undefined; unit: string; since?: string; digits?: number }) {
  const tt = useT('x_comms');
  if (value === undefined || since === undefined) return null;
  const up = value > 0;
  const flat = value === 0;
  return (
    <span className={`delta ${flat ? '' : up ? 'up' : 'down'}`}>
      {!flat && <Icon name={up ? 'trendUp' : 'trendDown'} size={13} />} {up ? '+' : ''}
      {de(value, digits)} {unit} {tt('seit {day}', { day: day(since) })}
    </span>
  );
}

export function GoogleReviewsPanel() {
  const tt = useT('x_comms');
  const data = useLoad(() => api.get('/api/google-reviews').catch(() => null), []);
  const replyCfg = useReplyCfg();
  const [busy, setBusy] = useState(false);
  const g = data.data;
  if (!g) return null;
  if (!g.configured) {
    return (
      <div className="card google-connect" data-tour="google-panel">
        <Icon name="place" /> <strong>{tt('Google-Bewertungen hier anzeigen:')}</strong> {tt('Sterne, Anzahl und neue Rezensionen deines Google-Unternehmensprofils, täglich aktualisiert – mit verbundenem Profil auch antworten und Beiträge veröffentlichen.')}{' '}
        <Link to="settings/reviews">{tt('Jetzt verbinden')}</Link>
      </div>
    );
  }
  const trend = (g.trend ?? []) as { day: string; rating: number; total: number }[];
  const business = !!g.business?.ready;
  const replaced = (r: any) => data.setData({ ...g, reviews: g.reviews.map((x: any) => (x.id === r.id ? r : x)) });
  return (
    <>
    <div className="card google-reviews" data-tour="google-panel">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ marginBottom: 2 }}>
            Google <Badge tone="blue">{g.place?.name || tt('Unternehmensprofil')}</Badge>
          </h2>
          <div className="muted small">
            {g.place?.address}
            {g.last_sync_at ? tt(' · zuletzt abgerufen {dt}', { dt: dt(g.last_sync_at) }) : ''}
            {g.last_error ? <span style={{ color: 'var(--red)' }}> · {g.last_error}</span> : null}
          </div>
        </div>
        <div className="actions">
          <button
            className="btn small secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await act(() => api.post('/api/google-reviews/sync'));
              setBusy(false);
              if (r) toast(r.new ? tt.plural(r.new, { one: '{n} neue Bewertung', other: '{n} neue Bewertungen' }) : tt('Aktuell – nichts Neues'));
              void data.reload();
            }}
          >
            <Icon name="refresh" size={14} /> {tt('Jetzt abrufen')}
          </button>
          {g.place && (
            <>
              <a className="btn small secondary" href={g.place.reviews_url} target="_blank" rel="noopener noreferrer">
                <Icon name="external" size={14} /> {tt('Auf Google ansehen')}
              </a>
              <a className="btn small secondary" href={g.place.manage_url} target="_blank" rel="noopener noreferrer">
                {tt('Unternehmensprofil')}
              </a>
            </>
          )}
        </div>
      </div>
      <SortableGrid id="google-reviews.stats" className="stats" style={{ marginTop: 12 }}>
        <Stat
          label={tt('Google-Bewertung')}
          value={g.rating != null ? `${de(g.rating)} ★` : '–'}
          sub={
            <>
              <Delta value={g.change?.rating} unit="★" since={g.change?.since} digits={1} />
              <Sparkline points={trend.map((t) => ({ day: t.day, v: t.rating }))} label={tt('Durchschnitt')} format={(v) => `${de(v)} ★`} />
            </>
          }
        />
        <Stat
          label={tt('Bewertungen auf Google')}
          value={g.total ?? '–'}
          sub={
            <>
              <Delta value={g.change?.total} unit="" since={g.change?.since} />
              <Sparkline points={trend.map((t) => ({ day: t.day, v: t.total }))} label={tt('Anzahl')} format={(v) => String(v)} />
            </>
          }
        />
      </SortableGrid>
      <ReplySettingsPanel cfg={replyCfg.data} onSaved={replyCfg.reload} />
      {g.reviews.length ? (
        <div className="g-reviews">
          {g.reviews.map((r: any) => (
            <div key={r.id} className={`g-review${r.rating <= 3 ? ' low' : ''}`}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                <span>
                  <span className="g-stars" aria-label={tt('{rating} von 5 Sternen', { rating: r.rating })}>
                    {stars(r.rating)}
                  </span>{' '}
                  {r.author_url ? (
                    <a href={r.author_url} target="_blank" rel="noopener noreferrer">
                      <strong>{r.author}</strong>
                    </a>
                  ) : (
                    <strong>{r.author}</strong>
                  )}{' '}
                  <span className="muted small">{r.published_at ? day(r.published_at) : r.relative_time}</span>
                </span>
                <span className="actions">
                  <Badge>Google</Badge>
                  {r.contact_id && <Link to={`contacts/${r.contact_id}`}>{tt('Kontakt')}</Link>}
                  {!(business && String(r.review_key).startsWith('accounts/')) && (
                    <a className="btn small secondary" href={r.link} target="_blank" rel="noopener noreferrer" title={tt('Öffnet die Bewertung auf Google – als Inhaber des Profils kannst du dort antworten')}>
                      {tt('Auf Google antworten')}
                    </a>
                  )}
                </span>
              </div>
              {r.text ? <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{r.text}</p> : <p className="muted small" style={{ margin: '6px 0 0' }}>{tt('(ohne Text)')}</p>}
              {business && String(r.review_key).startsWith('accounts/') ? (
                <GoogleReply review={r} onSaved={replaced} cfg={replyCfg.data} />
              ) : r.reply_text ? (
                <div className="g-reply">
                  <div className="muted small">{tt('Antwort des Inhabers')}</div>
                  <p style={{ margin: '2px 0 0', whiteSpace: 'pre-wrap' }}>{r.reply_text}</p>
                </div>
              ) : (
                <DraftOnly review={r} cfg={replyCfg.data} onSaved={replaced} />
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">{tt('Noch keine Rezensionen abgerufen.')}</p>
      )}
      <p className="muted small" style={{ marginBottom: 0 }}>
        {business
          ? tt('Über das verbundene Unternehmensprofil ({account_email}): alle Rezensionen, täglich aktualisiert. Antworten erscheinen sofort öffentlich auf Google.', { account_email: g.business.account_email })
          : tt('Google gibt pro Abruf höchstens 5 Rezensionen heraus (die relevantesten); neue sammeln sich hier täglich an. Antworten geht im Google-Unternehmensprofil – oder hier, wenn es unter Einstellungen → Bewertungen verbunden ist.')}
      </p>
    </div>
    {business && <GooglePostsPanel />}
    </>
  );
}

export function GoogleReviewSettings() {
  const tt = useT('x_comms');
  const data = useLoad(() => api.get('/api/google-reviews/settings'), []);
  const [key, setKey] = useState('');
  const [placeId, setPlaceId] = useState('');
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<any[] | null>(null);
  const [busy, setBusy] = useState('');
  useEffect(() => {
    if (data.data) {
      setKey(data.data.api_key);
      setPlaceId(data.data.place_id);
    }
  }, [data.data]);
  if (!data.data) return <Spinner />;
  const s = data.data;
  const save = async (extra: Record<string, string> = {}) => {
    setBusy('save');
    const r = await act(() => api.put('/api/google-reviews/settings', { api_key: key, place_id: placeId, ...extra }));
    setBusy('');
    if (!r) return;
    data.setData(r);
    if (r.sync?.error) toast(tt('Gespeichert, aber der Abruf klappte nicht: {error}', { error: r.sync.error }));
    else if (r.sync) toast(tt('Verbunden: {replace} ★ aus {v} Bewertungen', { replace: r.sync.rating == null ? '–' : fmtNumber(Number(r.sync.rating), { maximumFractionDigits: 1 }), v: r.sync.total ?? 0 }));
    else toast(tt('Gespeichert'));
  };
  return (
    <div className="card" style={{ maxWidth: 720 }} data-tour="google-places">
      <h2>
        <Icon name="place" size={18} /> {tt('Google-Bewertungen')}
      </h2>
      <p className="muted small">
        {tt('Holt einmal am Tag Sterne, Anzahl und die neuesten Rezensionen deines Google-Unternehmensprofils (Places API). Neue Bewertungen bis 3★ gehen als E-Mail ans Team und können Workflows starten (Auslöser „Neue Google-Bewertung“).')}
      </p>
      <Field label={tt('Google Places API-Schlüssel')} hint={<>{tt('Google Cloud Console → APIs & Dienste → „Places API (New)“ aktivieren → Anmeldedaten → API-Schlüssel erstellen und auf die Places API beschränken. Wird verschlüsselt gespeichert.')} <SignupLink id="google_cloud" /></>}>
        <Input type="password" value={key} onChange={setKey} placeholder={tt('AIza…')} autoComplete="new-password" />
      </Field>
      <Field label={tt('Place ID')} hint={s.place_name ? `${s.place_name}${s.place_address ? ` · ${s.place_address}` : ''}` : tt('Mit „Place ID finden“ suchen oder direkt eintragen (beginnt meist mit ChIJ).')}>
        <Input value={placeId} onChange={setPlaceId} placeholder={tt('ChIJ…')} />
      </Field>
      <div className="row" style={{ alignItems: 'center' }}>
        <div className="grow">
          <Input value={query} onChange={setQuery} placeholder={tt('Firmenname und Ort, z. B. Malerei Muster Berlin')} onKeyDown={(e) => e.key === 'Enter' && query && document.getElementById('g-find')?.click()} />
        </div>
        <button
          id="g-find"
          className="btn secondary"
          disabled={!query || busy === 'find'}
          onClick={async () => {
            setBusy('find');
            const r = await act(() => api.post<any[]>('/api/google-reviews/settings/find-place', { query, api_key: key }));
            setBusy('');
            if (r) setFound(r);
          }}
        >
          {tt('Place ID finden')}
        </button>
      </div>
      {found && (
        <div className="g-found">
          {found.map((p) => (
            <div key={p.place_id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                <strong>{p.name}</strong> <span className="muted small">{p.address}</span>
                {p.rating != null && (
                  <span className="muted small">
                    {' '}
                    · {de(p.rating)} ★ ({p.total})
                  </span>
                )}
              </span>
              <button
                className="btn small"
                onClick={() => {
                  setPlaceId(p.place_id);
                  setFound(null);
                  void save({ place_id: p.place_id, place_name: p.name, place_address: p.address });
                }}
              >
                {tt('Übernehmen')}
              </button>
            </div>
          ))}
          {!found.length && <p className="muted small">{tt('Nichts gefunden – anders schreiben oder den Ort ergänzen.')}</p>}
        </div>
      )}
      <div className="actions" style={{ marginTop: 12 }}>
        <button className="btn" disabled={busy === 'save'} onClick={() => save()}>
          {tt('Speichern')}
        </button>
        {s.api_key_set && s.place_id && (
          <button
            className="btn danger"
            onClick={async () => confirmAsk(tt('Google-Bewertungen trennen? Gespeicherte Google-Rezensionen und der Verlauf werden gelöscht.')) && (await act(() => api.del('/api/google-reviews/settings'), tt('Getrennt'))) && data.reload()}
          >
            {tt('Trennen')}
          </button>
        )}
        {s.last_sync_at && (
          <span className="muted small">
            {tt('Zuletzt abgerufen {dt}', { dt: dt(s.last_sync_at) })}
            {s.last_error ? <span style={{ color: 'var(--red)' }}> – {s.last_error}</span> : ' ✓'}
          </span>
        )}
      </div>
      {s.write_review_url && (
        <>
          <hr />
          <Field label={tt('Direktlink „Bewertung schreiben“')} hint={tt('Für „Öffentliches Bewertungsprofil“ oben: zufriedene Kunden landen damit direkt im Google-Bewertungsformular.')}>
            <ShareLink url={s.write_review_url} title={tt('Google-Bewertung schreiben')} />
          </Field>
        </>
      )}
      <p className="muted small" style={{ marginBottom: 0 }}>
        {tt('Direkt antworten und Beiträge veröffentlichen geht mit verbundenem Google-Unternehmensprofil (oben); sonst öffnet „Auf Google antworten“ die Bewertung bei Google.')}
      </p>
    </div>
  );
}
