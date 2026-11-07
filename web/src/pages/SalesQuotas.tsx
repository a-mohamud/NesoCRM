import { useState } from 'react';
import { api } from '../api';
import { Badge, Empty, Field, Modal, Select, Spinner, Tabs, act, toast, useLoad } from '../ui';
import { Bar, Section, eur } from './SalesKit';
import { useT } from '../i18n';

/**
 * Quoten und Rangliste: Ziele je Person und Team für Monat oder Quartal, Zielerreichung mit Zeitfortschritt und Pipeline, Rangliste.
 * Gezählt wird, was jemand gewonnen hat (Datum des Abschlusses), in der Währung der Quote.
 */

const PACE_TONE: Record<string, 'green' | 'blue' | 'red' | 'yellow' | 'gray'> = { reached: 'green', ahead: 'green', on_track: 'blue', behind: 'red', closed: 'red', none: 'gray' };
const BAR_TONE: Record<string, string> = { reached: 'green', ahead: 'green', on_track: '', behind: 'red', closed: 'red', none: '' };

function QuotaEditor({ data, onClose, onSaved }: { data: any; onClose: () => void; onSaved: () => void }) {
  const tt = useT('x_finance');
  const money = data.metric === 'won_value';
  const initial: Record<string, string> = {};
  for (const x of data.quotas) initial[`${x.scope}:${x.subject_id}`] = String(x.target);
  const [v, setV] = useState<Record<string, string>>(initial);
  const [lb, setLb] = useState<string>(data.leaderboard ?? '');
  const subjects: { key: string; scope: 'user' | 'team'; id: string; name: string; sub?: string }[] = [
    ...data.people.map((p: any) => ({ key: `user:${p.id}`, scope: 'user' as const, id: p.id, name: p.name })),
    ...data.teams.map((t: any) => ({ key: `team:${t.id}`, scope: 'team' as const, id: t.id, name: t.name, sub: `Team · ${t.members} Mitglieder` })),
  ];
  const save = async () => {
    const quotas = subjects.filter((s) => (v[s.key] ?? '') !== (initial[s.key] ?? '')).map((s) => ({ scope: s.scope, subject_id: s.id, target: v[s.key] === '' || v[s.key] === undefined ? 0 : Number(String(v[s.key]).replace(',', '.')) }));
    if (quotas.length && !(await act(() => api.put('/api/quotas', { period: data.period.kind, start: data.period.start, metric: data.metric, quotas }), tt('Quoten gespeichert')))) return;
    if ((data.leaderboard ?? '') !== lb) await act(() => api.put('/api/quota-settings', { leaderboard: lb || null }), tt('Einstellung gespeichert'));
    onSaved();
  };
  const copy = async () => {
    const r = await act(() => api.post('/api/quotas/copy', { period: data.period.kind, start: data.period.start, metric: data.metric }));
    if (r) (toast(tt('{copied} Quoten übernommen', { copied: r.copied })), onSaved());
  };
  return (
    <Modal
      title={tt('Quoten {label}', { label: data.period.label })}
      className="sales-modal"
      onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={copy}>
            {tt('Aus der Vorperiode übernehmen')}
          </button>
          <button className="btn" onClick={save} data-tour="quota-save">
            {tt('Speichern')}
          </button>
        </>
      }
    >
      <p className="muted">{tt('Ziel in')} {money ? data.currency : tt('Deals')} {tt('je Person und Team ({v}). Leer lassen oder 0 = keine Quote. Teams haben ein eigenes Ziel; ihr Erreichtes ist die Summe ihrer Mitglieder.', { v: data.metric_labels[data.metric] })}</p>
      <table className="sales-table">
        <tbody>
          {subjects.map((s) => (
            <tr key={s.key}>
              <td>
                <b>{s.name}</b>
                {s.sub && <div className="muted small">{s.sub}</div>}
              </td>
              <td style={{ width: 170 }}>
                <input type="number" min={0} inputMode="decimal" aria-label={tt('Ziel {name}', { name: s.name })} value={v[s.key] ?? ''} onChange={(e) => setV({ ...v, [s.key]: e.target.value })} style={{ width: '100%' }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Field label={tt('Wer sieht die Zahlen der anderen?')} hint={tt('Ohne Auswahl: alle – außer Personen, deren Deals durch Datensatz-Zugriff eingeschränkt sind (sie sehen nur sich).')}>
        <Select value={lb} onChange={setLb} options={[['', tt('Standard')], ['all', tt('Alle sehen alle')], ['own', tt('Jeder sieht nur sich (und sein Team)')], ['off', tt('Niemand (nur Admins)')]]} />
      </Field>
    </Modal>
  );
}

export function SalesQuotas() {
  const tt = useT('x_finance');
  const [kind, setKind] = useState('month');
  const [start, setStart] = useState('');
  const [metric, setMetric] = useState('won_value');
  const qs = `period=${kind}&metric=${metric}${start ? `&start=${start}` : ''}`;
  const q = useLoad(() => api.get<any>(`/api/quotas?${qs}`), [qs]);
  const lb = useLoad(() => api.get<any>(`/api/leaderboard?${qs}`).catch(() => null), [qs]);
  const [edit, setEdit] = useState(false);
  const data = q.data;
  const money = metric === 'won_value';
  const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '–' : money ? eur(n * 100, data?.currency) : String(n));
  const rows = (scope: string) => (data?.rows ?? []).filter((r: any) => r.scope === scope);
  const board: any[] = lb.data?.rows ?? [];
  const top = board.length ? Math.max(1, ...board.map((r: any) => r.achieved)) : 1;
  const table = (list: any[]) => (
    <div className="table-wrap">
      <table className="sales-table stack">
        <thead>
          <tr>
            <th>Name</th>
            <th className="r">{tt('Ziel')}</th>
            <th className="r">{tt('Erreicht')}</th>
            <th style={{ minWidth: 150 }}>{tt('Erreichung')}</th>
            <th>{tt('Stand')}</th>
            <th className="r">{tt('Pipeline (gewichtet)')}</th>
            <th className="r">{tt('Fehlt noch')}</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={`${r.scope}${r.subject_id}`}>
              <td data-label={tt('Name')}><b>{r.name}</b></td>
              <td className="r" data-label={tt('Ziel')}>{fmt(r.target)}</td>
              <td className="r" data-label={tt('Erreicht')}>{fmt(r.achieved)}</td>
              <td data-label={tt('Erreichung')}>
                <Bar pct={r.attainment_pct} tone={BAR_TONE[r.pace]} /> <span className="small" style={{ whiteSpace: 'nowrap' }}>{r.attainment_pct === null ? '–' : `${r.attainment_pct} %`}</span>
              </td>
              <td data-label={tt('Stand')}><Badge tone={PACE_TONE[r.pace]}>{tt(r.pace_label)}</Badge></td>
              <td className="r" data-label="Pipeline">{money ? eur(r.weighted_pipeline * 100, data.currency) : '–'}</td>
              <td className="r" data-label={tt('Fehlt noch')}>{r.gap === null ? '–' : fmt(r.gap)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div data-tour="quota-page">
      <div className="sales-bar">
        <Tabs tabs={[['month', tt('Monat')], ['quarter', tt('Quartal')]]} value={kind} onChange={(v) => (setKind(v), setStart(''))} />
        {data && (
          <>
            <button className="btn secondary" onClick={() => setStart(data.period.prev)} aria-label={tt('Vorige Periode')}>‹</button>
            <b>{data.period.label}</b>
            <button className="btn secondary" onClick={() => setStart(data.period.next)} aria-label={tt('Nächste Periode')}>›</button>
            <span className="muted small">{tt('{round} % der Zeit sind um', { round: Math.round(data.period.elapsed_pct) })}{data.period.days_left ? tt(' · noch {days_left} Tage', { days_left: data.period.days_left }) : ''}</span>
          </>
        )}
        <span className="grow" />
        <div style={{ flex: '1 1 210px', maxWidth: 260 }}>
          <Select value={metric} onChange={setMetric} options={Object.entries<string>(data?.metric_labels ?? { won_value: tt('Gewonnener Umsatz'), won_count: tt('Gewonnene Deals') })} />
        </div>
        {data?.can_edit && (
          <button className="btn" onClick={() => setEdit(true)} data-tour="quota-edit">
            {tt('Quoten festlegen')}
          </button>
        )}
      </div>
      {!data ? (
        <Spinner />
      ) : (
        <>
          {data.visibility === 'off' ? (
            <Empty>{tt('Die Quoten sind in diesem Sub-Account ausgeschaltet.')}</Empty>
          ) : (
            <>
              <Section title={tt('Personen')} tour="quota-table">{rows('user').length ? table(rows('user')) : <Empty action={data.can_edit && <button className="btn" onClick={() => setEdit(true)}>{tt('Quoten festlegen')}</button>}>{tt('Für diese Periode gibt es noch keine Quoten und nichts Gewonnenes.')}</Empty>}</Section>
              {rows('team').length > 0 && <Section title="Teams">{table(rows('team'))}</Section>}
              <Section title={tt('Rangliste')} tour="quota-board">
                {!board.length ? (
                  <p className="muted">{tt('Noch nichts gewonnen in dieser Periode.')}</p>
                ) : (
                  <table className="sales-table">
                    <tbody>
                      {board.map((r: any) => (
                        <tr key={r.subject_id} className={r.me ? 'me' : ''}>
                          <td style={{ width: 44 }}><b>{r.rank}.</b></td>
                          <td>{r.name}{r.me ? tt(' (du)') : ''}</td>
                          <td style={{ minWidth: 140 }}><Bar pct={(r.achieved / top) * 100} /></td>
                          <td className="r"><b>{fmt(r.achieved)}</b></td>
                          <td className="r muted small">{r.attainment_pct === null ? tt('keine Quote') : `${r.attainment_pct} %`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {lb.data && lb.data.visibility === 'own' && <p className="muted small">{tt('Du siehst nur deine Platzierung – {total} Personen sind in der Rangliste.', { total: lb.data.total })}</p>}
              </Section>
            </>
          )}
          {edit && <QuotaEditor data={data} onClose={() => setEdit(false)} onSaved={() => (setEdit(false), q.reload(), lb.reload())} />}
        </>
      )}
    </div>
  );
}
