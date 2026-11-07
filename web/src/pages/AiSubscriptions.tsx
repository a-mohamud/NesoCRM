import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useSession } from '../session';
import { Badge, Check, Modal, Spinner, act, confirmAsk, toast, useLoad } from '../ui';
import './AiGallery.css';
import { SortableGrid } from '../sortable/Sortable';
import { tr, useT } from '../i18n';

/**
 * Einstellungen → KI-Anbieter, top: "Mit deinem Abo". Two big cards:
 *  - Mit ChatGPT anmelden – OpenAI's official "Sign in with ChatGPT" for open-source apps (modules/ai-subscriptions.ts): sign in at
 *    OpenAI, paste the address the browser lands on, done. Personal: only you can use it, for your own chats, assistant actions and
 *    Werkstatt builds; refreshes itself; disconnect revokes it.
 *  - Mit Claude verbinden – Anthropic does not allow third-party Claude sign-in, so the way is Claude Code on your own computer (the
 *    bridge: one command, pairing code, live status, your model) or a Console API key.
 * Codex CLI works the same way as Claude Code through the bridge (the fallback when the direct ChatGPT sign-in is not available).
 */

const USAGE_URL = 'https://chatgpt.com/settings/usage';
const POLICY_URL = 'https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use';
const OPENAI_POLICY_URL = 'https://developers.openai.com/siwc/token-sharing-open-source';

const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '–');
const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('de-DE', { dateStyle: 'medium' }) : '–');
export function ago(iso?: string | null, nowMs = Date.now()) {
  const tt = tr('x_ai');
  if (!iso) return tt('noch nie');
  const s = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 1000));
  if (s < 10) return tt('gerade eben');
  if (s < 90) return tt('vor {n} s', { n: s });
  if (s < 5400) return tt('vor {n} Min', { n: Math.round(s / 60) });
  if (s < 129_600) return tt('vor {n} Std', { n: Math.round(s / 3600) });
  return tt('vor {n} Tagen', { n: Math.round(s / 86_400) });
}

function CopyBtn({ text, label = 'Kopieren' }: { text: string; label?: string }) {
  const tt = useT('x_ai');
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn secondary aisub-btn"
      aria-label={`${tt(label)}: ${text.slice(0, 40)}`}
      onClick={async () => {
        try {
          await navigator.clipboard?.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          toast(tt('Kopieren nicht möglich – bitte von Hand markieren.'));
        }
      }}
    >
      {done ? tt('Kopiert ✓') : tt(label)}
    </button>
  );
}
const Code = ({ text, label }: { text: string; label?: string }) => (
  <div className="aisub-code">
    <code>{text}</code>
    <CopyBtn text={text} label={label} />
  </div>
);

// ---------------------------------------------------------------------------------------------------------------
// Mit ChatGPT anmelden
// ---------------------------------------------------------------------------------------------------------------

function ChatGptConnect({ onClose, onDone, again }: { onClose: () => void; onDone: () => void; again: boolean }) {
  const tt = useT('x_ai');
  const [step, setStep] = useState<'intro' | 'paste' | 'done'>('intro');
  const [url, setUrl] = useState('');
  const [expires, setExpires] = useState('');
  const [paste, setPaste] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api.post('/api/ai-subscriptions/chatgpt/start', {});
      setUrl(r.authorize_url);
      setExpires(r.expires_at);
      setStep('paste');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const finish = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post('/api/ai-subscriptions/chatgpt/complete', { callback: paste });
      setStep('done');
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={again ? tt('Neu mit ChatGPT anmelden') : tt('Mit ChatGPT anmelden')} onClose={onClose} wide>
      {step === 'done' ? (
        <>
          <div className="aisub-callout ok">
            <strong>{tt('Du nutzt jetzt dein ChatGPT-Abo.')}</strong>
            {tt('Eligible Anfragen in HyperLevel laufen über deinen ChatGPT-Plan. Nutzung und Limits verwaltest du in ChatGPT unter')}{' '}
            <a href={USAGE_URL} target="_blank" rel="noopener noreferrer">
              {tt('Einstellungen → Nutzung ↗')}
            </a>
            .
          </div>
          <button className="btn aisub-btn" onClick={onClose}>
            {tt('Verstanden')}
          </button>
        </>
      ) : (
        <>
          <div className="aisub-callout">
            <strong>{tt('So funktioniert es')}</strong>
            {tt('Du meldest dich direkt bei ChatGPT an und erlaubst HyperLevel, Modellanfragen über deinen Plan (Plus, Pro, Team) laufen zu lassen. HyperLevel bekommt dabei weder deine Unterhaltungen noch einen API-Schlüssel – und nie dein Passwort. Die Verbindung gehört dir allein: Andere Personen, Agentur-Admins, API-Schlüssel, Workflows und automatische Läufe können sie nicht nutzen.')}
          </div>
          <ol className="aisub-steps">
            <li className={step === 'paste' ? 'done' : ''}>
              <div>
                <h4>{tt('Anmeldung bei ChatGPT öffnen')}</h4>
                {step === 'intro' ? (
                  <>
                    <p className="aisub-note">{tt('Ein neuer Tab öffnet die Anmeldeseite von OpenAI. Dort wählst du dein Konto und den Workspace und erlaubst die Nutzung deines Plans.')}</p>
                    <button className="btn aisub-btn" onClick={start} disabled={busy}>
                      {busy ? tt('Starte …') : tt('Anmeldung starten')}
                    </button>
                  </>
                ) : (
                  <div className="aisub-row">
                    <a className="btn aisub-btn" href={url} target="_blank" rel="noopener noreferrer">
                      {tt('ChatGPT öffnen ↗')}
                    </a>
                    <CopyBtn text={url} label={tt('Link kopieren')} />
                    <span className="aisub-note">{tt('Gültig bis {time} Uhr.', { time: new Date(expires).toLocaleTimeString('de-DE', { timeStyle: 'short' }) })}</span>
                  </div>
                )}
              </div>
            </li>
            <li>
              <div>
                <h4>{tt('Adresse kopieren')}</h4>
                <p className="aisub-note">
                  {tt('Nach dem Erlauben zeigt der Browser eine Fehlerseite („Seite nicht erreichbar“) – das ist richtig: OpenAI erlaubt als Rücksprung nur')} <code>127.0.0.1</code>{tt(', also deinen eigenen Rechner. Kopiere die')} <strong>{tt('komplette Adresse aus der Adresszeile')}</strong>{tt(', sie beginnt mit')} <code>http://127.0.0.1:1455/auth/callback?code=…</code>
                </p>
              </div>
            </li>
            <li>
              <div>
                <h4>{tt('Hier einfügen')}</h4>
                <textarea className="aisub-paste" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="http://127.0.0.1:1455/auth/callback?code=…&state=…&client_id=…" disabled={step !== 'paste'} aria-label={tt('Adresse nach der Anmeldung')} spellCheck={false} />
                {error && <p className="aisub-err" role="alert">{error}</p>}
                <div className="aisub-row" style={{ marginTop: 8 }}>
                  <button className="btn aisub-btn" onClick={finish} disabled={step !== 'paste' || busy || !paste.trim()}>
                    {busy ? tt('Verbinde …') : tt('Verbinden')}
                  </button>
                  <button className="btn secondary aisub-btn" onClick={onClose}>
                    {tt('Abbrechen')}
                  </button>
                </div>
              </div>
            </li>
          </ol>
          {step === 'intro' && error && <p className="aisub-err" role="alert">{error}</p>}
          <p className="aisub-note" style={{ marginTop: 14 }}>
            {tt('Der Code in der Adresse gilt nur einmal und nur zusammen mit einem geheimen Schlüssel, der auf dem HyperLevel-Server bleibt (PKCE). Grundlage: OpenAIs „Sign in with ChatGPT“ für Open-Source-Apps (')}
            <a href={OPENAI_POLICY_URL} target="_blank" rel="noopener noreferrer">
              {tt('Dokumentation ↗')}
            </a>
            ).
          </p>
        </>
      )}
    </Modal>
  );
}

function ChatGptCard({ data, reload, onBridge, open, setOpen }: { data: any; reload: () => void; onBridge: () => void; open: boolean; setOpen: (v: boolean) => void }) {
  const tt = useT('x_ai');
  const session = useSession();
  const admin = session.user.role === 'admin';
  const f = data.features.chatgpt;
  const c = data.chatgpt;
  const [models, setModels] = useState<{ slug: string; name: string }[] | null>(null);
  const [testing, setTesting] = useState(false);
  const connected = !!c?.connected;
  useEffect(() => {
    if (!connected) return setModels(null);
    let live = true;
    api.get('/api/ai-subscriptions/chatgpt/models').then((r) => live && setModels(r.models), () => live && setModels(null));
    return () => {
      live = false;
    };
  }, [connected]);
  const patch = async (body: any) => (await act(() => api.patch('/api/ai-subscriptions/chatgpt', body))) && reload();
  const modelSelect = (key: 'model' | 'werkstatt_model', label: string) => {
    const value = c[key] ?? '';
    return (
      <label>
        {tt(label)}
        {models ? (
          <select value={value} onChange={(e) => void patch({ [key]: e.target.value })}>
            {key === 'werkstatt_model' && <option value="">{tt('wie oben')}</option>}
            {value && !models.some((m) => m.slug === value) && <option value={value}>{value}</option>}
            {models.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.name}
              </option>
            ))}
          </select>
        ) : (
          <input defaultValue={value} onBlur={(e) => e.target.value !== value && void patch({ [key]: e.target.value.trim() })} placeholder={tt('Modell-ID')} />
        )}
      </label>
    );
  };
  return (
    <div className={`aisub-card${f.available || connected ? '' : ' off'}`} data-tour="aisub-chatgpt">
      <div className="aisub-title">
        <span>{tt('ChatGPT-Abo')}</span>
        {connected ? <Badge tone="green">{tt('Verbunden')}</Badge> : c?.status === 'expired' ? <Badge tone="red">{tt('Abgelaufen')}</Badge> : c?.status === 'plan_disabled' ? <Badge tone="yellow">{tt('Plan nicht erlaubt')}</Badge> : !f.available ? <Badge>{tt('nicht verfügbar')}</Badge> : null}
      </div>
      {!connected && (
        <>
          <p className="aisub-sub">{tt('Plus, Pro oder Team: Der KI-Agent, der Assistent und die Werkstatt laufen auf deinem eigenen ChatGPT-Plan – ohne API-Schlüssel, nur für dich persönlich.')}</p>
          {f.available ? (
            <button className="aisub-big" onClick={() => setOpen(true)} data-tour="aisub-chatgpt-btn">
              {c?.status === 'expired' || c?.status === 'plan_disabled' ? tt('Neu mit ChatGPT anmelden') : tt('Mit ChatGPT anmelden')}
            </button>
          ) : (
            <>
              <button className="aisub-big" aria-disabled="true" disabled>
                {tt('Mit ChatGPT anmelden')}
              </button>
              <div className="aisub-callout warn" style={{ margin: 0 }}>
                <strong>{tt('Gerade nicht verfügbar')}</strong>
                {f.reason}
                {admin && f.state === 'off_admin' && (
                  <div style={{ marginTop: 8 }}>
                    <button className="btn aisub-btn" onClick={async () => (await act(() => api.put('/api/ai-subscriptions/admin', { chatgpt: true }), tt('Eingeschaltet'))) && reload()}>
                      {tt('Wieder einschalten (Agentur)')}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
          {c?.status_message && <p className="aisub-note">{c.status_message}</p>}
        </>
      )}
      {connected && (
        <>
          <dl className="aisub-facts">
            <dt>{tt('Konto')}</dt>
            <dd>{c.account_email || '–'}</dd>
            <dt>{tt('Plan')}</dt>
            <dd>{c.plan_label || tt('wird von ChatGPT verwaltet (siehe Nutzung)')}</dd>
            <dt>{tt('Anmeldung')}</dt>
            <dd>{tt('gültig bis {day} – verlängert sich bei jeder Nutzung', { day: day(c.refresh_valid_until) })}</dd>
            <dt>{tt('Zugriff')}</dt>
            <dd>{tt('erneuert sich selbst · läuft {when} ab', { when: when(c.access_expires_at) })}</dd>
            <dt>{tt('Zuletzt genutzt')}</dt>
            <dd>
              {tt('{ago} · 30 Tage: {calls} Anfragen,', { ago: ago(c.last_used_at), calls: c.last30.calls })} {(c.last30.input_tokens + c.last30.output_tokens).toLocaleString('de-DE')} {tt('Tokens')}
            </dd>
          </dl>
          {c.status_message && <div className="aisub-callout warn" style={{ margin: 0 }}>{c.status_message}</div>}
          <div className="aisub-device-fields">
            {modelSelect('model', 'Modell')}
            {modelSelect('werkstatt_model', 'Modell für die Werkstatt')}
          </div>
          <div className="aisub-uses" role="group" aria-label={tt('Wofür darf dein Abo genutzt werden?')}>
            {data.uses.map((u: any) => (
              <Check key={u.id} checked={!!c.uses[u.id]} onChange={(v) => void patch({ uses: { [u.id]: v } })} label={<span title={tt(u.hint)}>{tt(u.label)}</span>} />
            ))}
          </div>
          <div className="aisub-row">
            <button
              className="btn secondary aisub-btn"
              disabled={testing}
              onClick={async () => {
                setTesting(true);
                const r = await act(() => api.post('/api/ai-subscriptions/chatgpt/test', {}));
                setTesting(false);
                if (r) toast(r.message);
                reload();
              }}
            >
              {testing ? tt('Teste …') : tt('Verbindung testen')}
            </button>
            <button className="btn secondary aisub-btn" onClick={() => setOpen(true)}>
              {tt('Neu anmelden')}
            </button>
            <button
              className="btn ghost aisub-btn"
              onClick={async () => {
                if (!confirmAsk(tt('ChatGPT-Abo trennen? HyperLevel widerruft die Freigabe bei OpenAI und löscht die Zugangsdaten.'))) return;
                const r = await act(() => api.del('/api/ai-subscriptions/chatgpt'));
                if (r) toast(r.revoked ? tt('Getrennt – Freigabe bei OpenAI widerrufen') : r.note);
                reload();
              }}
            >
              {tt('Trennen')}
            </button>
          </div>
          <a className="aisub-link" href={USAGE_URL} target="_blank" rel="noopener noreferrer">
            {tt('Nutzung und Limits in ChatGPT verwalten ↗')}
          </a>
        </>
      )}
      <p className="aisub-note">{tt('Die Nutzung zählt auf das Limit deines Plans (bei Plus teilen sich alle Apps ein 5-Stunden-Limit). Es gelten OpenAIs Bedingungen für deinen Plan.')}</p>
      <div className="aisub-row">
        <button type="button" className="btn secondary aisub-btn" onClick={onBridge} data-tour="aisub-codex">
          {tt('Oder: über die Codex CLI auf deinem Rechner')}
        </button>
      </div>
      {open && (
        <ChatGptConnect
          again={connected}
          onClose={() => {
            setOpen(false);
            reload();
          }}
          onDone={reload}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Mit Claude verbinden (and Codex): the local bridge
// ---------------------------------------------------------------------------------------------------------------

export function BridgeConnect({ cli, onClose }: { cli: 'claude' | 'codex'; onClose: () => void }) {
  const tt = useT('x_ai');
  const session = useSession();
  const admin = session.user.role === 'admin';
  const st = useLoad(() => api.get('/api/agent/bridge'), []);
  const [code, setCode] = useState<any>(null);
  const [left, setLeft] = useState(0);
  const [os, setOs] = useState<'unix' | 'windows'>(/Windows/i.test(navigator.userAgent) ? 'windows' : 'unix');
  const [tick, setTick] = useState(Date.now());
  const reload = st.reload;
  useEffect(() => {
    // live status: ask again every few seconds while this window is open and visible
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void reload();
      setTick(Date.now());
    }, 4000);
    return () => clearInterval(t);
  }, [reload]);
  useEffect(() => {
    if (!code) return;
    const t = setInterval(() => setLeft(Math.max(0, Math.round((Date.parse(code.expires_at) - Date.now()) / 1000))), 1000);
    setLeft(Math.max(0, Math.round((Date.parse(code.expires_at) - Date.now()) / 1000)));
    return () => clearInterval(t);
  }, [code]);
  const name = cli === 'claude' ? 'Claude Code' : 'Codex CLI';
  const install = cli === 'claude' ? ['npm i -g @anthropic-ai/claude-code', 'claude'] : ['npm i -g @openai/codex', 'codex login'];
  const enabled = !!st.data?.enabled;
  const devices: any[] = st.data?.devices ?? [];
  const generate = async () => {
    const r = await act(() => api.post('/api/agent/bridge/code', {}));
    if (r) setCode(r);
  };
  const cmd = code ? (os === 'windows' ? code.command_windows : code.command_oneline) : '';
  return (
    <Modal title={cli === 'claude' ? tt('Mit Claude verbinden') : tt('ChatGPT über die Codex CLI verbinden')} onClose={onClose} wide>
      {cli === 'claude' ? (
        <div className="aisub-callout">
          <strong>{tt('Warum läuft das über deinen Rechner?')}</strong>
          {tt('Anthropic erlaubt Drittanbietern keine „Mit Claude anmelden“-Funktion und keine Anfragen über Free-, Pro- oder Max-Zugänge. Deshalb meldest du dich in')} <strong>{tt('Claude Code auf deinem eigenen Rechner')}</strong> {tt('an – dein Abo-Login bleibt dort, HyperLevel sieht ihn nie. Die Bridge reicht nur deine Chat-Aufträge an Claude Code weiter (')}
          <a href={POLICY_URL} target="_blank" rel="noopener noreferrer">
            {tt('Anthropics Regel ↗')}
          </a>
          ).
        </div>
      ) : (
        <div className="aisub-callout">
          <strong>{tt('Die Alternative zur direkten Anmeldung')}</strong>
          {tt('Die offizielle Codex CLI läuft mit deinem ChatGPT-Abo auf deinem eigenen Rechner. HyperLevel gibt ihr die Aufträge – dein Login verlässt den Rechner nicht. Das hilft auch, wenn „Mit ChatGPT anmelden“ auf dieser Installation nicht verfügbar ist.')}
        </div>
      )}
      <div className="aisub-callout warn">
        <strong>{tt('Gut zu wissen')}</strong>
        {tt('Läuft nur, solange dein Rechner an ist und die Bridge läuft · nur für dich persönlich (keine Automationen, Workflows oder andere Personen) · zählt auf das Limit deines')} {cli === 'claude' ? 'Claude' : 'ChatGPT'}{tt('-Plans.')}
      </div>
      {!enabled && st.data && (
        <div className="aisub-callout warn">
          <strong>{tt('Die Bridge ist für diese Agentur ausgeschaltet.')}</strong>
          {admin ? (
            <div style={{ marginTop: 8 }}>
              <button className="btn aisub-btn" onClick={async () => (await act(() => api.put('/api/agent/agency-settings', { bridge_enabled: true }), tt('Bridge erlaubt'))) && reload()}>
                {tt('Bridge für diese Agentur erlauben')}
              </button>
            </div>
          ) : (
            tt(' Bitte einen Agentur-Admin, sie unter KI-Agenten → In ChatGPT & Claude zu erlauben.')
          )}
        </div>
      )}
      <ol className="aisub-steps">
        <li className={devices.length ? 'done' : ''}>
          <div>
            <h4>{tt('{name} installieren und anmelden', { name: name })}</h4>
            <p className="aisub-note">{tt('Einmal auf deinem Rechner (Node.js 18 oder neuer). Melde dich dort mit deinem')} {cli === 'claude' ? 'Claude' : 'ChatGPT'}{tt('-Konto an.')}</p>
            {install.map((c) => (
              <Code key={c} text={c} />
            ))}
          </div>
        </li>
        <li className={devices.length ? 'done' : ''}>
          <div>
            <h4>{tt('Rechner verbinden')}</h4>
            {!code || left === 0 ? (
              <>
                <p className="aisub-note">{code ? tt('Der Code ist abgelaufen.') : tt('Erzeugt einen Code, der 10 Minuten und nur einmal gilt.')}</p>
                <button className="btn aisub-btn" onClick={generate} disabled={!enabled}>
                  {code ? tt('Neuen Code erzeugen') : tt('Verbindungs-Code erzeugen')}
                </button>
              </>
            ) : (
              <>
                <div className="aisub-pair">
                  <div>
                    <div className="big-code" aria-label={tt('Code {code}', { code: code.code })}>
                      {code.code}
                    </div>
                    <div className="aisub-note">
                      {tt('noch {time} gültig · nur einmal benutzbar', { time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` })}
                    </div>
                  </div>
                  <img alt={tt('QR-Code des Koppel-Befehls')} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(code.qr_svg)}`} />
                </div>
                <div className="aisub-tabs" role="group" aria-label={tt('Betriebssystem')}>
                  <button type="button" aria-pressed={os === 'unix'} onClick={() => setOs('unix')}>
                    {tt('macOS / Linux')}
                  </button>
                  <button type="button" aria-pressed={os === 'windows'} onClick={() => setOs('windows')}>
                    {tt('Windows (PowerShell)')}
                  </button>
                </div>
                <Code text={cmd} label={tt('Befehl kopieren')} />
                <p className="aisub-note">
                  {tt('Der Befehl lädt die Bridge von deinem HyperLevel, koppelt und startet sie – danach das Terminal offen lassen. Der QR-Code enthält den Koppel-Befehl: mit dem Handy scannen und an deinen Rechner schicken. Nur Koppeln ohne Download:')} <code>{code.command}</code>
                </p>
              </>
            )}
          </div>
        </li>
        <li className={devices.some((d) => d.online) ? 'done' : ''}>
          <div>
            <h4>{tt('Status')}</h4>
            {st.loading && !st.data ? (
              <Spinner />
            ) : !devices.length ? (
              <div className="aisub-row">
                <span className="dot wait" aria-hidden="true" /> <span className="aisub-note">{tt('Noch kein Rechner verbunden – ich warte auf den Befehl …')}</span>
              </div>
            ) : (
              devices.map((d) => (
                <div key={d.id} className="aisub-device">
                  <div className="aisub-device-head">
                    <span className={`dot ${d.online ? 'on' : ''}`} aria-hidden="true" />
                    <span className="grow">{d.name}</span>
                    <Badge tone={d.online ? 'green' : 'gray'}>{d.online ? tt('Verbunden') : tt('Offline')}</Badge>
                    <span className="aisub-note">{tt('zuletzt gesehen {ago}', { ago: ago(d.last_seen_at, tick) })}</span>
                  </div>
                  <div className="aisub-device-fields">
                    <label>
                      {tt('Programm')}
                      <select value={d.cli} onChange={async (e) => (await act(() => api.patch(`/api/agent/bridge/devices/${d.id}`, { cli: e.target.value }))) && reload()}>
                        <option value="claude" disabled={!d.clis.includes('claude')}>
                          {tt('Claude Code')}{d.clis.includes('claude') ? '' : tt(' (nicht gefunden)')}
                        </option>
                        <option value="codex" disabled={!d.clis.includes('codex')}>
                          {tt('Codex CLI')}{d.clis.includes('codex') ? '' : tt(' (nicht gefunden)')}
                        </option>
                      </select>
                    </label>
                    <label>
                      {tt('Modell (leer = Standard der CLI)')}
                      <input key={`${d.id}:${d.model}`} defaultValue={d.model} placeholder={d.cli === 'claude' ? tt('z. B. claude-sonnet-5-5') : tt('z. B. gpt-6.1-sol')} onBlur={async (e) => e.target.value.trim() !== d.model && (await act(() => api.patch(`/api/agent/bridge/devices/${d.id}`, { model: e.target.value.trim() }), tt('Modell gespeichert'))) && reload()} />
                    </label>
                    <label>
                      {tt('Bridge-Version')}
                      <input value={d.version || '–'} readOnly />
                    </label>
                  </div>
                  <div className="aisub-row">
                    <span className="aisub-note grow">{tt('Im KI-Agent-Chat oben das Modell „Mein Abo über die Bridge“ wählen.')}</span>
                    <button className="btn ghost aisub-btn" onClick={async () => confirmAsk(tt('„{name}“ entfernen?', { name: d.name })) && (await act(() => api.del(`/api/agent/bridge/devices/${d.id}`))) && reload()}>
                      {tt('Entfernen')}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </li>
      </ol>
      <p className="aisub-note" style={{ marginTop: 12 }}>
        {tt('Die Bridge verbindet sich von selbst neu, nach Netzproblemen und nach einem Neustart von HyperLevel. Beim Anmelden des Rechners starten lassen: siehe Dokumentation „KI-Anbieter → Bridge“.')}
      </p>
    </Modal>
  );
}

function ClaudeCard({ bridge, onOpen, onAdd }: { bridge: any; onOpen: () => void; onAdd: (id: string) => void }) {
  const tt = useT('x_ai');
  const devices: any[] = bridge?.devices ?? [];
  const live = devices.find((d) => d.online);
  return (
    <div className="aisub-card" data-tour="aisub-claude">
      <div className="aisub-title">
        <span>{tt('Claude-Abo')}</span>
        {live ? <Badge tone="green">{tt('Verbunden')}</Badge> : devices.length ? <Badge>{tt('Offline')}</Badge> : null}
      </div>
      <p className="aisub-sub">{tt('Pro oder Max: Claude Code läuft mit deinem Abo auf deinem Rechner und beantwortet die Aufträge deines KI-Agenten. Dein Abo-Login bleibt dort.')}</p>
      <button className="aisub-big claude" onClick={onOpen} data-tour="aisub-claude-btn">
        {tt('Mit Claude verbinden')}
      </button>
      {devices.length > 0 && (
        <p className="aisub-note">
          <span className={`dot ${live ? 'on' : ''}`} aria-hidden="true" /> {live ? `${live.name} · ${live.cli === 'claude' ? tt('Claude Code') : tt('Codex CLI')}${live.model ? ` · ${live.model}` : ''}` : tt('{name} – zuletzt gesehen {ago}', { name: devices[0].name, ago: ago(devices[0].last_seen_at) })}
        </p>
      )}
      <p className="aisub-note">
        {tt('Anthropic erlaubt keine Claude-Anmeldung in Drittanbieter-Apps (')}
        <a href={POLICY_URL} target="_blank" rel="noopener noreferrer">
          {tt('Quelle ↗')}
        </a>
        {tt(') – deshalb läuft dein Abo über Claude Code auf deinem Rechner.')}
      </p>
      <div className="aisub-row">
        <button type="button" className="btn secondary aisub-btn" onClick={() => onAdd('anthropic')}>
          {tt('Oder: Claude über API-Schlüssel (Console)')}
        </button>
      </div>
    </div>
  );
}

export function AiSubscriptions({ onAddProvider }: { onAddProvider: (presetId: string) => void }) {
  const tt = useT('x_ai');
  const subs = useLoad(() => api.get('/api/ai-subscriptions'), []);
  const [modal, setModal] = useState<'claude' | 'codex' | null>(null);
  const [chatgpt, setChatgpt] = useState(false);
  const reload = subs.reload;
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useEffect(() => {
    // the provider gallery opens the same dialogs
    const on = (e: Event) => {
      const kind = (e as CustomEvent).detail;
      if (kind === 'claude' || kind === 'codex') setModal(kind);
      if (kind === 'chatgpt') {
        setChatgpt(true);
        document.querySelector('[data-tour="aisub-chatgpt"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    };
    window.addEventListener('pghl:ai-subscription', on);
    return () => window.removeEventListener('pghl:ai-subscription', on);
  }, []);
  useEffect(() => {
    if (!modal) void reloadRef.current();
  }, [modal]);
  if (subs.error && !subs.data) return null;
  if (!subs.data) return <Spinner />;
  const d = subs.data;
  return (
    <section className="aisub" data-tour="aisub">
      <h2>{tt('Mit deinem Abo')}</h2>
      <p className="muted">
        {tt('Nutze dein ChatGPT- oder Claude-Abo statt eines API-Schlüssels. Die Anmeldung gehört dir persönlich – andere Personen, Workflows und automatische Läufe können sie nicht nutzen.')}
      </p>
      <SortableGrid id="ai-subscriptions" className="aisub-grid">
        <ChatGptCard data={d} reload={reload} onBridge={() => setModal('codex')} open={chatgpt && d.features.chatgpt.available} setOpen={setChatgpt} />
        <ClaudeCard bridge={d.bridge} onOpen={() => setModal('claude')} onAdd={onAddProvider} />
      </SortableGrid>
      {d.can_admin && (
        <div className="aisub-alt">
          <Check
            checked={d.features.chatgpt.state !== 'off_admin'}
            onChange={async (v) => (await act(() => api.put('/api/ai-subscriptions/admin', { chatgpt: v }), v ? tt('„Mit ChatGPT anmelden“ eingeschaltet') : tt('„Mit ChatGPT anmelden“ ausgeschaltet'))) && reload()}
            label={tt('„Mit ChatGPT anmelden“ für diese Agentur erlauben (Agentur-Admin)')}
          />
        </div>
      )}
      {modal && (
        <BridgeConnect
          cli={modal}
          onClose={() => {
            setModal(null);
            void reload();
          }}
        />
      )}
    </section>
  );
}
