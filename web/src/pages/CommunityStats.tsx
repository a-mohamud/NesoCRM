import { useState } from 'react';
import { api } from '../api';
import { ColumnChart } from '../charts/BarChart';
import { LineChart } from '../charts/LineChart';
import { color, type Shaped } from '../charts/core';
import { Empty, Select, Spinner, useLoad } from '../ui';
import { Kpi, Sec, euro } from './CommunityParts';
import { SortableGrid } from '../sortable/Sortable';
import { fmtDate, fmtNumber, intlLocale, useT } from '../i18n';

/**
 * Community → Zahlen: members over time, MRR and churn, trial conversion, active members per day, posts and comments per day,
 * top contributors and engagement. The numbers come from /api/community/groups/:id/analytics (services/community-growth.ts).
 */

const dayLabel = (ymd: string) => fmtDate(`${ymd.slice(0, 10)}T12:00:00`, { day: '2-digit', month: '2-digit', year: 'numeric' });
const cats = (rows: { day: string }[]) => rows.map((r) => ({ k: r.day, l: dayLabel(r.day) }));
const shaped = (rows: { day: string }[], series: { key: string; label: string; values: number[] }[]): Shaped => ({
  categories: cats(rows),
  series: series.map((s, i) => ({ ...s, color: color(i) })),
  format: 'number',
  measures: [0],
  integer: true,
});
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '–' : `${fmtNumber(v, { maximumFractionDigits: 2 })}${intlLocale().startsWith('de') ? ' %' : '%'}`);
const dec = (v: number) => fmtNumber(v, { maximumFractionDigits: 2 });

export function StatsTab({ group }: { group: any }) {
  const tt = useT('x_community');
  const [days, setDays] = useState('30');
  const r = useLoad(() => api.get<any>(`/api/community/groups/${group.id}/analytics?days=${days}`), [group.id, days]);
  const a = r.data;
  return (
    <div className="cma">
      <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <p className="muted" style={{ margin: 0 }}>
          {tt('Zeitraum:')} {a ? `${dayLabel(a.range.from)} – ${dayLabel(a.range.to)}` : '…'}
        </p>
        <div style={{ width: 200 }}>
          <Select value={days} onChange={setDays} options={[['7', tt('Letzte 7 Tage')], ['30', tt('Letzte 30 Tage')], ['90', tt('Letzte 90 Tage')], ['365', tt('Letztes Jahr')]]} />
        </div>
      </div>
      {r.error ? (
        <Empty>{r.error}</Empty>
      ) : !a ? (
        <Spinner />
      ) : (
        <>
          <SortableGrid id="community-stats" className="cma-kpis" data-tour="community-stats">
            <Kpi label={tt('Mitglieder')} value={a.totals.members} note={tt('{new_in_range} neu · {left_in_range} gegangen', { new_in_range: a.totals.new_in_range, left_in_range: a.totals.left_in_range })} />
            <Kpi label={tt('Aktiv heute')} value={a.totals.dau_today} note={tt('Ø {n} pro Tag', { n: dec(a.totals.dau_avg) })} />
            <Kpi label={tt('Engagement')} value={pct(a.totals.engagement_rate)} note={tt('{mau} von {members} in 30 Tagen aktiv', { mau: a.totals.mau, members: a.totals.members })} />
            <Kpi label={tt('MRR (netto)')} value={euro(a.revenue.mrr_cents, a.revenue.currency)} note={tt('{euro} im Jahr', { euro: euro(a.revenue.arr_cents, a.revenue.currency) })} />
            <Kpi label={tt('Zahlende')} value={a.revenue.paying} note={tt('{trialing} in der Testphase{v}', { trialing: a.revenue.trialing, v: a.revenue.past_due ? tt(' · {n} Zahlung offen', { n: a.revenue.past_due }) : '' })} />
            <Kpi label={tt('Abwanderung')} value={pct(a.churn.paying_rate)} note={tt('Zahlende · alle Mitglieder {pct}', { pct: pct(a.churn.members_rate) })} tone={a.churn.paying_rate > 10 ? 'red' : undefined} />
            <Kpi label={tt('Testphase → Abo')} value={pct(a.trials.conversion_rate)} note={tt('{started} gestartet · {converted} umgewandelt · {lost} verloren', { started: a.trials.started, converted: a.trials.converted, lost: a.trials.lost })} />
            <Kpi label={tt('Beiträge pro Tag')} value={dec(a.totals.posts_per_day)} note={tt('{n} Kommentare pro Tag', { n: dec(a.totals.comments_per_day) })} />
          </SortableGrid>
          {a.requests.pending > 0 && (
            <div className="cma-note">
              <strong>{tt('{pending} Beitrittsanfragen warten auf dich.', { pending: a.requests.pending })}</strong> {tt('Du findest sie unter „Beitritt → Anfragen“.')}
            </div>
          )}
          <SortableGrid id="community.stats" className="cma-grid">
            <Sec title={tt('Mitglieder')} lead={tt('Alle, die zum Ende des Tages dabei waren.')}>
              <LineChart area height={240} data={shaped(a.members, [{ key: 'total', label: tt('Mitglieder'), values: a.members.map((x: any) => x.total) }])} />
            </Sec>
            <Sec title={tt('Neu und gegangen')} lead={tt('Wer pro Tag dazukam und wer ging (Kündigung, Zahlung fehlgeschlagen, Entfernung).')}>
              <ColumnChart stacked height={240} data={shaped(a.members, [{ key: 'joined', label: tt('Neu'), values: a.members.map((x: any) => x.joined) }, { key: 'left', label: tt('Gegangen'), values: a.members.map((x: any) => x.left) }])} />
            </Sec>
            <Sec title={tt('Aktive Mitglieder pro Tag')} lead={tt('Wer an dem Tag die Community geöffnet hat.')}>
              <LineChart height={240} data={shaped(a.dau, [{ key: 'dau', label: tt('Aktiv'), values: a.dau.map((x: any) => x.n) }])} />
            </Sec>
            <Sec title={tt('Beiträge und Kommentare pro Tag')}>
              <ColumnChart stacked height={240} data={shaped(a.activity, [{ key: 'posts', label: tt('Beiträge'), values: a.activity.map((x: any) => x.posts) }, { key: 'comments', label: tt('Kommentare'), values: a.activity.map((x: any) => x.comments) }])} />
            </Sec>
            <Sec title={tt('Umsatz nach Stufe')} lead={tt('Monatlich wiederkehrend, netto (Jahresbeiträge geteilt durch 12, ohne Testphasen und Einmalzahlungen).')}>
              {a.revenue.by_tier.length ? (
                <div className="table-wrap" style={{ border: 0 }}>
                  <table className="t cma-table">
                    <thead>
                      <tr>
                        <th>{tt('Stufe')}</th>
                        <th>{tt('Mitglieder')}</th>
                        <th>{tt('MRR')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.revenue.by_tier.map((t: any) => (
                        <tr key={t.tier_id}>
                          <td>{t.name}</td>
                          <td>{t.members}</td>
                          <td>{euro(t.mrr_cents, a.revenue.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">{tt('Noch keine Mitgliedschaften mit Stufe.')}</p>
              )}
              {a.revenue.trial_mrr_cents > 0 && <p className="muted small">{tt('Dazu kommen {euro} im Monat, sobald die laufenden Testphasen bezahlt werden. Einmalzahlungen im Zeitraum: {euro2}.', { euro: euro(a.revenue.trial_mrr_cents, a.revenue.currency), euro2: euro(a.revenue.one_time_cents, a.revenue.currency) })}</p>}
            </Sec>
            <Sec title={tt('Aktivste Mitglieder')} lead={tt('Nach Punkten im Zeitraum.')}>
              {a.top_contributors.length ? (
                <ul className="cma-list">
                  {a.top_contributors.map((c: any, i: number) => (
                    <li key={c.contact_id}>
                      <b style={{ width: 24, textAlign: 'right' }}>{i + 1}</b>
                      <div className="grow">
                        <div>
                          <strong>{c.name}</strong>
                        </div>
                        <div className="muted small">
                          {tt('{posts} Beiträge · {comments} Kommentare', { posts: c.posts, comments: c.comments })}
                        </div>
                      </div>
                      <b>{c.points}</b>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">{tt('Im Zeitraum hat noch niemand Punkte gesammelt.')}</p>
              )}
            </Sec>
          </SortableGrid>
        </>
      )}
    </div>
  );
}
