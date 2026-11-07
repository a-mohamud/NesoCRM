import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, dt, money } from '../api';
import { Icon } from '../icons';
import { Badge, Check, Empty, Field, Input, Link, Select, Spinner, Stat, act, confirmAsk, useLoad } from '../ui';
import { SignupLink } from '../referrals';
import { SortableGrid } from '../sortable/Sortable';
import { useT } from '../i18n';

/** Ads reporting: spend per campaign from Meta / Google joined with attribution (CPL, ROAS), and the account connections. */

export const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Date range with quick presets; shared by the report and the ads tab. */
export function RangePicker({ from, to, onChange, children }: { from: string; to: string; onChange: (from: string, to: string) => void; children?: ReactNode }) {
  const tt = useT('x_integrations');
  const preset = (days: number) => onChange(ymd(new Date(Date.now() - (days - 1) * 864e5)), ymd(new Date()));
  return (
    <div className="row attr-filters" data-tour="range-picker">
      <div style={{ width: 150 }}>
        <Field label={tt('Von')}>
          <Input type="date" value={from} onChange={(v) => v && onChange(v, to)} />
        </Field>
      </div>
      <div style={{ width: 150 }}>
        <Field label={tt('Bis')}>
          <Input type="date" value={to} onChange={(v) => v && onChange(from, v)} />
        </Field>
      </div>
      <div className="actions attr-presets">
        <button className="btn small secondary" onClick={() => preset(7)}>{tt('7 Tage')}</button>
        <button className="btn small secondary" onClick={() => preset(30)}>{tt('30 Tage')}</button>
        <button className="btn small secondary" onClick={() => preset(90)}>{tt('90 Tage')}</button>
        <button className="btn small secondary" onClick={() => onChange(`${new Date().getFullYear()}-01-01`, ymd(new Date()))}>{tt('Jahr')}</button>
      </div>
      {children}
    </div>
  );
}

const PLATFORM: Record<string, string> = { meta: 'Meta', google: 'Google' };
const pct = (v: number | null) => (v === null || v === undefined ? '–' : `${v.toLocaleString('de-DE', { maximumFractionDigits: 2 })} %`);
const roas = (v: number | null) => (v === null || v === undefined ? '–' : `${v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`);
const int = (v: number) => (v || 0).toLocaleString('de-DE');

/** Spend per day: one series, columns from one baseline, value on the tallest, hover title on every day. */
function SpendChart({ days }: { days: { date: string; spend_cents: number; clicks: number }[] }) {
  const tt = useT('x_integrations');
  // Drawn at the card's real width, so text never scales and columns keep their 2px gap.
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(280, Math.floor(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [days.length >= 2]);
  if (days.length < 2) return null;
  const h = 150;
  const top = 18;
  const base = h - 20;
  const max = Math.max(1, ...days.map((d) => d.spend_cents));
  const slot = w / days.length;
  const bw = Math.min(24, Math.max(2, slot - 2));
  const peak = days.reduce((a, b) => (b.spend_cents > a.spend_cents ? b : a), days[0]);
  const day = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  return (
    <div className="card ads-chart">
      <h2 style={{ marginBottom: 2 }}>{tt('Ausgaben pro Tag')}</h2>
      <div ref={box}>
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={tt('Ausgaben pro Tag vom {day} bis {day2}, höchster Tag {day3} mit {money}', { day: day(days[0].date), day2: day(days[days.length - 1].date), day3: day(peak.date), money: money(peak.spend_cents) })}>
        <line x1="0" x2={w} y1={base} y2={base} stroke="var(--line)" strokeWidth="1" />
        {days.map((d, i) => {
          const bh = Math.max(d.spend_cents ? 2 : 0, ((base - top) * d.spend_cents) / max);
          const x = i * slot + (slot - bw) / 2;
          const r = Math.min(4, bw / 2, bh);
          const y = base - bh;
          return (
            <g key={d.date}>
              {bh > 0 && <path d={`M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${base} Z`} fill="var(--brand)" />}
              {d === peak && (
                <text x={x + bw / 2} y={y - 5} textAnchor="middle" fontSize="11" fill="var(--muted)">
                  {money(d.spend_cents)}
                </text>
              )}
              <rect x={i * slot} y={0} width={slot} height={h} fill="transparent">
                <title>{tt('{day}: {money} · {int} Klicks', { day: day(d.date), money: money(d.spend_cents), int: int(d.clicks) })}</title>
              </rect>
            </g>
          );
        })}
        <text x="0" y={h - 4} fontSize="11" fill="var(--muted)">
          {day(days[0].date)}
        </text>
        <text x={w} y={h - 4} fontSize="11" fill="var(--muted)" textAnchor="end">
          {day(days[days.length - 1].date)}
        </text>
      </svg>
      </div>
    </div>
  );
}

export function AdsReport({ range, setRange }: { range: { from: string; to: string }; setRange: (from: string, to: string) => void }) {
  const tt = useT('x_integrations');
  const [model, setModel] = useState('last');
  const [busy, setBusy] = useState(false);
  const qs = `from=${range.from}&to=${range.to}&model=${model}`;
  const { data, loading, reload } = useLoad(() => api.get(`/api/ads/report?${qs}`), [qs]);
  const accounts = useLoad(() => api.get<any[]>('/api/ads/accounts'), []);
  const anyConnected = (accounts.data ?? []).some((a) => a.connected);
  const tot = data?.totals;
  return (
    <>
      <RangePicker from={range.from} to={range.to} onChange={setRange}>
        <div style={{ width: 160 }}>
          <Field label={tt('Leads zählen nach')}>
            <Select
              value={model}
              onChange={setModel}
              options={[
                ['last', 'Letztem Kontakt'],
                ['first', 'Erstem Kontakt'],
              ]}
            />
          </Field>
        </div>
        {anyConnected && (
          <button
            className="btn secondary attr-export"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await act(() => api.post('/api/ads/sync', {}), tt('Zahlen abgerufen'));
              setBusy(false);
              void reload();
              void accounts.reload();
            }}
          >
            <Icon name="refresh" /> {busy ? tt('Ruft ab…') : tt('Jetzt abrufen')}
          </button>
        )}
      </RangePicker>
      {loading && !data ? (
        <Spinner />
      ) : !data?.rows.length ? (
        <Empty action={!anyConnected ? <Link to="attribution/settings" className="btn">{tt('Werbekonto verbinden')}</Link> : undefined}>
          {anyConnected ? tt('Für diesen Zeitraum sind noch keine Werbedaten da. Der Abruf läuft täglich – oder jetzt mit „Jetzt abrufen“.') : tt('Verbinde Meta Ads oder Google Ads, um Ausgaben, Kosten pro Lead und ROAS zu sehen.')}
        </Empty>
      ) : (
        <>
          <SortableGrid id="ads.stats" className="stats">
            <Stat label={tt('Ausgaben')} value={money(tot.spend_cents)} sub={tt('{int} Impressionen · {int2} Klicks', { int: int(tot.impressions), int2: int(tot.clicks) })} />
            <Stat label={tt('Leads im CRM')} value={tot.crm_leads} sub={tt('laut Werbeplattform: {int}', { int: int(tot.platform_leads) })} />
            <Stat label={tt('Kosten pro Lead')} value={tot.cpl_cents === null ? '–' : money(tot.cpl_cents)} sub={tt('Ausgaben ÷ Leads im CRM')} />
            <Stat label={tt('Umsatz')} value={money(tot.revenue_cents)} sub={tt('bezahlte Rechnungen dieser Leads')} />
            <Stat label={tt('ROAS')} value={roas(tot.roas)} sub={tt('Umsatz ÷ Ausgaben')} />
          </SortableGrid>
          <SpendChart days={data.days} />
          <div className="table-wrap" style={{ marginTop: 14 }}>
            <table className="t attr-table">
              <thead>
                <tr>
                  <th>{tt('Kampagne')}</th>
                  <th className="num">{tt('Ausgaben')}</th>
                  <th className="num">{tt('Klicks')}</th>
                  <th className="num">{tt('CTR')}</th>
                  <th className="num">{tt('Leads (Plattform)')}</th>
                  <th className="num">{tt('Leads (CRM)')}</th>
                  <th className="num">{tt('CPL')}</th>
                  <th className="num">{tt('Umsatz')}</th>
                  <th className="num">{tt('ROAS')}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r: any) => (
                  <tr key={`${r.platform}-${r.campaign_id}`}>
                    <td>
                      <Badge tone={r.platform === 'meta' ? 'blue' : 'yellow'}>{PLATFORM[r.platform]}</Badge> <strong>{r.campaign_name || r.campaign_id}</strong>
                      <div className="muted small">ID {r.campaign_id}</div>
                    </td>
                    <td className="num">{money(r.spend_cents, r.currency)}</td>
                    <td className="num">{int(r.clicks)}</td>
                    <td className="num">{pct(r.ctr)}</td>
                    <td className="num">{int(r.platform_leads)}</td>
                    <td className="num">{r.crm_leads}</td>
                    <td className="num">{r.cpl_cents === null ? '–' : money(r.cpl_cents, r.currency)}</td>
                    <td className="num">{money(r.revenue_cents)}</td>
                    <td className="num">{roas(r.roas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            {tt('CRM-Leads und Umsatz werden über')} <code>utm_campaign</code> {tt('zugeordnet: Name oder ID der Kampagne (z. B.')} <code>utm_campaign={'{{campaign.name}}'}</code> {tt('bei Meta,')} <code>{'{campaignid}'}</code> {tt('bei Google).')}
          </p>
        </>
      )}
    </>
  );
}

const FIELDS: Record<string, [key: string, label: string, secret?: boolean, hint?: string][]> = {
  meta: [
    ['ad_account_id', 'Werbekonto-ID', false, 'act_1234567890 – Meta Business Suite → Werbekonten'],
    ['token', 'Zugriffstoken (System-User, ads_read)', true, 'Langlebiges Token eines System-Users mit Recht ads_read (nur Berichte; Kampagnen verwalten: Marketing → Anzeigen)'],
  ],
  google: [
    ['customer_id', 'Kunden-ID', false, '123-456-7890 (oben rechts in Google Ads)'],
    ['login_customer_id', 'Verwaltungskonto-ID (optional)', false, 'nur wenn der Zugriff über ein MCC-Konto läuft'],
    ['developer_token', 'Developer-Token', true, 'Google Ads → Tools → API-Center'],
    ['client_id', 'OAuth Client-ID', true],
    ['client_secret', 'OAuth Client-Secret', true],
    ['refresh_token', 'Refresh-Token', true, 'z. B. mit dem OAuth 2.0 Playground erzeugt (Scope adwords) – Anleitung in docs/growth.md'],
  ],
};

function AccountCard({ a, onChange }: { a: any; onChange: () => void }) {
  const tt = useT('x_integrations');
  const [f, setF] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const val = (k: string) => (f[k] !== undefined ? f[k] : (a.config[k] ?? ''));
  const set = (k: string, v: unknown) => setF({ ...f, [k]: v });
  const run = async (fn: () => Promise<any>, ok?: string) => {
    setBusy(true);
    const r = await act(fn, ok);
    setBusy(false);
    if (r) (setF({}), onChange());
    return r;
  };
  return (
    <div className="card" data-tour="ads-account">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>{a.platform === 'meta' ? tt('Meta Ads (Facebook & Instagram)') : tt('Google Ads')} {a.platform === 'meta' && <SignupLink id="meta" />}</h2>
        {a.connected ? <Badge tone={a.last_error ? 'red' : 'green'}>{a.last_error ? tt('Fehler') : 'verbunden'}</Badge> : <Badge>{tt('nicht verbunden')}</Badge>}
      </div>
      <p className="muted small">
        {a.last_sync_at ? tt('Zuletzt abgerufen {dt} · {campaigns} Kampagnen', { dt: dt(a.last_sync_at), campaigns: a.campaigns }) : tt('Nur lesender Zugriff: Ausgaben, Impressionen, Klicks und Leads je Kampagne, täglich.')}
        {a.last_error ? <span style={{ color: 'var(--red)' }}> · {a.last_error}</span> : null}
      </p>
      <div className="grid2">
        {FIELDS[a.platform].map(([k, label, secret, hint]) => (
          <Field key={k} label={label} hint={hint}>
            {secret ? (
              <Input type="password" autoComplete="off" value={f[k] ?? ''} onChange={(v) => set(k, v)} placeholder={a.secrets[k] ? tt('•••••• gespeichert') : ''} />
            ) : (
              <Input value={val(k)} onChange={(v) => set(k, v)} />
            )}
          </Field>
        ))}
      </div>
      {a.platform === 'meta' && (
        <details className="attr-capi" open={!!a.config.capi_enabled}>
          <summary>{tt('Conversions API (optional): Leads und Käufe an Meta zurückmelden')}</summary>
          <Check checked={!!val('capi_enabled')} onChange={(v) => set('capi_enabled', v)} label={tt('Lead (neuer Kontakt aus Formular, Termin, Chat) und Purchase (bezahlte Rechnung) senden')} />
          <div className="grid2">
            <Field label={tt('Pixel-/Dataset-ID')}>
              <Input value={val('pixel_id')} onChange={(v) => set('pixel_id', v)} />
            </Field>
            <Field label={tt('CAPI-Token (optional)')} hint={tt('leer = Zugriffstoken oben')}>
              <Input type="password" autoComplete="off" value={f.capi_token ?? ''} onChange={(v) => set('capi_token', v)} placeholder={a.secrets.capi_token ? tt('•••••• gespeichert') : ''} />
            </Field>
            <Field label={tt('Test-Code (optional)')} hint={tt('aus dem Events-Manager, nur zum Testen')}>
              <Input value={val('test_event_code')} onChange={(v) => set('test_event_code', v)} />
            </Field>
          </div>
          <Check checked={val('capi_only_meta_leads') !== false} onChange={(v) => set('capi_only_meta_leads', v)} label={tt('Nur Kontakte senden, die über Meta-Werbung kamen (fbclid oder utm_source facebook/instagram)')} />
          <p className="muted small">{tt('E-Mail, Telefon und Name gehen nur als SHA-256-Hash raus. Du brauchst dafür eine Rechtsgrundlage (Einwilligung) – siehe Datenschutz-Hinweise in docs/growth.md.')}</p>
        </details>
      )}
      <div className="actions" style={{ marginTop: 12 }}>
        <button className="btn" disabled={busy} onClick={() => run(() => api.put(`/api/ads/accounts/${a.platform}`, f), 'Gespeichert')}>
          {tt('Speichern')}
        </button>
        {a.connected && (
          <>
            <button className="btn secondary" disabled={busy} onClick={() => run(() => api.post(`/api/ads/accounts/${a.platform}/test`, {}).then((r) => (r ? { ...r, ok: true } : r)), 'Verbindung klappt')}>
              {tt('Verbindung testen')}
            </button>
            <button className="btn secondary" disabled={busy} onClick={() => run(() => api.post('/api/ads/sync', { platform: a.platform, days: 30 }), 'Letzte 30 Tage abgerufen')}>
              <Icon name="refresh" /> {tt('30 Tage abrufen')}
            </button>
            <button className="btn ghost" disabled={busy} onClick={() => confirmAsk(tt('Verbindung trennen und gespeicherte Werbezahlen löschen?')) && run(() => api.del(`/api/ads/accounts/${a.platform}`), 'Getrennt')}>
              {tt('Trennen')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function AdsAccounts() {
  const tt = useT('x_integrations');
  const { data, reload } = useLoad(() => api.get<any[]>('/api/ads/accounts'), []);
  const log = useLoad(() => api.get<any[]>('/api/ads/capi-log').catch(() => []), []);
  if (!data) return <Spinner />;
  return (
    <>
      {data.map((a) => (
        <AccountCard key={a.platform} a={a} onChange={() => (reload(), log.reload())} />
      ))}
      {(log.data ?? []).length > 0 && (
        <div className="card">
          <h2>{tt('Gesendete Conversions')}</h2>
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>{tt('Zeit')}</th>
                  <th>{tt('Ereignis')}</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {log.data!.slice(0, 30).map((l) => (
                  <tr key={l.id}>
                    <td className="muted">{dt(l.created_at)}</td>
                    <td>{l.event_name}</td>
                    <td>
                      <Badge tone={l.status === 'sent' ? 'green' : l.status === 'failed' ? 'red' : l.status === 'blocked' ? 'yellow' : 'gray'}>{l.status === 'sent' ? 'gesendet' : l.status === 'failed' ? tt('Fehler') : l.status === 'blocked' ? 'blockiert' : tt('läuft')}</Badge> <span className="muted small">{l.error}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
