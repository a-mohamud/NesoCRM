import { useEffect, useState, type ReactNode } from 'react';
import { api, d, money } from '../api';
import { Icon } from '../icons';
import { useSession } from '../session';
import { Badge, Empty, Field, Modal, Select, Spinner, Tabs, Textarea, act, navigate, toast, useLoad } from '../ui';
import { CloudClients, CloudTeam } from './CloudTeam';
import { MeterBar, PHASE_TONE, REASONS, legalDocName, type CloudMe, type Tenant } from './CloudKit';
import { CloudData } from './CloudData';
import { useT } from '../i18n';

/**
 * Einstellungen → Cloud-Konto: the customer's side of the hosted service. Overview with the fair-use meters and the
 * start checklist, plan and invoices, team, client accounts and white-label (Agentur), data export, support access and
 * deleting the account. Everything is for the signed-in customer's own tenant (the server never takes a tenant id).
 */

const METERS: [keyof Tenant['meters'], string, string][] = [
  ['emails', 'E-Mails diesen Monat', ''],
  ['sms', 'SMS diesen Monat', ''],
  ['ai', 'KI-Aufrufe diesen Monat', ''],
  ['storage_mb', 'Medien-Speicher', ' MB'],
];

function Checklist() {
  const tt = useT('x_agency');
  const o = useLoad(() => api.get<{ items: { key: string; label: string; hint: string; to: string; done: boolean }[]; done: number; total: number }>('/api/cloud/onboarding'), []);
  const x = o.data;
  if (!x || x.done === x.total) return null;
  return (
    <div className="card cloud-check" data-tour="cloud-checklist">
      <h3 style={{ marginTop: 0 }}>
        {tt('Los geht’s')} <span className="muted small">{tt('{done} von {total} erledigt', { done: x.done, total: x.total })}</span>
      </h3>
      <ul>
        {x.items.map((i) => (
          <li key={i.key} className={i.done ? 'done' : ''}>
            <Icon name={i.done ? 'ok' : 'pending'} size={18} />
            <div className="grow">
              <strong>{i.label}</strong>
              <div className="muted small">{i.hint}</div>
            </div>
            {!i.done && (
              <button className="btn small secondary" onClick={() => navigate(i.to)}>
                {tt('Öffnen')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Overview({ me, owner, onTab }: { me: CloudMe; owner: boolean; onTab: (t: string) => void }) {
  const tt = useT('x_agency');
  const t = me.tenant;
  const every = t.plan.interval === 'year' ? tt('Jahr') : tt('Monat');
  return (
    <>
      <div className="card" data-tour="cloud-plan">
        <div className="saas-plan-head">
          <div>
            <div className="muted small">{tt('Dein Tarif')}</div>
            <h2>
              {t.plan.name} <Badge tone={PHASE_TONE[t.phase] ?? 'gray'}>{tt(t.phase_label)}</Badge> {t.cancel_at_period_end && <Badge tone="yellow">{tt('gekündigt')}</Badge>}
            </h2>
            <p className="muted">{t.plan.key === 'solo' ? tt('Eine Person, alle Funktionen.') : t.plan.key === 'team' ? tt('Unbegrenzt Nutzer, alle Funktionen.') : tt('Unbegrenzt Nutzer und Kunden-Accounts, White-Label inklusive.')}</p>
          </div>
          <div className="saas-price">
            {t.comped ? tt('geschenkt') : money(t.plan.price_cents, t.plan.currency)}
            {!t.comped && <span className="muted"> / {every}</span>}
          </div>
        </div>
        <ul className="saas-facts">
          {t.phase === 'trial' && t.trial_end && <li>{tt('Testphase bis {d}', { d: d(t.trial_end) })}{t.billing === 'manual' ? tt(' – danach schreibgeschützt, solange kein Tarif gewählt ist') : ''}</li>}
          {t.current_period_end && t.billing === 'stripe' && <li>{t.cancel_at_period_end ? tt('Endet am {d}', { d: d(t.current_period_end) }) : tt('Nächste Verlängerung: {d}', { d: d(t.current_period_end) })}</li>}
          {t.comped && t.comp_until && <li>{tt('Geschenkt bis {d}', { d: d(t.comp_until) })}</li>}
          {t.phase === 'past_due' && t.grace_until && <li>{tt('Bitte Zahlung bis {d} erledigen – danach wird das Konto schreibgeschützt.', { d: d(t.grace_until) })}</li>}
          {t.read_only && <li>{tt('Das Konto ist schreibgeschützt: alles bleibt les- und exportierbar.')}</li>}
          {t.deletion && <li>{tt('Löschung geplant am {d}.', { d: d(t.deletion.at) })}</li>}
          <li>{t.entitlements.users === null ? tt('Unbegrenzt Nutzer') : tt('{users} von {users2} Nutzer', { users: t.counts.users, users2: t.entitlements.users })}{t.entitlements.client_accounts ? tt(' · {clients} Kunden-Accounts', { clients: t.counts.clients }) : ''}</li>
          {t.subdomain && <li>{tt('Deine Adresse:')} <span className="mono">{t.subdomain}</span></li>}
        </ul>
        {owner && (
          <div className="actions">
            <button className="btn secondary" onClick={() => onTab('plan')}>
              <Icon name="card" /> {tt('Tarif & Rechnungen')}
            </button>
          </div>
        )}
      </div>
      <Checklist />
      <div className="card" data-tour="cloud-meters">
        <h3 style={{ marginTop: 0 }}>{tt('Fair Use – dein Verbrauch')}</h3>
        <p className="muted small" style={{ marginTop: 0 }}>{tt('Alle Funktionen sind in jedem Tarif frei. Nur teure Ressourcen haben Grenzen, pro Sub-Account und Monat.')}</p>
        <div className="saas-meters">
          {METERS.map(([k, l, u]) => (
            <MeterBar key={k} label={tt(l)} m={t.meters[k]} unit={u} />
          ))}
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>{tt('Mit eigenem KI-Schlüssel (Einstellungen → KI-Anbieter) rechnest du KI direkt mit deinem Anbieter ab.')}</p>
      </div>
      {me.support_email && (
        <p className="muted small">
          {tt('Fragen zu Tarif oder Rechnung?')} <a href={`mailto:${me.support_email}`}>{me.support_email}</a>
          {me.status_url && (
            <>
              {' '}
              · <a href={me.status_url} target="_blank" rel="noopener noreferrer">Status</a>
            </>
          )}
        </p>
      )}
    </>
  );
}

// --- plan & invoices --------------------------------------------------------------------------------

interface Card {
  key: 'solo' | 'team' | 'agency';
  name: string;
  tagline: string;
  price_month_cents: number;
  price_year_cents: number;
  users: number | null;
  highlights: string[];
}

function CancelModal({ t, onClose, onDone }: { t: Tenant; onClose: () => void; onDone: () => void }) {
  const tt = useT('x_agency');
  const [reason, setReason] = useState('price');
  const [comment, setComment] = useState('');
  return (
    <Modal
      title={tt('Abo kündigen')}
      onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={onClose}>
            {tt('Abbrechen')}
          </button>
          <button className="btn danger" onClick={async () => (await act(() => api.post('/api/cloud/cancel', { reason, comment }), tt('Gekündigt'))) && (onDone(), onClose())}>
            {tt('Zum Ende des Zeitraums kündigen')}
          </button>
        </>
      }
    >
      <p>
        {tt('Dein Abo „{name}“ läuft bis', { name: t.plan.name })} {d(t.current_period_end ?? t.trial_end) || tt('zum Ende des Zeitraums')} {tt('weiter, danach ist das Konto schreibgeschützt. Du kannst die Kündigung bis dahin zurücknehmen und jederzeit alle Daten exportieren.')}
      </p>
      <Field label={tt('Warum kündigst du? (hilft uns, besser zu werden)')}>
        <Select value={reason} onChange={setReason} options={REASONS.map(([k, l]) => [k, tt(l)] as [string, string])} />
      </Field>
      <Field label={tt('Möchtest du etwas ergänzen? (optional)')}>
        <Textarea value={comment} onChange={setComment} maxLength={1000} />
      </Field>
    </Modal>
  );
}

function PlanTab({ me, reload }: { me: CloudMe; reload: () => void }) {
  const tt = useT('x_agency');
  const t = me.tenant;
  const plans = useLoad(() => api.get<{ plans: Card[]; yearly_discount_percent: number; price_note: string }>('/api/cloud/plans'), []);
  const invoices = useLoad(() => api.get<{ items: { id: string; number: string; status: string; amount_cents: number; currency: string; created: string; hosted_url: string; pdf_url: string }[]; portal: boolean }>('/api/cloud/invoices'), []);
  const [interval, setInterval] = useState<'month' | 'year'>(t.plan.interval);
  const [cancel, setCancel] = useState(false);
  if (!plans.data) return <Spinner />;
  const note = plans.data.price_note === 'net' ? tt('zzgl. USt.') : plans.data.price_note === 'gross' ? tt('inkl. USt.') : '';
  const choose = async (c: Card) => {
    if (t.billing === 'stripe' && !t.read_only) {
      if (c.key === t.plan.key && interval === t.plan.interval) return;
      if (!window.confirm(tt('Auf „{name}“ ({interval}) wechseln? Der Preis wird anteilig verrechnet.', { name: c.name, interval: interval === 'year' ? tt('jährlich') : tt('monatlich') }))) return;
      if (await act(() => api.post('/api/cloud/plan', { plan: c.key, interval }), tt('Tarif geändert'))) reload();
    } else if (t.billing === 'manual' && !t.read_only && t.status !== 'canceled' && t.stripe === false && t.phase !== 'comped') {
      // Trial without payment data: switch the plan first, paying is the next step.
      if (c.key !== t.plan.key && (await act(() => api.post('/api/cloud/plan', { plan: c.key, interval }), tt('Tarif geändert')))) reload();
    } else if (t.phase === 'comped') {
      toast(tt('Dein Tarif ist geschenkt – Änderungen macht der Anbieter.'));
    }
  };
  const subscribe = async (c: Card) => {
    const r = await act(() => api.post<{ url: string }>('/api/cloud/subscribe', { plan: c.key, interval }));
    if (r?.url) window.location.href = r.url;
  };
  const needsSubscribe = (t.billing === 'manual' && t.phase !== 'comped') || (t.phase === 'canceled' && !t.deletion);
  return (
    <>
      <div className="cloud-interval" role="group" aria-label={tt('Abrechnung')}>
        <button className={interval === 'month' ? 'on' : ''} onClick={() => setInterval('month')}>
          {tt('Monatlich')}
        </button>
        <button className={interval === 'year' ? 'on' : ''} onClick={() => setInterval('year')}>
          {tt('Jährlich')} {plans.data.yearly_discount_percent > 0 && <Badge tone="green">-{plans.data.yearly_discount_percent} %</Badge>}
        </button>
      </div>
      <div className="cloud-plans" data-tour="cloud-plans">
        {plans.data.plans.map((c) => {
          const current = c.key === t.plan.key;
          const price = interval === 'year' ? Math.round(c.price_year_cents / 12) : c.price_month_cents;
          return (
            <div key={c.key} className={`card cloud-plan${current ? ' current' : ''}`}>
              <h3>
                {c.name} {current && <Badge tone="blue">{tt('aktuell')}</Badge>}
              </h3>
              <p className="muted small">{c.tagline}</p>
              <div className="cloud-price">
                {money(price)}
                <span className="muted"> {tt('/ Monat {note}', { note: note })}</span>
              </div>
              {interval === 'year' && <div className="muted small">{tt('{money} pro Jahr', { money: money(c.price_year_cents) })}</div>}
              <ul>
                {c.highlights.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
              {needsSubscribe ? (
                <button className="btn" onClick={() => subscribe(c)}>
                  {current ? tt('Jetzt abonnieren') : tt('{name} abonnieren', { name: c.name })}
                </button>
              ) : (
                <button className={`btn${current && interval === t.plan.interval ? ' secondary' : ''}`} disabled={(current && interval === t.plan.interval) || t.read_only} onClick={() => choose(c)}>
                  {current && interval === t.plan.interval ? tt('Dein Tarif') : current ? tt('Intervall ändern') : tt('Wechseln')}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="actions" style={{ margin: '14px 0' }}>
        {t.stripe && (
          <button
            className="btn secondary"
            onClick={async () => {
              const r = await act(() => api.post<{ url: string }>('/api/cloud/portal', {}));
              if (r?.url) window.location.href = r.url;
            }}
          >
            <Icon name="card" /> {tt('Zahlungsmethode & Rechnungsadresse')}
          </button>
        )}
        {t.cancel_at_period_end ? (
          <button className="btn secondary" onClick={async () => (await act(() => api.post('/api/cloud/cancel', { undo: true }), tt('Abo läuft weiter'))) && reload()}>
            {tt('Kündigung zurücknehmen')}
          </button>
        ) : (
          t.status !== 'canceled' && (
            <button className="btn ghost" onClick={() => setCancel(true)}>
              {tt('Abo kündigen')}
            </button>
          )
        )}
      </div>
      <div className="card" data-tour="cloud-invoices">
        <h3 style={{ marginTop: 0 }}>{tt('Rechnungen')}</h3>
        {invoices.data?.items.length ? (
          <div className="table-wrap">
<table className="t">
            <thead>
              <tr>
                <th>{tt('Nummer')}</th>
                <th>{tt('Datum')}</th>
                <th>{tt('Betrag')}</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invoices.data.items.map((i) => (
                <tr key={i.id}>
                  <td>{i.number || '–'}</td>
                  <td>{d(i.created)}</td>
                  <td>{money(i.amount_cents, i.currency)}</td>
                  <td>{i.status === 'paid' ? <Badge tone="green">{tt('bezahlt')}</Badge> : i.status === 'open' ? <Badge tone="yellow">{tt('offen')}</Badge> : <Badge>{i.status}</Badge>}</td>
                  <td className="nowrap">
                    {i.hosted_url && (
                      <a href={i.hosted_url} target="_blank" rel="noopener noreferrer">
                        {tt('Ansehen')}
                      </a>
                    )}{' '}
                    {i.pdf_url && (
                      <a href={i.pdf_url} target="_blank" rel="noopener noreferrer">
                        PDF
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
</div>
        ) : (
          <Empty>{t.stripe ? tt('Noch keine Rechnung – die erste kommt nach der Testphase.') : tt('Sobald du ein Abo abschließt, erscheinen deine Rechnungen hier.')}</Empty>
        )}
      </div>
      {cancel && <CancelModal t={t} onClose={() => setCancel(false)} onDone={reload} />}
    </>
  );
}

// --- the page -----------------------------------------------------------------------------------------

/** `fallback`: shown to sub-accounts that are no cloud customer (e.g. the operator's own, or a SaaS customer of an agency). */
export function CloudAccount({ fallback }: { fallback?: ReactNode }) {
  const tt = useT('x_agency');
  const session = useSession();
  const me = useLoad(() => api.get<CloudMe>('/api/cloud/me'), [session.locationId]);
  const q = new URLSearchParams(location.search).get('tab');
  const [tab, setTab] = useState(q ?? 'overview');
  const m = me.data;
  // After paying at Stripe the customer comes back with ?abo=ok&session_id=…: take the subscription over at once.
  useEffect(() => {
    const sid = new URLSearchParams(location.search).get('session_id');
    if (!sid || !m || m.role !== 'owner') return;
    void api.post('/api/cloud/subscribe/confirm', { session_id: sid }).then(() => {
      history.replaceState(null, '', location.pathname);
      void me.reload();
      void session.reload();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!m]);
  if (!m) return me.loading ? <Spinner /> : (fallback ?? <Empty>{tt('Dieses Konto gehört zu keinem Cloud-Tarif.')}</Empty>);
  if (!m.customer) return <>{fallback ?? <Empty>{tt('Dieses Konto gehört zu keinem Cloud-Tarif.')}</Empty>}</>;
  if (m.limited) return <Empty>{m.read_only ? tt('Dieser Kunden-Account ist schreibgeschützt.') : tt('Die Verwaltung deines Kunden-Accounts liegt bei deiner Agentur.')}</Empty>;
  const t = m.tenant;
  const owner = m.role === 'owner';
  const tabs: [string, string][] = [
    ['overview', tt('Übersicht')],
    ...(owner ? ([['plan', tt('Tarif & Rechnungen')]] as [string, string][]) : []),
    ['team', tt('Team')],
    ...(t.entitlements.client_accounts ? ([['clients', tt('Kunden & White-Label')]] as [string, string][]) : []),
    ...(owner ? ([['data', tt('Daten & Konto')]] as [string, string][]) : []),
  ];
  const reload = () => {
    void me.reload();
    void session.reload();
  };
  const active = tabs.some(([k]) => k === tab) ? tab : 'overview';
  return (
    <div className="cloud" data-tour="cloud-account">
      {t.deletion && (
        <div className="saas-banner error" role="alert">
          <Icon name="lock" size={18} />
          <span className="grow">
            {tt('Dein Konto wird am {d} gelöscht.', { d: d(t.deletion.at) })}
            {t.deletion.reason === 'self' ? tt(' Du hast die Löschung angefordert.') : tt(' Exportiere vorher deine Daten – oder schließe ein Abo ab.')}
          </span>
          {owner && t.deletion.reason === 'self' && (
            <button className="btn small secondary" onClick={async () => (await act(() => api.post('/api/cloud/delete/undo', {}), tt('Löschung zurückgenommen'))) && reload()}>
              {tt('Löschung zurücknehmen')}
            </button>
          )}
          {owner && t.deletion.reason !== 'self' && (
            <button className="btn small secondary" onClick={() => setTab('data')}>
              {tt('Daten exportieren')}
            </button>
          )}
        </div>
      )}
      {owner && !!m.legal.pending.length && (
        <div className="saas-banner info" role="status">
          <Icon name="shield" size={18} />
          <span className="grow">{tt('Unsere Bedingungen wurden aktualisiert (')}{m.legal.pending.map((p) => legalDocName(tt, p.doc)).join(', ')}{tt('). Bitte sieh sie dir an und bestätige.')}</span>
          <a href="/cloud/legal/agb" target="_blank" rel="noopener noreferrer">
            {tt('Lesen')}
          </a>
          <button className="btn small" onClick={async () => (await act(() => api.post('/api/cloud/legal/accept', {}), tt('Danke'))) && reload()}>
            {tt('Bestätigen')}
          </button>
        </div>
      )}
      <Tabs tabs={tabs} value={active} onChange={setTab} />
      {active === 'overview' && <Overview me={m} owner={owner} onTab={setTab} />}
      {active === 'plan' && owner && <PlanTab me={m} reload={reload} />}
      {active === 'team' && <CloudTeam me={m} owner={owner} reload={reload} />}
      {active === 'clients' && <CloudClients me={m} owner={owner} reload={reload} />}
      {active === 'data' && owner && <CloudData me={m} reload={reload} />}
    </div>
  );
}
