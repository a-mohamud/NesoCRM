import { useEffect, useState } from 'react';
import { api, dt } from '../api';
import { Icon } from '../icons';
import { act, Badge, CodeBox, confirmAsk, Empty, Field, Input, Modal, pressable, Select, Spinner, useLoad } from '../ui';
import { MoreFields } from '../areas/fields';
import { useT } from '../i18n';

/** Einstellungen → API & Webhooks: REST-hook subscriptions (Zapier/Make/n8n) and the delivery log. */

const SOURCE: Record<string, string> = { zapier: 'Zapier', make: 'Make', n8n: 'n8n', api: 'API' };
const HOOK_STATUS: Record<string, [string, 'green' | 'gray' | 'red']> = { active: ['aktiv', 'green'], paused: ['pausiert', 'gray'], disabled: ['deaktiviert', 'red'] };
const DELIVERY: Record<string, [string, 'green' | 'yellow' | 'red' | 'gray' | 'blue']> = {
  success: ['zugestellt', 'green'],
  retrying: ['wird wiederholt', 'yellow'],
  pending: ['läuft', 'blue'],
  failed: ['fehlgeschlagen', 'red'],
  gone: ['410 Gone', 'red'],
  cancelled: ['abgebrochen', 'gray'],
};

function NewHook({ triggers, onClose, onDone }: { triggers: any[]; onClose: () => void; onDone: () => void }) {
  const tt = useT('x_integrations');
  const [f, setF] = useState<any>({ event: 'contact.created', target_url: '', label: '', filters: {} });
  const t = triggers.find((x) => x.key === f.event);
  const save = async () => {
    const r = await act(() => api.post('/api/hooks', { ...f, source: 'api' }), tt('Abo angelegt'));
    if (r) onDone();
  };
  return (
    <Modal
      title={tt('Neues Abo')}
      onClose={onClose}
      footer={
        <button className="btn" disabled={!f.target_url} onClick={save}>
          {tt('Abonnieren')}
        </button>
      }
    >
      <p className="muted small" style={{ marginTop: 0 }}>
        {tt('Zapier, Make und n8n legen ihre Abos selbst an. Hier kannst du eine eigene URL von Hand eintragen.')}
      </p>
      <Field label={tt('Auslöser')}>
        <Select value={f.event} onChange={(v) => setF({ ...f, event: v, filters: {} })} options={triggers.map((x) => [x.key, x.label])} />
      </Field>
      {t && <p className="muted small">{t.description}</p>}
      <Field label={tt('Ziel-URL')}>
        <Input value={f.target_url} onChange={(v) => setF({ ...f, target_url: v })} placeholder="https://…" autoFocus />
      </Field>
      <MoreFields id="resthook-new" label={tt('Filter und Bezeichnung')}>
        {(t?.filters ?? []).map((flt: any) => (
          <Field key={flt.key} label={flt.label}>
            <Input value={f.filters[flt.key] ?? ''} onChange={(v) => setF({ ...f, filters: { ...f.filters, [flt.key]: v } })} />
          </Field>
        ))}
        <Field label={tt('Bezeichnung (optional)')}>
          <Input value={f.label} onChange={(v) => setF({ ...f, label: v })} />
        </Field>
      </MoreFields>
    </Modal>
  );
}

function DeliveryDetail({ id, onClose, onChange }: { id: string; onClose: () => void; onChange: () => void }) {
  const tt = useT('x_integrations');
  const d = useLoad(() => api.get(`/api/hooks/deliveries/${id}`), [id]);
  const [busy, setBusy] = useState(false);
  const retry = async () => {
    setBusy(true);
    const r = await act(() => api.post(`/api/hooks/deliveries/${id}/retry`, {}), tt('Erneut gesendet'));
    setBusy(false);
    if (r) (d.setData(r), onChange());
  };
  const x = d.data;
  return (
    <Modal
      title={tt('Zustellung')}
      wide
      onClose={onClose}
      footer={
        x && x.status !== 'pending' ? (
          <button className="btn" disabled={busy} onClick={retry}>
            <Icon name="refresh" /> {tt('Erneut senden')}
          </button>
        ) : undefined
      }
    >
      {!x ? (
        <Spinner />
      ) : (
        <>
          <div className="hook-facts">
            <div>
              <span className="muted small">{tt('Status')}</span>
              <Badge tone={DELIVERY[x.status]?.[1] ?? 'gray'}>{tt(DELIVERY[x.status]?.[0] ?? x.status)}</Badge>
            </div>
            <div>
              <span className="muted small">{tt('Auslöser')}</span>
              <code>{x.event}</code>
            </div>
            <div>
              <span className="muted small">{tt('Versuche')}</span>
              {x.attempts}
            </div>
            <div>
              <span className="muted small">{tt('HTTP')}</span>
              {x.response_status ?? '–'}
            </div>
            <div>
              <span className="muted small">{tt('Dauer')}</span>
              {x.duration_ms != null ? tt('{duration_ms} ms', { duration_ms: x.duration_ms }) : '–'}
            </div>
            <div>
              <span className="muted small">{tt('Nächster Versuch')}</span>
              {x.next_attempt_at ? dt(x.next_attempt_at) : '–'}
            </div>
          </div>
          <p className="small mono hook-url">{x.target_url}</p>
          {x.error && <p className="hook-error">{x.error}</p>}
          <h3 className="integ-h">{tt('Payload')}</h3>
          <pre className="hook-pre">{JSON.stringify(x.payload, null, 2)}</pre>
          {x.response_body ? (
            <>
              <h3 className="integ-h">{tt('Antwort')}</h3>
              <pre className="hook-pre">{x.response_body}</pre>
            </>
          ) : null}
        </>
      )}
    </Modal>
  );
}

export function RestHooksPanel() {
  const tt = useT('x_integrations');
  const triggers = useLoad(() => api.get<any[]>('/api/hooks/triggers'), []);
  const hooks = useLoad(() => api.get<any[]>('/api/hooks'), []);
  const [status, setStatus] = useState('');
  const [limit, setLimit] = useState(25);
  const log = useLoad(() => api.get<any>(`/api/hooks/deliveries?limit=${limit}${status ? `&status=${status}` : ''}`), [status, limit]);
  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState('');
  useEffect(() => {
    // Keep the log fresh while retries are pending.
    if (!log.data?.deliveries?.some((d: any) => d.status === 'retrying' || d.status === 'pending')) return;
    const timer = setInterval(() => void log.reload(), 15_000);
    return () => clearInterval(timer);
  }, [log.data]);
  const reloadAll = () => (hooks.reload(), log.reload());
  const counts = log.data?.counts_7d ?? {};
  return (
    <div className="rest-hooks">
      <div className="card" data-tour="rest-hooks">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>{tt('REST-Hooks: Zapier, Make & n8n')}</h2>
          <div className="row" style={{ gap: 6 }}>
            <a className="btn small secondary" data-tour="rest-hooks-docs" href="/api/docs.html" target="_blank" rel="noopener">
              {tt('API-Referenz')} <Icon name="external" size={13} />
            </a>
            <button className="btn small" onClick={() => setAdding(true)} disabled={!triggers.data}>
              {tt('+ Abo')}
            </button>
          </div>
        </div>
        <p className="muted small">
          {tt('Sofort-Auslöser für Automatisierungs-Tools:')} <code>{tt('POST /api/hooks')}</code> {tt('abonniert,')} <code>{tt('DELETE /api/hooks/:id')}</code> {tt('bestellt ab. Jede Zustellung trägt')} <code>{tt('x-pghl-signature = sha256(secret + body)')}</code>{tt(', Fehler werden bis zu 6× wiederholt, nach drei Antworten mit 410 wird das Abo deaktiviert.')}
        </p>
        {!hooks.data ? (
          <Spinner />
        ) : hooks.data.length ? (
          <div className="table-wrap">
            <table className="t hook-table">
              <thead>
                <tr>
                  <th>{tt('Auslöser')}</th>
                  <th>{tt('Ziel')}</th>
                  <th>{tt('Status')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {hooks.data.map((h) => (
                  <tr key={h.id}>
                    <td>
                      <strong>{h.trigger_label}</strong>
                      {h.label && <div className="small">{h.label}</div>}
                      {Object.keys(h.filters ?? {}).length > 0 && (
                        <div className="muted small">
                          {Object.entries(h.filters)
                            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
                            .join(' · ')}
                        </div>
                      )}
                    </td>
                    <td>
                      <Badge tone="purple">{SOURCE[h.source] ?? h.source}</Badge> <span className="mono small hook-url">{h.target_url}</span>
                    </td>
                    <td>
                      <Badge tone={HOOK_STATUS[h.status]?.[1] ?? 'gray'}>{tt(HOOK_STATUS[h.status]?.[0] ?? h.status)}</Badge>
                      <div className="muted small">{h.disabled_reason || h.last_status || tt('noch nichts gesendet')}</div>
                    </td>
                    <td className="hook-btns">
                      <button className="btn small secondary" onClick={() => act(() => api.post(`/api/hooks/${h.id}/test`, {}), tt('Beispiel gesendet')).then(reloadAll)}>
                        {tt('Testen')}
                      </button>
                      {h.status === 'active' ? (
                        <button className="btn small ghost" onClick={() => act(() => api.patch(`/api/hooks/${h.id}`, { status: 'paused' })).then(reloadAll)}>
                          {tt('Pausieren')}
                        </button>
                      ) : (
                        <button className="btn small ghost" onClick={() => act(() => api.patch(`/api/hooks/${h.id}`, { status: 'active' }), tt('Wieder aktiv')).then(reloadAll)}>
                          {tt('Aktivieren')}
                        </button>
                      )}
                      <button className="btn small ghost" aria-label={tt('Abo löschen')} onClick={() => confirmAsk(tt('Abo löschen? Das Tool bekommt dann keine Ereignisse mehr.')) && act(() => api.del(`/api/hooks/${h.id}`)).then(reloadAll)}>
                        <Icon name="trash" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>{tt('Noch keine Abos. Verbinde Zapier, Make oder n8n mit einem API-Schlüssel – die Abos erscheinen dann hier.')}</Empty>
        )}
      </div>

      <div className="card" data-tour="rest-hooks-log">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>{tt('Zustell-Protokoll')}</h2>
          <div className="row" style={{ gap: 6, alignItems: 'center' }}>
            <span className="muted small hook-counts">
              {tt('7 Tage: {v} zugestellt · {v2} in Wiederholung · {v3} fehlgeschlagen', { v: counts.success ?? 0, v2: counts.retrying ?? 0, v3: (counts.failed ?? 0) + (counts.gone ?? 0) })}
            </span>
            <div style={{ width: 180 }}>
              <Select value={status} onChange={setStatus} placeholder={tt('Alle Status')} options={Object.entries(DELIVERY).map(([k, [l]]) => [k, tt(l)])} />
            </div>
            <button className="btn small secondary" onClick={() => log.reload()} aria-label={tt('Aktualisieren')}>
              <Icon name="refresh" />
            </button>
          </div>
        </div>
        {!log.data ? (
          <Spinner />
        ) : log.data.deliveries.length ? (
          <>
            <div className="table-wrap">
              <table className="t hook-table">
                <thead>
                  <tr>
                    <th>{tt('Zeit')}</th>
                    <th>{tt('Auslöser')}</th>
                    <th>{tt('Ziel')}</th>
                    <th>{tt('Status')}</th>
                    <th className="num">{tt('Versuche')}</th>
                    <th className="num">{tt('HTTP')}</th>
                  </tr>
                </thead>
                <tbody>
                  {log.data.deliveries.map((d: any) => (
                    <tr key={d.id} className="click" {...pressable(() => setDetail(d.id))}>
                      <td className="nowrap">{dt(d.created_at)}</td>
                      <td>
                        <code>{d.event}</code>
                      </td>
                      <td className="mono small hook-url">{d.target_url}</td>
                      <td>
                        <Badge tone={DELIVERY[d.status]?.[1] ?? 'gray'}>{tt(DELIVERY[d.status]?.[0] ?? d.status)}</Badge>
                        {d.error && <div className="muted small">{d.error}</div>}
                      </td>
                      <td className="num">{d.attempts}</td>
                      <td className="num">{d.response_status ?? '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {log.data.total > log.data.deliveries.length && (
              <p style={{ textAlign: 'center' }}>
                <button className="btn small secondary" onClick={() => setLimit(Math.min(200, limit + 50))}>
                  {tt('Mehr laden ({length} von {total})', { length: log.data.deliveries.length, total: log.data.total })}
                </button>
              </p>
            )}
          </>
        ) : (
          <Empty>{tt('Noch keine Zustellungen')}{status ? tt(' mit diesem Status') : ''}.</Empty>
        )}
      </div>
      {adding && triggers.data && <NewHook triggers={triggers.data} onClose={() => setAdding(false)} onDone={() => (setAdding(false), reloadAll())} />}
      {detail && <DeliveryDetail id={detail} onClose={() => setDetail('')} onChange={reloadAll} />}
      <ApiQuickRef />
    </div>
  );
}

function ApiQuickRef() {
  const tt = useT('x_integrations');
  const origin = location.origin;
  return (
    <div className="card" data-tour="api-quickref">
      <h2>{tt('Schnellstart')}</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        {tt('Fertige Verbindungen liegen im Repo unter')} <code>integrations/zapier</code>, <code>integrations/make</code> {tt('und')} <code>integrations/n8n</code>{tt('. OpenAPI für Postman, Insomnia oder n8n:')}
      </p>
      <CodeBox text={`${origin}/api/openapi.json`} />
      <pre className="hook-pre" style={{ marginTop: 10 }}>{tt('curl -X POST {origin}/api/hooks \\\n  -H "Authorization: Bearer pghl_…" -H \'content-type: application/json\' \\\n  -d \'{"target_url":"https://example.com/hook","event":"opportunity.won"}\'', { origin: origin })}</pre>
    </div>
  );
}
