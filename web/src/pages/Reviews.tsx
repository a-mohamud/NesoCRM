import { useEffect, useState } from 'react';
import { api, dt, name } from '../api';
import { Check, CodeBox, Empty, Field, Input, Link, Modal, PageHead, Select, Spinner, Stat, act, useLoad } from '../ui';
import { GoogleReviewsPanel } from './GoogleReviews';
import { Slot } from '../slots';
import { MoreFields } from '../areas/fields';
import { SortableGrid } from '../sortable/Sortable';
import { useT } from '../i18n';

export function Reviews() {
  const tt = useT('x_comms');
  const data = useLoad(() => api.get('/api/reviews'), []);
  const [modal, setModal] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<any[]>([]);
  const [channel, setChannel] = useState('email');
  useEffect(() => {
    if (q.length < 2) return setFound([]);
    const t = setTimeout(() => api.get(`/api/contacts?q=${encodeURIComponent(q)}&limit=6`).then((r) => setFound(r.contacts)), 200);
    return () => clearTimeout(t);
  }, [q]);
  if (!data.data) return <Spinner />;
  const { stats, requests, widget } = data.data;
  const max = Math.max(1, ...stats.distribution);
  return (
    <>
      <PageHead title={tt('Bewertungen')} sub={tt('Zufriedene Kunden landen auf deinem Google-Profil, Kritik bleibt intern')}>
        <Link to="settings/reviews" className="btn secondary">
          {tt('Einstellungen')}
        </Link>
        <button className="btn" data-tour="reviews-request" onClick={() => setModal(true)}>
          {tt('+ Anfrage senden')}
        </button>
      </PageHead>
      <SortableGrid id="reviews-stats" className="stats" data-tour="reviews-stats">
        <Stat label={tt('Durchschnitt')} value={stats.average ? `${stats.average} ★` : '–'} />
        <Stat label={tt('Antworten')} value={stats.responses} sub={tt('von {sent} Anfragen', { sent: stats.sent })} />
        <div className="card">
          {[5, 4, 3, 2, 1].map((n) => (
            <div key={n} className="row" style={{ alignItems: 'center', gap: 6 }}>
              <span style={{ width: 24 }}>{n}★</span>
              <div className="bar grow">
                <div style={{ width: `${(stats.distribution[n - 1] / max) * 100}%` }} />
              </div>
              <span className="muted small">{stats.distribution[n - 1]}</span>
            </div>
          ))}
        </div>
      </SortableGrid>
      <GoogleReviewsPanel />
      <Slot name="reviews.panel" />
      <MoreFields id="reviews-widget" label={tt('Bewertungs-Widget für deine Webseite')}>
        <div className="card" data-tour="reviews-widget">
          <h2>{tt('Bewertungs-Widget für deine Webseite')}</h2>
          <p className="muted">{tt('Zeigt Bewertungen ab 4★, deren Verfasser zugestimmt haben – und, wenn verbunden, Google und die weiteren Plattformen.')}</p>
          <CodeBox text={widget} />
        </div>
      </MoreFields>
      <div className="table-wrap" style={{ marginTop: 14 }} data-tour="reviews-list">
        <table className="t">
          <thead>
            <tr>
              <th>{tt('Kontakt')}</th>
              <th>{tt('Bewertung')}</th>
              <th>{tt('Kommentar')}</th>
              <th>{tt('Öffentlich')}</th>
              <th>{tt('Datum')}</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r: any) => (
              <tr key={r.id}>
                <td>{r.contact_id ? <Link to={`contacts/${r.contact_id}`}>{name(r)}</Link> : '–'}</td>
                <td>{r.rating ? <span className="g-stars" aria-label={tt('{rating} von 5 Sternen', { rating: r.rating })}>{'★'.repeat(r.rating) + '☆'.repeat(5 - r.rating)}</span> : <span className="muted">{tt('ausstehend')}</span>}</td>
                <td>{r.comment}</td>
                <td>{r.rating ? <Check checked={!!r.public} onChange={(v) => act(() => api.patch(`/api/reviews/${r.id}`, { public: v })).then(data.reload)} label="" aria={tt('Öffentlich zeigen')} /> : null}</td>
                <td className="muted">{dt(r.responded_at || r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!requests.length && <Empty>{tt('Noch keine Anfragen. Tipp: Workflow-Vorlage „Nach dem Termin: Bewertung anfragen“.')}</Empty>}
      </div>
      {modal && (
        <Modal title={tt('Bewertung anfragen')} onClose={() => setModal(false)}>
          <Field label={tt('Kanal')}>
            <Select value={channel} onChange={setChannel} options={[['email', 'E-Mail'], ['sms', 'SMS']]} />
          </Field>
          <Field label={tt('Kontakt')}>
            <Input value={q} onChange={setQ} placeholder={tt('Name oder E-Mail…')} autoFocus />
          </Field>
          {found.map((c) => (
            <div key={c.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span>
                {name(c)} <span className="muted">{c.email}</span>
              </span>
              <button className="btn small" onClick={() => act(() => api.post('/api/reviews/request', { contact_id: c.id, channel }), tt('Anfrage gesendet')).then(() => (setModal(false), data.reload()))}>
                {tt('Senden')}
              </button>
            </div>
          ))}
        </Modal>
      )}
    </>
  );
}
