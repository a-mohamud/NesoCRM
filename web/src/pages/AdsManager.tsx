import { useState } from 'react';
import { api, dt, money } from '../api';
import { Icon } from '../icons';
import { Badge, Empty, Field, Input, Link, PageHead, Spinner, Stat, Tabs, act, confirmAsk, navigate, useLoad } from '../ui';
import { RangePicker, ymd } from './Ads';
import { AdsAudiences, AdsLeads } from './AdsAudiences';
import { AdsConnections } from './AdsConnect';
import { AdsModal, PlatformBadge, StatusBadge, fromCents, toCents } from './AdsKit';
import { AdsRules } from './AdsRules';
import { AdsWizard } from './AdsWizard';
import { SortableGrid } from '../sortable/Sortable';
import { useT } from '../i18n';

/**
 * Anzeigen: create and manage Meta (Facebook/Instagram) and Google Ads campaigns. Everything is created paused;
 * switching on and budget changes are confirmed here, and what API keys, MCP clients or the agent ask for lands
 * under "Freigaben". Server side: server/modules/ads-*.ts, docs/ads-manager.md.
 */

const TABS: [string, string][] = [
  ['campaigns', 'Kampagnen'],
  ['audiences', 'Zielgruppen'],
  ['leads', 'Lead-Formulare'],
  ['rules', 'Regeln'],
  ['connections', 'Verbindungen'],
];

export function AdsManager({ path }: { path: string[] }) {
  const tt = useT('x_integrations');
  const [first, id] = path;
  if (first === 'new' || first === 'edit') return <AdsWizard draftId={first === 'edit' ? id : undefined} />;
  const tab = TABS.some(([k]) => k === first) ? first! : 'campaigns';
  return (
    <div className="ads">
      <PageHead title={tt('Anzeigen')} sub={tt('Kampagnen bei Meta und Google erstellen und steuern – alles wird pausiert angelegt, aktiviert wird mit deiner Bestätigung.')}>
        {tab === 'campaigns' && (
          <button className="btn" data-tour="ads-new" onClick={() => navigate('ads/new')}>
            {tt('+ Neue Kampagne')}
          </button>
        )}
      </PageHead>
      <Tabs tabs={TABS} value={tab} onChange={(v) => navigate(`ads/${v}`)} />
      {tab === 'campaigns' && <Campaigns />}
      {tab === 'audiences' && <AdsAudiences />}
      {tab === 'leads' && <AdsLeads />}
      {tab === 'rules' && <AdsRules />}
      {tab === 'connections' && <AdsConnections />}
    </div>
  );
}

const VIA: Record<string, string> = { mcp: 'MCP-Client', agent: 'KI-Agent', api_key: 'API-Schlüssel', agency_key: 'Agentur-Schlüssel' };
const int = (v: number | null | undefined) => (v ?? 0).toLocaleString('de-DE');
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '–' : `${v.toLocaleString('de-DE', { maximumFractionDigits: 2 })} %`);

type Row = {
  key: string;
  id: string | null;
  remote_id: string | null;
  platform: 'meta' | 'google';
  name: string;
  status: string;
  managed: boolean;
  budget_cents: number | null;
  budget_type: 'daily' | 'lifetime' | null;
  currency: string;
  last_error: string | null;
  metrics: { spend_cents: number; clicks: number; ctr: number | null; crm_leads: number; platform_leads: number; cpl_cents: number | null; currency: string } | null;
};

function Campaigns() {
  const tt = useT('x_integrations');
  const [range, setRange] = useState({ from: ymd(new Date(Date.now() - 29 * 864e5)), to: ymd(new Date()) });
  const [busy, setBusy] = useState(false);
  const qs = `from=${range.from}&to=${range.to}&model=last`;
  const { data, loading, reload } = useLoad(() => api.get(`/api/ads/campaigns?${qs}`), [qs]);
  const approvals = useLoad(() => api.get<any[]>('/api/ads/approvals').catch(() => []), []);
  const [dialog, setDialog] = useState<null | { kind: 'activate' | 'budget' | 'approve'; row?: Row; approval?: any }>(null);
  const anyConnected = data?.connected?.meta || data?.connected?.google;
  const ref = (r: Row) => r.id ?? `${r.platform}:${r.remote_id}`;
  const refresh = async () => {
    setBusy(true);
    await act(async () => {
      await api.get(`/api/ads/campaigns?${qs}&refresh=1`);
      await api.post('/api/ads/sync', {}).catch(() => null);
    }, tt('Aktualisiert'));
    setBusy(false);
    void reload();
    void approvals.reload();
  };
  const run = async (fn: () => Promise<any>, ok: string) => {
    const r = await act(fn, ok);
    void reload();
    void approvals.reload();
    return r;
  };
  const tot = data?.totals;

  return (
    <>
      {(approvals.data ?? []).length > 0 && (
        <div className="card ads-approvals" data-tour="ads-approvals">
          <h2>{tt('Freigaben ({length})', { length: approvals.data!.length })}</h2>
          <p className="muted small">{tt('API-Schlüssel, MCP-Clients und der KI-Agent geben nie selbst Geld aus – sie fragen hier an. Prüfe die Änderung und entscheide.')}</p>
          {approvals.data!.map((a) => (
            <div key={a.id} className="ads-approval">
              <div>
                <strong>{a.summary}</strong>
                <div className="muted small">
                  {tt('Angefragt über')} {VIA[a.requested_via] ?? a.requested_via ?? 'API'}{a.requested_by_name && a.requested_by_name !== VIA[a.requested_via] ? ` (${a.requested_by_name})` : ''} {tt('· {dt} · gültig bis {dt2}', { dt: dt(a.created_at), dt2: dt(a.expires_at) })}
                </div>
              </div>
              <div className="actions">
                <button className="btn small" onClick={() => setDialog({ kind: 'approve', approval: a })}>
                  {tt('Prüfen & freigeben')}
                </button>
                <button className="btn small secondary" onClick={() => confirmAsk(tt('Anfrage ablehnen? Es wird nichts geändert.')) && run(() => api.post(`/api/ads/approvals/${a.id}/reject`, {}), 'Abgelehnt')}>
                  {tt('Ablehnen')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <RangePicker from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })}>
        <button className="btn secondary attr-export" disabled={busy} onClick={refresh} title={tt('Status, Budgets und Zahlen von Meta und Google neu laden')}>
          <Icon name="refresh" /> {busy ? tt('Lädt …') : tt('Aktualisieren')}
        </button>
      </RangePicker>

      {loading && !data ? (
        <Spinner />
      ) : (
        <>
          {data && !anyConnected && (
            <Empty action={<Link to="ads/connections" className="btn">{tt('Werbekonto verbinden')}</Link>} tour="ads-empty">
              {tt('Verbinde Meta Ads oder Google Ads, um Kampagnen direkt hier zu erstellen und zu steuern.')}
            </Empty>
          )}
          {data && Object.entries(data.errors ?? {}).map(([p, e]) => (
            <p key={p} style={{ color: 'var(--red)' }}>
              {p === 'meta' ? tt('Meta') : 'Google'}: {String(e)}
            </p>
          ))}
          {tot && data.campaigns.length > 0 && (
            <SortableGrid id="ads-manager.stats" className="stats">
              <Stat label={tt('Ausgaben')} value={money(tot.spend_cents)} sub={tt('{int} Impressionen · {int2} Klicks', { int: int(tot.impressions), int2: int(tot.clicks) })} />
              <Stat label={tt('Leads im CRM')} value={tot.crm_leads} sub={tt('laut Werbeplattform: {int}', { int: int(tot.platform_leads) })} />
              <Stat label={tt('Kosten pro Lead')} value={tot.cpl_cents === null ? '–' : money(tot.cpl_cents)} sub={tt('Ausgaben ÷ Leads im CRM')} />
              <Stat label={tt('ROAS')} value={tot.roas === null ? '–' : `${tot.roas.toLocaleString('de-DE', { minimumFractionDigits: 2 })}×`} sub={tt('Umsatz ÷ Ausgaben')} />
            </SortableGrid>
          )}
          {data && anyConnected && data.campaigns.length === 0 && (
            <Empty action={<button className="btn" onClick={() => navigate('ads/new')}>{tt('Erste Kampagne anlegen')}</button>}>{tt('Noch keine Kampagnen. Lege eine an – sie startet pausiert, nichts wird ausgegeben.')}</Empty>
          )}
          {data && data.campaigns.length > 0 && (
            <div className="table-wrap" data-tour="ads-table">
              <table className="t ads-table">
                <thead>
                  <tr>
                    <th>{tt('Kampagne')}</th>
                    <th>Status</th>
                    <th className="num">{tt('Budget')}</th>
                    <th className="num">{tt('Ausgaben')}</th>
                    <th className="num">{tt('Klicks')}</th>
                    <th className="num">{tt('CTR')}</th>
                    <th className="num">{tt('Leads (CRM)')}</th>
                    <th className="num">{tt('CPL')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(data.campaigns as Row[]).map((r) => {
                    const draft = r.status === 'draft' || r.status === 'error' || r.status === 'publishing';
                    const m = r.metrics;
                    return (
                      <tr key={r.key}>
                        <td>
                          <PlatformBadge platform={r.platform} /> <strong>{r.name}</strong>
                          {!r.managed && r.status !== 'ended' && <span className="muted small"> {tt('· aus dem Werbekonto')}</span>}
                          {r.last_error && <div className="small" style={{ color: 'var(--red)' }}>{r.last_error}</div>}
                        </td>
                        <td>
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="num">{r.budget_cents ? `${money(r.budget_cents, r.currency)}${r.budget_type === 'lifetime' ? ' ges.' : tt(' / Tag')}` : '–'}</td>
                        <td className="num">{m ? money(m.spend_cents, m.currency) : '–'}</td>
                        <td className="num">{m ? int(m.clicks) : '–'}</td>
                        <td className="num">{m ? pct(m.ctr) : '–'}</td>
                        <td className="num">{m ? m.crm_leads : '–'}</td>
                        <td className="num">{m?.cpl_cents == null ? '–' : money(m.cpl_cents, m.currency)}</td>
                        <td className="ads-actions">
                          {draft ? (
                            <>
                              <button className="btn small secondary" onClick={() => navigate(`ads/edit/${r.id}`)}>
                                {r.status === 'error' ? tt('Korrigieren') : tt('Weiter')}
                              </button>
                              <button className="btn small ghost" onClick={() => confirmAsk(tt('Entwurf „{name}“ löschen?', { name: r.name })) && run(() => api.del(`/api/ads/campaigns/${r.id}`), 'Gelöscht')}>
                                {tt('Löschen')}
                              </button>
                            </>
                          ) : r.status === 'ended' ? null : (
                            <>
                              {r.status === 'active' ? (
                                <button className="btn small secondary" onClick={() => run(() => api.post(`/api/ads/campaigns/${encodeURIComponent(ref(r))}/status`, { status: 'paused' }), 'Pausiert')}>
                                  {tt('Pausieren')}
                                </button>
                              ) : (
                                <button className="btn small" onClick={() => setDialog({ kind: 'activate', row: r })}>
                                  {tt('Aktivieren')}
                                </button>
                              )}
                              <button className="btn small secondary" onClick={() => setDialog({ kind: 'budget', row: r })}>
                                {tt('Budget')}
                              </button>
                              {r.managed && r.id && (
                                <button className="btn small ghost" title={tt('Als neuen Entwurf kopieren')} onClick={async () => { const c = await run(() => api.post(`/api/ads/campaigns/${r.id}/duplicate`, {}), 'Kopie als Entwurf angelegt'); if (c?.id) navigate(`ads/edit/${c.id}`); }}>
                                  {tt('Duplizieren')}
                                </button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {data?.campaigns?.length > 0 && !data.attribution && <p className="muted small">{tt('Leads im CRM werden über')} <code>utm_campaign</code> {tt('zugeordnet (Modul Attribution).')}</p>}
        </>
      )}

      {dialog?.kind === 'activate' && dialog.row && (
        <ActivateDialog
          row={dialog.row}
          onClose={() => setDialog(null)}
          onDone={async () => {
            const r = dialog.row!;
            setDialog(null);
            await run(() => api.post(`/api/ads/campaigns/${encodeURIComponent(r.id ?? `${r.platform}:${r.remote_id}`)}/status`, { status: 'active', confirm: true }), 'Aktiviert');
          }}
        />
      )}
      {dialog?.kind === 'budget' && dialog.row && (
        <BudgetDialog
          row={dialog.row}
          onClose={() => setDialog(null)}
          onDone={async (cents) => {
            const r = dialog.row!;
            setDialog(null);
            await run(() => api.post(`/api/ads/campaigns/${encodeURIComponent(r.id ?? `${r.platform}:${r.remote_id}`)}/budget`, { amount_cents: cents, type: r.budget_type ?? undefined, confirm: true }), 'Budget geändert');
          }}
        />
      )}
      {dialog?.kind === 'approve' && dialog.approval && (
        <AdsModal
          title={tt('Freigabe prüfen')}
          onClose={() => setDialog(null)}
          footer={
            <>
              <button className="btn secondary" onClick={() => setDialog(null)}>
                {tt('Abbrechen')}
              </button>
              <button
                className="btn"
                data-tour="ads-approve"
                onClick={async () => {
                  const a = dialog.approval;
                  setDialog(null);
                  await run(() => api.post(`/api/ads/approvals/${a.id}/approve`, {}), 'Freigegeben und ausgeführt');
                }}
              >
                {tt('Freigeben und ausführen')}
              </button>
            </>
          }
        >
          <p>
            <strong>{dialog.approval.summary}</strong>
          </p>
          <p className="muted">
            {tt('Angefragt über')} {VIA[dialog.approval.requested_via] ?? 'API'}{dialog.approval.requested_by_name && dialog.approval.requested_by_name !== VIA[dialog.approval.requested_via] ? ` (${dialog.approval.requested_by_name})` : ''}{tt('. Mit „Freigeben“ wird es sofort bei')} {dialog.approval.platform === 'meta' ? tt('Meta') : 'Google'} {tt('ausgeführt und im Protokoll festgehalten.')}
          </p>
        </AdsModal>
      )}
    </>
  );
}

function ActivateDialog({ row, onClose, onDone }: { row: Row; onClose: () => void; onDone: () => void }) {
  const tt = useT('x_integrations');
  const budget = row.budget_cents ? `${money(row.budget_cents, row.currency)} ${row.budget_type === 'lifetime' ? 'insgesamt' : 'pro Tag'}` : 'dem eingestellten Budget';
  return (
    <AdsModal
      title={tt('Kampagne aktivieren?')}
      onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={onClose}>
            {tt('Abbrechen')}
          </button>
          <button className="btn" data-tour="ads-confirm" onClick={onDone}>
            {tt('Ja, jetzt aktivieren')}
          </button>
        </>
      }
    >
      <p>
        <strong>„{row.name}“</strong> bei {row.platform === 'meta' ? tt('Meta (Facebook & Instagram)') : tt('Google Ads')} {tt('wird aktiviert.')}
      </p>
      <p>
        {tt('Ab sofort wird')} <strong>{tt('Geld ausgegeben')}</strong> {tt('– bis zu {budget}. Du kannst die Kampagne jederzeit pausieren.', { budget: budget })}
      </p>
    </AdsModal>
  );
}

function BudgetDialog({ row, onClose, onDone }: { row: Row; onClose: () => void; onDone: (cents: number) => void }) {
  const tt = useT('x_integrations');
  const [v, setV] = useState(fromCents(row.budget_cents));
  const cents = toCents(v);
  const unit = row.budget_type === 'lifetime' ? 'insgesamt' : 'pro Tag';
  return (
    <AdsModal
      title={tt('Budget ändern')}
      onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={onClose}>
            {tt('Abbrechen')}
          </button>
          <button className="btn" disabled={!cents || cents === row.budget_cents} onClick={() => onDone(cents)}>
            {tt('Budget ändern')}
          </button>
        </>
      }
    >
      <Field label={tt('Neues Budget ({unit}, €)', { unit: unit })} hint={row.budget_cents ? tt('Bisher: {money} {unit}', { money: money(row.budget_cents, row.currency), unit: unit }) : tt('Bisheriges Budget unbekannt – bitte „Aktualisieren“ drücken')}>
        <Input inputMode="decimal" value={v} onChange={setV} autoFocus />
      </Field>
      {cents > 0 && row.budget_cents && cents !== row.budget_cents && (
        <p className={cents > row.budget_cents ? '' : 'muted'}>
          {cents > row.budget_cents ? <Badge tone="yellow">{tt('Mehr Ausgaben')}</Badge> : <Badge tone="green">{tt('Weniger Ausgaben')}</Badge>} „{row.name}“: {money(row.budget_cents, row.currency)} → <strong>{money(cents, row.currency)}</strong> {unit}
        </p>
      )}
      <p className="muted small">{tt('Das Tageslimit des Sub-Accounts gilt (Verbindungen). Die Änderung wird sofort bei der Plattform wirksam und im Protokoll festgehalten.')}</p>
    </AdsModal>
  );
}
