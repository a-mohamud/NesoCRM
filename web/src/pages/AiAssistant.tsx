import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../icons';
import { api, currentLocation, dt } from '../api';
import { Badge, Check, Empty, Field, Input, Link, MergeHint, Select, Spinner, Stat, TagInput, Tabs, Textarea, act, confirmAsk, toast, useLoad } from '../ui';
import { AiProviderCard } from './AiProvider';
import { SignupLink } from '../referrals';
import { MoreFields } from '../areas/fields';
import { lazyPages } from '../lazy';
import { SortableGrid } from '../sortable/Sortable';
import { useT } from '../i18n';
// "Termin buchen" of the chat bot – a part of the calendar view's chunk (docs/booking.md#ai-books-appointments).
const { AiBookingSettings } = lazyPages(() => import('./AiBookingSettings'), 'AiBookingSettings');

/** KI-Assistent: settings tab, inbox helpers (suggest button, side panel) and the workflow step. */

const DAYS: [string, string][] = [
  ['mon', 'Montag'],
  ['tue', 'Dienstag'],
  ['wed', 'Mittwoch'],
  ['thu', 'Donnerstag'],
  ['fri', 'Freitag'],
  ['sat', 'Samstag'],
  ['sun', 'Sonntag'],
];
const MODES: [string, string][] = [
  ['off', 'Aus – nur Vorschläge für das Team'],
  ['after_hours', 'Außerhalb der Geschäftszeiten antworten'],
  ['always', 'Immer antworten'],
];
const STATUS: Record<string, [string, 'green' | 'red' | 'yellow']> = { ok: ['ok', 'green'], error: ['Fehler', 'red'], blocked: ['Limit', 'yellow'] };

/** Option labels are German message ids – translated where they are shown. */
const tl = (tt: (s: string) => string, list: [string, string][]): [string, string][] => list.map(([k, l]) => [k, tt(l)]);

const usd = (v: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: v > 0 && v < 0.1 ? 4 : 2 }).format(v || 0);
const n = (v: number) => new Intl.NumberFormat('de-DE').format(v || 0);

export const isBotMessage = (m: any) => typeof m?.source === 'string' && m.source.startsWith('KI-');

/** Shared, briefly cached: is the assistant on for this sub-account? */
let statusCache: { at: number; loc: string; p: Promise<any> } | null = null;
function useAiStatus() {
  const loc = currentLocation();
  return useLoad(() => {
    if (!statusCache || statusCache.loc !== loc || Date.now() - statusCache.at > 60_000) statusCache = { at: Date.now(), loc, p: api.get('/api/ai/status').catch(() => ({ enabled: false })) };
    return statusCache.p;
  }, [loc]);
}

// --- settings ------------------------------------------------------------------------------

export function AiSettings() {
  const tt = useT('x_ai');
  const info = useLoad(() => api.get<any>('/api/ai/settings'), []);
  const [s, setS] = useState<any>();
  const [key, setKey] = useState('');
  const [editKey, setEditKey] = useState(false);
  const [tab, setTab] = useState('setup');
  const [picked, setPicked] = useState<string | null>(null);
  const providerDraft = useRef<Record<string, string> | null>(null);
  const [providerVersion, setProviderVersion] = useState(0);
  useEffect(() => setS(info.data?.settings), [info.data]);
  if (!s || !info.data) return info.error ? <Empty>{info.error}</Empty> : <Spinner />;
  const d = info.data;
  // OpenAI chosen (modules/ai-providers.ts): the Anthropic key and model fields step aside.
  const savedOpenai = d.provider?.id === 'openai';
  const openai = (picked ?? d.provider?.id) === 'openai';
  const set = (p: any) => setS({ ...s, ...p });
  const save = async (extra: any = {}) => {
    // An unsaved provider choice (and OpenAI key/model) is saved first, so „einschalten“ checks the right key.
    if (providerDraft.current) {
      const ok = await act(() => api.put('/api/ai/provider', providerDraft.current));
      if (!ok) return;
      providerDraft.current = null;
      setProviderVersion((v) => v + 1);
    }
    const r = await act(() => api.put('/api/ai/settings', { ...s, ...(key.trim() ? { api_key: key.trim() } : {}), ...extra }), tt('Gespeichert'));
    if (r) {
      info.setData(r);
      setKey('');
      setEditKey(false);
      statusCache = null;
    }
  };
  const saveBtn = (
    <p>
      <button className="btn" onClick={() => save()}>
        {tt('Speichern')}
      </button>
    </p>
  );
  return (
    <div style={{ maxWidth: 860 }}>
      <div className="card ai-status" data-tour="ai-status">
        <Icon name="ai" size={20} />
        <div className="grow">
          <strong>{tt('KI-Assistent')} {d.settings.enabled ? <Badge tone="green">{tt('an')}</Badge> : <Badge>{tt('aus')}</Badge>}</strong>
          <div className="muted small">
            {d.settings.enabled
              ? `${savedOpenai ? tt('OpenAI · {model}', { model: d.provider.model }) : (d.models.find((m: any) => m.id === d.settings.model)?.label ?? d.settings.model)}${tt(' · Live-Chat-Bot: {mode}', { mode: tt(MODES.find(([k]) => k === d.settings.bot_mode)?.[1] ?? '') })}${d.settings.bot_mode !== 'off' ? (d.bot_active_now ? tt(' (antwortet gerade)') : tt(' (schweigt gerade)')) : ''}`
              : tt('Vorschläge, Zusammenfassungen und Chat-Bot mit {model} – mit deinem eigenen {provider}-Schlüssel.', { model: savedOpenai ? tt('OpenAI (GPT)') : 'Claude', provider: savedOpenai ? 'OpenAI' : 'Anthropic' })}
          </div>
        </div>
        <div className="ai-usage-mini">
          <div className="small muted">
            {tt('Diesen Monat {usd} von {usd2}', { usd: usd(d.usage.cost_usd), usd2: usd(d.usage.limit_usd) })}
          </div>
          <div className="bar">
            <div style={{ width: `${Math.min(100, (d.usage.cost_usd / d.usage.limit_usd) * 100)}%` }} />
          </div>
        </div>
      </div>
      <Tabs
        tabs={[
          ['setup', tt('Einrichtung')],
          ['knowledge', tt('Wissen')],
          ['bot', tt('Live-Chat-Bot')],
          ['usage', tt('Nutzung & Limit')],
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'setup' && (
        <div className="card">
          <AiProviderCard onChange={() => info.reload()} onPick={setPicked} onDraft={(b) => (providerDraft.current = b)} version={providerVersion} />
          {!openai && (
          <>
          <Field
            tour="ai-key"
            label={tt('Anthropic-API-Schlüssel')}
            hint={
              <>
                {tt('Bekommst du in der')} <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">{tt('Anthropic Console')}</a> {tt('unter „API Keys“. Er wird verschlüsselt gespeichert und nie wieder angezeigt; die Kosten laufen über dein Anthropic-Konto.')} <SignupLink id="anthropic" />
              </>
            }
          >
            {d.key_set && !editKey ? (
              <div className="row" style={{ alignItems: 'center' }}>
                <Badge tone="green">hinterlegt {d.key_hint}</Badge>
                <button className="btn small secondary" onClick={() => setEditKey(true)}>
                  {tt('Ersetzen')}
                </button>
                <button className="btn small secondary" onClick={() => confirmAsk(tt('Schlüssel entfernen? Der Assistent wird dann ausgeschaltet.')) && save({ api_key: null, enabled: false })}>
                  {tt('Entfernen')}
                </button>
              </div>
            ) : (
              <Input type="password" autoComplete="off" value={key} onChange={setKey} placeholder={d.key_source === 'server' ? tt('leer = Schlüssel des Servers nutzen') : 'sk-ant-…'} />
            )}
          </Field>
          {d.key_source === 'server' && !d.key_set && <p className="muted small">{tt('Es wird der Schlüssel aus der Server-Umgebung genutzt (PGHL_ANTHROPIC_API_KEY).')}</p>}
          <p>
            <button
              className="btn secondary"
              disabled={!key.trim() && !d.key_set && d.key_source !== 'server'}
              onClick={async () => {
                const r = await act(() => api.post('/api/ai/test', { api_key: key.trim() || undefined, model: s.model }));
                if (r) toast(tt('Verbindung ok – {name} erreichbar', { name: r.name }));
              }}
            >
              {tt('Verbindung testen')}
            </button>
          </p>
          </>
          )}
          <Check checked={s.enabled} onChange={(v) => set({ enabled: v })} label={tt('KI-Assistent einschalten')} />
          <div className="grid2">
            {!openai && (
              <Field tour="ai-model" label={tt('Modell')} hint={tt('Sonnet reicht für fast alles; Opus für knifflige Fälle, Haiku für viel Chat zu kleinem Preis.')}>
                <Select value={s.model} onChange={(v) => set({ model: v })} options={d.models.map((m: any) => [m.id, m.label])} />
              </Field>
            )}
          </div>
          <Field tour="ai-facts" label={tt('Fakten zum Unternehmen')} hint={tt('Leistungen, Preise, Region, Öffnungszeiten, Ansprechpartner, Links (Termin buchen, Preisliste) …')}>
            <Textarea value={s.facts} onChange={(v) => set({ facts: v })} rows={6} />
          </Field>
          <MoreFields id="ai-persona" values={[s.assistant_name, s.persona]}>
            <Field label={tt('Name im Chat')}>
              <Input value={s.assistant_name} onChange={(v) => set({ assistant_name: v })} placeholder={tt('z. B. Paula')} />
            </Field>
            <Field tour="ai-persona" label={tt('Tonfall & Persona')} hint={tt('Wie soll der Assistent klingen? Du oder Sie, locker oder förmlich, was ist tabu?')}>
              <Textarea value={s.persona} onChange={(v) => set({ persona: v })} rows={3} />
            </Field>
          </MoreFields>
          {key.trim() && !s.enabled && <p className="muted small">{tt('Tipp: Haken bei „einschalten“ setzen, damit der Assistent nach dem Speichern loslegt.')}</p>}
          {saveBtn}
        </div>
      )}
      {tab === 'knowledge' && (
        <div className="card" data-tour="ai-knowledge">
          <h2>{tt('Fragen & Antworten')}</h2>
          <p className="muted small">{tt('Der Assistent nutzt nur dieses Wissen als Fakten – was hier nicht steht, gibt er ans Team weiter.')}</p>
          {s.knowledge.map((k: any, i: number) => (
            <div key={i} className="ai-qa">
              <Input value={k.q} onChange={(v) => set({ knowledge: s.knowledge.map((x: any, j: number) => (j === i ? { ...x, q: v } : x)) })} placeholder={tt('Frage, z. B. Was kostet eine Website?')} />
              <Textarea value={k.a} onChange={(v) => set({ knowledge: s.knowledge.map((x: any, j: number) => (j === i ? { ...x, a: v } : x)) })} rows={2} placeholder={tt('Antwort')} />
              <button className="icon-btn" aria-label={tt('Frage entfernen')} onClick={() => set({ knowledge: s.knowledge.filter((_: any, j: number) => j !== i) })}>
                ✕
              </button>
            </div>
          ))}
          <p>
            <button className="btn small secondary" onClick={() => set({ knowledge: [...s.knowledge, { q: '', a: '' }] })}>
              {tt('+ Frage hinzufügen')}
            </button>
          </p>
          <Field label={tt('Weiteres Wissen (Freitext)')} hint={tt('Abläufe, Bedingungen, Lieferzeiten, Garantie, Datenschutz-Hinweise … Keine Passwörter oder Zugangsdaten eintragen.')}>
            <Textarea value={s.knowledge_text} onChange={(v) => set({ knowledge_text: v })} rows={8} />
          </Field>
          <Check checked={s.use_project_profile} onChange={(v) => set({ use_project_profile: v })} label={<>{tt('Projekt-Steckbrief mitschicken')} {d.sources.profile ? <Badge tone="green">{tt('vorhanden')}</Badge> : <Badge>{tt('leer')}</Badge>}</>} />
          <Check checked={s.use_faq_blocks} onChange={(v) => set({ use_faq_blocks: v })} label={<>{tt('FAQ-Blöcke aus Funnels & Websites mitschicken')} <Badge tone={d.sources.faq_count ? 'green' : 'gray'}>{tt('{faq_count} Fragen', { faq_count: d.sources.faq_count })}</Badge></>} />
          <p className="muted small">{tt('Kontaktdaten, die letzten 20 Nachrichten und dieses Wissen gehen bei jeder Anfrage an Claude; Schlüssel, Passwörter, Kartennummern und IBANs werden vorher entfernt. Das Wissen wird zwischengespeichert (Prompt-Caching), wiederholte Anfragen kosten dafür nur einen Bruchteil.')}</p>
          {saveBtn}
        </div>
      )}
      {tab === 'bot' && <BotSettings s={s} set={set} d={d} saveBtn={saveBtn} />}
      {tab === 'bot' && <AiBookingSettings />}
      {tab === 'usage' && <Usage s={s} set={set} saveBtn={saveBtn} />}
    </div>
  );
}

function BotSettings({ s, set, d, saveBtn }: { s: any; set: (p: any) => void; d: any; saveBtn: ReactNode }) {
  const tt = useT('x_ai');
  const pipelines = useLoad(() => api.get<any[]>('/api/pipelines'), []);
  const pipe = (pipelines.data ?? []).find((p) => p.id === s.pipeline_id);
  const hours = s.business_hours;
  const setDay = (day: string, p: any) => set({ business_hours: { ...hours, [day]: { ...hours[day], ...p } } });
  return (
    <div className="card">
      <Field label={tt('Website-Chat')} hint={<>{tt('Der Bot antwortet im Live-Chat (Einstellungen → Live-Chat). Seine Nachrichten sind im Posteingang lila markiert und beginnen mit 🤖.')}</>}>
        <Select value={s.bot_mode} onChange={(v) => set({ bot_mode: v })} options={tl(tt, MODES)} />
      </Field>
      {s.bot_mode !== 'off' && (
        <p className="small">
          {d.open_now ? tt('Gerade ist Geschäftszeit') : tt('Gerade ist außerhalb der Geschäftszeiten')} ({d.timezone}) – {d.bot_active_now ? <Badge tone="green">{tt('Bot antwortet')}</Badge> : <Badge>{tt('Bot schweigt')}</Badge>}
          <span className="muted"> {tt('(Stand nach dem letzten Speichern)')}</span>
        </p>
      )}
      <h2 style={{ marginTop: 16 }}>{tt('Geschäftszeiten')}</h2>
      <p className="muted small">{tt('Gleiche Uhrzeit bei „von“ und „bis“ (z. B. 00:00–00:00) = rund um die Uhr.')}</p>
      <div className="ai-hours">
        {DAYS.map(([k, l]) => (
          <div key={k} className="ai-hours-row">
            <Check checked={hours[k]?.open} onChange={(v) => setDay(k, { open: v })} label={tt(l)} />
            <input type="time" value={hours[k]?.from ?? '09:00'} disabled={!hours[k]?.open} onChange={(e) => setDay(k, { from: e.target.value })} aria-label={tt('{l} von', { l: tt(l) })} />
            <span className="muted">{tt('bis')}</span>
            <input type="time" value={hours[k]?.to ?? '17:00'} disabled={!hours[k]?.open} onChange={(e) => setDay(k, { to: e.target.value })} aria-label={tt('{l} bis', { l: tt(l) })} />
          </div>
        ))}
      </div>
      <h2 style={{ marginTop: 16 }}>{tt('Übergabe an das Team')}</h2>
      <p className="muted small">{tt('Der Bot übergibt, wenn jemand einen Menschen verlangt, ein Stichwort fällt, er unsicher ist oder die Höchstzahl an Antworten erreicht ist. Das Team bekommt eine E-Mail (Firmen-E-Mail), der Bot schweigt danach in diesem Gespräch.')}</p>
      <Field label={tt('Stichwörter für sofortige Übergabe')}>
        <TagInput value={s.handoff_keywords} onChange={(v) => set({ handoff_keywords: v })} placeholder={tt('Wort + Enter')} />
      </Field>
      <Field label={tt('Text bei Übergabe')}>
        <Input value={s.handoff_message} onChange={(v) => set({ handoff_message: v })} />
      </Field>
      <MoreFields id="ai-bot-handoff">
      <div className="grid2">
        <Field label={tt('Mindest-Sicherheit: {round} %', { round: Math.round(s.min_confidence * 100) })} hint={tt('Darunter übergibt der Bot statt zu raten.')}>
          <input type="range" min={0} max={100} step={5} value={Math.round(s.min_confidence * 100)} onChange={(e) => set({ min_confidence: Number(e.target.value) / 100 })} />
        </Field>
        <Field label={tt('Höchstens Bot-Antworten pro Gespräch')}>
          <Input type="number" min={1} max={50} value={s.max_bot_replies} onChange={(v) => set({ max_bot_replies: Number(v) })} />
        </Field>
      </div>
      </MoreFields>
      <h2 style={{ marginTop: 16 }}>{tt('Leads')}</h2>
      <Check checked={s.lead_capture} onChange={(v) => set({ lead_capture: v })} label={tt('Nach Name und E-Mail fragen, wenn sie fehlen, und den Kontakt ergänzen')} />
      <Check checked={s.create_opportunity} onChange={(v) => set({ create_opportunity: v })} label={tt('Bei Kaufinteresse eine Opportunity anlegen')} />
      {s.create_opportunity && (
        <div className="grid2">
          <Field label="Pipeline">
            <Select value={s.pipeline_id} onChange={(v) => set({ pipeline_id: v, stage_id: '' })} placeholder={tt('wählen…')} options={(pipelines.data ?? []).map((p) => [p.id, p.name])} />
          </Field>
          {pipe && (
            <Field label={tt('Stufe')}>
              <Select value={s.stage_id} onChange={(v) => set({ stage_id: v })} placeholder={tt('erste Stufe')} options={pipe.stages.map((x: any) => [x.id, x.name])} />
            </Field>
          )}
        </div>
      )}
      <Check checked={s.create_task} onChange={(v) => set({ create_task: v })} label={tt('Bei Kaufinteresse eine Aufgabe „Chat-Lead nachfassen“ anlegen')} />
      <h2 style={{ marginTop: 16 }}>{tt('E-Mail')}</h2>
      <Check checked={s.email_drafts} onChange={(v) => set({ email_drafts: v })} label={tt('Für eingehende E-Mails einen Antwort-Entwurf anlegen')} />
      <p className="muted small">{tt('E-Mails verschickt der Assistent nie selbst – Entwürfe erscheinen in der Konversation zum Prüfen, Senden oder Verwerfen (höchstens 30 pro Stunde).')}</p>
      {saveBtn}
    </div>
  );
}

function Usage({ s, set, saveBtn }: { s: any; set: (p: any) => void; saveBtn: ReactNode }) {
  const tt = useT('x_ai');
  const u = useLoad(() => api.get<any>('/api/ai/usage?limit=200'), []);
  if (!u.data) return u.error ? <Empty>{u.error}</Empty> : <Spinner />;
  const m = u.data.month;
  const pct = Math.min(100, (m.cost_usd / m.limit_usd) * 100);
  const label = (p: string) => u.data.purposes[p] ?? p;
  return (
    <>
      <SortableGrid id="ai-assistant.stats" className="stats">
        <Stat label={tt('Kosten diesen Monat')} value={usd(m.cost_usd)} sub={<>{tt('von {usd} Limit', { usd: usd(m.limit_usd) })}</>} />
        <Stat label={tt('Tokens')} value={n(m.tokens)} sub={m.token_limit ? tt('von {n}', { n: n(m.token_limit) }) : tt('kein Token-Limit')} />
        <Stat label={tt('KI-Aufrufe')} value={n(m.calls)} sub={tt('seit {toLocaleDateString}', { toLocaleDateString: new Date(m.since).toLocaleDateString('de-DE') })} />
      </SortableGrid>
      <div className="card">
        <div className="bar" style={{ marginBottom: 12 }}>
          <div style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--red)' : pct > 80 ? 'var(--yellow)' : undefined }} />
        </div>
        <div className="grid2">
          <Field label={tt('Monatslimit (US-Dollar)')} hint={tt('Ist es erreicht, macht der Assistent bis Monatsende nichts mehr; der Chat-Bot übergibt dann ans Team.')}>
            <Input type="number" min={0.01} step={1} value={s.monthly_limit_usd} onChange={(v) => set({ monthly_limit_usd: Number(v) })} />
          </Field>
          <Field label={tt('Token-Limit pro Monat (0 = keins)')}>
            <Input type="number" min={0} step={10000} value={s.monthly_token_limit} onChange={(v) => set({ monthly_token_limit: Number(v) })} />
          </Field>
        </div>
        {saveBtn}
        <p className="muted small">{tt('Kosten sind nach Anthropic-Listenpreisen geschätzt (inkl. Prompt-Cache); maßgeblich ist die Abrechnung in der Anthropic Console.')}</p>
      </div>
      {u.data.by_purpose.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 14 }}>
          <table className="t">
            <thead>
              <tr>
                <th>{tt('Zweck')}</th>
                <th>{tt('Aufrufe')}</th>
                <th>{tt('Tokens')}</th>
                <th>{tt('davon aus Cache')}</th>
                <th>{tt('Kosten')}</th>
              </tr>
            </thead>
            <tbody>
              {u.data.by_purpose.map((p: any) => (
                <tr key={p.purpose}>
                  <td>{label(p.purpose)}</td>
                  <td>{n(p.calls)}</td>
                  <td>{n(p.tokens)}</td>
                  <td>{n(p.cached_tokens)}</td>
                  <td>{usd(p.cost_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2 style={{ marginTop: 18 }}>{tt('Letzte Aufrufe')}</h2>
      {u.data.recent.length ? (
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>{tt('Zeit')}</th>
                <th>{tt('Zweck')}</th>
                <th>{tt('Modell')}</th>
                <th>{tt('Status')}</th>
                <th>{tt('Ein / Aus / Cache')}</th>
                <th>{tt('Kosten')}</th>
                <th>{tt('Hinweis')}</th>
              </tr>
            </thead>
            <tbody>
              {u.data.recent.map((r: any) => (
                <tr key={r.id}>
                  <td className="small">{dt(r.created_at)}</td>
                  <td>
                    {label(r.purpose)}
                    {r.conversation_id && (
                      <>
                        {' '}
                        <Link to={`conversations/${r.conversation_id}`}>
                          <Icon name="chat" size={12} />
                        </Link>
                      </>
                    )}
                  </td>
                  <td className="small mono">{r.model}</td>
                  <td>
                    <Badge tone={STATUS[r.status]?.[1] ?? 'gray'}>{tt(STATUS[r.status]?.[0] ?? r.status)}</Badge>
                  </td>
                  <td className="small">
                    {n(r.input_tokens)} / {n(r.output_tokens)} / {n(r.cache_read_tokens + r.cache_write_tokens)}
                  </td>
                  <td>{usd(r.cost_usd)}</td>
                  <td className="small muted" style={{ maxWidth: 260 }}>
                    {r.error}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>{tt('Noch keine KI-Aufrufe.')}</Empty>
      )}
    </>
  );
}

// --- inbox ---------------------------------------------------------------------------------

/** "Antwort vorschlagen" next to the composer: the draft lands in the text box, nothing is sent. */
export function AiComposerAddon({ contactId, conversationId, channel, setDraft }: { contactId: string; conversationId?: string; channel: string; setDraft: (body: string, subject?: string) => void }) {
  const tt = useT('x_ai');
  const status = useAiStatus();
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);
  if (!status.data?.enabled) return null;
  const go = async () => {
    setBusy(true);
    const r = await act(() => api.post('/api/ai/suggest', { conversation_id: conversationId, contact_id: conversationId ? undefined : contactId, channel, instruction: hint }));
    setBusy(false);
    if (r) {
      setDraft(r.text, r.subject);
      toast(tt('Vorschlag eingefügt – bitte prüfen, dann senden'));
    }
  };
  return (
    <div className="ai-addon">
      <button type="button" className="btn small secondary" disabled={busy} onClick={go} title={tt('Schreibt einen Entwurf mit dem KI-Assistenten')}>
        <Icon name="ai" size={14} /> {busy ? tt('Schreibt…') : tt('Antwort vorschlagen')}
      </button>
      <input value={hint} onChange={(e) => setHint(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !busy && go()} placeholder={tt('Hinweis an die KI (optional)')} aria-label={tt('Hinweis an die KI')} />
    </div>
  );
}

/** Side panel in Konversationen: bot status, handoff, summary + next step. */
export function AiPanel({ conversationId, refreshKey }: { conversationId: string; refreshKey?: unknown }) {
  const tt = useT('x_ai');
  const st = useLoad(() => api.get<any>(`/api/ai/conversations/${conversationId}`).catch(() => null), [conversationId, refreshKey]);
  const [busy, setBusy] = useState(false);
  const d = st.data;
  if (!d?.enabled) return null;
  const setBot = async (bot_status: string) => {
    const r = await act(() => api.patch(`/api/ai/conversations/${conversationId}`, { bot_status }), bot_status === 'active' ? tt('Bot wieder aktiv') : tt('Bot pausiert'));
    if (r) st.setData(r);
  };
  return (
    <aside className="ai-panel" data-tour="ai-panel">
      <h3>
        <Icon name="ai" /> {tt('KI-Assistent')}
      </h3>
      {d.bot_mode !== 'off' && (
        <section>
          <div className="muted small">{tt('Live-Chat-Bot')}</div>
          {d.bot_status === 'active' && (
            <p>
              <Badge tone="green">{tt('aktiv')}</Badge> <span className="small muted">{tt('{bot_replies} Antworten', { bot_replies: d.bot_replies })}</span>
            </p>
          )}
          {d.bot_status === 'handoff' && (
            <p>
              <Badge tone="yellow">{tt('an Team übergeben')}</Badge>
              <br />
              <span className="small">{d.handoff_reason}</span>
              <br />
              <span className="small muted">{dt(d.handoff_at)}</span>
            </p>
          )}
          {d.bot_status === 'paused' && (
            <p>
              <Badge>{tt('pausiert')}</Badge>
            </p>
          )}
          {d.bot_status === 'active' ? (
            <button className="btn small secondary" onClick={() => setBot('paused')}>
              {tt('Bot pausieren')}
            </button>
          ) : (
            <button className="btn small secondary" onClick={() => setBot('active')}>
              {tt('Bot wieder übernehmen lassen')}
            </button>
          )}
        </section>
      )}
      <section>
        <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="muted small">{tt('Zusammenfassung')}</span>
          <button
            className="btn small"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await act(() => api.post('/api/ai/summarize', { conversation_id: conversationId }));
              setBusy(false);
              if (r) st.setData({ ...d, ...r });
            }}
          >
            {busy ? tt('Fasst zusammen…') : d.summary ? tt('Neu zusammenfassen') : tt('Zusammenfassen')}
          </button>
        </div>
        {d.summary ? (
          <>
            <p className="ai-summary">{d.summary}</p>
            {d.next_step && (
              <p className="ai-next">
                <strong>{tt('Nächster Schritt:')}</strong> {d.next_step}
              </p>
            )}
            <div className="muted small">{dt(d.summary_at)}</div>
          </>
        ) : (
          <p className="muted small">{tt('Kurz das Wichtigste und der nächste Schritt – auf Knopfdruck.')}</p>
        )}
      </section>
      {(d.opportunity_id || d.task_id) && (
        <section>
          <div className="muted small">{tt('Vom Bot angelegt')}</div>
          {d.opportunity_id && (
            <p>
              <Link to="opportunities">
                <Icon name="deal" size={14} /> {tt('Opportunity')}
              </Link>
            </p>
          )}
          {d.task_id && (
            <p>
              <Link to="tasks">
                <Icon name="todo" size={14} /> {tt('Aufgabe')}
              </Link>
            </p>
          )}
        </section>
      )}
    </aside>
  );
}

// --- workflow step -------------------------------------------------------------------------

const TEXT_FIELDS: [string, string][] = [
  ['company', 'Firma'],
  ['city', 'Ort'],
  ['country', 'Land'],
  ['website', 'Website'],
  ['source', 'Quelle'],
];

export function AiTextStep({ step, set, customFields }: { step: any; set: (p: any) => void; customFields: any[] }) {
  const tt = useT('x_ai');
  const target = step.target ?? 'field';
  return (
    <>
      <Field label={tt('Auftrag an die KI')} hint={tt('Kontaktdaten und die letzten Nachrichten bekommt die KI automatisch dazu.')}>
        <Textarea value={step.prompt} onChange={(v) => set({ prompt: v })} rows={6} placeholder={tt('z. B. Schreibe eine persönliche Einleitung für {{contact.first_name}} passend zu den Tags.')} />
      </Field>
      <MergeHint />
      <Field label={tt('Ergebnis')}>
        <Select
          value={target}
          onChange={(v) => set({ target: v })}
          options={[
            ['field', tt('In ein Feld schreiben')],
            ['email_draft', tt('Als E-Mail-Entwurf ablegen (wird nicht gesendet)')],
            ['note', tt('Als Notiz speichern')],
          ]}
        />
      </Field>
      {target === 'field' && (
        <Field label={tt('Feld')} hint={tt('Danach z. B. in E-Mails mit {{contact.custom.<feld>}} nutzen.')}>
          <Select value={step.field} onChange={(v) => set({ field: v })} placeholder={tt('wählen…')} options={[...customFields.map((f: any) => [`custom.${f.key}`, tt('Feld: {label}', { label: f.label })] as [string, string]), ...tl(tt, TEXT_FIELDS)]} />
        </Field>
      )}
      {target === 'email_draft' && (
        <Field label={tt('Betreff (Platzhalter erlaubt)')}>
          <Input value={step.subject} onChange={(v) => set({ subject: v })} />
        </Field>
      )}
      <p className="muted small">{tt('Nutzt den KI-Assistenten (Einstellungen → KI-Assistent) und zählt aufs Monatslimit. Fehler (z. B. Limit erreicht) stehen im Protokoll des Workflows.')}</p>
    </>
  );
}
