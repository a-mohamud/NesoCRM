import { api, d, money } from '../api';
import { Icon } from '../icons';
import { useSession } from '../session';
import { Badge, Link, Spinner, act, confirmAsk, useLoad } from '../ui';
import { useT } from '../i18n';

/**
 * SaaS mode, sub-account side: the plan state the shell needs (hidden areas, billing banner)
 * and the "Abo & Rechnung" settings tab with usage, limits and the Stripe customer portal.
 */

export interface SaasAccount {
  plan: null | { id: string; name: string; description: string; currency: string; price_cents: number; interval: 'month' | 'year'; features: string[]; limits: Record<string, number | null>; overage: Record<string, string> };
  status?: 'trialing' | 'active' | 'past_due' | 'paused' | 'canceled';
  status_label?: string;
  billing?: 'stripe' | 'manual';
  current_period_end?: string | null;
  trial_end?: string | null;
  cancel_at_period_end?: boolean;
  grace_until?: string | null;
  read_only?: boolean;
  usage?: Record<string, number>;
  counts?: Record<string, number>;
  disabled_areas?: { key: string; label: string }[];
  blocked: string[];
  banner: null | { tone: 'info' | 'warn' | 'error'; text: string; action?: 'portal' | 'undo_cancel' };
  portal?: boolean;
  support_email?: string;
}

/** The current sub-account's plan state (null when it can't be read). */
export async function loadSaasAccount(): Promise<SaasAccount | null> {
  try {
    return await api.get<SaasAccount>('/api/saas/account');
  } catch {
    return null;
  }
}

export const SAAS_STATUS: Record<string, [string, 'green' | 'blue' | 'yellow' | 'red' | 'gray']> = {
  active: ['aktiv', 'green'],
  trialing: ['Testphase', 'blue'],
  past_due: ['Zahlung offen', 'yellow'],
  paused: ['pausiert', 'red'],
  canceled: ['beendet', 'gray'],
};

async function openPortal() {
  const r = await act(() => api.post<{ url: string }>('/api/saas/account/portal'));
  if (r?.url) window.location.href = r.url;
}

/** Billing banner above every page of a sub-account (past due, paused, ending, trial ending). */
export function SaasBanner({ account, onChange }: { account?: SaasAccount | null; onChange?: () => void }) {
  const tt = useT('x_agency');
  const b = account?.banner;
  if (!b) return null;
  return (
    <div className={`saas-banner ${b.tone}`} role={b.tone === 'info' ? 'status' : 'alert'}>
      <Icon name={b.tone === 'info' ? 'pending' : b.tone === 'warn' ? 'card' : 'lock'} size={18} />
      <span className="grow">{b.text}</span>
      {b.action === 'portal' && (
        <button className="btn small" onClick={openPortal}>
          {tt('Zahlung aktualisieren')}
        </button>
      )}
      {b.action === 'undo_cancel' && (
        <button className="btn small secondary" onClick={() => act(() => api.post('/api/saas/account/cancel', { undo: true }), tt('Abo läuft weiter')).then((r) => r && onChange?.())}>
          {tt('Kündigung zurücknehmen')}
        </button>
      )}
      {b.action !== 'portal' && b.tone !== 'info' && <Link to="settings/subscription">{tt('Abo & Rechnung')}</Link>}
    </div>
  );
}

/** Shown instead of a page the plan doesn't include. */
export function PlanLocked() {
  const tt = useT('x_agency');
  return (
    <div className="card plan-locked">
      <Icon name="lock" size={28} />
      <h2>{tt('Nicht in deinem Tarif')}</h2>
      <p className="muted">{tt('Dieser Bereich ist in deinem aktuellen Tarif nicht enthalten. Mit einem größeren Tarif schaltest du ihn frei.')}</p>
      <Link to="settings/subscription" className="btn">
        {tt('Tarif ansehen')}
      </Link>
    </div>
  );
}

const METERS: [key: string, label: string, monthly: boolean][] = [
  ['contacts', 'Kontakte', false],
  ['users', 'Nutzer', false],
  ['funnels', 'Funnels & Websites', false],
  ['courses', 'Kurse', false],
  ['emails', 'E-Mails diesen Monat', true],
  ['sms', 'SMS diesen Monat', true],
  ['ai', 'KI-Aufrufe diesen Monat', true],
];

function Meter({ label, used, limit, billed }: { label: string; used: number; limit: number | null | undefined; billed: boolean }) {
  const tt = useT('x_agency');
  const unlimited = limit === null || limit === undefined;
  const pct = unlimited ? 0 : limit === 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));
  const over = !unlimited && used >= (limit ?? 0);
  return (
    <div className="saas-meter">
      <div className="saas-meter-head">
        <span>{label}</span>
        <strong>
          {used.toLocaleString('de-DE')}
          <span className="muted"> / {unlimited ? 'unbegrenzt' : limit!.toLocaleString('de-DE')}</span>
        </strong>
      </div>
      {!unlimited && (
        <div className={`bar${over ? ' full' : pct >= 80 ? ' high' : ''}`} title={`${pct} %`}>
          <div style={{ width: `${pct}%` }} />
        </div>
      )}
      {over && <small className="muted">{billed ? tt('Darüber hinaus wird nach Verbrauch abgerechnet.') : tt('Limit erreicht – für mehr bitte den Tarif wechseln.')}</small>}
    </div>
  );
}

/** Einstellungen → Abo & Rechnung. */
export function SubscriptionSettings() {
  const tt = useT('x_agency');
  const session = useSession();
  const acc = useLoad(() => api.get<SaasAccount>('/api/saas/account'), []);
  const a = acc.data;
  if (!a) return <Spinner />;
  if (!a.plan) return <p className="muted">{tt('Für diesen Sub-Account ist kein Tarif hinterlegt.')}</p>;
  const refresh = async () => {
    acc.reload();
    await session.reload();
  };
  const [label, tone] = SAAS_STATUS[a.status ?? 'active'];
  const every = a.plan.interval === 'year' ? 'Jahr' : 'Monat';
  const cancel = async () => {
    if (!confirmAsk(tt('Abo „{name}“ zum Ende des Zeitraums{v} kündigen? Bis dahin läuft alles weiter.', { name: a.plan!.name, v: a.current_period_end ? ` (${d(a.current_period_end)})` : '' }))) return;
    if (await act(() => api.post('/api/saas/account/cancel'), tt('Gekündigt'))) await refresh();
  };
  return (
    <div className="saas-billing">
      <div className="card">
        <div className="saas-plan-head">
          <div>
            <div className="muted small">{tt('Dein Tarif')}</div>
            <h2>
              {a.plan.name} <Badge tone={tone}>{label}</Badge> {a.cancel_at_period_end && <Badge tone="yellow">{tt('gekündigt')}</Badge>}
            </h2>
            {a.plan.description && <p className="muted">{a.plan.description}</p>}
          </div>
          <div className="saas-price">
            {a.plan.price_cents ? (
              <>
                {money(a.plan.price_cents, a.plan.currency)}
                <span className="muted"> / {every}</span>
              </>
            ) : (
              tt('Kostenlos')
            )}
          </div>
        </div>
        <ul className="saas-facts">
          {a.status === 'trialing' && a.trial_end && <li>{tt('Testphase bis {d}', { d: d(a.trial_end) })}</li>}
          {a.current_period_end && <li>{a.cancel_at_period_end ? tt('Endet am {d}', { d: d(a.current_period_end) }) : tt('Nächste Verlängerung: {d}', { d: d(a.current_period_end) })}</li>}
          {a.status === 'past_due' && a.grace_until && <li>{tt('Bitte Zahlung bis {d} erledigen – danach wird das Konto pausiert.', { d: d(a.grace_until) })}</li>}
          {a.read_only && <li>{tt('Das Konto ist nur lesbar, bis die Zahlung da ist.')}</li>}
          <li>{a.billing === 'stripe' ? tt('Abrechnung über Stripe (Karte, SEPA …)') : tt('Abrechnung direkt über deine Agentur')}</li>
        </ul>
        <div className="actions">
          {a.portal ? (
            <>
              <button className="btn" onClick={openPortal}>
                <Icon name="card" /> {tt('Zahlung & Rechnungen verwalten')}
              </button>
              {a.cancel_at_period_end ? (
                <button className="btn secondary" onClick={() => act(() => api.post('/api/saas/account/cancel', { undo: true }), tt('Abo läuft weiter')).then((r) => r && refresh())}>
                  {tt('Kündigung zurücknehmen')}
                </button>
              ) : (
                a.status !== 'canceled' && (
                  <button className="btn ghost" onClick={cancel}>
                    {tt('Abo kündigen')}
                  </button>
                )
              )}
            </>
          ) : (
            <p className="muted small" style={{ margin: 0 }}>
              {tt('Fragen zu Tarif oder Rechnung?')} {a.support_email ? <a href={`mailto:${a.support_email}`}>{a.support_email}</a> : tt('Bitte wende dich an deine Agentur.')}
            </p>
          )}
        </div>
        {a.portal && <p className="muted small">{tt('Im Stripe-Kundenportal änderst du Zahlungsmethode und Rechnungsadresse und lädst alle Rechnungen herunter.')}</p>}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{tt('Verbrauch & Limits')}</h3>
        <div className="saas-meters">
          {METERS.filter(([k]) => (k === 'funnels' || k === 'courses' ? a.plan!.features.includes(k) : true)).map(([k, l, monthly]) => (
            <Meter key={k} label={l} used={(monthly ? a.usage?.[k] : a.counts?.[k]) ?? 0} limit={a.plan!.limits[k]} billed={a.plan!.overage[k] === 'bill'} />
          ))}
        </div>
      </div>

      {!!a.disabled_areas?.length && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{tt('Nicht in deinem Tarif')}</h3>
          <div className="saas-locked-list">
            {a.disabled_areas.map((x) => (
              <span key={x.key}>
                <Icon name="lock" size={14} /> {x.label}
              </span>
            ))}
          </div>
          <p className="muted small" style={{ marginBottom: 0 }}>
            {tt('Für diese Bereiche')} {a.support_email ? <a href={`mailto:${a.support_email}?subject=${encodeURIComponent('Tarif-Upgrade')}`}>{tt('frag nach einem größeren Tarif')}</a> : tt('frag deine Agentur nach einem größeren Tarif')}.
          </p>
        </div>
      )}
    </div>
  );
}
