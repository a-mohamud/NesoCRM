import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useSession } from '../session';
import { Badge, Check, Empty, Field, Input, Modal, Select, Spinner, Textarea, act, confirmAsk, navigate, toast, useLoad } from '../ui';
import { SignupLink } from '../referrals';
import { AiEffort } from './AiEffort';
import { MoreFields } from '../areas/fields';
import { AiSubscriptions } from './AiSubscriptions';
import { Gallery, ModelsModal } from './AiGallery';
import '../agent/agent.css';
import { useT } from '../i18n';

/**
 * KI-Anbieter (BYOK): bring your own key for any model – text (OpenAI, Anthropic, Gemini, OpenRouter,
 * Groq, Together, Fireworks, DeepSeek, Mistral, xAI, Perplexity, Cerebras, Hugging Face, Azure, Ollama,
 * LM Studio, vLLM/LiteLLM, any OpenAI-compatible URL) and media (fal.ai, kie.ai, Replicate, Stability,
 * ElevenLabs, Runway, Luma, custom HTTP). Card grid of presets, capability chips, sealed keys,
 * „Verbindung testen“, model picker (live list + free text) and routing per usage (agent chat, quick
 * texts, summaries, embeddings, images, video, speech, transcription) – per sub-account or agency-wide.
 * On top: "Mit deinem Abo" (Mit ChatGPT anmelden, Mit Claude verbinden – AiSubscriptions.tsx); below: the provider gallery with search,
 * filters and EU-Hosting badges (AiGallery.tsx).
 */

const AUTH: [string, string][] = [
  ['bearer', 'Authorization: Bearer <Schlüssel>'],
  ['x-api-key', 'x-api-key: <Schlüssel>'],
  ['key', 'Authorization: Key <Schlüssel> (fal.ai)'],
  ['token', 'Authorization: Token <Schlüssel> (Deepgram)'],
  ['header', 'Eigener Header'],
  ['query', 'Als URL-Parameter (?name=<Schlüssel>)'],
  ['none', 'Ohne Schlüssel'],
];
/** Option labels are German message ids – translated where they are shown. */
const tl = (tt: (s: string) => string, list: [string, string][]): [string, string][] => list.map(([k, l]) => [k, tt(l)]);

function Caps({ caps, labels, on, onToggle }: { caps: string[]; labels: Record<string, string>; on?: string[]; onToggle?: (c: string) => void }) {
  return (
    <div className="aic-caps">
      {caps.map((c) =>
        onToggle ? (
          <button key={c} type="button" className={`aic-cap${on?.includes(c) ? ' on' : ''}`} onClick={() => onToggle(c)}>
            {labels[c] ?? c}
          </button>
        ) : (
          <span key={c} className="aic-cap">
            {labels[c] ?? c}
          </span>
        ),
      )}
    </div>
  );
}

/** Model field: search the live list (where the provider has one) or type any model id. */
export function ModelPicker({ value, onChange, connectionId, suggestions, placeholder }: { value: string; onChange: (v: string) => void; connectionId?: string; suggestions: string[]; placeholder?: string }) {
  const tt = useT('x_ai');
  const [live, setLive] = useState<string[] | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const id = useMemo(() => `models-${Math.random().toString(36).slice(2)}`, []);
  const load = async (refresh = false) => {
    if (!connectionId) return;
    setLoading(true);
    const r = await api.get(`/api/ai-connections/${connectionId}/models${refresh ? '?refresh=1' : ''}`).catch(() => null);
    setLoading(false);
    if (r) {
      setLive(r.models);
      // "$0,80 / $3,20 je 1 Mio." next to the model id where the provider's list states prices
      setPrices(Object.fromEntries((r.details ?? []).filter((d: any) => d.in !== undefined).map((d: any) => [d.id, d.free ? 'kostenlos' : `$${d.in} / $${d.out} je 1 Mio. Tokens`])));
      if (r.error) toast(tt('Modell-Liste nicht verfügbar: {error}', { error: r.error }));
    }
  };
  const list = [...new Set([...(live ?? []), ...suggestions])];
  return (
    <div className="row" style={{ alignItems: 'center', gap: 6 }}>
      <input className="grow" value={value} onChange={(e) => onChange(e.target.value)} list={id} placeholder={placeholder ?? tt('Modell-ID (Freitext erlaubt)')} style={{ flex: '1 1 200px' }} />
      <datalist id={id}>
        {list.map((m) => (
          <option key={m} value={m} label={prices[m] ? `${m} · ${prices[m]}` : undefined} />
        ))}
      </datalist>
      {connectionId && (
        <button type="button" className="btn small secondary" onClick={() => void load(!!live)} disabled={loading}>
          {loading ? '…' : live ? tt('{length} Modelle ↻', { length: live.length }) : tt('Liste laden')}
        </button>
      )}
    </div>
  );
}

function ConnectionForm({ preset, conn, meta, agency, onClose, onSaved }: { preset: any; conn?: any; meta: any; agency: boolean; onClose: () => void; onSaved: () => void }) {
  const tt = useT('x_ai');
  const session = useSession();
  const admin = session.user.role === 'admin';
  const capLabels = Object.fromEntries(meta.capabilities.map((c: any) => [c.id, tt(c.label)]));
  const [f, setF] = useState<any>(() => ({
    scope: conn?.scope ?? (agency ? 'agency' : 'location'),
    label: conn?.label && conn.label !== preset.label ? conn.label : '',
    base_url: conn?.base_url && preset.custom_url ? conn.base_url : preset.custom_url ? preset.base_url : '',
    api_key: '',
    auth_style: conn?.auth_style ?? preset.auth,
    auth_header: conn?.auth_header ?? preset.auth_header ?? '',
    capabilities: conn?.capabilities ?? preset.capabilities,
    models: { ...(conn?.models ?? {}) },
    enabled: conn?.enabled ?? true,
    options: { price_in: conn?.options?.price_in ?? '', price_out: conn?.options?.price_out ?? '', api_version: conn?.options?.api_version ?? '', allow_private: !!conn?.options?.allow_private },
    webhook_secret: '',
    template: conn?.options?.template ? JSON.stringify(conn.options.template, null, 2) : '',
    headers: (conn?.extra_header_names ?? []).map((n: string) => ({ name: n, value: '' })),
  }));
  // "Erweitert" opens by itself when the connection holds a value there (nothing set is ever hidden).
  const [advanced, setAdvanced] = useState(() => !!conn && !!(conn.extra_header_names?.length || conn.options?.price_in != null || conn.options?.price_out != null || conn.options?.api_version || conn.options?.template || conn.webhook_secret_set || conn.options?.allow_private || (conn.auth_style && conn.auth_style !== preset.auth)));
  const [test, setTest] = useState<any>(null);
  const [testing, setTesting] = useState(false);
  const set = (p: any) => setF((x: any) => ({ ...x, ...p }));
  const body = () => {
    const b: any = { provider: preset.id, label: f.label, capabilities: f.capabilities, models: f.models, enabled: f.enabled, auth_style: f.auth_style, auth_header: f.auth_header };
    if (preset.custom_url) b.base_url = f.base_url;
    if (f.api_key.trim()) b.api_key = f.api_key.trim();
    b.options = { price_in: f.options.price_in === '' ? null : Number(f.options.price_in), price_out: f.options.price_out === '' ? null : Number(f.options.price_out), ...(f.options.api_version ? { api_version: f.options.api_version } : {}), ...(admin ? { allow_private: f.options.allow_private } : {}) };
    if (preset.id === 'custom_http') b.options.template = f.template.trim() || null;
    if (f.webhook_secret.trim()) b.webhook_secret = f.webhook_secret.trim();
    const headers = f.headers.filter((h: any) => h.name.trim());
    if (headers.length || conn?.extra_header_names?.length) b.extra_headers = Object.fromEntries(headers.map((h: any) => [h.name.trim(), h.value]));
    if (!conn) b.scope = f.scope;
    return b;
  };
  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      setTest(await api.post('/api/ai-connections/test', { ...(conn ? { id: conn.id } : {}), ...body(), deep: f.capabilities.includes('text') }));
    } catch (e) {
      setTest({ ok: false, message: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };
  const save = async () => {
    const r = await act(() => (conn ? api.patch(`/api/ai-connections/${conn.id}`, body()) : api.post('/api/ai-connections', body())), tt('Gespeichert'));
    if (r) onSaved();
  };
  return (
    <Modal
      title={`${conn ? tt('Verbindung bearbeiten') : tt('Verbinden')}: ${preset.label}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn secondary" onClick={runTest} disabled={testing} data-tour="aic-test">
            {testing ? tt('Teste …') : tt('Verbindung testen')}
          </button>
          <button className="btn" onClick={save}>
            {tt('Speichern')}
          </button>
        </>
      }
    >
      {preset.note && <p className="small muted">{preset.note}</p>}
      <div className="grid2">
        <Field label={tt('Name (optional)')}>
          <Input value={f.label} onChange={(v) => set({ label: v })} placeholder={preset.label} />
        </Field>
        {!conn && admin ? (
          <Field label={tt('Gilt für')}>
            <Select value={f.scope} onChange={(v) => set({ scope: v })} options={[['location', tt('Diesen Sub-Account')], ['agency', tt('Alle Sub-Accounts (Agentur)')]]} />
          </Field>
        ) : (
          <div />
        )}
      </div>
      {preset.custom_url && (
        <Field label={tt('Adresse (Base URL)')} hint={preset.local ? tt('Läuft der Server auf einem anderen Rechner, dessen Adresse eintragen. Lokale Netze gibt ein Agentur-Admin frei.') : tt('z. B. https://…/v1')}>
          <Input value={f.base_url} onChange={(v) => set({ base_url: v })} placeholder={preset.base_url || 'https://…/v1'} />
        </Field>
      )}
      {(preset.key_required || preset.auth !== 'none' || f.auth_style !== 'none') && (
        <Field
          label={tt('API-Schlüssel')}
          tour="aic-key"
          hint={
            <>
              {conn?.key_set ? tt('Hinterlegt ({key_hint}) – leer lassen, um ihn zu behalten. ', { key_hint: conn.key_hint }) : ''}{tt('Wird verschlüsselt gespeichert und nie wieder angezeigt.')}{' '}
              {preset.key_url && (
                <a href={preset.key_url} target="_blank" rel="noreferrer">
                  {tt('Schlüssel holen')}
                </a>
              )}{' '}
              <SignupLink id={preset.id} />
            </>
          }
        >
          <Input type="password" autoComplete="off" value={f.api_key} onChange={(v) => set({ api_key: v })} placeholder={preset.key_hint} />
        </Field>
      )}
      <Field label={tt('Fähigkeiten')}>
        <Caps caps={meta.capabilities.map((c: any) => c.id).filter((c: string) => preset.wire !== 'http' || c !== 'text')} labels={capLabels} on={f.capabilities} onToggle={(c) => set({ capabilities: f.capabilities.includes(c) ? f.capabilities.filter((x: string) => x !== c) : [...f.capabilities, c] })} />
      </Field>
      {f.capabilities.map((c: string) => (
        <Field key={c} label={tt('Standard-Modell: {v}', { v: capLabels[c] ?? c })}>
          <ModelPicker value={f.models[c] ?? ''} onChange={(v) => set({ models: { ...f.models, [c]: v } })} connectionId={conn?.id} suggestions={preset.models[c] ?? preset.models.text ?? []} placeholder={(preset.models[c] ?? [])[0] ?? (preset.id === 'azure' ? tt('Name des Deployments') : tt('Modell-ID'))} />
        </Field>
      ))}
      <Check checked={f.enabled} onChange={(v) => set({ enabled: v })} label={tt('Aktiv')} />
      <button type="button" className="btn small ghost" onClick={() => setAdvanced(!advanced)}>
        {advanced ? '▾' : '▸'} {tt('Erweitert (Anmeldung, Header, Preise)')}
      </button>
      {advanced && (
        <div className="card" style={{ marginTop: 8 }}>
          <div className="grid2">
            <Field label={tt('Anmeldung')}>
              <Select value={f.auth_style} onChange={(v) => set({ auth_style: v })} options={tl(tt, AUTH.filter(([k]) => k !== 'query' || preset.wire === 'http'))} />
            </Field>
            {(f.auth_style === 'header' || f.auth_style === 'query') && (
              <Field label={f.auth_style === 'query' ? tt('Name des URL-Parameters') : tt('Header-Name')}>
                <Input value={f.auth_header} onChange={(v) => set({ auth_header: v })} placeholder={f.auth_style === 'query' ? 'key' : 'api-key'} />
              </Field>
            )}
          </div>
          {preset.wire === 'http' && (
            <Field label={tt('Webhook-Geheimnis (optional)')} hint={`${conn?.webhook_secret_set ? tt('Hinterlegt – leer lassen, um es zu behalten. ') : ''}${tt('Damit prüft HyperLevel die Signatur von Rückmeldungen des Anbieters (bei kie.ai der „webhookHmacKey“). Verschlüsselt gespeichert, nie wieder angezeigt.')}`}>
              <Input type="password" autoComplete="off" value={f.webhook_secret} onChange={(v) => set({ webhook_secret: v })} />
            </Field>
          )}
          {preset.id === 'custom_http' && (
            <Field label={tt('HTTP-Vorlage (JSON, optional)')} hint={tt('url, method, headers, body mit {{prompt}} usw., result_path, poll … – Aufbau siehe Doku „KI-Studio“. Ohne Vorlage nimmt das KI-Studio eine Vorlage aus „Eigene Anbieter“.')}>
              <Textarea rows={6} value={f.template} onChange={(v) => set({ template: v })} placeholder='{"url": "https://api.example.com/v1/generate", "body": "{\"prompt\": \"{{prompt}}\"}", "result_path": "images[0].url"}' style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }} />
            </Field>
          )}
          <Field label={tt('Zusätzliche Header')} hint={tt('z. B. OpenAI-Organization oder ein Header deines Proxys. Werte werden verschlüsselt und nicht wieder angezeigt (leer = behalten).')}>
            {f.headers.map((h: any, i: number) => (
              <div key={i} className="aic-headers">
                <Input value={h.name} onChange={(v) => set({ headers: f.headers.map((x: any, j: number) => (j === i ? { ...x, name: v } : x)) })} placeholder={tt('Header')} />
                <Input value={h.value} onChange={(v) => set({ headers: f.headers.map((x: any, j: number) => (j === i ? { ...x, value: v } : x)) })} placeholder={conn?.extra_header_names?.includes(h.name) ? tt('(hinterlegt)') : tt('Wert')} />
                <button className="icon-btn" aria-label={tt('Header entfernen')} onClick={() => set({ headers: f.headers.filter((_: any, j: number) => j !== i) })}>
                  ✕
                </button>
              </div>
            ))}
            <button type="button" className="btn small secondary" onClick={() => set({ headers: [...f.headers, { name: '', value: '' }] })}>
              {tt('+ Header')}
            </button>
          </Field>
          {f.capabilities.includes('text') && (
            <div className="grid2">
              <Field label={tt('Preis Eingabe ($ je 1 Mio. Tokens)')} hint={tt('Standard: {input}', { input: preset.price.input })}>
                <Input type="number" step="0.01" value={f.options.price_in} onChange={(v) => set({ options: { ...f.options, price_in: v } })} />
              </Field>
              <Field label={tt('Preis Ausgabe ($ je 1 Mio. Tokens)')} hint={tt('Standard: {output}', { output: preset.price.output })}>
                <Input type="number" step="0.01" value={f.options.price_out} onChange={(v) => set({ options: { ...f.options, price_out: v } })} />
              </Field>
            </div>
          )}
          {preset.id === 'azure' && (
            <Field label={tt('API-Version')} hint={tt('Standard 2024-10-21; bei einer Adresse mit /openai/v1 egal.')}>
              <Input value={f.options.api_version} onChange={(v) => set({ options: { ...f.options, api_version: v } })} />
            </Field>
          )}
          {admin && preset.custom_url && <Check checked={f.options.allow_private} onChange={(v) => set({ options: { ...f.options, allow_private: v } })} label={tt('Lokales Netz erlauben (z. B. Ollama auf diesem Server oder im LAN) – nur Agentur-Admins')} />}
        </div>
      )}
      {test && (
        <div className={`agent-${test.ok ? 'notice' : 'error'}`} style={{ marginTop: 10 }}>
          {test.message}
          {test.models?.length ? <div className="muted small">{tt('{length} Modelle gefunden.', { length: test.models.length })}</div> : null}
          {test.tools === true && <div className="muted small">{tt('Werkzeug-Aufrufe funktionieren – geeignet für den KI-Agenten.')}</div>}
        </div>
      )}
    </Modal>
  );
}

function Routing({ data, meta, agency, onChange }: { data: any; meta: any; agency: boolean; onChange: () => void }) {
  const tt = useT('x_ai');
  const session = useSession();
  const admin = session.user.role === 'admin';
  const [scope, setScope] = useState<'location' | 'agency'>(agency ? 'agency' : 'location');
  const routing = scope === 'agency' ? data.routing.agency : data.routing.location;
  const save = async (usage: string, connection_id: string, model = '', fallbacks?: string) => {
    if (await act(() => api.put('/api/ai-connections/routing', { scope, usage, connection_id, model, ...(fallbacks !== undefined ? { fallbacks } : {}) }), tt('Gespeichert'))) onChange();
  };
  return (
    <div className="card" data-tour="aic-routing">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>{tt('Wofür welches Modell?')}</h2>
        {admin && !agency && <Select value={scope} onChange={(v) => setScope(v as any)} options={[['location', tt('Dieser Sub-Account')], ['agency', tt('Agentur-Standard')]]} />}
      </div>
      <p className="muted small">{tt('„Automatisch“ nimmt die erste passende Verbindung (Sub-Account vor Agentur). Schnelle KI-Texte und Zusammenfassungen bleiben ohne Zuordnung beim Anbieter des KI-Assistenten.')}</p>
      <table className="aic-routing">
        <thead>
          <tr>
            <th>{tt('Verwendung')}</th>
            <th>{tt('Verbindung')}</th>
            <th>{tt('Modell')}</th>
            <th>{tt('Aktuell')}</th>
          </tr>
        </thead>
        <tbody>
          {meta.usages.map((u: any) => {
            const r = routing[u.id];
            const options = data.connections.filter((c: any) => c.capabilities.includes(u.capability) && (scope === 'location' || c.scope === 'agency'));
            const eff = data.routing.effective[u.id];
            return (
              <tr key={u.id}>
                <td>{tt(u.label)}</td>
                <td>
                  <Select value={r?.connection_id ?? ''} onChange={(v) => void save(u.id, v)} options={[['', tt('Automatisch')], ...options.map((c: any) => [c.id, `${c.label}${c.scope === 'agency' && scope === 'location' ? tt(' (Agentur)') : ''}`] as [string, string])]} />
                </td>
                <td>
                  {r?.connection_id ? <input key={`${r.connection_id}:${r.model ?? ''}`} defaultValue={r.model ?? ''} placeholder={tt('Standard der Verbindung')} onBlur={(e) => e.target.value.trim() !== (r.model ?? '') && void save(u.id, r.connection_id, e.target.value.trim())} /> : <span className="muted small">–</span>}
                  {r?.connection_id && u.capability === 'text' && (
                    // Ersatzmodelle (docs/agent.md#ersatzmodelle): tried in order when the model fails – expert setting, folded in Einfach-Modus
                    <MoreFields id={`aic-fallbacks-${scope}-${u.id}`} values={[r.fallbacks?.length ? 1 : '']} label={tt('Ersatzmodelle')}>
                      <input
                        key={`${r.connection_id}:fb:${(r.fallbacks ?? []).join(',')}`}
                        defaultValue={(r.fallbacks ?? []).join(', ')}
                        placeholder={tt('z. B. claude-sonnet-5, claude-haiku-5-5')}
                        aria-label={tt('Ersatzmodelle, durch Komma getrennt')}
                        title={tt('Fällt das Modell aus (Überlastung, 5xx, 429), versucht der Agent diese Modelle derselben Verbindung der Reihe nach – danach die anderen Text-Verbindungen. Leer = Standardreihenfolge des Anbieters.')}
                        onBlur={(e) => e.target.value.trim() !== (r.fallbacks ?? []).join(', ') && void save(u.id, r.connection_id, r.model ?? '', e.target.value.trim())}
                      />
                    </MoreFields>
                  )}
                </td>
                <td className="small">{eff ? `${eff.label} · ${eff.model || '–'}` : <span className="muted">{tt('keine')}</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function AiConnections({ agency = false }: { agency?: boolean }) {
  const tt = useT('x_ai');
  const meta = useLoad(() => api.get('/api/ai-connections/presets'), []);
  const data = useLoad(() => api.get('/api/ai-connections'), []);
  const [form, setForm] = useState<{ preset: any; conn?: any } | null>(null);
  const [models, setModels] = useState<any>(null);
  const [busy, setBusy] = useState('');
  useEffect(() => {
    const on = () => void data.reload();
    window.addEventListener('pghl:ai-connections', on);
    return () => window.removeEventListener('pghl:ai-connections', on);
  }, []);
  if (!meta.data || !data.data) return <Spinner />;
  const capLabels = Object.fromEntries(meta.data.capabilities.map((c: any) => [c.id, tt(c.label)]));
  const presetOf = (id: string) => meta.data.presets.find((p: any) => p.id === id);
  const conns = data.data.connections.filter((c: any) => (agency ? c.scope === 'agency' : true));
  const usd = (v: number) => `${(v ?? 0).toLocaleString('de-DE', { maximumFractionDigits: 4 })} $`;
  return (
    <>
      <p className="muted">
        {tt('Bring your own key: Verbinde jedes Modell mit deinem eigenen Schlüssel – Text-Modelle für KI-Agent und KI-Assistent, Bild-, Video- und Audio-Anbieter für Medien. Schlüssel werden verschlüsselt gespeichert und nie wieder angezeigt; die Kosten laufen über dein Konto beim Anbieter.')}
      </p>
      {!agency && <AiSubscriptions onAddProvider={(id) => presetOf(id) && setForm({ preset: presetOf(id) })} />}
      <h2>{tt('Verbunden')}</h2>
      {!conns.length && <Empty>{tt('Noch nichts verbunden – wähle unten einen Anbieter.')}</Empty>}
      <div className="aic-conns" data-tour="aic-list">
        {conns.map((c: any) => {
          const u = data.data.usage[c.id];
          return (
            <div key={c.id} className="card">
              <div className="aic-conn-head">
                <div>
                  <strong>{c.label}</strong>
                  <div className="muted small">
                    {c.provider_label}
                    {c.scope === 'agency' ? tt(' · Agentur') : tt(' · Sub-Account')}
                    {c.implicit ? tt(' · aus dem KI-Assistenten') : ''}
                  </div>
                </div>
                {!c.enabled ? <Badge>{tt('aus')}</Badge> : c.status === 'ok' ? <Badge tone="green">{tt('geprüft')}</Badge> : c.status === 'error' ? <Badge tone="red">{tt('Fehler')}</Badge> : c.status === 'warning' ? <Badge tone="yellow">{tt('Hinweis')}</Badge> : null}
              </div>
              <Caps caps={c.capabilities} labels={capLabels} />
              <div className="small">
                {Object.entries(c.models ?? {})
                  .filter(([, m]) => m)
                  .map(([cap, m]) => (
                    <div key={cap}>
                      <span className="muted">{capLabels[cap] ?? cap}:</span> {String(m)}
                    </div>
                  ))}
              </div>
              {c.status_message && <div className="muted small">{c.status_message}</div>}
              <div className="muted small">
                {c.key_set ? tt('Schlüssel {key_hint}', { key_hint: c.key_hint }) : tt('ohne Schlüssel')}
                {u ? tt(' · diesen Monat {calls} Aufrufe, {usd}', { calls: u.calls, usd: usd(u.cost_usd) }) : ''}
              </div>
              <div className="row">
                <button
                  className="btn small secondary"
                  disabled={busy === c.id}
                  onClick={async () => {
                    setBusy(c.id);
                    const r = await act(() => api.post('/api/ai-connections/test', { id: c.id }));
                    setBusy('');
                    if (r) toast(r.message);
                    void data.reload();
                  }}
                >
                  {busy === c.id ? tt('Teste …') : tt('Testen')}
                </button>
                {presetOf(c.provider)?.list_models && (
                  <button className="btn small secondary" onClick={() => setModels(c)}>
                    {tt('Modelle & Preise')}
                  </button>
                )}
                {c.editable && (
                  <>
                    <button className="btn small secondary" onClick={() => setForm({ preset: presetOf(c.provider), conn: c })}>
                      {tt('Bearbeiten')}
                    </button>
                    <button className="btn small ghost" onClick={async () => confirmAsk(tt('„{label}“ entfernen?', { label: c.label })) && (await act(() => api.del(`/api/ai-connections/${c.id}`), tt('Entfernt'))) && data.reload()}>
                      {tt('Entfernen')}
                    </button>
                  </>
                )}
                {c.implicit && (
                  <a className="btn small ghost" href="/app/settings/ai">
                    {tt('Im KI-Assistenten ändern')}
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <h2 style={{ marginTop: 22 }}>{tt('Anbieter hinzufügen')}</h2>
      <Gallery presets={meta.data.presets} capLabels={capLabels} onPick={(p) => setForm({ preset: p })} onSubscription={(k) => window.dispatchEvent(new CustomEvent('pghl:ai-subscription', { detail: k }))} />
      <p className="muted small">{tt('Amazon Bedrock, Vertex AI & Co.: über einen LiteLLM-Proxy (OpenAI-kompatibel) verbinden. Jede andere OpenAI-kompatible Adresse geht mit „Benutzerdefiniert“.')}</p>
      <p className="muted small" data-tour="aic-voice-link">
        {tt('Stimme, Spracherkennung und Telefon: Anbieter, Stimme und „Stimme testen“ gibt es unter')}{' '}
        <a href="/app/settings/voice" onClick={(e) => (e.preventDefault(), navigate('settings/voice'))}>
          {tt('Einstellungen → Stimme')}
        </a>
        {tt('. Anbieter mit „Live“ können im Telefonat streamen.')}
      </p>
      <div style={{ marginTop: 18 }}>
        <Routing data={data.data} meta={meta.data} agency={agency} onChange={() => void data.reload()} />
      </div>
      <div style={{ marginTop: 18 }}>
        <AiEffort agency={agency} />
      </div>
      {models && <ModelsModal conn={models} preset={presetOf(models.provider)} onClose={() => setModels(null)} onChanged={() => void data.reload()} />}
      {form && (
        <ConnectionForm
          preset={form.preset}
          conn={form.conn}
          meta={meta.data}
          agency={agency}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            void data.reload();
          }}
        />
      )}
    </>
  );
}
