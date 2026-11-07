import { useState } from 'react';
import { ago, api, d, money } from '../api';
import { Icon } from '../icons';
import { Badge, Check, CodeBox, Copy, Empty, Field, Input, Modal, Select, Spinner, Stat, Tabs, Textarea, act, confirmAsk, useLoad } from '../ui';
import { MoreFields } from '../areas/fields';
import { SAAS_STATUS } from './SaasBilling';
import { SortableGrid } from '../sortable/Sortable';
import { fmtNumber, useT } from '../i18n';

/**
 * Agentur → SaaS: sell sub-accounts to your own customers. Overview (MRR, statuses, churn,
 * renewals), plans (areas, limits, prices synced to Stripe), customer accounts (assign/change
 * plans with or without Stripe) and settings (agency Stripe, signup page, rebilling).
 */

const LIMIT_LABELS: [string, string][] = [
  ['contacts', 'Kontakte'],
  ['users', 'Nutzer'],
  ['funnels', 'Funnels & Websites'],
  ['courses', 'Kurse'],
  ['emails', 'E-Mails / Monat'],
  ['sms', 'SMS / Monat'],
  ['ai', 'KI-Aufrufe / Monat'],
];
const USAGE: [string, string][] = [
  ['emails', 'E-Mails'],
  ['sms', 'SMS'],
  ['ai', 'KI-Aufrufe'],
];
const EVENT_LABEL: Record<string, string> = {
  signup: 'Neue Anmeldung',
  subscribed: 'Abo gestartet',
  plan_assigned: 'Tarif vergeben',
  plan_changed: 'Tarif geändert',
  plan_removed: 'Tarif entfernt',
  past_due: 'Zahlung offen',
  paused: 'Pausiert',
  reactivated: 'Wieder aktiv',
  active: 'Aktiv',
  trialing: 'Testphase',
  canceled: 'Beendet',
  cancel_scheduled: 'Gekündigt zum Laufzeitende',
  cancel_undone: 'Kündigung zurückgenommen',
  usage_billed: 'Mehrverbrauch berechnet',
  checkout_link: 'Bezahllink erstellt',
  invite_accepted: 'Login eingerichtet',
  mail_failed: 'E-Mail fehlgeschlagen',
  snapshot_failed: 'Snapshot fehlgeschlagen',
};

export function StatusBadge({ status }: { status?: string | null }) {
  const tt = useT('x_agency');
  if (!status) return <Badge>{tt('kein Tarif')}</Badge>;
  const [label, tone] = SAAS_STATUS[status] ?? [status, 'gray'];
  return <Badge tone={tone}>{tt(label)}</Badge>;
}

const euros = (cents: number) => (cents ? String(cents / 100).replace('.', ',') : '');

// --- overview -------------------------------------------------------------------------

function Overview({ goSettings }: { goSettings: () => void }) {
  const tt = useT('x_agency');
  const o = useLoad(() => api.get('/api/saas/overview'), []);
  const x = o.data;
  if (!x) return <Spinner />;
  const cur = x.currency;
  const maxMrr = Math.max(1, ...x.plans.map((p: any) => p.mrr_cents));
  return (
    <>
      {!x.stripe_connected && (
        <div className="notice-warn">
          {tt('Agentur-Stripe ist noch nicht verbunden – Tarife lassen sich nur ohne Stripe vergeben.')}{' '}
          <a href="#" onClick={(e) => (e.preventDefault(), goSettings())}>
            {tt('Jetzt einrichten')}
          </a>
        </div>
      )}
      <SortableGrid id="saas.stats" className="stats">
        <Stat label={tt('MRR')} value={money(x.mrr_cents, cur)} sub={tt('ARR {money}', { money: money(x.arr_cents, cur) })} />
        <Stat label={tt('Aktive Abos')} value={x.counts.active} sub={tt('{new_30d} neu in 30 Tagen', { new_30d: x.new_30d })} />
        <Stat label={tt('Testphase')} value={x.counts.trialing} sub={tt('noch ohne Umsatz')} />
        <Stat label={tt('Zahlung offen')} value={x.counts.past_due + x.counts.paused} sub={tt('{paused} davon pausiert', { paused: x.counts.paused })} />
        <Stat label={tt('Churn (30 Tage)')} value={`${fmtNumber(Number(x.churn.rate_percent), { maximumFractionDigits: 1 })} %`} sub={tt('{lost_30d} beendet', { lost_30d: x.churn.lost_30d })} />
      </SortableGrid>
      <SortableGrid id="saas.cards" className="grid2 saas-grid">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{tt('Abos je Tarif')}</h3>
          {x.plans.length ? (
            <table className="t saas-plan-table">
              <thead>
                <tr>
                  <th>{tt('Tarif')}</th>
                  <th>{tt('Accounts')}</th>
                  <th>{tt('MRR')}</th>
                </tr>
              </thead>
              <tbody>
                {x.plans.map((p: any) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>
                      {p.count}
                      {p.trialing ? <span className="muted small"> {tt('({trialing} Test)', { trialing: p.trialing })}</span> : null}
                    </td>
                    <td style={{ width: '45%' }}>
                      <div className="saas-mrr" title={tt('{name}: {money} pro Monat', { name: p.name, money: money(p.mrr_cents, cur) })}>
                        <div className="saas-mrr-track">
                          <div className="saas-mrr-bar" style={{ width: `${Math.max(p.mrr_cents ? 3 : 0, Math.round((p.mrr_cents / maxMrr) * 100))}%` }} />
                        </div>
                        <span>{money(p.mrr_cents, cur)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>{tt('Noch keine Tarife.')}</Empty>
          )}
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{tt('Anstehende Verlängerungen (30 Tage)')}</h3>
          {x.renewals.length ? (
            <table className="t">
              <tbody>
                {x.renewals.map((r: any) => (
                  <tr key={r.location_id}>
                    <td className="nowrap">{d(r.date)}</td>
                    <td>
                      {r.name}
                      <div className="muted small">
                        {r.plan} · {r.interval === 'year' ? tt('jährlich') : tt('monatlich')}
                      </div>
                    </td>
                    <td className="nowrap">{money(r.amount_cents, r.currency)}</td>
                    <td>{r.ends ? <Badge tone="yellow">{tt('endet')}</Badge> : <StatusBadge status={r.status} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>{tt('Keine Verlängerungen in den nächsten 30 Tagen.')}</Empty>
          )}
        </div>
      </SortableGrid>
      <div className="card" style={{ marginTop: 14 }}>
        <h3 style={{ marginTop: 0 }}>{tt('Letzte Ereignisse')}</h3>
        {x.events.length ? (
          <ul className="saas-events">
            {x.events.map((e: any) => (
              <li key={e.id}>
                <span className="muted small nowrap">{ago(e.at)}</span>
                <strong>{EVENT_LABEL[e.type] ? tt(EVENT_LABEL[e.type]) : e.type}</strong>
                <span>{e.location_name ?? '–'}</span>
                <span className="muted small">{e.detail}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>{tt('Noch nichts passiert.')}</Empty>
        )}
      </div>
    </>
  );
}

// --- plans ----------------------------------------------------------------------------

function PlanEditor({ plan, settings, onClose, onSaved }: { plan?: any; settings: any; onClose: () => void; onSaved: () => void }) {
  const tt = useT('x_agency');
  const perms = useLoad(() => api.get<Record<string, string>>('/api/permissions'), []);
  const snaps = useLoad(() => api.get<any[]>('/api/snapshots'), []);
  const [f, setF] = useState<any>(() => ({
    name: plan?.name ?? '',
    description: plan?.description ?? '',
    price_month: euros(plan?.price_month_cents ?? 0),
    price_year: euros(plan?.price_year_cents ?? 0),
    trial_days: String(plan?.trial_days ?? 14),
    snapshot_id: plan?.snapshot_id ?? '',
    public: plan ? !!plan.public : true,
    active: plan ? !!plan.active : true,
    sort: String(plan?.sort ?? 0),
    features: plan?.features ?? ['dashboard', 'conversations', 'calendars', 'contacts', 'opportunities', 'funnels', 'forms', 'settings'],
    limits: Object.fromEntries(LIMIT_LABELS.map(([k]) => [k, plan?.limits?.[k] ?? ''])),
    overage: { emails: 'block', sms: 'block', ai: 'block', ...(plan?.overage ?? {}) },
    markup_percent: plan?.markup_percent ?? '',
  }));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const body = { ...f, trial_days: Number(f.trial_days || 0), sort: Number(f.sort || 0), markup_percent: f.markup_percent === '' ? null : Number(f.markup_percent) };
    const r = await act(() => (plan ? api.patch(`/api/saas/plans/${plan.id}`, body) : api.post('/api/saas/plans', body)), tt('Tarif gespeichert'));
    setBusy(false);
    if (r) onSaved();
  };
  const markup = f.markup_percent === '' ? settings.markup_percent : Number(f.markup_percent);
  const resale = (k: string) => {
    const c = (settings.unit_cost?.[k] ?? 0) * (1 + markup / 100);
    const two = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    return c >= 1 ? `${fmtNumber(c, two)} ct` : tt('{v} € je 1.000', { v: fmtNumber(c * 10, two) });
  };
  return (
    <Modal
      title={plan ? tt('Tarif „{name}“', { name: plan.name }) : tt('Neuer Tarif')}
      onClose={onClose}
      wide
      footer={
        <button className="btn" disabled={busy || !f.name} onClick={save}>
          {tt('Speichern')}{settings.connected ? tt(' & mit Stripe abgleichen') : ''}
        </button>
      }
    >
      <Field label={tt('Name *')}>
        <Input value={f.name} onChange={(v) => setF({ ...f, name: v })} autoFocus placeholder={tt('z. B. Starter')} />
      </Field>
      <Field label={tt('Beschreibung')} hint={tt('Steht auf der Anmeldeseite unter dem Preis')}>
        <Textarea value={f.description} onChange={(v) => setF({ ...f, description: v })} rows={2} />
      </Field>
      <div className="grid3">
        <Field label={tt('Preis pro Monat (€)')} hint={tt('leer = kein Monatspreis')}>
          <Input value={f.price_month} onChange={(v) => setF({ ...f, price_month: v })} inputMode="decimal" placeholder="49" />
        </Field>
        <Field label={tt('Preis pro Jahr (€)')} hint={tt('leer = kein Jahrespreis')}>
          <Input value={f.price_year} onChange={(v) => setF({ ...f, price_year: v })} inputMode="decimal" placeholder="490" />
        </Field>
        <Field label={tt('Testphase (Tage)')} hint={tt('0 = sofort zahlen')}>
          <Input type="number" min={0} max={365} value={f.trial_days} onChange={(v) => setF({ ...f, trial_days: v })} />
        </Field>
      </div>
      <div className="actions">
        <Check checked={f.public} onChange={(v) => setF({ ...f, public: v })} label={tt('Auf der Anmeldeseite zeigen (sonst nur per Link ?plan=…)')} />
        <Check checked={f.active} onChange={(v) => setF({ ...f, active: v })} label={tt('Aktiv (buchbar)')} />
      </div>

      <h4>{tt('Bereiche im Tarif')}</h4>
      {perms.data ? (
        <div className="grid3">
          {Object.entries(perms.data).map(([k, label]) => (
            <Check key={k} checked={k === 'settings' || f.features.includes(k)} onChange={(on) => k !== 'settings' && setF({ ...f, features: on ? [...f.features, k] : f.features.filter((x: string) => x !== k) })} label={k === 'settings' ? tt('{label} (immer)', { label: label }) : label} />
          ))}
        </div>
      ) : (
        <Spinner />
      )}

      <MoreFields id="saas-plan-limits" label={tt('Snapshot, Limits und Mehrverbrauch')} values={[f.snapshot_id, Object.values(f.limits).some((x) => x !== '' && x != null), Object.values(f.overage).includes('bill'), f.markup_percent]}>
      <Field label={tt('Snapshot für neue Konten')} hint={tt('Startpaket (Websites, Formulare, Workflows …); leer = Standard aus den Einstellungen')}>
        <Select value={f.snapshot_id} onChange={(v) => setF({ ...f, snapshot_id: v })} options={(snaps.data ?? []).map((s) => [s.id, s.name] as [string, string])} placeholder={tt('Standard')} />
      </Field>
      <h4>{tt('Limits')}</h4>
      <p className="muted small" style={{ marginTop: 0 }}>
        {tt('Leer = unbegrenzt. Kontakte, Nutzer, Funnels und Kurse werden beim Anlegen geprüft; E-Mails, SMS und KI-Aufrufe zählen je Kalendermonat.')}
      </p>
      <div className="grid3">
        {LIMIT_LABELS.map(([k, label]) => (
          <Field key={k} label={tt(label)}>
            <Input type="number" min={0} value={f.limits[k]} onChange={(v) => setF({ ...f, limits: { ...f.limits, [k]: v } })} placeholder={tt('unbegrenzt')} />
          </Field>
        ))}
      </div>

      <h4>{tt('Mehrverbrauch (E-Mails, SMS, KI)')}</h4>
      <div className="grid3">
        {USAGE.map(([k, label]) => (
          <Field key={k} label={tt('{label} über dem Limit', { label: tt(label) })} hint={f.overage[k] === 'bill' ? tt('Kunde zahlt {resale} je Stück', { resale: resale(k) }) : undefined}>
            <Select value={f.overage[k]} onChange={(v) => setF({ ...f, overage: { ...f.overage, [k]: v } })} options={[['block', tt('sperren')], ['bill', tt('weiterberechnen (Stripe)')]]} />
          </Field>
        ))}
      </div>
      <Field label={tt('Aufschlag auf deine Kosten (%)')} hint={tt('leer = Standard ({markup_percent} %). Deine Kosten je Stück stehen unter Einstellungen.', { markup_percent: settings.markup_percent })}>
        <Input type="number" min={0} value={f.markup_percent} onChange={(v) => setF({ ...f, markup_percent: v })} placeholder={String(settings.markup_percent)} />
      </Field>
      </MoreFields>
    </Modal>
  );
}

function Plans({ settings }: { settings: any }) {
  const tt = useT('x_agency');
  const plans = useLoad(() => api.get<any[]>('/api/saas/plans'), []);
  const [edit, setEdit] = useState<any>(null);
  if (!plans.data) return <Spinner />;
  return (
    <>
      <div className="actions" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <p className="muted" style={{ margin: 0 }}>
          {tt('Tarife bestimmen, welche Bereiche ein Kunden-Account sieht und wie viel er nutzen darf. Preise landen als Produkt + Preise in deinem Stripe-Konto.')}
        </p>
        <button className="btn" onClick={() => setEdit({})}>
          {tt('+ Neuer Tarif')}
        </button>
      </div>
      {plans.data.length ? (
        <div className="saas-plans">
          {plans.data.map((p) => (
            <div key={p.id} className={`card saas-plan-card${p.active ? '' : ' off'}`}>
              <div className="saas-plan-top">
                <h3>{p.name}</h3>
                <span>
                  {!p.active && <Badge>{tt('inaktiv')}</Badge>} {!p.public && <Badge tone="purple">{tt('versteckt')}</Badge>}
                </span>
              </div>
              <div className="saas-price">
                {p.free ? tt('Kostenlos') : p.price_month_cents ? money(p.price_month_cents, p.currency) : money(p.price_year_cents, p.currency)}
                {!p.free && <span className="muted"> / {p.price_month_cents ? tt('Monat') : tt('Jahr')}</span>}
              </div>
              <div className="muted small">
                {p.price_month_cents && p.price_year_cents ? tt('oder {money} / Jahr · ', { money: money(p.price_year_cents, p.currency) }) : ''}
                {p.trial_days ? tt('{trial_days} Tage Test', { trial_days: p.trial_days }) : tt('ohne Testphase')}
              </div>
              <ul className="saas-limits">
                {LIMIT_LABELS.filter(([k]) => p.limits?.[k] !== undefined && p.limits?.[k] !== null).map(([k, label]) => (
                  <li key={k}>
                    {fmtNumber(Number(p.limits[k]))} {tt(label)}
                    {USAGE.some(([u]) => u === k) && p.overage?.[k] === 'bill' ? tt(' (+ Mehrverbrauch)') : ''}
                  </li>
                ))}
                <li>{tt('{v} Bereiche', { v: p.features.length - 1 })}</li>
              </ul>
              <div className="saas-plan-foot">
                <span className="muted small">
                  {p.subscribers} {p.subscribers === 1 ? tt('Account') : tt('Accounts')} ·{' '}
                  {p.sync_error ? (
                    <span title={p.sync_error} style={{ color: 'var(--red)' }}>
                      {tt('Stripe-Fehler')}
                    </span>
                  ) : p.stripe_product_id ? (
                    tt('mit Stripe abgeglichen')
                  ) : settings.connected ? (
                    tt('noch nicht abgeglichen')
                  ) : (
                    tt('ohne Stripe')
                  )}
                </span>
                <span className="actions">
                  {settings.connected && (
                    <button className="btn small ghost" title={tt('Mit Stripe abgleichen')} onClick={() => act(() => api.post(`/api/saas/plans/${p.id}/sync`), tt('Abgeglichen')).then(() => plans.reload())}>
                      <Icon name="refresh" size={14} />
                    </button>
                  )}
                  <button className="btn small secondary" onClick={() => setEdit(p)}>
                    {tt('Bearbeiten')}
                  </button>
                  {!p.subscribers && (
                    <button className="btn small ghost" title={tt('Löschen')} onClick={() => confirmAsk(tt('Tarif „{name}“ löschen?', { name: p.name })) && act(() => api.del(`/api/saas/plans/${p.id}`), tt('Gelöscht')).then(() => plans.reload())}>
                      <Icon name="trash" size={14} />
                    </button>
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty action={<button className="btn" onClick={() => setEdit({})}>{tt('Ersten Tarif anlegen')}</button>}>{tt('Noch keine Tarife.')}</Empty>
      )}
      {edit && (
        <PlanEditor
          plan={edit.id ? edit : undefined}
          settings={settings}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            void plans.reload();
          }}
        />
      )}
    </>
  );
}

// --- accounts ---------------------------------------------------------------------------

function AccountEditor({ row, plans, onClose, onSaved }: { row: any; plans: any[]; onClose: () => void; onSaved: () => void }) {
  const tt = useT('x_agency');
  const sub = row.subscription;
  const stripeLive = sub?.billing === 'stripe' && sub.stripe_subscription && sub.status !== 'canceled';
  const [f, setF] = useState({ plan_id: sub?.plan_id ?? plans[0]?.id ?? '', interval: sub?.interval ?? 'month', status: sub?.billing === 'manual' ? sub.status : 'active', mode: 'manual', email: '' });
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<any>, ok: string, close = true) => {
    setBusy(true);
    const r = await act(fn, ok);
    setBusy(false);
    if (r && close) onSaved();
    return r;
  };
  const plan = plans.find((p) => p.id === f.plan_id);
  const intervals: string[] = plan?.intervals ?? ['month'];
  const iv = intervals.includes(f.interval) ? f.interval : intervals[0];
  return (
    <Modal title={tt('Tarif – {name}', { name: row.name })} onClose={onClose}>
      {sub && (
        <p>
          {tt('Jetzt:')} <strong>{row.plan?.name}</strong> <StatusBadge status={sub.status} /> {sub.billing === 'stripe' ? <Badge tone="blue">Stripe</Badge> : <Badge>{tt('ohne Stripe')}</Badge>}
          {sub.cancel_at_period_end ? <Badge tone="yellow">{tt('endet {d}', { d: d(sub.current_period_end) })}</Badge> : null}
        </p>
      )}
      <div className="grid2">
        <Field label={tt('Tarif')}>
          <Select value={f.plan_id} onChange={(v) => setF({ ...f, plan_id: v })} options={plans.map((p) => [p.id, p.name] as [string, string])} />
        </Field>
        <Field label={tt('Abrechnung')}>
          <Select value={iv} onChange={(v) => setF({ ...f, interval: v })} options={intervals.map((i) => [i, i === 'year' ? tt('jährlich') : tt('monatlich')] as [string, string])} />
        </Field>
      </div>
      {stripeLive ? (
        <>
          <p className="muted small">{tt('Läuft über Stripe: eine Tarif-Änderung stellt das Abo bei Stripe um (anteilige Verrechnung). Der Status kommt von Stripe.')}</p>
          <div className="actions">
            <button className="btn" disabled={busy} onClick={() => run(() => api.put(`/api/saas/locations/${row.location_id}`, { plan_id: f.plan_id, interval: iv }), tt('Tarif geändert'))}>
              {tt('Tarif ändern')}
            </button>
            {sub.cancel_at_period_end ? (
              <button className="btn secondary" disabled={busy} onClick={() => run(() => api.post(`/api/saas/locations/${row.location_id}/cancel`, { undo: true }), tt('Kündigung zurückgenommen'))}>
                {tt('Kündigung zurücknehmen')}
              </button>
            ) : (
              <button className="btn secondary" disabled={busy} onClick={() => confirmAsk(tt('Zum Ende des Zeitraums kündigen?')) && run(() => api.post(`/api/saas/locations/${row.location_id}/cancel`, {}), tt('Gekündigt'))}>
                {tt('Zum Laufzeitende kündigen')}
              </button>
            )}
            <button className="btn ghost" disabled={busy} onClick={() => confirmAsk(tt('Abo sofort beenden? Das Konto wird nur noch lesbar.')) && run(() => api.post(`/api/saas/locations/${row.location_id}/cancel`, { now: true }), tt('Beendet'))}>
              {tt('Sofort beenden')}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="actions" style={{ margin: '4px 0 10px' }}>
            <label className="check">
              <input type="radio" checked={f.mode === 'manual'} onChange={() => setF({ ...f, mode: 'manual' })} /> {tt('Ohne Stripe vergeben')}
            </label>
            <label className="check">
              <input type="radio" checked={f.mode === 'stripe'} onChange={() => setF({ ...f, mode: 'stripe' })} /> {tt('Stripe-Bezahllink an den Kunden')}
            </label>
          </div>
          {f.mode === 'manual' ? (
            <>
              <Field label="Status" hint={tt('z. B. „pausiert“ sperrt das Konto auf nur lesen')}>
                <Select value={f.status} onChange={(v) => setF({ ...f, status: v })} options={Object.entries(SAAS_STATUS).map(([k, [l]]) => [k, tt(l)] as [string, string])} />
              </Field>
              <div className="actions">
                <button className="btn" disabled={busy || !f.plan_id} onClick={() => run(() => api.put(`/api/saas/locations/${row.location_id}`, { plan_id: f.plan_id, interval: iv, status: f.status }), tt('Tarif gespeichert'))}>
                  {tt('Speichern')}
                </button>
                {sub && (
                  <button className="btn ghost" disabled={busy} onClick={() => confirmAsk(tt('Tarif entfernen? Dann gelten keine Limits mehr.')) && run(() => api.del(`/api/saas/locations/${row.location_id}`), tt('Tarif entfernt'))}>
                    {tt('Tarif entfernen')}
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <Field label={tt('E-Mail des Kunden')} hint={tt('füllt Stripe Checkout vor')}>
                <Input type="email" value={f.email} onChange={(v) => setF({ ...f, email: v })} placeholder={tt('kunde@firma.de')} />
              </Field>
              <button
                className="btn"
                disabled={busy || !f.plan_id}
                onClick={async () => {
                  const r = await run(() => api.post(`/api/saas/locations/${row.location_id}/checkout`, { plan_id: f.plan_id, interval: iv, email: f.email }), tt('Link erstellt'), false);
                  if (r?.url) setLink(r.url);
                }}
              >
                {tt('Bezahllink erstellen')}
              </button>
              {link && (
                <div style={{ marginTop: 10 }}>
                  <CodeBox text={link} />
                  <p className="muted small">{tt('Schick den Link an den Kunden. Sobald er bezahlt hat, läuft das Abo über Stripe und erscheint hier.')}</p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </Modal>
  );
}

function Accounts() {
  const tt = useT('x_agency');
  const rows = useLoad(() => api.get<any[]>('/api/saas/locations'), []);
  const plans = useLoad(() => api.get<any[]>('/api/saas/plans'), []);
  const signups = useLoad(() => api.get<any[]>('/api/saas/signups'), []);
  const [edit, setEdit] = useState<any>(null);
  const [q, setQ] = useState('');
  if (!rows.data || !plans.data) return <Spinner />;
  const list = rows.data.filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="actions" style={{ marginBottom: 12 }}>
        <Input value={q} onChange={setQ} placeholder={tt('Sub-Account suchen…')} style={{ maxWidth: 280 }} />
        <span className="muted small">{tt('Verbrauch: aktueller Monat')}</span>
      </div>
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th>{tt('Sub-Account')}</th>
              <th>{tt('Tarif')}</th>
              <th>Status</th>
              <th>{tt('Verlängerung')}</th>
              <th>{tt('E-Mails')}</th>
              <th>SMS</th>
              <th>{tt('KI')}</th>
              <th>{tt('MRR')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const lim = (k: string) => (r.limits?.[k] === null || r.limits?.[k] === undefined ? '' : ` / ${fmtNumber(Number(r.limits[k]))}`);
              return (
                <tr key={r.location_id}>
                  <td>{r.name}</td>
                  <td>
                    {r.plan?.name ?? <span className="muted">–</span>}
                    {r.subscription && <div className="muted small">{r.subscription.billing === 'stripe' ? 'Stripe' : tt('ohne Stripe')} · {r.subscription.interval === 'year' ? tt('jährlich') : tt('monatlich')}</div>}
                  </td>
                  <td>
                    {r.subscription ? <StatusBadge status={r.subscription.status} /> : <span className="muted">–</span>} {r.subscription?.cancel_at_period_end ? <Badge tone="yellow">{tt('gekündigt')}</Badge> : null}
                  </td>
                  <td className="nowrap">{r.subscription?.current_period_end ? d(r.subscription.current_period_end) : '–'}</td>
                  {['emails', 'sms', 'ai'].map((k) => (
                    <td key={k} className="nowrap small">
                      {fmtNumber(r.usage?.[k] ?? 0)}
                      <span className="muted">{lim(k)}</span>
                    </td>
                  ))}
                  <td className="nowrap">{r.mrr_cents ? money(r.mrr_cents) : '–'}</td>
                  <td>
                    <button className="btn small secondary" disabled={!plans.data!.length} onClick={() => setEdit(r)}>
                      {tt('Tarif')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {signups.data && signups.data.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3 style={{ marginTop: 0 }}>{tt('Anmeldungen über die Anmeldeseite')}</h3>
          <table className="t">
            <tbody>
              {signups.data.slice(0, 20).map((s) => (
                <tr key={s.id}>
                  <td className="nowrap muted small">{d(s.created_at)}</td>
                  <td>
                    {s.company}
                    <div className="muted small">{s.email}</div>
                  </td>
                  <td>{s.plan_name}</td>
                  <td>
                    <Badge tone={s.status === 'done' ? 'green' : s.status === 'failed' ? 'red' : 'gray'}>{s.status === 'done' ? tt('angelegt') : s.status === 'failed' ? tt('Fehler') : tt('wartet auf Zahlung')}</Badge>
                    {s.error && <div className="muted small">{s.error}</div>}
                  </td>
                  <td>
                    {s.status === 'done' && (
                      <button
                        className="btn small ghost"
                        onClick={async () => {
                          const r = await act(() => api.post(`/api/saas/signups/${s.id}/invite`), tt('Neue Einladung erstellt'));
                          if (r?.url) window.prompt(tt('Einladungslink (7 Tage gültig):'), r.url);
                        }}
                      >
                        {tt('Einladung neu')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && (
        <AccountEditor
          row={edit}
          plans={plans.data}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            void rows.reload();
          }}
        />
      )}
    </>
  );
}

// --- settings ---------------------------------------------------------------------------

const HOOK_EVENTS = ['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.paid', 'invoice.payment_failed'];

function Settings({ data, onChange }: { data: any; onChange: (s: any) => void }) {
  const tt = useT('x_agency');
  const snaps = useLoad(() => api.get<any[]>('/api/snapshots'), []);
  const locs = useLoad(() => api.get<any[]>('/api/saas/locations'), []);
  const [keys, setKeys] = useState({ secret_key: '', webhook_secret: '' });
  const [f, setF] = useState<any>(() => ({ ...data, unit_cost: { ...data.unit_cost } }));
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<any>(null);
  const save = async (body: any, ok = tt('Gespeichert')) => {
    setBusy(true);
    const r = await act(() => api.put('/api/saas/settings', body), ok);
    setBusy(false);
    if (r) {
      onChange(r);
      setF({ ...r, unit_cost: { ...r.unit_cost } });
    }
    return r;
  };
  return (
    <>
      <div className="card" style={{ maxWidth: 820 }}>
        <h2 style={{ marginTop: 0 }}>
          <Icon name="card" /> {tt('Agentur-Stripe')} {data.connected ? <Badge tone="green">{tt('verbunden')}</Badge> : <Badge>{tt('nicht verbunden')}</Badge>} {data.connected && <Badge tone={data.live ? 'blue' : 'yellow'}>{data.live ? tt('Live') : tt('Testmodus')}</Badge>}
        </h2>
        <p className="muted" style={{ marginTop: 0 }}>
          {tt('Dein eigenes Stripe-Konto für die Abos deiner Kunden – getrennt vom Stripe, das ein Sub-Account für seine eigenen Rechnungen nutzt.')}
        </p>
        {data.account && (
          <p>
            {tt('Konto:')} <strong>{data.account.name}</strong> <span className="muted small">{data.account.id} · {data.key_hint}</span>
          </p>
        )}
        <Field label={tt('Secret Key')} hint={tt('Stripe-Dashboard → Entwickler → API-Schlüssel (zum Ausprobieren sk_test_…)')}>
          <Input type="password" value={keys.secret_key} onChange={(v) => setKeys({ ...keys, secret_key: v.trim() })} placeholder={data.key_set ? tt('gespeichert ({key_hint}) – leer lassen zum Behalten', { key_hint: data.key_hint }) : tt('sk_live_… oder sk_test_…')} autoComplete="off" />
        </Field>
        <h3>Webhook {data.webhook_set ? <Badge tone="green">{tt('eingerichtet')}</Badge> : <Badge tone="yellow">{tt('fehlt')}</Badge>}</h3>
        <MoreFields id="saas-webhook" label={tt('Webhook einrichten')} values={[data.key_set && !data.webhook_set]}>
        <ol className="steps small">
          <li>{tt('Stripe → Entwickler → Webhooks → „Endpunkt hinzufügen“')}</li>
          <li>
            {tt('URL:')} <CodeBox text={data.webhook_url} />
          </li>
          <li>
            {tt('Ereignisse:')}{' '}
            {HOOK_EVENTS.map((e, i) => (
              <span key={e}>
                {i ? ', ' : ''}
                <code>{e}</code>
              </span>
            ))}
          </li>
          <li>{tt('Signing Secret (whsec_…) hier eintragen')}</li>
        </ol>
        <Field label={tt('Webhook Signing Secret')}>
          <Input type="password" value={keys.webhook_secret} onChange={(v) => setKeys({ ...keys, webhook_secret: v.trim() })} placeholder={data.webhook_set ? tt('gespeichert – leer lassen zum Behalten') : 'whsec_…'} autoComplete="off" />
        </Field>
        </MoreFields>
        <div className="actions">
          <button className="btn" disabled={busy || (!keys.secret_key && !keys.webhook_secret)} onClick={() => save(keys).then((r) => r && setKeys({ secret_key: '', webhook_secret: '' }))}>
            {tt('Speichern')}
          </button>
          <button className="btn secondary" disabled={busy || (!data.key_set && !keys.secret_key)} onClick={async () => setCheck(await act(() => api.post('/api/saas/settings/test', keys.secret_key ? { secret_key: keys.secret_key } : {})))}>
            {tt('Verbindung testen')}
          </button>
          {data.connected && (
            <button className="btn ghost" onClick={() => confirmAsk(tt('Agentur-Stripe trennen? Neue Abos und Bezahllinks gehen dann nicht mehr.')) && act(() => api.del('/api/saas/settings/stripe'), tt('Getrennt')).then((r) => r && onChange(r))}>
              {tt('Trennen')}
            </button>
          )}
        </div>
        {check && (
          <p className="small">
            <Badge tone="green">{tt('✓ Verbindung klappt')}</Badge> {check.account.name} ({check.live ? tt('Live') : tt('Testmodus')})
          </p>
        )}
      </div>

      <div className="card" style={{ maxWidth: 820 }}>
        <h2 style={{ marginTop: 0 }}>{tt('Anmeldeseite')}</h2>
        <Check checked={!!f.signup_enabled} onChange={(v) => setF({ ...f, signup_enabled: v })} label={tt('Anmeldeseite aktiv – Kunden buchen selbst einen Tarif')} />
        <Field label={tt('Adresse')} hint={tt('läuft auch auf deiner App-Domain aus dem White-Label')}>
          <div className="actions">
            <CodeBox text={data.signup_url} />
            <a className="btn small secondary" href="/signup" target="_blank" rel="noopener">
              {tt('Öffnen')}
            </a>
          </div>
        </Field>
        <Field label={tt('Überschrift')}>
          <Input value={f.signup_title} onChange={(v) => setF({ ...f, signup_title: v })} placeholder={tt('Name jetzt starten')} />
        </Field>
        <Field label={tt('Text unter der Überschrift')}>
          <Textarea value={f.signup_text} onChange={(v) => setF({ ...f, signup_text: v })} rows={2} />
        </Field>
        <MoreFields id="saas-signup" values={[f.terms_url, f.default_snapshot_id, f.mail_location_id, f.activate_workflows]}>
        <Field label={tt('Link zu deinen AGB')} hint={tt('dann muss der Kunde sie anhaken')}>
          <Input value={f.terms_url} onChange={(v) => setF({ ...f, terms_url: v })} placeholder="https://…" />
        </Field>
        <div className="grid2">
          <Field label={tt('Standard-Snapshot für neue Konten')} hint={tt('wenn der Tarif keinen eigenen hat')}>
            <Select value={f.default_snapshot_id} onChange={(v) => setF({ ...f, default_snapshot_id: v })} options={(snaps.data ?? []).map((s) => [s.id, s.name] as [string, string])} placeholder={tt('keiner (leeres Konto)')} />
          </Field>
          <Field label={tt('Einladungs-Mails senden über')} hint={tt('dessen E-Mail-Einstellungen (SMTP) werden genutzt')}>
            <Select value={f.mail_location_id} onChange={(v) => setF({ ...f, mail_location_id: v })} options={(locs.data ?? []).map((l) => [l.location_id, l.name] as [string, string])} placeholder={tt('den neuen Sub-Account')} />
          </Field>
        </div>
        <Check checked={!!f.activate_workflows} onChange={(v) => setF({ ...f, activate_workflows: v })} label={tt('Workflows aus dem Snapshot gleich aktivieren (sonst als Entwurf)')} />
        </MoreFields>
      </div>

      <div className="card" style={{ maxWidth: 820 }}>
        <h2 style={{ marginTop: 0 }}>{tt('Zahlungsverzug & Weiterberechnung')}</h2>
        <div className="grid2">
          <Field label={tt('Kulanzzeit bei offener Zahlung (Tage)')} hint={tt('danach wird das Konto pausiert (nur lesen)')}>
            <Input type="number" min={0} max={60} value={f.grace_days} onChange={(v) => setF({ ...f, grace_days: v })} />
          </Field>
        </div>
        <MoreFields id="saas-costs" label={tt('Aufschlag und deine Kosten')}>
        <div className="grid2">
          <Field label={tt('Standard-Aufschlag (%)')} hint={tt('auf deine Kosten für Mehrverbrauch')}>
            <Input type="number" min={0} value={f.markup_percent} onChange={(v) => setF({ ...f, markup_percent: v })} />
          </Field>
        </div>
        <div className="grid3">
          {USAGE.map(([k]) => (
            <Field key={k} label={k === 'emails' ? tt('Deine Kosten je E-Mail (Cent)') : k === 'ai' ? tt('Deine Kosten je KI-Aufruf (Cent)') : tt('Deine Kosten je SMS (Cent)')}>
              <Input value={String(f.unit_cost?.[k] ?? '').replace('.', ',')} onChange={(v) => setF({ ...f, unit_cost: { ...f.unit_cost, [k]: v } })} inputMode="decimal" />
            </Field>
          ))}
        </div>
        <p className="muted small">{tt('Mehrverbrauch eines Monats geht nach Monatsende als Rechnungsposten an die nächste Stripe-Rechnung des Kunden.')}</p>
        </MoreFields>
        <button
          className="btn"
          disabled={busy}
          onClick={() =>
            save({
              signup_enabled: f.signup_enabled,
              signup_title: f.signup_title,
              signup_text: f.signup_text,
              terms_url: f.terms_url,
              default_snapshot_id: f.default_snapshot_id,
              mail_location_id: f.mail_location_id,
              activate_workflows: f.activate_workflows,
              grace_days: Number(f.grace_days),
              markup_percent: Number(f.markup_percent),
              unit_cost: Object.fromEntries(USAGE.map(([k]) => [k, String(f.unit_cost?.[k] ?? 0).replace(',', '.')])),
            })
          }
        >
          {tt('Einstellungen speichern')}
        </button>
      </div>
    </>
  );
}

export function SaasAdmin() {
  const tt = useT('x_agency');
  const [tab, setTab] = useState('overview');
  const settings = useLoad(() => api.get('/api/saas/settings'), []);
  if (!settings.data) return <Spinner />;
  return (
    <>
      <div className="saas-subtabs" data-tour="saas-tabs">
        <Tabs
          tabs={[
            ['overview', tt('Übersicht')],
            ['plans', tt('Tarife')],
            ['accounts', tt('Kunden-Abos')],
            ['settings', tt('Einstellungen')],
          ]}
          value={tab}
          onChange={setTab}
        />
        {settings.data.signup_enabled && <Copy text={settings.data.signup_url} label={tt('Anmelde-Link kopieren')} />}
      </div>
      {tab === 'overview' && <Overview goSettings={() => setTab('settings')} />}
      {tab === 'plans' && <Plans settings={settings.data} />}
      {tab === 'accounts' && <Accounts />}
      {tab === 'settings' && <Settings data={settings.data} onChange={settings.setData} />}
    </>
  );
}
