import { useMemo, useState } from 'react';
import { api, dt } from '../api';
import { Badge, Empty, pressable, Select, Spinner, Stat, useLoad } from '../ui';
import { Link } from '../ui';
import { euros, fmtDuration, fmtSession, percent } from './WebinarKit';
import type { TabProps } from './WebinarTabs';
import { SortableGrid } from '../sortable/Sortable';
import { intlLocale, useT } from '../i18n';

/** Tab "Auswertung": numbers per webinar and session, the drop-off curve, polls, registrations and questions. */

/** The curve of how many attendees were in the room at each point of the video, as plain SVG (theme colours, no library). */
export function DropoffChart({ points, duration }: { points: { at_s: number; viewers: number; share: number }[]; duration: number }) {
  const tt = useT('x_community');
  const W = 640;
  const H = 190;
  const pad = { l: 40, r: 12, t: 12, b: 28 };
  const x = (s: number) => pad.l + (duration ? (s / duration) * (W - pad.l - pad.r) : 0);
  const y = (share: number) => pad.t + (1 - share) * (H - pad.t - pad.b);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.at_s).toFixed(1)} ${y(p.share).toFixed(1)}`).join(' ');
  const area = points.length ? `${line} L${x(points[points.length - 1].at_s).toFixed(1)} ${y(0)} L${x(points[0].at_s).toFixed(1)} ${y(0)} Z` : '';
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="wb-chart" role="img" aria-label={tt('Zuschauer im Raum über die Länge des Videos')}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid" />
          <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="tick">
            {Math.round(t * 100)} %
          </text>
        </g>
      ))}
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <text key={t} x={x(duration * t)} y={H - 8} textAnchor={t === 0 ? 'start' : t === 1 ? 'end' : 'middle'} className="tick">
          {fmtDuration(duration * t)}
        </text>
      ))}
      <path d={area} className="area" />
      <path d={line} className="line" />
      {points.map((p) => (
        <circle key={p.at_s} cx={x(p.at_s)} cy={y(p.share)} r={3} className="dot">
          <title>{tt('{fmtDuration}: {viewers} Personen ({round} %)', { fmtDuration: fmtDuration(p.at_s), viewers: p.viewers, round: Math.round(p.share * 100) })}</title>
        </circle>
      ))}
    </svg>
  );
}

export function StatsTab({ form, w }: TabProps) {
  const tt = useT('x_community');
  const stats = useLoad(() => api.get(`/api/webinars/${w.id}/stats`), [w.id]);
  const [session, setSession] = useState('');
  const [filter, setFilter] = useState('');
  const regs = useLoad(() => api.get(`/api/webinars/${w.id}/registrations?limit=200${session ? `&session=${encodeURIComponent(session)}` : ''}${filter === 'yes' ? '&attended=1' : filter === 'no' ? '&attended=0' : ''}`), [w.id, session, filter]);
  const questions = useLoad(() => api.get<any[]>(`/api/webinars/${w.id}/questions`), [w.id]);
  const tz = w.tz || 'Europe/Berlin';
  const loc = intlLocale();
  const s = stats.data;
  const totals = s?.totals;
  const sessionOptions = useMemo(() => (s?.sessions ?? []).map((x: any) => [x.start, x.start === 'ondemand' ? tt('Sofort gestartet (alle)') : fmtSession(x.start, tz, loc)] as [string, string]), [s, tz, tt, loc]);
  if (stats.loading && !s) return <Spinner />;
  if (!s) return <Empty>{tt('Die Auswertung konnte nicht geladen werden.')}</Empty>;
  return (
    <div data-tour="webinar-stats">
      <SortableGrid id="webinar.stats" className="stats">
        <Stat label={tt('Anmeldungen')} value={totals.registrations} sub={totals.cancelled ? tt('{cancelled} abgesagt', { cancelled: totals.cancelled }) : undefined} />
        <Stat label={tt('Teilgenommen')} value={totals.attended} sub={tt('Show-up-Rate {percent}', { percent: percent(totals.show_up_rate, loc) })} />
        <Stat label={tt('Ø Sehdauer')} value={fmtDuration(totals.avg_watch_s)} sub={tt('{avg_watch_pct} % des Videos', { avg_watch_pct: totals.avg_watch_pct })} />
        <Stat label={tt('Klicks aufs Angebot')} value={totals.cta_clicks} sub={tt('{cta_unique} Personen', { cta_unique: totals.cta_unique })} />
        <Stat label={tt('Käufe')} value={totals.purchases} sub={tt('Abschlussquote {percent}', { percent: percent(totals.conversion_rate, loc) })} />
        <Stat label={tt('Umsatz')} value={euros(totals.revenue_cents, loc)} />
        <Stat label={tt('Aufzeichnung')} value={totals.replay_views} sub={tt('Aufrufe')} />
        <Stat label={tt('Fragen')} value={totals.questions} />
      </SortableGrid>

      <div className="card" style={{ marginBottom: 14 }}>
        <h3>{tt('Wie lange bleiben die Zuschauer?')}</h3>
        <p className="muted small">{tt('Anteil der Teilnehmenden, die an dieser Stelle des Videos im Raum waren. Späte Einsteiger zählen ab ihrem Einstieg.')}</p>
        {totals.attended ? <DropoffChart points={s.dropoff} duration={form.duration_s || w.duration_s} /> : <p className="muted">{tt('Noch niemand war im Raum.')}</p>}
      </div>

      <h3>{tt('Termine')}</h3>
      {s.sessions.length ? (
        <div className="table-wrap" style={{ marginBottom: 14 }}>
          <table className="t">
            <thead>
              <tr>
                <th>{tt('Termin')}</th>
                <th className="num">{tt('Anmeldungen')}</th>
                <th className="num">{tt('Teilgenommen')}</th>
                <th className="num">{tt('Show-up')}</th>
                <th className="num">{tt('Ø Sehdauer')}</th>
                <th className="num">{tt('Klicks')}</th>
                <th className="num">{tt('Käufe')}</th>
                <th className="num">{tt('Umsatz')}</th>
              </tr>
            </thead>
            <tbody>
              {s.sessions.map((x: any) => (
                <tr key={x.start} className="click" {...pressable(() => setSession(x.start === session ? '' : x.start))}>
                  <td>
                    {x.start === 'ondemand' ? tt('Sofort gestartet') : fmtSession(x.start, tz, loc)} {x.kind === 'jit' && <Badge tone="blue">{tt('Just in time')}</Badge>} {x.seats > 0 && x.registrations >= x.seats && <Badge tone="yellow">{tt('ausgebucht')}</Badge>}
                  </td>
                  <td className="num">
                    {x.registrations}
                    {x.seats > 0 ? ` / ${x.seats}` : ''}
                  </td>
                  <td className="num">{x.attended}</td>
                  <td className="num">{percent(x.show_up_rate, loc)}</td>
                  <td className="num">{fmtDuration(x.avg_watch_s)}</td>
                  <td className="num">{x.cta_clicks}</td>
                  <td className="num">{x.purchases}</td>
                  <td className="num">{euros(x.revenue_cents, loc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>{tt('Noch keine Anmeldungen.')}</Empty>
      )}

      {s.polls.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3>{tt('Umfragen')}</h3>
          {s.polls.map((p: any) => (
            <div key={p.id} className="wb-pollres">
              <b>{p.question}</b> <span className="muted small">{tt('{total} Antworten', { total: p.total })}</span>
              {p.options.map((o: any) => (
                <div key={o.label} className="wb-bar">
                  <span className="fill" style={{ width: `${p.total ? Math.round((o.count / p.total) * 100) : 0}%` }} />
                  <span className="lbl">
                    {o.label} – {o.count}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <h3>{tt('Angemeldete')}</h3>
      <div className="actions" style={{ marginBottom: 10 }}>
        <Select value={session} onChange={setSession} placeholder={tt('Alle Termine')} options={sessionOptions} />
        <Select value={filter} onChange={setFilter} placeholder={tt('Alle')} options={[['yes', tt('Nur Teilnehmende')], ['no', tt('Nur Nicht-Erschienene')]]} />
        <span className="muted small">{regs.data ? tt('{total} Einträge', { total: regs.data.total }) : ''}</span>
      </div>
      {regs.data?.registrations.length ? (
        <div className="table-wrap" style={{ marginBottom: 14 }}>
          <table className="t">
            <thead>
              <tr>
                <th>{tt('Kontakt')}</th>
                <th>{tt('Termin')}</th>
                <th>Status</th>
                <th className="num">{tt('Gesehen')}</th>
                <th>{tt('Angebot')}</th>
                <th>{tt('Aufzeichnung')}</th>
              </tr>
            </thead>
            <tbody>
              {regs.data.registrations.map((r: any) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`contacts/${r.contact_id}`}>{r.name}</Link>
                    <div className="muted small">{r.email}</div>
                  </td>
                  <td>{r.session_kind === 'ondemand' ? tt('Sofort, {dt}', { dt: dt(r.session_start) }) : fmtSession(r.session_start, tz, loc)}</td>
                  <td>{r.status === 'cancelled' ? <Badge tone="red">{tt('abgesagt')}</Badge> : r.attended ? <Badge tone="green">{tt('dabei')}</Badge> : new Date(r.session_start) > new Date() ? <Badge>{tt('angemeldet')}</Badge> : <Badge tone="yellow">{tt('nicht erschienen')}</Badge>}</td>
                  <td className="num">{r.attended ? `${r.watch_pct}${loc.startsWith('de') ? ' %' : '%'} (${fmtDuration(r.watched_s)})` : '–'}</td>
                  <td>{r.purchased ? <Badge tone="green">{tt('gekauft {amount}', { amount: euros(r.purchase_cents, loc) })}</Badge> : r.cta_clicked ? <Badge tone="blue">{tt('angeklickt')}</Badge> : '–'}</td>
                  <td>{r.replay_watched ? '✓' : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">{tt('Keine Einträge.')}</p>
      )}

      <h3>{tt('Fragen an das Team')}</h3>
      {(questions.data ?? []).length ? (
        <div className="card">
          {(questions.data ?? []).map((q: any) => (
            <div key={q.id} className="wb-q">
              <div>
                <b>{q.name}</b> <span className="muted small">{dt(q.created_at)}{q.offset_s !== null ? tt(' · bei {fmtDuration}', { fmtDuration: fmtDuration(q.offset_s) }) : ''}</span>
              </div>
              <div>{q.body}</div>
              {q.conversation_id && <Link to={`conversations/${q.conversation_id}`}>{tt('In Konversationen beantworten →')}</Link>}
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">{tt('Noch keine Fragen. Sie landen auch in Konversationen.')}</p>
      )}
    </div>
  );
}
