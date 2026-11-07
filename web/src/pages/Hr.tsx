import { useEffect, useState } from 'react';
import { api, d } from '../api';
import { Icon } from '../icons';
import { Badge, Check, Empty, Field, Input, Modal, PageHead, Select, Spinner, Stat, Tabs, Textarea, act, confirmAsk, navigate, toast, useLoad } from '../ui';
import { dlHref, germanDate, qty, ymdLocal } from './boCommon';
import { HrAbsences, HrChecklists, HrEmployees, HrWorkingTime } from './HrAdmin';
import { SortableGrid } from '../sortable/Sortable';
import { tr, useT } from '../i18n';

/**
 * Personal (HR basics): employees, absences with approval, team calendar, vacation accounts, checklists, working-time overview.
 * Everybody gets "Mein Bereich" (their own record only); HR staff (area "Personal", granted explicitly) get the rest.
 * Salary and other sensitive fields sit behind a second gate – see docs/backoffice.md.
 */

export const ABS_TYPES: [string, string][] = [['vacation', 'Urlaub'], ['sick', 'Krankmeldung'], ['other', 'Sonstiges']];
export const absLabel = (a: { type: string; label?: string }) => (a.type === 'other' && a.label ? a.label : tr('x_finance')(ABS_TYPES.find(([k]) => k === a.type)?.[1] ?? a.type));
/** ABS_TYPES with translated labels, for selects. */
export const absTypeOptions = (): [string, string][] => ABS_TYPES.map(([k, l]) => [k, tr('x_finance')(l)]);
export const ABS_STATUS: Record<string, [string, 'gray' | 'green' | 'red' | 'blue' | 'yellow']> = { requested: ['Beantragt', 'yellow'], approved: ['Genehmigt', 'green'], rejected: ['Abgelehnt', 'red'], cancelled: ['Zurückgezogen', 'gray'] };
export const period = (a: { start_date: string; end_date: string }) => (a.start_date === a.end_date ? germanDate(a.start_date) : `${germanDate(a.start_date)} – ${germanDate(a.end_date)}`);
export const days = (n: number) => tr('x_finance').plural(n, { one: '{qty} Tag', other: '{qty} Tage' }, { qty: qty(n) });

const HR_TABS: [string, string][] = [
  ['overview', 'Übersicht'],
  ['employees', 'Mitarbeiter'],
  ['absences', 'Abwesenheiten'],
  ['calendar', 'Teamkalender'],
  ['time', 'Arbeitszeit'],
  ['checklists', 'Checklisten'],
  ['holidays', 'Feiertage'],
  ['settings', 'Einstellungen'],
  ['me', 'Mein Bereich'],
];

export function Hr({ tab }: { tab?: string }) {
  const tt = useT('x_finance');
  const me = useLoad(() => api.get('/api/me/hr'), []);
  const m = me.data;
  if (!m) return me.error ? <p style={{ color: 'var(--red)' }}>{me.error}</p> : <Spinner />;
  const tabs = (m.is_hr ? HR_TABS : ([['me', 'Mein Bereich']] as [string, string][])).map(([k, l]): [string, string] => [k, tt(l)]);
  const t = tabs.some(([k]) => k === tab) ? tab! : m.is_hr ? 'overview' : 'me';
  return (
    <>
      <PageHead title={tt('Personal')} sub={m.is_hr ? tt('Mitarbeiter, Abwesenheiten, Urlaub und Checklisten.') : tt('Deine Abwesenheiten, dein Urlaub und deine Unterlagen.')} />
      {m.is_hr && !m.can_sensitive && (
        <div className="bo-note compact" role="note">
          <Icon name="lock" size={16} />
          <span>{tt('Gehalt, Bankdaten, Steuer-ID und andere sensible Felder sind für dich gesperrt – sie sehen nur Administratoren und die in den Einstellungen freigegebenen Personen.')}</span>
        </div>
      )}
      {tabs.length > 1 && <Tabs tabs={tabs as [string, string][]} value={t} onChange={(v) => navigate(`personal/${v}`)} />}
      {t === 'overview' && <Overview />}
      {t === 'employees' && <HrEmployees canSensitive={m.can_sensitive} defaultState={m.default_state} states={m.states} />}
      {t === 'absences' && <HrAbsences />}
      {t === 'calendar' && <TeamCalendar />}
      {t === 'time' && <HrWorkingTime />}
      {t === 'checklists' && <HrChecklists />}
      {t === 'holidays' && <Holidays states={m.states} defaultState={m.default_state} />}
      {t === 'settings' && <HrSettings onChange={() => void me.reload()} />}
      {t === 'me' && <MyArea me={m} onChange={() => void me.reload()} />}
    </>
  );
}

// --- overview ---------------------------------------------------------------------------------------------------------------

function Overview() {
  const tt = useT('x_finance');
  const st = useLoad(() => api.get('/api/hr/status'), []);
  const req = useLoad(() => api.get('/api/hr/absences?status=requested'), []);
  const [decide, setDecide] = useState<{ a: any; decision: 'approved' | 'rejected' }>();
  const s = st.data;
  const away = s?.away_today ?? {};
  return (
    <>
      <SortableGrid id="hr-stats" className="stats" data-tour="hr-stats">
        <Stat label={tt('Aktive Mitarbeiter')} value={s?.employees ?? '–'} />
        <Stat label={tt('Offene Anträge')} value={<span className={s?.pending_requests ? 'bo-neg' : undefined}>{s?.pending_requests ?? '–'}</span>} />
        <Stat label={tt('Heute im Urlaub')} value={away.vacation ?? 0} />
        <Stat label={tt('Heute abwesend (krank, sonstiges)')} value={(away.sick ?? 0) + (away.other ?? 0)} />
        <Stat label={tt('Offene Checklisten')} value={s?.open_checklists ?? '–'} />
      </SortableGrid>
      <div className="card" data-tour="hr-requests">
        <h2>{tt('Anträge zur Entscheidung')}</h2>
        {req.loading && !req.data ? (
          <Spinner />
        ) : (req.data ?? []).length ? (
          <div className="bo-scroll"><table className="t">
            <tbody>
              {(req.data as any[]).map((a) => (
                <tr key={a.id}>
                  <td>
                    <strong>{a.employee_name}</strong>
                    <div className="muted small">{a.reason}</div>
                  </td>
                  <td>{absLabel(a)}</td>
                  <td>{period(a)}</td>
                  <td className="num">{days(a.days)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {a.can_decide ? (
                      <>
                        <button className="btn small" onClick={() => setDecide({ a, decision: 'approved' })}>{tt('Genehmigen')}</button>{' '}
                        <button className="btn small secondary" onClick={() => setDecide({ a, decision: 'rejected' })}>{tt('Ablehnen')}</button>
                      </>
                    ) : (
                      <span className="muted small">{tt('eigener Antrag')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        ) : (
          <Empty>{tt('Keine offenen Anträge.')}</Empty>
        )}
      </div>
      {decide && <DecideModal a={decide.a} decision={decide.decision} url={`/api/hr/absences/${decide.a.id}/${decide.decision === 'approved' ? 'approve' : 'reject'}`} onClose={() => setDecide(undefined)} onDone={() => (setDecide(undefined), void req.reload(), void st.reload())} />}
    </>
  );
}

export function DecideModal({ a, decision, url, onClose, onDone }: { a: any; decision: 'approved' | 'rejected'; url: string; onClose: () => void; onDone: () => void }) {
  const tt = useT('x_finance');
  const [note, setNote] = useState('');
  const [force, setForce] = useState(false);
  return (
    <Modal
      title={decision === 'approved' ? tt('Antrag genehmigen') : tt('Antrag ablehnen')}
      onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={onClose}>{tt('Abbrechen')}</button>
          <button className={`btn${decision === 'rejected' ? ' danger' : ''}`} onClick={async () => (await act(() => api.post(url, { note, ...(force ? { force: true } : {}), ...(url.includes('/api/me/') ? { decision } : {}) }), decision === 'approved' ? tt('Genehmigt') : tt('Abgelehnt'))) && onDone()}>
            {decision === 'approved' ? tt('Genehmigen') : tt('Ablehnen')}
          </button>
        </>
      }
    >
      <p>
        <strong>{a.employee_name}</strong> · {absLabel(a)} · {period(a)} ({days(a.days)})
      </p>
      {a.reason && <p className="muted">„{a.reason}“</p>}
      {a.balance && <p className="muted small">{tt('Urlaubskonto {year}: {qty} Tage verfügbar von {qty2}.', { year: a.balance.year, qty: qty(a.balance.available), qty2: qty(a.balance.entitlement + a.balance.carryover) })}</p>}
      <Field label={decision === 'approved' ? tt('Anmerkung (optional)') : tt('Begründung')}>
        <Textarea value={note} onChange={setNote} rows={2} />
      </Field>
      {decision === 'approved' && !url.includes('/api/me/') && <Check checked={force} onChange={setForce} label={tt('Auch genehmigen, wenn der Urlaubsanspruch nicht reicht')} />}
    </Modal>
  );
}

// --- my area ---------------------------------------------------------------------------------------------------------------------

function MyArea({ me, onChange }: { me: any; onChange: () => void }) {
  const tt = useT('x_finance');
  const e = me.employee;
  const [year, setYear] = useState(new Date().getFullYear());
  const bal = useLoad(() => (e ? api.get(`/api/me/hr/balance?year=${year}`) : Promise.resolve(undefined)), [year, e?.id]);
  const abs = useLoad(() => api.get(`/api/me/hr/absences?year=${year}`), [year]);
  const docs = useLoad(() => api.get('/api/me/hr/documents'), []);
  const lists = useLoad(() => api.get('/api/me/hr/checklists'), []);
  const [modal, setModal] = useState(false);
  const refresh = () => (void bal.reload(), void abs.reload(), onChange());
  const b = bal.data?.balance ?? me.balance;
  if (!e && !me.is_manager)
    return (
      <Empty>
        {tt('Dein Login ist noch keinem Mitarbeiterdatensatz zugeordnet. Bitte im Personalbüro melden – dann kannst du hier Urlaub beantragen und deine Unterlagen sehen.')}
      </Empty>
    );
  return (
    <>
      {e && (
        <div className="row" style={{ marginBottom: 14 }}>
          <div className="card grow" data-tour="hr-me-card">
            <h2>{e.name}</h2>
            <p className="muted">
              {[e.position, e.department].filter(Boolean).join(' · ') || tt('Mitarbeiter')} · {e.number}
            </p>
            <table className="t">
              <tbody>
                <tr><td className="muted">{tt('Eintritt')}</td><td>{germanDate(e.start_date)}</td></tr>
                <tr><td className="muted">{tt('Wochenstunden')}</td><td>{qty(e.weekly_hours)} ({e.work_days.map((x: number) => [tt('Mo'), tt('Di'), tt('Mi'), tt('Do'), tt('Fr'), tt('Sa'), tt('So')][x - 1]).join(', ')})</td></tr>
                <tr><td className="muted">{tt('Vorgesetzte/r')}</td><td>{e.manager || '–'}</td></tr>
                <tr><td className="muted">{tt('Feiertage in')}</td><td>{me.states[e.state] ?? e.state}</td></tr>
              </tbody>
            </table>
          </div>
          <div className="card grow" data-tour="hr-balance">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>{tt('Urlaub {year}', { year: year })}</h2>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn small secondary" aria-label={tt('Vorjahr')} onClick={() => setYear(year - 1)}>‹</button>
                <button className="btn small secondary" aria-label={tt('Folgejahr')} onClick={() => setYear(year + 1)}>›</button>
              </div>
            </div>
            {b ? <BalanceBlock b={b} /> : <Spinner />}
            <button className="btn" style={{ marginTop: 10 }} data-tour="hr-request" onClick={() => setModal(true)}>
              {tt('Abwesenheit beantragen')}
            </button>
          </div>
        </div>
      )}
      {me.is_manager && <MyApprovals onChange={refresh} />}
      {e && (
        <div className="card" style={{ marginBottom: 14 }} data-tour="hr-my-absences">
          <h2>{tt('Meine Abwesenheiten {year}', { year: year })}</h2>
          {(abs.data ?? []).length ? (
            <div className="bo-scroll"><table className="t">
              <tbody>
                {(abs.data as any[]).map((a) => (
                  <tr key={a.id}>
                    <td>{absLabel(a)}</td>
                    <td>{period(a)}</td>
                    <td className="num">{days(a.days)}</td>
                    <td>
                      <Badge tone={ABS_STATUS[a.status]?.[1]}>{tt(ABS_STATUS[a.status]?.[0] ?? a.status)}</Badge>
                      {a.decision_note && <div className="muted small">{a.decision_note}</div>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {(a.status === 'requested' || (a.status === 'approved' && a.start_date > ymdLocal())) && (
                        <button className="btn small ghost" onClick={async () => confirmAsk(tt('Antrag zurückziehen?')) && (await act(() => api.post(`/api/me/hr/absences/${a.id}/cancel`, {}), tt('Zurückgezogen'))) && refresh()}>
                          {tt('Zurückziehen')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          ) : (
            <Empty>{tt('Keine Abwesenheiten in {year}.', { year: year })}</Empty>
          )}
        </div>
      )}
      <TeamCalendar compact />
      {e && (!!(lists.data ?? []).length || !!(docs.data ?? []).length) && (
        <div className="row" style={{ marginTop: 14 }}>
          {!!(lists.data ?? []).length && (
            <div className="card grow" data-tour="hr-my-checklists">
              <h2>{tt('Meine Checklisten')}</h2>
              {(lists.data as any[]).map((c) => (
                <MyChecklist key={c.id} c={c} onChange={() => void lists.reload()} />
              ))}
            </div>
          )}
          {!!(docs.data ?? []).length && (
            <div className="card grow" data-tour="hr-my-docs">
              <h2>{tt('Meine Unterlagen')}</h2>
              <div className="bo-scroll"><table className="t">
                <tbody>
                  {(docs.data as any[]).map((x) => (
                    <tr key={x.id}>
                      <td>
                        <a href={dlHref(`/api/me/hr/documents/${x.id}`)} target="_blank" rel="noreferrer">
                          <Icon name="doc" /> {x.name}
                        </a>
                      </td>
                      <td className="muted small">{x.category}</td>
                      <td className="muted small">{d(x.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}
        </div>
      )}
      {modal && <AbsenceModal mode="self" onClose={() => setModal(false)} onDone={() => (setModal(false), refresh())} />}
    </>
  );
}

export function BalanceBlock({ b }: { b: any }) {
  const tt = useT('x_finance');
  const total = b.entitlement + b.carryover - b.carryover_forfeited + b.adjustment;
  const used = Math.min(100, total ? ((b.taken + b.pending) / total) * 100 : 0);
  return (
    <>
      <div className="hbar" style={{ margin: '10px 0' }} title={tt('{qty} genehmigt, {qty2} beantragt von {qty3}', { qty: qty(b.taken), qty2: qty(b.pending), qty3: qty(total) })}>
        <i style={{ width: `${used}%` }} />
        <span>{Math.round(used)} %</span>
      </div>
      <table className="t">
        <tbody>
          <tr><td>{tt('Anspruch {year}', { year: b.year })}</td><td className="num">{qty(b.entitlement)}</td></tr>
          {b.carryover > 0 && (
            <tr>
              <td>{tt('Resturlaub aus dem Vorjahr')} {b.carryover_expires && <span className="muted small">{tt('(verfällt am {germanDate})', { germanDate: germanDate(b.carryover_expires) })}</span>}</td>
              <td className="num">{qty(b.carryover)}{b.carryover_forfeited > 0 && <span className="bo-neg"> {tt('(davon {qty} verfallen)', { qty: qty(b.carryover_forfeited) })}</span>}</td>
            </tr>
          )}
          {b.adjustment !== 0 && <tr><td>{tt('Korrektur')}</td><td className="num">{b.adjustment > 0 ? '+' : ''}{qty(b.adjustment)}</td></tr>}
          <tr><td>{tt('Genehmigt')}</td><td className="num">− {qty(b.taken)}</td></tr>
          <tr><td>{tt('Beantragt, noch offen')}</td><td className="num">− {qty(b.pending)}</td></tr>
          <tr className="total">
            <td><strong>{tt('Noch verfügbar')}</strong></td>
            <td className="num"><strong className={b.available < 0 ? 'bo-neg' : undefined}>{days(b.available)}</strong></td>
          </tr>
        </tbody>
      </table>
      <p className="muted small">{tt('Krankheitstage: {qty} · sonstige Abwesenheit: {qty2}', { qty: qty(b.sick), qty2: qty(b.other) })}</p>
    </>
  );
}

function MyApprovals({ onChange }: { onChange: () => void }) {
  const tt = useT('x_finance');
  const list = useLoad(() => api.get('/api/me/hr/approvals'), []);
  const [decide, setDecide] = useState<{ a: any; decision: 'approved' | 'rejected' }>();
  const rows: any[] = list.data ?? [];
  return (
    <div className="card" style={{ marginBottom: 14 }} data-tour="hr-approvals">
      <h2>{tt('Anträge deines Teams')}</h2>
      {rows.length ? (
        <div className="bo-scroll"><table className="t">
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td>
                  <strong>{a.employee_name}</strong>
                  <div className="muted small">{a.reason}</div>
                </td>
                <td>{absLabel(a)}</td>
                <td>{period(a)}</td>
                <td className="num">{days(a.days)}</td>
                <td className="muted small">{a.balance ? tt('{qty} Tage frei', { qty: qty(a.balance.available) }) : ''}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="btn small" onClick={() => setDecide({ a, decision: 'approved' })}>{tt('Genehmigen')}</button>{' '}
                  <button className="btn small secondary" onClick={() => setDecide({ a, decision: 'rejected' })}>{tt('Ablehnen')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      ) : (
        <Empty>{tt('Keine offenen Anträge.')}</Empty>
      )}
      {decide && <DecideModal a={decide.a} decision={decide.decision} url={`/api/me/hr/absences/${decide.a.id}/decide`} onClose={() => setDecide(undefined)} onDone={() => (setDecide(undefined), void list.reload(), onChange())} />}
    </div>
  );
}

function MyChecklist({ c, onChange }: { c: any; onChange: () => void }) {
  const tt = useT('x_finance');
  return (
    <div style={{ marginBottom: 10 }}>
      <strong>{c.name}</strong> {c.status === 'done' && <Badge tone="green">erledigt</Badge>}
      {c.items.map((i: any) => (
        <label key={i.id} className="check" style={{ opacity: i.assignee === 'employee' ? 1 : 0.65 }}>
          <input type="checkbox" checked={i.done} disabled={i.assignee !== 'employee'} onChange={async (ev) => (await act(() => api.post(`/api/me/hr/checklists/${c.id}/items/${i.id}`, { done: ev.target.checked }))) && onChange()} /> {i.title}
          {i.due && <span className="muted small"> {tt('· bis {germanDate}', { germanDate: germanDate(i.due) })}</span>}
        </label>
      ))}
    </div>
  );
}

// --- request / enter an absence ---------------------------------------------------------------------------------------------------

export function AbsenceModal({ mode, employees, employeeId, onClose, onDone }: { mode: 'self' | 'hr'; employees?: any[]; employeeId?: string; onClose: () => void; onDone: () => void }) {
  const tt = useT('x_finance');
  const [f, setF] = useState({ employee_id: employeeId ?? '', type: 'vacation', label: '', start_date: ymdLocal(), end_date: ymdLocal(), half_start: false, half_end: false, reason: '', certificate: false, approved: false, force: false });
  const set = (k: string) => (v: any) => setF((s) => ({ ...s, [k]: v }));
  const hr = mode === 'hr';
  return (
    <Modal
      title={hr ? tt('Abwesenheit eintragen') : tt('Abwesenheit beantragen')}
      onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={onClose}>{tt('Abbrechen')}</button>
          <button
            className="btn"
            onClick={async () => {
              const { employee_id, approved, force, ...rest } = f;
              const body = hr ? { ...rest, employee_id, approved, force } : rest;
              const r = await act(() => api.post(hr ? '/api/hr/absences' : '/api/me/hr/absences', body));
              if (r) (toast(r.status === 'approved' ? tt('Eingetragen: {days}', { days: days(r.days) }) : tt('Beantragt: {days}', { days: days(r.days) })), onDone());
            }}
          >
            {hr ? tt('Eintragen') : f.type === 'sick' ? tt('Krank melden') : tt('Beantragen')}
          </button>
        </>
      }
    >
      {hr && !employeeId && (
        <Field label={tt('Mitarbeiter')}>
          <Select value={f.employee_id} onChange={set('employee_id')} placeholder={tt('wählen')} options={(employees ?? []).map((e) => [e.id, e.name] as [string, string])} />
        </Field>
      )}
      <div className="grid2">
        <Field label={tt('Art')}>
          <Select value={f.type} onChange={set('type')} options={absTypeOptions()} />
        </Field>
        {f.type === 'other' && (
          <Field label={tt('Bezeichnung')}>
            <Input value={f.label} onChange={set('label')} placeholder={tt('z. B. Sonderurlaub, Arzttermin')} />
          </Field>
        )}
      </div>
      <div className="grid2">
        <Field label={tt('Von')}>
          <Input type="date" value={f.start_date} onChange={(v) => setF((s) => ({ ...s, start_date: v, end_date: s.end_date < v ? v : s.end_date }))} />
        </Field>
        <Field label={tt('Bis (einschließlich)')}>
          <Input type="date" value={f.end_date} onChange={set('end_date')} />
        </Field>
      </div>
      <div className="row">
        <Check checked={f.half_start} onChange={set('half_start')} label={tt('erster Tag nur halber Tag')} />
        <Check checked={f.half_end} onChange={set('half_end')} label={tt('letzter Tag nur halber Tag')} />
      </div>
      <p className="muted small">{tt('Gezählt werden nur deine Arbeitstage – Wochenenden und die Feiertage deines Bundeslands zählen nicht mit.')}</p>
      {f.type === 'sick' ? (
        <>
          <Check checked={f.certificate} onChange={set('certificate')} label={tt('Ärztliche Bescheinigung liegt vor')} />
          <p className="muted small">{tt('Es wird nur festgehalten, dass du abwesend bist – nie der Grund. Krankmeldungen brauchen keine Genehmigung.')}</p>
        </>
      ) : (
        <Field label={tt('Anmerkung (optional)')}>
          <Textarea value={f.reason} onChange={set('reason')} rows={2} />
        </Field>
      )}
      {hr && (
        <div className="row">
          <Check checked={f.approved} onChange={set('approved')} label={tt('Gleich genehmigt eintragen')} />
          <Check checked={f.force} onChange={set('force')} label={tt('Auch über den Urlaubsanspruch hinaus')} />
        </div>
      )}
    </Modal>
  );
}

// --- team calendar ----------------------------------------------------------------------------------------------------------------

export function TeamCalendar({ compact }: { compact?: boolean }) {
  const tt = useT('x_finance');
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const last = new Date(ym.y, ym.m + 1, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  const from = `${ym.y}-${pad(ym.m + 1)}-01`;
  const to = `${ym.y}-${pad(ym.m + 1)}-${pad(last)}`;
  const cal = useLoad(() => api.get(`/api/me/hr/calendar?from=${from}&to=${to}`), [from, to]);
  const x = cal.data;
  const people = x ? [...new Map<string, string>(x.items.map((i: any) => [i.employee_id, i.name])).entries()].sort((a, b) => a[1].localeCompare(b[1])) : [];
  const hol = new Map<string, string>((x?.holidays ?? []).map((h: any) => [h.date, h.name]));
  const cell = (empId: string, day: number) => {
    const date = `${ym.y}-${pad(ym.m + 1)}-${pad(day)}`;
    return x?.items.find((i: any) => i.employee_id === empId && i.start_date <= date && i.end_date >= date);
  };
  const dow = (day: number) => new Date(ym.y, ym.m, day).getDay();
  const title = new Date(ym.y, ym.m, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  return (
    <div className="card" data-tour="hr-calendar">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>{compact ? tt('Teamkalender') : title}{compact && <span className="muted"> · {title}</span>}</h2>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn small secondary" aria-label={tt('Vorheriger Monat')} onClick={() => setYm(ym.m === 0 ? { y: ym.y - 1, m: 11 } : { ...ym, m: ym.m - 1 })}>‹</button>
          <button className="btn small secondary" onClick={() => setYm({ y: now.getFullYear(), m: now.getMonth() })}>{tt('Heute')}</button>
          <button className="btn small secondary" aria-label={tt('Nächster Monat')} onClick={() => setYm(ym.m === 11 ? { y: ym.y + 1, m: 0 } : { ...ym, m: ym.m + 1 })}>›</button>
        </div>
      </div>
      {!x ? (
        <Spinner />
      ) : !people.length ? (
        <Empty>{tt('Keine Abwesenheiten in diesem Monat')}{x.holidays.length ? tt(' (Feiertage: {n})', { n: x.holidays.map((h: any) => `${germanDate(h.date).slice(0, 5)} ${h.name}`).join(', ') }) : ''}.</Empty>
      ) : (
        <div className="bo-cal-wrap">
          <table className="bo-cal">
            <thead>
              <tr>
                <th />
                {Array.from({ length: last }, (_, i) => i + 1).map((day) => (
                  <th key={day} className={`${[0, 6].includes(dow(day)) ? 'we' : ''}${hol.has(`${ym.y}-${pad(ym.m + 1)}-${pad(day)}`) ? ' hol' : ''}`} title={hol.get(`${ym.y}-${pad(ym.m + 1)}-${pad(day)}`)}>
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map(([id, name]) => (
                <tr key={id}>
                  <th className="who">{name}</th>
                  {Array.from({ length: last }, (_, i) => i + 1).map((day) => {
                    const a = cell(id, day);
                    const date = `${ym.y}-${pad(ym.m + 1)}-${pad(day)}`;
                    return (
                      <td key={day} className={`${[0, 6].includes(dow(day)) ? 'we' : ''}${hol.has(date) ? ' hol' : ''}${a ? ` abs ${a.type}${a.status === 'requested' ? ' req' : ''}` : ''}`} title={a ? `${name}: ${a.label || { vacation: tt('Urlaub'), sick: tt('Krank'), other: tt('Sonstiges'), away: tt('Abwesend') }[a.type as string]}${a.status === 'requested' ? tt(' (beantragt)') : ''}` : undefined} />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">
        <span className="bo-key vacation" /> {tt('Urlaub')} <span className="bo-key sick" /> krank <span className="bo-key other" /> sonstiges <span className="bo-key away" /> abwesend <span className="bo-key hol" /> {tt('Feiertag · schraffiert = beantragt')}
        {!x?.holidays ? '' : tt(' · Feiertage nach {state}', { state: x.state })}
      </p>
    </div>
  );
}

// --- holidays ---------------------------------------------------------------------------------------------------------------------

function Holidays({ states, defaultState }: { states: Record<string, string>; defaultState: string }) {
  const tt = useT('x_finance');
  const [year, setYear] = useState(new Date().getFullYear());
  const [state, setState] = useState(defaultState);
  const r = useLoad(() => api.get(`/api/hr/holidays?year=${year}&state=${state}`), [year, state]);
  return (
    <div data-tour="hr-holidays">
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div style={{ width: 240 }}>
          <Field label={tt('Bundesland')}>
            <Select value={state} onChange={setState} options={Object.entries(states)} />
          </Field>
        </div>
        <div style={{ width: 110 }}>
          <Field label={tt('Jahr')}>
            <Input type="number" value={year} onChange={(v) => setYear(Number(v) || year)} />
          </Field>
        </div>
      </div>
      {r.data ? (
        <div className="table-wrap" style={{ maxWidth: 520 }}>
          <table className="t">
            <tbody>
              {r.data.holidays.map((h: any) => (
                <tr key={h.date}>
                  <td>{germanDate(h.date)}</td>
                  <td className="muted">{new Date(`${h.date}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'long' })}</td>
                  <td>{h.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Spinner />
      )}
      <p className="muted small">{tt('Gesetzliche Feiertage des ganzen Bundeslands. Regionale Feiertage einzelner Gemeinden (z. B. Mariä Himmelfahrt in Bayern, Augsburger Friedensfest) sind nicht enthalten.')}</p>
    </div>
  );
}

// --- settings -----------------------------------------------------------------------------------------------------------------------

function HrSettings({ onChange }: { onChange: () => void }) {
  const tt = useT('x_finance');
  const s = useLoad(() => api.get('/api/hr/settings'), []);
  const users = useLoad(() => api.get('/api/hr/users'), []);
  const [f, setF] = useState<any>();
  useEffect(() => {
    const x = s.data;
    if (x && !f) setF({ default_state: x.default_state, default_vacation_days: String(x.default_vacation_days), carryover_expiry: x.carryover_expiry, carryover_max_days: x.carryover_max_days === null ? '' : String(x.carryover_max_days), sick_auto_approve: x.sick_auto_approve, sensitive_user_ids: x.sensitive_user_ids });
  }, [s.data]);
  if (!f || !s.data) return s.error ? <p style={{ color: 'var(--red)' }}>{s.error}</p> : <Spinner />;
  const set = (k: string) => (v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const canEdit = s.data.can_edit_sensitive_users;
  const save = async () => {
    const body: any = { default_state: f.default_state, default_vacation_days: Number(f.default_vacation_days.replace(',', '.')), carryover_expiry: f.carryover_expiry, carryover_max_days: f.carryover_max_days === '' ? null : Number(f.carryover_max_days.replace(',', '.')), sick_auto_approve: f.sick_auto_approve };
    if (canEdit) body.sensitive_user_ids = f.sensitive_user_ids;
    if (await act(() => api.put('/api/hr/settings', body), tt('Gespeichert'))) (void s.reload(), onChange());
  };
  return (
    <>
      <div className="card" data-tour="hr-settings">
        <h2>{tt('Urlaub und Feiertage')}</h2>
        <div className="grid3">
          <Field label={tt('Bundesland für Feiertage')} hint={tt('Pro Mitarbeiter abweichend einstellbar')}>
            <Select value={f.default_state} onChange={set('default_state')} options={Object.entries(s.data.states)} />
          </Field>
          <Field label={tt('Urlaubstage pro Jahr (Vorgabe)')}>
            <Input value={f.default_vacation_days} onChange={set('default_vacation_days')} inputMode="decimal" />
          </Field>
          <Field label={tt('Resturlaub verfällt am (MM-TT)')} hint={tt('Leer = verfällt nie. Üblich: 03-31')}>
            <Input value={f.carryover_expiry} onChange={set('carryover_expiry')} placeholder="03-31" />
          </Field>
          <Field label={tt('Höchstens übertragbare Tage')} hint={tt('Leer = unbegrenzt')}>
            <Input value={f.carryover_max_days} onChange={set('carryover_max_days')} inputMode="decimal" />
          </Field>
        </div>
        <Check checked={f.sick_auto_approve} onChange={set('sick_auto_approve')} label={tt('Krankmeldungen brauchen keine Genehmigung')} />
      </div>
      <div className="card" data-tour="hr-sensitive-access">
        <h2>{tt('Zugriff auf sensible Daten')}</h2>
        <p className="muted small">
          {tt('Gehalt, IBAN, Steuer-ID, Sozialversicherungsnummer, Steuerklasse, Krankenkasse, Geburtsdatum und „vertrauliche“ Dokumente sehen nur Administratoren und die hier angehakten Personen – und nur in der Oberfläche (nie über API-Schlüssel, MCP oder die App). Jeder Zugriff wird im Protokoll festgehalten. Die Personen brauchen außerdem den Bereich „Personal“.')}
        </p>
        {canEdit ? (
          (users.data ?? []).filter((u: any) => u.role !== 'admin').length ? (
            (users.data as any[]).filter((u) => u.role !== 'admin').map((u) => (
              <Check key={u.id} checked={f.sensitive_user_ids.includes(u.id)} onChange={(v) => set('sensitive_user_ids')(v ? [...f.sensitive_user_ids, u.id] : f.sensitive_user_ids.filter((x: string) => x !== u.id))} label={`${u.name} (${u.email})`} />
            ))
          ) : (
            <p className="muted">{tt('Es gibt keine weiteren Logins in diesem Sub-Account.')}</p>
          )
        ) : (
          <p className="muted">{tt('Nur Administratoren und bereits freigegebene Personen können diese Liste ändern.')}</p>
        )}
      </div>
      <button className="btn" onClick={save}>{tt('Speichern')}</button>
    </>
  );
}
