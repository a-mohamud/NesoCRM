import { useEffect, useState } from 'react';
import { api, d } from '../api';
import { Icon } from '../icons';
import { act, Badge, Check, confirmAsk, Empty, Field, Input, Modal, pressable, Select, Spinner, Tabs, Textarea, toast, useLoad } from '../ui';
import { ContactPick, EuroInput, dlHref, euroText, germanDate, parseEuro, qty, ymdLocal } from './boCommon';
import { ABS_STATUS, absTypeOptions, AbsenceModal, BalanceBlock, DecideModal, absLabel, days, period } from './Hr';
import { useT } from '../i18n';

/** HR staff screens: employees (with the sealed sensitive block), absences, working-time overview, checklists. */

const EMPLOYMENT: [string, string][] = [['full', 'Vollzeit'], ['part', 'Teilzeit'], ['mini', 'Minijob'], ['intern', 'Praktikum / Ausbildung'], ['freelance', 'Freie Mitarbeit']];
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

// --- employees --------------------------------------------------------------------------------------------------------------

export function HrEmployees({ canSensitive, defaultState, states }: { canSensitive: boolean; defaultState: string; states: Record<string, string> }) {
  const tt = useT('x_finance');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('active');
  const [open, setOpen] = useState<any>();
  const list = useLoad(() => api.get(`/api/hr/employees?status=${status}${q ? `&q=${encodeURIComponent(q)}` : ''}`), [status, q]);
  const rows: any[] = list.data ?? [];
  return (
    <>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div style={{ width: 240 }}>
          <Field label={tt('Suche')}>
            <Input value={q} onChange={setQ} placeholder={tt('Name, Position, Abteilung …')} />
          </Field>
        </div>
        <div style={{ width: 170 }}>
          <Field label="Status">
            <Select value={status} onChange={setStatus} options={[['active', tt('Aktiv')], ['inactive', tt('Ausgeschieden')], ['all', tt('Alle')]]} />
          </Field>
        </div>
        <div style={{ marginLeft: 'auto', marginBottom: 12 }}>
          <button className="btn" data-tour="hr-new-employee" onClick={() => setOpen({})}>
            {tt('Mitarbeiter anlegen')}
          </button>
        </div>
      </div>
      {list.loading && !list.data ? (
        <Spinner />
      ) : rows.length ? (
        <div className="table-wrap" data-tour="hr-employees">
          <table className="t">
            <thead>
              <tr>
                <th>{tt('Nr.')}</th>
                <th>Name</th>
                <th>{tt('Beschäftigung')}</th>
                <th>{tt('Eintritt')}</th>
                <th className="num">{tt('Urlaub (frei / Anspruch)')}</th>
                <th>{tt('Login')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="click" style={e.status === 'inactive' ? { opacity: 0.6 } : undefined} {...pressable(() => setOpen(e))}>
                  <td className="mono">{e.number}</td>
                  <td>
                    <strong>{e.name}</strong>
                    <div className="muted small">{[e.position, e.department].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td>
                    {tt(EMPLOYMENT.find(([k]) => k === e.employment_type)?.[1] ?? '')} <span className="muted small">{tt('{qty} Std.', { qty: qty(e.weekly_hours) })}</span>
                  </td>
                  <td>{germanDate(e.start_date)}</td>
                  <td className="num">{e.vacation ? `${qty(e.vacation.available)} / ${qty(e.vacation.entitlement + e.vacation.carryover)}` : '–'}</td>
                  <td>{e.user_id ? <Badge tone="green">{tt('verknüpft')}</Badge> : <span className="muted small">{tt('ohne Login')}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty action={<button className="btn" onClick={() => setOpen({})}>{tt('Ersten Mitarbeiter anlegen')}</button>}>{tt('Keine Mitarbeiter.')}</Empty>
      )}
      {open && <EmployeeModal employee={open.id ? open : undefined} canSensitive={canSensitive} defaultState={defaultState} states={states} onClose={() => (setOpen(undefined), void list.reload())} />}
    </>
  );
}

function EmployeeModal({ employee, canSensitive, defaultState, states, onClose }: { employee?: any; canSensitive: boolean; defaultState: string; states: Record<string, string>; onClose: () => void }) {
  const tt = useT('x_finance');
  const [tab, setTab] = useState('data');
  const [created, setCreated] = useState<any>();
  const emp = created ?? employee;
  const tabs: [string, string][] = emp ? [['data', tt('Stammdaten')], ['vacation', tt('Urlaub')], ['docs', tt('Unterlagen')], ['sensitive', tt('Gehalt & sensible Daten')], ['lists', tt('Checklisten')]] : [['data', tt('Stammdaten')]];
  return (
    <Modal wide title={emp ? emp.name : tt('Neuer Mitarbeiter')} onClose={onClose}>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'data' && <EmployeeData employee={emp} defaultState={defaultState} states={states} onSaved={(e) => (e && !emp ? setCreated(e) : onClose())} />}
      {tab === 'vacation' && emp && <EmployeeVacation employee={emp} />}
      {tab === 'docs' && emp && <EmployeeDocs employee={emp} canSensitive={canSensitive} />}
      {tab === 'sensitive' && emp && <EmployeeSensitive employee={emp} canSensitive={canSensitive} onDeleted={onClose} />}
      {tab === 'lists' && emp && <EmployeeLists employee={emp} />}
    </Modal>
  );
}

function EmployeeData({ employee, defaultState, states, onSaved }: { employee?: any; defaultState: string; states: Record<string, string>; onSaved: (e?: any) => void }) {
  const tt = useT('x_finance');
  const users = useLoad(() => api.get('/api/hr/users'), []);
  const e = employee ?? {};
  const [f, setF] = useState<any>({
    first_name: e.first_name ?? '',
    last_name: e.last_name ?? '',
    email: e.email ?? '',
    phone: e.phone ?? '',
    position: e.position ?? '',
    department: e.department ?? '',
    employment_type: e.employment_type ?? 'full',
    start_date: e.start_date ?? '',
    end_date: e.end_date ?? '',
    probation_end: e.probation_end ?? '',
    notice_period: e.notice_period ?? '',
    weekly_hours: String(e.weekly_hours ?? 40),
    vacation_days: String(e.vacation_days ?? 30),
    work_days: e.work_days ?? [1, 2, 3, 4, 5],
    state: e.state && e.state !== defaultState ? e.state : e.state === defaultState && employee ? e.state : '',
    status: e.status ?? 'active',
    user_id: e.user_id ?? '',
    manager_user_id: e.manager_user_id ?? '',
    contact: e.contact_id ? { id: e.contact_id, name: tt('Verknüpfter Kontakt') } : null,
    notes: e.notes ?? '',
  });
  const set = (k: string) => (v: any) => setF((s: any) => ({ ...s, [k]: v }));
  const userOpts = (users.data ?? []).map((u: any) => [u.id, `${u.name} (${u.email})`] as [string, string]);
  return (
    <>
      <div className="grid3">
        <Field label={tt('Vorname')}><Input value={f.first_name} onChange={set('first_name')} /></Field>
        <Field label={tt('Nachname')}><Input value={f.last_name} onChange={set('last_name')} /></Field>
        <Field label="Status"><Select value={f.status} onChange={set('status')} options={[['active', tt('Aktiv')], ['inactive', tt('Ausgeschieden')]]} /></Field>
        <Field label={tt('E-Mail')}><Input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label={tt('Telefon')}><Input value={f.phone} onChange={set('phone')} /></Field>
        <Field label={tt('Beschäftigung')}><Select value={f.employment_type} onChange={set('employment_type')} options={EMPLOYMENT.map(([k, l]): [string, string] => [k, tt(l)])} /></Field>
        <Field label={tt('Position')}><Input value={f.position} onChange={set('position')} /></Field>
        <Field label={tt('Abteilung')}><Input value={f.department} onChange={set('department')} /></Field>
        <Field label={tt('Kündigungsfrist')}><Input value={f.notice_period} onChange={set('notice_period')} placeholder={tt('z. B. 4 Wochen zum Monatsende')} /></Field>
        <Field label={tt('Eintritt')}><Input type="date" value={f.start_date} onChange={set('start_date')} /></Field>
        <Field label={tt('Ende der Probezeit')}><Input type="date" value={f.probation_end} onChange={set('probation_end')} /></Field>
        <Field label={tt('Austritt')}><Input type="date" value={f.end_date} onChange={set('end_date')} /></Field>
        <Field label={tt('Wochenstunden')}><Input value={f.weekly_hours} onChange={set('weekly_hours')} inputMode="decimal" /></Field>
        <Field label={tt('Urlaubstage pro Jahr')}><Input value={f.vacation_days} onChange={set('vacation_days')} inputMode="decimal" /></Field>
        <Field label={tt('Feiertage in')} hint={tt('Leer = Standard ({v})', { v: states[defaultState] ?? defaultState })}>
          <Select value={f.state} onChange={set('state')} placeholder={tt('Standard')} options={Object.entries(states)} />
        </Field>
      </div>
      <Field label={tt('Arbeitstage')}>
        <div className="row">
          {WEEKDAYS.map((w, i) => (
            <Check key={w} checked={f.work_days.includes(i + 1)} onChange={(v) => set('work_days')(v ? [...f.work_days, i + 1].sort() : f.work_days.filter((x: number) => x !== i + 1))} label={tt(w)} />
          ))}
        </div>
      </Field>
      <div className="grid3">
        <Field label={tt('HyperLevel-Login')} hint={tt('Damit kann die Person Urlaub beantragen und ihre Unterlagen sehen')}>
          <Select value={f.user_id} onChange={set('user_id')} placeholder={tt('– ohne Login –')} options={userOpts} />
        </Field>
        <Field label={tt('Vorgesetzte/r (genehmigt Anträge)')}>
          <Select value={f.manager_user_id} onChange={set('manager_user_id')} placeholder={tt('– keine/r –')} options={userOpts} />
        </Field>
        <Field label={tt('CRM-Kontakt')} hint={tt('Damit Workflows die Person erreichen')}>
          <ContactPick value={f.contact} onChange={set('contact')} />
        </Field>
      </div>
      <Field label={tt('Interne Notizen (nur Personal)')}>
        <Textarea value={f.notes} onChange={set('notes')} rows={2} />
      </Field>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button
          className="btn"
          data-tour="hr-save-employee"
          onClick={async () => {
            const body = { ...f, weekly_hours: Number(String(f.weekly_hours).replace(',', '.')), vacation_days: Number(String(f.vacation_days).replace(',', '.')), user_id: f.user_id || null, manager_user_id: f.manager_user_id || null, contact_id: f.contact?.id ?? null, state: f.state || '' };
            delete body.contact;
            const r = await act(() => (employee ? api.patch(`/api/hr/employees/${employee.id}`, body) : api.post('/api/hr/employees', body)), tt('Gespeichert'));
            if (r) onSaved(employee ? undefined : r);
          }}
        >
          {tt('Speichern')}
        </button>
      </div>
    </>
  );
}

function EmployeeVacation({ employee }: { employee: any }) {
  const tt = useT('x_finance');
  const [year, setYear] = useState(new Date().getFullYear());
  const r = useLoad(() => api.get(`/api/hr/employees/${employee.id}/balance?year=${year}`), [year]);
  const abs = useLoad(() => api.get(`/api/hr/absences?employee_id=${employee.id}&from=${year}-01-01&to=${year}-12-31`), [year]);
  const [carry, setCarry] = useState<string>();
  const [adj, setAdj] = useState<string>();
  const [modal, setModal] = useState(false);
  const x = r.data;
  if (!x) return <Spinner />;
  const carryVal = carry ?? String(x.leave_year.carryover_days).replace('.', ',');
  const adjVal = adj ?? String(x.leave_year.adjustment_days).replace('.', ',');
  const refresh = () => (void r.reload(), void abs.reload());
  return (
    <>
      <div className="row" style={{ alignItems: 'center', marginBottom: 8 }}>
        <strong>{tt('Urlaubskonto {year}', { year: year })}</strong>
        <button className="btn small secondary" aria-label={tt('Vorjahr')} onClick={() => (setYear(year - 1), setCarry(undefined), setAdj(undefined))}>‹</button>
        <button className="btn small secondary" aria-label={tt('Folgejahr')} onClick={() => (setYear(year + 1), setCarry(undefined), setAdj(undefined))}>›</button>
        <button className="btn small" style={{ marginLeft: 'auto' }} onClick={() => setModal(true)}>{tt('Abwesenheit eintragen')}</button>
      </div>
      <div className="row">
        <div className="card grow">
          <BalanceBlock b={x.balance} />
        </div>
        <div className="card grow">
          <h3>{tt('Resturlaub und Korrektur {year}', { year: year })}</h3>
          <div className="grid2" style={{ marginTop: 10 }}>
            <Field label={tt('Resturlaub aus dem Vorjahr (Tage)')} hint={x.suggested_carryover === null ? tt('Im Eintrittsjahr gibt es keinen Übertrag.') : tt('Vorschlag: {qty} Tage', { qty: qty(x.suggested_carryover) })}>
              <Input value={carryVal} onChange={setCarry} inputMode="decimal" />
            </Field>
            <Field label={tt('Korrektur (+/− Tage)')}>
              <Input value={adjVal} onChange={setAdj} inputMode="decimal" />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {x.suggested_carryover !== null && (
              <button className="btn small secondary" onClick={() => setCarry(String(x.suggested_carryover).replace('.', ','))}>
                {tt('Vorschlag übernehmen')}
              </button>
            )}
            <button className="btn small" onClick={async () => (await act(() => api.put(`/api/hr/employees/${employee.id}/leave-years/${year}`, { carryover_days: Number(carryVal.replace(',', '.')), adjustment_days: Number(adjVal.replace(',', '.')) }), tt('Gespeichert'))) && (setCarry(undefined), setAdj(undefined), refresh())}>
              {tt('Speichern')}
            </button>
          </div>
        </div>
      </div>
      {(abs.data ?? []).length ? (
        <table className="t" style={{ marginTop: 12 }}>
          <tbody>
            {(abs.data as any[]).map((a) => (
              <tr key={a.id}>
                <td>{absLabel(a)}</td>
                <td>{period(a)}</td>
                <td className="num">{days(a.days)}</td>
                <td>
                  <Badge tone={ABS_STATUS[a.status]?.[1]}>{tt(ABS_STATUS[a.status]?.[0] ?? a.status)}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">{tt('Keine Abwesenheiten in {year}.', { year: year })}</p>
      )}
      {modal && <AbsenceModal mode="hr" employeeId={employee.id} onClose={() => setModal(false)} onDone={() => (setModal(false), refresh())} />}
    </>
  );
}

function EmployeeDocs({ employee, canSensitive }: { employee: any; canSensitive: boolean }) {
  const tt = useT('x_finance');
  const list = useLoad(() => api.get(`/api/hr/employees/${employee.id}/documents`), []);
  const [cat, setCat] = useState('vertrag');
  const [vis, setVis] = useState('hr');
  const [busy, setBusy] = useState(false);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of [...files]) {
        const data = await new Promise<string>((res, rej) => {
          const rd = new FileReader();
          rd.onload = () => res(String(rd.result));
          rd.onerror = () => rej(new Error(tt('Datei konnte nicht gelesen werden')));
          rd.readAsDataURL(file);
        });
        await act(() => api.post(`/api/hr/employees/${employee.id}/documents`, { name: file.name, data, category: cat, visibility: vis }), tt('Hochgeladen'));
      }
      void list.reload();
    } finally {
      setBusy(false);
    }
  };
  const VIS: Record<string, string> = { hr: tt('nur Personal'), employee: tt('Mitarbeiter sieht es'), sensitive: 'vertraulich' };
  return (
    <>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div style={{ width: 170 }}>
          <Field label={tt('Art')}>
            <Select value={cat} onChange={setCat} options={[['vertrag', tt('Vertrag')], ['zeugnis', tt('Zeugnis')], ['bescheinigung', tt('Bescheinigung')], ['abrechnung', tt('Abrechnung')], ['sonstiges', tt('Sonstiges')]]} />
          </Field>
        </div>
        <div style={{ width: 210 }}>
          <Field label={tt('Sichtbar für')}>
            <Select value={vis} onChange={setVis} options={[['hr', VIS.hr], ['employee', VIS.employee], ...(canSensitive ? [['sensitive', VIS.sensitive] as [string, string]] : [])]} />
          </Field>
        </div>
        <label className={`btn secondary${busy ? ' disabled' : ''}`} style={{ marginBottom: 12, cursor: 'pointer' }}>
          <Icon name="upload" /> {busy ? tt('Lädt …') : tt('Datei hochladen')}
          <input type="file" hidden multiple disabled={busy} accept="application/pdf,image/*,text/plain,.docx,.xlsx,.odt,.ods" onChange={(e) => (void upload(e.target.files), (e.target.value = ''))} />
        </label>
      </div>
      {(list.data ?? []).length ? (
        <table className="t">
          <tbody>
            {(list.data as any[]).map((x) => (
              <tr key={x.id}>
                <td>
                  <a href={dlHref(`/api/hr/documents/${x.id}`)} target="_blank" rel="noreferrer">
                    <Icon name="doc" /> {x.name}
                  </a>
                  <div className="mono muted small" title={tt('SHA-256')}>{x.sha256.slice(0, 16)}…</div>
                </td>
                <td>{x.category}</td>
                <td>
                  <Badge tone={x.visibility === 'sensitive' ? 'red' : x.visibility === 'employee' ? 'green' : 'gray'}>{VIS[x.visibility]}</Badge>
                </td>
                <td className="muted small">{d(x.created_at)}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn small ghost danger-text" onClick={async () => confirmAsk(tt('{name} löschen?', { name: x.name })) && (await act(() => api.del(`/api/hr/documents/${x.id}`), tt('Gelöscht'))) && void list.reload()}>
                    {tt('Löschen')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Empty>{tt('Noch keine Unterlagen.')}</Empty>
      )}
      <p className="muted small">{tt('Verträge, Zeugnisse und Abrechnungen unterliegen Aufbewahrungsfristen (meist 6 bis 10 Jahre) – lösche nur, was du nicht mehr aufbewahren musst.')}</p>
    </>
  );
}

function EmployeeSensitive({ employee, canSensitive, onDeleted }: { employee: any; canSensitive: boolean; onDeleted: () => void }) {
  const tt = useT('x_finance');
  const r = useLoad(() => (canSensitive ? api.get(`/api/hr/employees/${employee.id}/sensitive`) : Promise.resolve(undefined)), []);
  const [f, setF] = useState<any>();
  useEffect(() => {
    const x = r.data;
    if (x && !f)
      setF({ salary: euroText(x.salary_cents), salary_period: x.salary_period ?? 'month', iban: x.iban ?? '', tax_id: x.tax_id ?? '', social_security_no: x.social_security_no ?? '', tax_class: x.tax_class ?? '', health_insurance: x.health_insurance ?? '', birth_date: x.birth_date ?? '' });
  }, [r.data]);
  if (!canSensitive)
    return (
      <div className="bo-note" role="note">
        <Icon name="lock" size={16} />
        <span>{tt('Diese Daten sehen nur Administratoren und die in Personal → Einstellungen freigegebenen Personen.')}</span>
      </div>
    );
  if (!f) return r.error ? <p style={{ color: 'var(--red)' }}>{r.error}</p> : <Spinner />;
  const set = (k: string) => (v: any) => setF((s: any) => ({ ...s, [k]: v }));
  return (
    <>
      <div className="bo-note compact" role="note">
        <Icon name="lock" size={16} />
        <span>{tt('Verschlüsselt gespeichert. Das Ansehen und jede Änderung steht im Protokoll (ohne die Werte).')}</span>
      </div>
      <div className="grid3">
        <Field label={tt('Gehalt (€)')}>
          <EuroInput value={f.salary} onChange={set('salary')} />
        </Field>
        <Field label={tt('je')}>
          <Select value={f.salary_period} onChange={set('salary_period')} options={[['month', tt('Monat')], ['year', tt('Jahr')], ['hour', tt('Stunde')]]} />
        </Field>
        <Field label={tt('Geburtsdatum')}>
          <Input type="date" value={f.birth_date} onChange={set('birth_date')} />
        </Field>
        <Field label="IBAN">
          <Input value={f.iban} onChange={set('iban')} />
        </Field>
        <Field label={tt('Steuer-ID (11 Ziffern)')}>
          <Input value={f.tax_id} onChange={set('tax_id')} />
        </Field>
        <Field label={tt('Sozialversicherungsnummer')}>
          <Input value={f.social_security_no} onChange={set('social_security_no')} />
        </Field>
        <Field label={tt('Steuerklasse')}>
          <Input value={f.tax_class} onChange={set('tax_class')} />
        </Field>
        <Field label={tt('Krankenkasse')}>
          <Input value={f.health_insurance} onChange={set('health_insurance')} />
        </Field>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {employee.status === 'inactive' ? (
          <button className="btn ghost danger-text" onClick={async () => confirmAsk(tt('{name} mit allen Unterlagen endgültig löschen? Aufbewahrungsfristen beachten.', { name: employee.name })) && (await act(() => api.del(`/api/hr/employees/${employee.id}`), tt('Gelöscht'))) && onDeleted()}>
            {tt('Mitarbeiter löschen')}
          </button>
        ) : (
          <span className="muted small">{tt('Löschen ist erst nach „Ausgeschieden“ möglich.')}</span>
        )}
        <button
          className="btn"
          data-tour="hr-save-sensitive"
          onClick={async () => {
            const body = { salary_cents: f.salary === '' ? '' : parseEuro(f.salary), salary_period: f.salary_period, iban: f.iban, tax_id: f.tax_id, social_security_no: f.social_security_no, tax_class: f.tax_class, health_insurance: f.health_insurance, birth_date: f.birth_date };
            if (await act(() => api.put(`/api/hr/employees/${employee.id}/sensitive`, body), tt('Gespeichert'))) toast(tt('Gespeichert und protokolliert'));
          }}
        >
          {tt('Speichern')}
        </button>
      </div>
    </>
  );
}

function EmployeeLists({ employee }: { employee: any }) {
  const tt = useT('x_finance');
  const lists = useLoad(() => api.get(`/api/hr/checklists?employee_id=${employee.id}`), []);
  const tpl = useLoad(() => api.get('/api/hr/checklist-templates'), []);
  const [t, setT] = useState('');
  return (
    <>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div style={{ width: 280 }}>
          <Field label={tt('Checkliste starten')}>
            <Select value={t} onChange={setT} placeholder={tt('Vorlage wählen')} options={(tpl.data?.templates ?? []).map((x: any) => [x.id, `${x.kind === 'onboarding' ? tt('Onboarding') : tt('Offboarding')}: ${x.name}`] as [string, string])} />
          </Field>
        </div>
        <button className="btn" style={{ marginBottom: 12 }} disabled={!t} onClick={async () => (await act(() => api.post('/api/hr/checklists', { employee_id: employee.id, template_id: t }), tt('Gestartet'))) && (setT(''), void lists.reload())}>
          {tt('Starten')}
        </button>
      </div>
      {(lists.data ?? []).length ? (lists.data as any[]).map((c) => <ChecklistCard key={c.id} c={c} onChange={() => void lists.reload()} />) : <Empty>{tt('Keine Checklisten.')}</Empty>}
    </>
  );
}

// --- absences ------------------------------------------------------------------------------------------------------------------

export function HrAbsences() {
  const tt = useT('x_finance');
  const [status, setStatus] = useState('requested');
  const [emp, setEmp] = useState('');
  const [type, setType] = useState('');
  const [modal, setModal] = useState(false);
  const [decide, setDecide] = useState<{ a: any; decision: 'approved' | 'rejected' }>();
  const [edit, setEdit] = useState<any>();
  const emps = useLoad(() => api.get('/api/hr/employees?status=all'), []);
  const qs = new URLSearchParams({ ...(status !== 'all' ? { status } : {}), ...(emp ? { employee_id: emp } : {}), ...(type ? { type } : {}) }).toString();
  const list = useLoad(() => api.get(`/api/hr/absences?${qs}`), [qs]);
  const rows: any[] = list.data ?? [];
  const refresh = () => void list.reload();
  return (
    <>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div style={{ width: 170 }}>
          <Field label="Status">
            <Select value={status} onChange={setStatus} options={[['requested', tt('Beantragt')], ['approved', tt('Genehmigt')], ['rejected', tt('Abgelehnt')], ['cancelled', tt('Zurückgezogen')], ['all', tt('Alle')]]} />
          </Field>
        </div>
        <div style={{ width: 220 }}>
          <Field label={tt('Mitarbeiter')}>
            <Select value={emp} onChange={setEmp} placeholder={tt('Alle')} options={(emps.data ?? []).map((e: any) => [e.id, e.name] as [string, string])} />
          </Field>
        </div>
        <div style={{ width: 170 }}>
          <Field label={tt('Art')}>
            <Select value={type} onChange={setType} placeholder={tt('Alle')} options={absTypeOptions()} />
          </Field>
        </div>
        <div style={{ marginLeft: 'auto', marginBottom: 12 }}>
          <button className="btn" data-tour="hr-new-absence" onClick={() => setModal(true)}>
            {tt('Abwesenheit eintragen')}
          </button>
        </div>
      </div>
      {list.loading && !list.data ? (
        <Spinner />
      ) : rows.length ? (
        <div className="table-wrap" data-tour="hr-absences">
          <table className="t">
            <thead>
              <tr>
                <th>{tt('Mitarbeiter')}</th>
                <th>{tt('Art')}</th>
                <th>{tt('Zeitraum')}</th>
                <th className="num">{tt('Tage')}</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>
                    <strong>{a.employee_name}</strong>
                    {a.reason && <div className="muted small">{a.reason}</div>}
                  </td>
                  <td>
                    {absLabel(a)} {a.certificate ? <Badge tone="blue">{tt('Attest')}</Badge> : null}
                  </td>
                  <td>{period(a)}</td>
                  <td className="num">{days(a.days)}</td>
                  <td>
                    <Badge tone={ABS_STATUS[a.status]?.[1]}>{tt(ABS_STATUS[a.status]?.[0] ?? a.status)}</Badge>
                    {a.decision_note && <div className="muted small">{a.decision_note}</div>}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {a.status === 'requested' &&
                      (a.can_decide ? (
                        <>
                          <button className="btn small" onClick={() => setDecide({ a, decision: 'approved' })}>{tt('Genehmigen')}</button>{' '}
                          <button className="btn small secondary" onClick={() => setDecide({ a, decision: 'rejected' })}>{tt('Ablehnen')}</button>{' '}
                        </>
                      ) : (
                        <span className="muted small">{tt('eigener Antrag')}{' '}</span>
                      ))}
                    {['requested', 'approved'].includes(a.status) && (
                      <>
                        <button className="btn small ghost" onClick={() => setEdit(a)}>{tt('Ändern')}</button>{' '}
                        <button className="btn small ghost danger-text" onClick={async () => confirmAsk(tt('Abwesenheit zurückziehen?')) && (await act(() => api.post(`/api/hr/absences/${a.id}/cancel`, {}), tt('Zurückgezogen'))) && refresh()}>
                          {tt('Zurückziehen')}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>{tt('Keine Abwesenheiten für diese Auswahl.')}</Empty>
      )}
      {modal && <AbsenceModal mode="hr" employees={emps.data ?? []} onClose={() => setModal(false)} onDone={() => (setModal(false), refresh())} />}
      {decide && <DecideModal a={decide.a} decision={decide.decision} url={`/api/hr/absences/${decide.a.id}/${decide.decision === 'approved' ? 'approve' : 'reject'}`} onClose={() => setDecide(undefined)} onDone={() => (setDecide(undefined), refresh())} />}
      {edit && <EditAbsence a={edit} onClose={() => setEdit(undefined)} onDone={() => (setEdit(undefined), refresh())} />}
    </>
  );
}

function EditAbsence({ a, onClose, onDone }: { a: any; onClose: () => void; onDone: () => void }) {
  const tt = useT('x_finance');
  const [f, setF] = useState({ type: a.type, label: a.label, start_date: a.start_date, end_date: a.end_date, half_start: a.half_start, half_end: a.half_end, reason: a.reason, certificate: a.certificate, force: false });
  const set = (k: string) => (v: any) => setF((s) => ({ ...s, [k]: v }));
  return (
    <Modal
      title={tt('{employee_name}: Abwesenheit ändern', { employee_name: a.employee_name })}
      onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={onClose}>{tt('Abbrechen')}</button>
          <button className="btn" onClick={async () => (await act(() => api.patch(`/api/hr/absences/${a.id}`, f), tt('Gespeichert'))) && onDone()}>{tt('Speichern')}</button>
        </>
      }
    >
      <div className="grid2">
        <Field label={tt('Art')}><Select value={f.type} onChange={set('type')} options={absTypeOptions()} /></Field>
        {f.type === 'other' && <Field label={tt('Bezeichnung')}><Input value={f.label} onChange={set('label')} /></Field>}
        <Field label={tt('Von')}><Input type="date" value={f.start_date} onChange={set('start_date')} /></Field>
        <Field label={tt('Bis')}><Input type="date" value={f.end_date} onChange={set('end_date')} /></Field>
      </div>
      <div className="row">
        <Check checked={f.half_start} onChange={set('half_start')} label={tt('erster Tag halb')} />
        <Check checked={f.half_end} onChange={set('half_end')} label={tt('letzter Tag halb')} />
        <Check checked={f.force} onChange={set('force')} label={tt('Auch über den Anspruch hinaus')} />
      </div>
      {f.type !== 'sick' && (
        <Field label={tt('Anmerkung')}>
          <Textarea value={f.reason} onChange={set('reason')} rows={2} />
        </Field>
      )}
    </Modal>
  );
}

// --- working time ---------------------------------------------------------------------------------------------------------------

export function HrWorkingTime() {
  const tt = useT('x_finance');
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const [from, setFrom] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`);
  const [to, setTo] = useState(ymdLocal(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
  const r = useLoad(() => api.get(`/api/hr/working-time?from=${from}&to=${to}`), [from, to]);
  const x = r.data;
  return (
    <>
      <div className="row" style={{ alignItems: 'flex-end' }} data-tour="hr-time-range">
        <div style={{ width: 150 }}>
          <Field label={tt('Von')}>
            <Input type="date" value={from} onChange={setFrom} />
          </Field>
        </div>
        <div style={{ width: 150 }}>
          <Field label={tt('Bis')}>
            <Input type="date" value={to} onChange={setTo} />
          </Field>
        </div>
      </div>
      {!x ? (
        r.error ? <p style={{ color: 'var(--red)' }}>{r.error}</p> : <Spinner />
      ) : x.employees.length ? (
        <div className="table-wrap" data-tour="hr-time">
          <table className="t">
            <thead>
              <tr>
                <th>{tt('Mitarbeiter')}</th>
                <th className="num">{tt('Soll (Std.)')}</th>
                <th className="num">{tt('Erfasst (Std.)')}</th>
                <th className="num">{tt('Saldo')}</th>
                <th className="num">{tt('Urlaub')}</th>
                <th className="num">{tt('Krank')}</th>
                <th className="num">{tt('Sonstiges')}</th>
                <th className="num">{tt('Feiertage')}</th>
              </tr>
            </thead>
            <tbody>
              {x.employees.map((e: any) => (
                <tr key={e.employee_id}>
                  <td>
                    <strong>{e.name}</strong> <span className="muted small">{tt('{qty} Std./Woche', { qty: qty(e.weekly_hours) })}</span>
                  </td>
                  <td className="num">{qty(e.target_hours)}</td>
                  <td className="num">{e.tracked_hours === null ? '–' : qty(e.tracked_hours)}</td>
                  <td className="num">{e.balance_hours === null ? '–' : <span className={e.balance_hours < 0 ? 'bo-neg' : 'bo-ok'}>{e.balance_hours > 0 ? '+' : ''}{qty(e.balance_hours)}</span>}</td>
                  <td className="num">{qty(e.vacation_days)}</td>
                  <td className="num">{qty(e.sick_days)}</td>
                  <td className="num">{qty(e.other_days)}</td>
                  <td className="num">{e.holidays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>{tt('Keine aktiven Mitarbeiter.')}</Empty>
      )}
      <p className="muted small">
        {tt('Soll = Wochenstunden verteilt auf die Arbeitstage, ohne Feiertage und genehmigte Abwesenheiten.')} {x && !x.tracking_connected ? tt('Die Zeiterfassung ist nicht verbunden – erfasste Stunden erscheinen hier, sobald ein Zeiterfassungs-Modul sie liefert (siehe docs/backoffice.md).') : tt('Die erfassten Stunden kommen aus der Zeiterfassung.')}
      </p>
    </>
  );
}

// --- checklists ------------------------------------------------------------------------------------------------------------------

function ChecklistCard({ c, onChange }: { c: any; onChange: () => void }) {
  const tt = useT('x_finance');
  const done = c.items.filter((i: any) => i.done).length;
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>
          {c.name} <Badge tone={c.status === 'done' ? 'green' : 'blue'}>{done} / {c.items.length}</Badge>
        </h3>
        <button className="btn small ghost danger-text" onClick={async () => confirmAsk(tt('Checkliste löschen?')) && (await act(() => api.del(`/api/hr/checklists/${c.id}`))) && onChange()}>
          {tt('Löschen')}
        </button>
      </div>
      {c.items.map((i: any) => (
        <label key={i.id} className="check">
          <input type="checkbox" checked={i.done} onChange={async (ev) => (await act(() => api.post(`/api/hr/checklists/${c.id}/items/${i.id}`, { done: ev.target.checked }))) && onChange()} /> {i.title}
          <span className="muted small"> · {tt(ASSIGNEE[i.assignee] ?? i.assignee)}{i.due ? tt(', bis {germanDate}', { germanDate: germanDate(i.due) }) : ''}{i.done && i.done_by ? tt(', erledigt von {done_by}', { done_by: i.done_by }) : ''}</span>
        </label>
      ))}
    </div>
  );
}

const ASSIGNEE: Record<string, string> = { hr: 'Personalbüro', employee: 'Mitarbeiter/in', manager: 'Vorgesetzte/r', it: 'IT / Technik' };

export function HrChecklists() {
  const tt = useT('x_finance');
  const tpl = useLoad(() => api.get('/api/hr/checklist-templates'), []);
  const lists = useLoad(() => api.get('/api/hr/checklists?status=open'), []);
  const [edit, setEdit] = useState<any>();
  const templates: any[] = tpl.data?.templates ?? [];
  return (
    <>
      <div className="card" style={{ marginBottom: 14 }} data-tour="hr-templates">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>{tt('Vorlagen')}</h2>
          <button className="btn small" onClick={() => setEdit({ kind: 'onboarding', name: '', items: [{ title: '', assignee: 'hr', due_days: 0 }] })}>{tt('Vorlage anlegen')}</button>
        </div>
        <p className="muted small">{tt('Starte eine Checkliste im Mitarbeiter-Dialog unter „Checklisten“. Die Fristen zählen ab Eintritt (Onboarding) bzw. Austritt (Offboarding).')}</p>
        <div className="bo-scroll"><table className="t">
          <tbody>
            {templates.map((t) => (
              <tr key={t.id}>
                <td>
                  <strong>{t.name}</strong>
                </td>
                <td>
                  <Badge tone={t.kind === 'onboarding' ? 'green' : 'purple'}>{t.kind === 'onboarding' ? tt('Onboarding') : tt('Offboarding')}</Badge>
                </td>
                <td className="muted small">{tt('{length} Punkte', { length: t.items.length })}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn small secondary" onClick={() => setEdit(t)}>{tt('Bearbeiten')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
      <h2>{tt('Laufende Checklisten')}</h2>
      {(lists.data ?? []).length ? (lists.data as any[]).map((c) => <ChecklistCard key={c.id} c={c} onChange={() => void lists.reload()} />) : <Empty>{tt('Keine offenen Checklisten.')}</Empty>}
      {edit && <TemplateModal t={edit} onClose={() => setEdit(undefined)} onDone={() => (setEdit(undefined), void tpl.reload())} />}
    </>
  );
}

function TemplateModal({ t, onClose, onDone }: { t: any; onClose: () => void; onDone: () => void }) {
  const tt = useT('x_finance');
  const [f, setF] = useState({ kind: t.kind, name: t.name, items: t.items.map((i: any) => ({ ...i, due_days: String(i.due_days) })) as any[] });
  const upd = (i: number, k: string, v: string) => setF((s) => ({ ...s, items: s.items.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }));
  return (
    <Modal
      wide
      title={t.id ? tt('Vorlage bearbeiten') : tt('Neue Vorlage')}
      onClose={onClose}
      footer={
        <>
          {t.id && (
            <button className="btn ghost danger-text" onClick={async () => confirmAsk(tt('Vorlage löschen? Laufende Checklisten bleiben.')) && (await act(() => api.del(`/api/hr/checklist-templates/${t.id}`), tt('Gelöscht'))) && onDone()}>
              {tt('Löschen')}
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className="btn secondary" onClick={onClose}>{tt('Abbrechen')}</button>
          <button
            className="btn"
            onClick={async () => {
              const body = { kind: f.kind, name: f.name, items: f.items.filter((i) => i.title.trim()).map((i) => ({ title: i.title, assignee: i.assignee, due_days: Number(i.due_days) || 0 })) };
              if (await act(() => (t.id ? api.patch(`/api/hr/checklist-templates/${t.id}`, body) : api.post('/api/hr/checklist-templates', body)), tt('Gespeichert'))) onDone();
            }}
          >
            {tt('Speichern')}
          </button>
        </>
      }
    >
      <div className="grid2">
        <Field label="Name"><Input value={f.name} onChange={(v) => setF({ ...f, name: v })} /></Field>
        <Field label={tt('Art')}><Select value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={[['onboarding', tt('Onboarding (ab Eintritt)')], ['offboarding', tt('Offboarding (ab Austritt)')]]} /></Field>
      </div>
      <table className="t">
        <thead>
          <tr>
            <th>{tt('Punkt')}</th>
            <th style={{ width: 170 }}>{tt('Zuständig')}</th>
            <th style={{ width: 120 }}>{tt('Frist (Tage)')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {f.items.map((i, idx) => (
            <tr key={idx}>
              <td><Input value={i.title} onChange={(v) => upd(idx, 'title', v)} /></td>
              <td><Select value={i.assignee} onChange={(v) => upd(idx, 'assignee', v)} options={Object.entries(ASSIGNEE).map(([k, l]): [string, string] => [k, tt(l)])} /></td>
              <td><Input value={i.due_days} onChange={(v) => upd(idx, 'due_days', v)} inputMode="numeric" /></td>
              <td>
                {f.items.length > 1 && (
                  <button className="icon-btn" aria-label={tt('Punkt entfernen')} onClick={() => setF((s) => ({ ...s, items: s.items.filter((_, j) => j !== idx) }))}>✕</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn small secondary" style={{ marginTop: 8 }} onClick={() => setF((s) => ({ ...s, items: [...s.items, { title: '', assignee: 'hr', due_days: '0' }] }))}>{tt('+ Punkt')}</button>
      <p className="muted small">{tt('Frist in Tagen relativ zum Eintritts- bzw. Austrittsdatum; negativ = davor (−7: eine Woche vorher).')}</p>
    </Modal>
  );
}

