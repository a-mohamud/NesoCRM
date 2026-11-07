import { useState } from 'react';
import { api, d, dt, money } from '../api';
import { Icon } from '../icons';
import { act, Badge, Empty, Field, Input, Modal, pressable, Select, Spinner, Stat, Tabs, Textarea, useLoad } from '../ui';
import { useSession } from '../session';
import { PHASE_TONE, REASONS } from './CloudKit';
import { CloudSettingsForm } from './CloudSettings';
import { Slot } from '../slots';
import { SortableGrid } from '../sortable/Sortable';
import { fmtNumber, intlLocale, useT } from '../i18n';

/**
 * Agentur → Cloud: the operator console of the hosted service. Numbers (MRR, churn, trial conversion), the customer list
 * with the actions the operator has (extend a trial, comp a plan, change a plan, open the account with the customer's
 * consent, delete), the settings of the service, the legal texts and signups that failed; abuse and the waitlist plug in as slots.
 */

const EVENTS: Record<string, string> = {
  provisioned: 'Konto angelegt',
  trial_started: 'Testphase gestartet',
  trial_converted: 'Testphase → Abo',
  trial_expired: 'Testphase abgelaufen',
  trial_extended: 'Testphase verlängert',
  subscribed: 'Abo abgeschlossen',
  checkout_started: 'Bezahlseite geöffnet',
  payment_failed: 'Zahlung fehlgeschlagen',
  payment_recovered: 'Zahlung nachgeholt',
  reactivated: 'Wieder freigeschaltet',
  read_only: 'Schreibgeschützt',
  canceled: 'Abo beendet',
  cancel_scheduled: 'Gekündigt',
  cancel_undone: 'Kündigung zurückgenommen',
  plan_changed: 'Tarif geändert',
  comped: 'Tarif geschenkt',
  comp_ended: 'Geschenk ausgelaufen',
  deletion_scheduled: 'Löschung geplant',
  deletion_undone: 'Löschung zurückgenommen',
  deleted: 'Gelöscht',
  export: 'Daten exportiert',
  support_consent: 'Support-Freigabe',
  support_open: 'Support hat geöffnet',
  member_invited: 'Nutzer eingeladen',
  member_removed: 'Nutzer entfernt',
  client_created: 'Kunden-Account angelegt',
  client_deleted: 'Kunden-Account gelöscht',
  branding_changed: 'White-Label geändert',
  domain_changed: 'Domain geändert',
  legal_accepted: 'Bedingungen bestätigt',
  mail_failed: 'E-Mail fehlgeschlagen',
  provision_failed: 'Einrichtung fehlgeschlagen',
  signup_blocked: 'Anmeldung blockiert',
  b2b_confirmed: 'Unternehmer bestätigt',
  abuse_reported: 'Missbrauch gemeldet',
  abuse_sending_paused: 'Versand pausiert',
  abuse_sending_resumed: 'Versand wieder frei',
  abuse_sites_offline: 'Websites offline',
  abuse_sites_online: 'Websites wieder online',
  abuse_suspended: 'Konto gesperrt',
  abuse_unsuspended: 'Sperre aufgehoben',
};
const PLANS: [string, string][] = [
  ['solo', 'Cloud Solo'],
  ['team', 'Cloud Team & Company'],
  ['agency', 'Cloud Agentur'],
];
const PHASES: [string, string][] = [
  ['', 'Alle Status'],
  ['trial', 'Testphase'],
  ['active', 'Aktiv'],
  ['comped', 'Geschenkt'],
  ['past_due', 'Zahlung offen'],
  ['read_only', 'Schreibgeschützt'],
  ['canceled', 'Gekündigt'],
  ['deletion_scheduled', 'Löschung geplant'],
];

const pct = (n: number | null | undefined) => (n === null || n === undefined ? '–' : `${fmtNumber(n, { maximumFractionDigits: 1 })} %`);

function Overview({ go }: { go: (t: string) => void }) {
  const tt = useT('x_agency');
  const o = useLoad(() => api.get('/api/cloud/console/overview'), []);
  const x = o.data;
  if (!x) return <Spinner />;
  const h = x.health;
  const checks: [boolean, string, string?][] = [
    [h.stripe_connected, tt('Stripe ist verbunden'), tt('Schlüssel unter Agentur → SaaS → Einstellungen')],
    [h.webhook_set, tt('Webhook-Secret ist hinterlegt'), tt('ohne Webhook entstehen keine Konten nach der Zahlung')],
    [h.signup_open, tt('Anmeldung ist offen'), tt('Einstellungen → Anmeldung')],
    [h.mail_ready, tt('System-Mails werden wirklich verschickt (Absender mit SMTP oder Mail-Dienst, nicht „nur speichern“)'), tt('Einstellungen → Domain & Mail')],
    [!h.legal_open, tt('Rechtstexte sind vollständig ausgefüllt'), tt('{n} Dokument(e) mit offenen Platzhaltern', { n: h.legal_open })],
    [!!h.cloud_domain, tt('Cloud-Domain für <name>.domain gesetzt'), tt('optional – sonst pfadbasiert')],
    [!h.saas_signup_open, tt('Die SaaS-Anmeldeseite (/signup) ist aus'), tt('im Cloud-Modus laufen Anmeldungen über /start')],
    [!!h.sites_domain, tt('Eigene Domain für Kunden-Websites gesetzt (PGHL_CLOUD_SITES_DOMAIN)'), tt('sonst sind Kunden-Websites nur über ihre eigene, bestätigte Domain erreichbar – nie unter der Login-Adresse')],
    [!!h.offsite_backup, tt('Off-site-Backup ist eingerichtet'), tt('PGHL_BACKUP_S3_* und PGHL_BACKUP_KEY – Status unter Agentur → System')],
  ];
  return (
    <>
      <SortableGrid id="cloud-stats" className="stats" data-tour="cloud-stats">
        <Stat label={tt('MRR')} value={money(x.mrr_cents, x.currency)} sub={tt('ARR {money}', { money: money(x.arr_cents, x.currency) })} />
        <Stat label={tt('Zahlende Kunden')} value={x.paying} sub={tt('{total} Konten gesamt, {new_30d} neu in 30 Tagen', { total: x.total, new_30d: x.new_30d })} />
        <Stat label={tt('Testphasen')} value={x.counts.trial} sub={tt('noch ohne Umsatz')} />
        <Stat label={tt('Testphase → Abo')} value={pct(x.trial.conversion_percent)} sub={tt('{converted_90d} umgestiegen, {expired_90d} abgelaufen (90 Tage)', { converted_90d: x.trial.converted_90d, expired_90d: x.trial.expired_90d })} />
        <Stat label={tt('Churn (30 Tage)')} value={pct(x.churn.rate_percent)} sub={tt('{lost_30d} beendet', { lost_30d: x.churn.lost_30d })} />
        <Stat label={tt('Zahlung offen')} value={x.counts.past_due + x.counts.read_only} sub={tt('{read_only} davon schreibgeschützt', { read_only: x.counts.read_only })} />
      </SortableGrid>
      <SortableGrid id="cloud.cards" className="grid2 saas-grid">
        <div className="card" data-tour="cloud-health">
          <h3 style={{ marginTop: 0 }}>{tt('Einrichtung')}</h3>
          <ul className="cloud-checks">
            {checks.map(([ok, label, hint]) => (
              <li key={label} className={ok ? 'ok' : 'todo'}>
                <Icon name={ok ? 'ok' : 'pending'} size={18} />
                <div>
                  {label}
                  {!ok && hint && <div className="muted small">{hint}</div>}
                </div>
              </li>
            ))}
          </ul>
          <button className="btn secondary small" onClick={() => go('settings')}>
            {tt('Zu den Einstellungen')}
          </button>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{tt('Kunden je Tarif')}</h3>
          <div className="table-wrap">
<table className="t">
            <thead>
              <tr>
                <th>{tt('Tarif')}</th>
                <th>{tt('Konten')}</th>
                <th>{tt('MRR')}</th>
              </tr>
            </thead>
            <tbody>
              {x.plans.map((p: any) => (
                <tr key={p.key}>
                  <td>{p.name}</td>
                  <td>
                    {p.count}
                    {p.trialing ? <span className="muted small"> {tt('({trialing} Test)', { trialing: p.trialing })}</span> : null}
                  </td>
                  <td>{money(p.mrr_cents, x.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
</div>
          {x.failed_signups > 0 && (
            <p className="notice-warn" style={{ marginTop: 12 }}>
              {tt('{failed_signups} Anmeldung(en) mit Zahlung konnten nicht eingerichtet werden.', { failed_signups: x.failed_signups })}{' '}
              <a href="#" onClick={(e) => (e.preventDefault(), go('signups'))}>
                {tt('Ansehen')}
              </a>
            </p>
          )}
        </div>
      </SortableGrid>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{tt('Letzte Ereignisse')}</h3>
        {x.events.length ? (
          <div className="table-wrap">
<table className="t">
            <tbody>
              {x.events.map((e: any) => (
                <tr key={e.id}>
                  <td className="nowrap muted">{dt(e.at)}</td>
                  <td>{e.tenant_name || <span className="muted">{tt('gelöschtes Konto')}</span>}</td>
                  <td>{EVENTS[e.type] ? tt(EVENTS[e.type]) : e.type}</td>
                  <td className="muted small">{e.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
</div>
        ) : (
          <Empty>{tt('Noch nichts passiert.')}</Empty>
        )}
      </div>
    </>
  );
}

function TenantModal({ id, onClose, onChange }: { id: string; onClose: () => void; onChange: () => void }) {
  const tt = useT('x_agency');
  const session = useSession();
  const t = useLoad(() => api.get(`/api/cloud/console/tenants/${id}`), [id]);
  const [days, setDays] = useState('7');
  const [plan, setPlan] = useState('team');
  const [months, setMonths] = useState('');
  const [confirm, setConfirm] = useState('');
  const [notes, setNotes] = useState<string | null>(null);
  const x = t.data;
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    if (await act(fn, ok)) {
      void t.reload();
      onChange();
    }
  };
  return (
    <Modal title={x ? x.name : tt('Kunde')} wide onClose={onClose}>
      {!x ? (
        <Spinner />
      ) : (
        <>
          <div className="row">
            <div className="grow">
              <p>
                <Badge tone={PHASE_TONE[x.phase] ?? 'gray'}>{tt(x.phase_label)}</Badge> {x.plan.name} · {x.plan.interval === 'year' ? tt('jährlich') : tt('monatlich')} · {x.billing === 'stripe' ? 'Stripe' : tt('ohne Stripe')}
              </p>
              <p className="muted small">
                {tt('{email} · angelegt {d}', { email: x.email, d: d(x.created_at) })}
                {x.trial_end && tt(' · Testphase bis {d}', { d: d(x.trial_end) })}
                {x.current_period_end && tt(' · Laufzeit bis {d}', { d: d(x.current_period_end) })}
                {x.deletion && tt(' · Löschung {d}', { d: d(x.deletion.at) })}
              </p>
              <p className="muted small">
                {tt('{users} Nutzer', { users: x.users })}{x.entitlements.client_accounts ? tt(', {clients} Kunden-Accounts', { clients: x.clients }) : ''} {tt('· E-Mails')} {x.meters.emails.used.toLocaleString(intlLocale())} {tt('· Support-Zugriff')} {x.support.active ? tt('bis {d}', { d: d(x.support.until) }) : tt('nicht freigegeben')}
              </p>
              {x.cancel_reason && (
                <p className="muted small">
                  {tt('Kündigungsgrund: {v}', { v: tt(REASONS.find(([k]) => k === x.cancel_reason)?.[1] ?? x.cancel_reason) })}
                  {x.cancel_comment ? ` – „${x.cancel_comment}“` : ''}
                </p>
              )}
            </div>
          </div>
          <div className="actions" style={{ margin: '8px 0 14px' }}>
            <button
              className="btn"
              disabled={!x.support.active}
              title={x.support.active ? tt('Konto im Support öffnen') : tt('Der Kunde hat den Support-Zugriff nicht freigegeben')}
              onClick={async () => {
                const r = await act(() => api.post<{ location_id: string }>(`/api/cloud/console/tenants/${id}/open`, { reason: 'Support' } /* i18n-ignore */));
                if (r?.location_id) {
                  onClose();
                  session.switchLocation(r.location_id);
                }
              }}
            >
              <Icon name="eye" /> {tt('Konto öffnen')}
            </button>
          </div>
          <div className="grid2">
            <Field label={tt('Testphase verlängern (Tage)')}>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <Input value={days} onChange={setDays} />
                <button className="btn secondary" onClick={() => run(() => api.post(`/api/cloud/console/tenants/${id}/extend-trial`, { days: Number(days) }), tt('Testphase verlängert'))}>
                  {tt('Verlängern')}
                </button>
              </div>
            </Field>
            <Field label={tt('Tarif ändern')}>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <Select value={plan} onChange={setPlan} options={PLANS.map(([k, l]) => [k, tt(l)] as [string, string])} />
                <button className="btn secondary" onClick={() => run(() => api.post(`/api/cloud/console/tenants/${id}/plan`, { plan }), tt('Tarif geändert'))}>
                  {tt('Ändern')}
                </button>
              </div>
            </Field>
            <Field label={tt('Tarif schenken (Monate, leer = unbefristet)')}>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <Input value={months} onChange={setMonths} placeholder={tt('z. B. 3')} />
                <button className="btn secondary" onClick={() => run(() => api.post(`/api/cloud/console/tenants/${id}/comp`, { plan, ...(months ? { months: Number(months) } : {}) }), tt('Tarif geschenkt'))}>
                  {tt('Schenken')}
                </button>
              </div>
            </Field>
            <Field label={tt('Notiz (nur für dich)')}>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <Input value={notes ?? x.notes} onChange={setNotes} />
                <button className="btn secondary" disabled={notes === null} onClick={() => run(() => api.patch(`/api/cloud/console/tenants/${id}`, { notes }), tt('Gespeichert'))}>
                  {tt('Speichern')}
                </button>
              </div>
            </Field>
          </div>
          <h4>{tt('Verlauf')}</h4>
          <div className="cloud-events">
            <div className="table-wrap">
<table className="t">
              <tbody>
                {x.events.map((e: any) => (
                  <tr key={e.id}>
                    <td className="nowrap muted">{dt(e.at)}</td>
                    <td>{EVENTS[e.type] ? tt(EVENTS[e.type]) : e.type}</td>
                    <td className="muted small">{e.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
</div>
          </div>
          <details style={{ marginTop: 14 }}>
            <summary>{tt('Konto löschen …')}</summary>
            <p className="muted small">{tt('Löscht alle Daten und Logins sofort und endgültig (der Kunde wird per E-Mail informiert, das Stripe-Abo beendet).')}</p>
            <Field label={tt('Zur Bestätigung „{name}“ eintippen', { name: x.name })}>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <Input value={confirm} onChange={setConfirm} />
                <button
                  className="btn danger"
                  disabled={confirm !== x.name}
                  onClick={async () => {
                    if (await act(() => api.post(`/api/cloud/console/tenants/${id}/delete`, { confirm }), tt('Gelöscht'))) {
                      onChange();
                      onClose();
                    }
                  }}
                >
                  {tt('Löschen')}
                </button>
              </div>
            </Field>
          </details>
        </>
      )}
    </Modal>
  );
}

function Customers() {
  const tt = useT('x_agency');
  const [q, setQ] = useState('');
  const [phase, setPhase] = useState('');
  const [plan, setPlan] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const list = useLoad(() => api.get(`/api/cloud/console/tenants?q=${encodeURIComponent(q)}&phase=${phase}&plan=${plan}&limit=200`), [q, phase, plan]);
  const x = list.data;
  return (
    <div className="card" data-tour="cloud-customers">
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="grow">
          <Field label={tt('Suchen')}>
            <Input value={q} onChange={setQ} placeholder={tt('Firma, E-Mail …')} />
          </Field>
        </div>
        <div>
          <Field label="Status">
            <Select value={phase} onChange={setPhase} options={PHASES.map(([k, l]) => [k, tt(l)] as [string, string])} />
          </Field>
        </div>
        <div>
          <Field label={tt('Tarif')}>
            <Select value={plan} onChange={setPlan} options={[['', tt('Alle Tarife')], ...PLANS.map(([k, l]) => [k, tt(l)] as [string, string])]} />
          </Field>
        </div>
        <a className="btn secondary" style={{ marginBottom: 12 }} href="/api/cloud/console/tenants.csv" download>
          <Icon name="csv" /> CSV
        </a>
      </div>
      {!x ? (
        <Spinner />
      ) : x.items.length ? (
        <div className="table-wrap">
<table className="t">
          <thead>
            <tr>
              <th>{tt('Firma')}</th>
              <th>{tt('Tarif')}</th>
              <th>Status</th>
              <th>{tt('MRR')}</th>
              <th>{tt('Testphase / Laufzeit')}</th>
              <th>{tt('Angelegt')}</th>
            </tr>
          </thead>
          <tbody>
            {x.items.map((r: any) => (
              <tr key={r.id} className="click" {...pressable(() => setOpen(r.id))}>
                <td>
                  {r.name}
                  <div className="muted small">{r.email}</div>
                </td>
                <td>
                  {r.plan_name}
                  <div className="muted small">{r.interval === 'year' ? tt('jährlich') : tt('monatlich')}</div>
                </td>
                <td>
                  <Badge tone={PHASE_TONE[r.phase] ?? 'gray'}>{tt(r.phase_label)}</Badge> {r.cancel_at_period_end && <Badge tone="yellow">{tt('gekündigt')}</Badge>} {r.support && <Badge tone="purple">{tt('Support frei')}</Badge>}
                </td>
                <td className="nowrap">{r.mrr_cents ? money(r.mrr_cents) : '–'}</td>
                <td className="nowrap">{d(r.status === 'trialing' ? r.trial_end : r.current_period_end)}</td>
                <td className="nowrap">{d(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
</div>
      ) : (
        <Empty>{tt('Keine Kunden gefunden.')}</Empty>
      )}
      {open && <TenantModal id={open} onClose={() => setOpen(null)} onChange={() => void list.reload()} />}
    </div>
  );
}

function Legal() {
  const tt = useT('x_agency');
  const l = useLoad(() => api.get<{ docs: { doc: string; title: string; version: number; body: string; open_placeholders: string[]; accepted: number; created_at: string }[] }>('/api/cloud/console/legal'), []);
  const [edit, setEdit] = useState<Record<string, string>>({});
  if (!l.data) return <Spinner />;
  return (
    <div data-tour="cloud-legal">
      <div className="notice-warn">
        {tt('Die Texte sind Vorlagen mit Platzhaltern und')} <strong>{tt('keine Rechtsberatung')}</strong>{tt('. Lass sie prüfen und trage deine Angaben unter Einstellungen → Anbieter ein. Jede Änderung ist eine neue Version; Kunden sehen sie als „bitte bestätigen“. Platzhalter:')} <code>{'{{operator.name}}'}</code>, <code>{'{{operator.address}}'}</code>, <code>{'{{customer.company}}'}</code>, <code>{'{{service}}'}</code>, <code>{'{{date}}'}</code>, <code>{'{{trial_days}}'}</code> …
      </div>
      {l.data.docs.map((x) => {
        const body = edit[x.doc] ?? x.body;
        return (
          <div className="card" key={x.doc}>
            <div className="saas-subtabs">
              <h3 style={{ marginTop: 0 }}>
                {x.title} <Badge>{tt('Version {version}', { version: x.version })}</Badge> {x.open_placeholders.length > 0 && <Badge tone="yellow">{tt('{length} Platzhalter offen', { length: x.open_placeholders.length })}</Badge>}
              </h3>
              <a href={`/cloud/legal/${x.doc}`} target="_blank" rel="noopener noreferrer">
                {tt('Seite ansehen')}
              </a>
            </div>
            {x.open_placeholders.length > 0 && <p className="muted small">{tt('Offen:')} {x.open_placeholders.map((p) => `{{${p}}}`).join(', ')}</p>}
            <Textarea value={body} onChange={(v) => setEdit({ ...edit, [x.doc]: v })} rows={12} className="mono" />
            <div className="actions" style={{ marginTop: 10 }}>
              <button
                className="btn"
                disabled={edit[x.doc] === undefined || edit[x.doc] === x.body}
                onClick={async () => {
                  if (await act(() => api.put(`/api/cloud/console/legal/${x.doc}`, { body: edit[x.doc] }), tt('Neue Version veröffentlicht'))) {
                    setEdit({ ...edit, [x.doc]: undefined as any });
                    void l.reload();
                  }
                }}
              >
                {tt('Als neue Version veröffentlichen')}
              </button>
              <span className="muted small">{tt('{accepted} Kunden haben diese Version bestätigt', { accepted: x.accepted })}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Signups() {
  const tt = useT('x_agency');
  const s = useLoad(() => api.get<any[]>('/api/cloud/console/signups'), []);
  if (!s.data) return <Spinner />;
  return (
    <div className="card">
      <p className="muted small" style={{ marginTop: 0 }}>{tt('Offene Anmeldungen löscht das System nach 7 Tage, fehlgeschlagene nach 30 Tagen (Datenschutz).')}</p>
      {s.data.length ? (
        <div className="table-wrap">
<table className="t">
          <thead>
            <tr>
              <th>{tt('Wann')}</th>
              <th>{tt('Firma')}</th>
              <th>{tt('Tarif')}</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {s.data.map((r) => (
              <tr key={r.id}>
                <td className="nowrap">{dt(r.created_at)}</td>
                <td>
                  {r.company}
                  <div className="muted small">{r.email}</div>
                </td>
                <td>{r.plan_key}</td>
                <td>
                  <Badge tone={r.status === 'done' ? 'green' : r.status === 'failed' ? 'red' : 'gray'}>{r.status}</Badge>
                  {r.error && <div className="muted small">{r.error}</div>}
                </td>
                <td>
                  {r.status === 'failed' && (
                    <button className="btn small secondary" onClick={async () => (await act(() => api.post(`/api/cloud/console/signups/${r.id}/retry`, {}), tt('Erneut versucht'))) && s.reload()}>
                      {tt('Erneut einrichten')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
</div>
      ) : (
        <Empty>{tt('Keine Anmeldungen.')}</Empty>
      )}
    </div>
  );
}

export function CloudConsole() {
  const tt = useT('x_agency');
  // ?tab=waitlist (the admins' push notification about a new waitlist entry links there)
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get('tab') || 'overview');
  return (
    <div className="cloud" data-tour="cloud-console">
      <div className="saas-subtabs">
        <Tabs
          tabs={[
            ['overview', tt('Übersicht')],
            ['customers', tt('Kunden')],
            ['settings', tt('Einstellungen')],
            ['legal', tt('Rechtliches')],
            ['signups', tt('Anmeldungen')],
            ['abuse', tt('Missbrauch')],
            ['waitlist', tt('Warteliste')],
          ]}
          value={tab}
          onChange={setTab}
        />
        <div className="actions">
          <a className="btn small secondary" href="/cloud" target="_blank" rel="noopener noreferrer">
            {tt('Preisseite')}
          </a>
          <a className="btn small secondary" href="/start" target="_blank" rel="noopener noreferrer">
            {tt('Anmeldeseite')}
          </a>
        </div>
      </div>
      {tab === 'overview' && <Overview go={setTab} />}
      {tab === 'customers' && <Customers />}
      {tab === 'settings' && <CloudSettingsForm />}
      {tab === 'legal' && <Legal />}
      {tab === 'signups' && <Signups />}
      {tab === 'abuse' && <Slot name="cloud.abuse" />}
      {tab === 'waitlist' && <Slot name="cloud.waitlist" />}
    </div>
  );
}

