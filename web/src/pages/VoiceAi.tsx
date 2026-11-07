import { useEffect, useState } from 'react';
import { Icon } from '../icons';
import { api, dt } from '../api';
import { Badge, Check, Empty, Field, Input, Link, Modal, Select, Spinner, Textarea, act, useLoad } from '../ui';
import { MoreFields } from '../areas/fields';
import { useT } from '../i18n';

/** KI-Telefonagent: settings card (Einstellungen → Telefonie), call details in the call log, workflow filter. */

const MODES: [string, string][] = [
  ['off', 'Nie – der Agent ist aus'],
  ['no_answer', 'Wenn niemand abnimmt (statt Voicemail)'],
  ['after_hours', 'Außerhalb der Geschäftszeiten (Zeiten siehe oben)'],
  ['always', 'Immer – der Agent nimmt jeden Anruf an'],
];

export const VOICE_OUTCOMES: [string, string][] = [
  ['booked', 'Termin gebucht'],
  ['transferred', 'Weiterverbunden'],
  ['message', 'Nachricht aufgenommen'],
  ['opportunity', 'Opportunity angelegt'],
  ['task', 'Aufgabe angelegt'],
  ['sms_link', 'Buchungslink per SMS'],
  ['answered', 'Fragen beantwortet'],
  ['hangup', 'Aufgelegt ohne Anliegen'],
  ['voicemail', 'Voicemail'],
  ['limit', 'Limit erreicht'],
  ['error', 'Technischer Fehler'],
];
const OUTCOME_TONE: Record<string, 'green' | 'blue' | 'yellow' | 'red' | 'gray' | 'purple'> = {
  booked: 'green',
  transferred: 'blue',
  message: 'purple',
  opportunity: 'green',
  task: 'purple',
  sms_link: 'blue',
  answered: 'gray',
  hangup: 'gray',
  voicemail: 'yellow',
  limit: 'yellow',
  error: 'red',
};

export function VoiceAiSettings() {
  const tt = useT('x_comms');
  const info = useLoad(() => api.get<any>('/api/voice-ai/settings'), []);
  const [s, setS] = useState<any>();
  useEffect(() => setS(info.data?.settings), [info.data]);
  if (!s || !info.data) return info.error ? <Empty>{info.error}</Empty> : <Spinner />;
  const d = info.data;
  const set = (p: any) => setS({ ...s, ...p });
  const pipe = d.pipelines.find((p: any) => p.id === s.pipeline_id);
  const save = async () => {
    const r = await act(() => api.put('/api/voice-ai/settings', s), tt('Gespeichert'));
    if (r) info.setData(r);
  };
  const stats = Object.entries(d.stats ?? {}) as [string, number][];
  const toggleCal = (id: string, on: boolean) => set({ calendar_ids: on ? [...s.calendar_ids, id] : s.calendar_ids.filter((x: string) => x !== id) });
  return (
    <div className="card voice-ai" style={{ marginTop: 14 }} data-tour="voice-ai">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>
          <Icon name="bot" size={18} /> {tt('KI-Telefonagent')}
        </h2>
        {d.settings.mode === 'off' ? <Badge>aus</Badge> : d.active_now ? <Badge tone="green">{tt('nimmt Anrufe an')}</Badge> : <Badge tone="yellow">wartet</Badge>}
      </div>
      <p className="muted small">
        {tt('Claude nimmt Anrufe an, beantwortet Fragen aus dem Wissen des KI-Assistenten, bucht Termine, nimmt Nachrichten auf oder verbindet weiter. Danach liegen Zusammenfassung und Verlauf am Anruf und beim Kontakt.')}
      </p>
      {!d.ai_ready && (
        <p className="voice-warn small">
          <Icon name="ai" size={14} /> {tt('{ai_problem} Solange nimmt der Agent keine Anrufe an –', { ai_problem: d.ai_problem })} <Link to="settings/ai">{tt('KI-Assistent einrichten')}</Link>.
        </p>
      )}
      {!d.telephony_ready && <p className="voice-warn small">{tt('Erst oben Twilio-Zugang und Nummer eintragen.')}</p>}

      <div className="grid2">
        <Field label={tt('Wann nimmt der Agent ab?')} tour="voice-mode">
          <Select value={s.mode} onChange={(v) => set({ mode: v })} options={MODES} />
        </Field>
        <Field label={tt('Stimme')} hint={
            <>
              {tt('Deutsch (de-DE), neuronale Stimmen von Amazon Polly und Google über Twilio. Eigene Stimme (ElevenLabs, OpenAI, Deepgram …) und Live-Stream:')} <Link to="settings/voice">{tt('Einstellungen → Stimme')}</Link>.
            </>
          }>
          <Select value={s.voice} onChange={(v) => set({ voice: v })} options={d.voices.map((v: any) => [v.id, v.label])} />
        </Field>
      </div>
      <Field tour="voice-greeting" label={tt('Begrüßung')} hint={tt('Platzhalter: {{location.name}}, {{contact.first_name}} (wenn die Nummer bekannt ist). Ehrlich sagen, dass hier eine KI spricht.')}>
        <Textarea value={s.greeting} onChange={(v) => set({ greeting: v })} rows={2} />
      </Field>
      <Field label={tt('Anweisungen')} hint={tt('Was soll der Agent tun – und was nicht?')} tour="voice-instructions">
        <Textarea value={s.instructions} onChange={(v) => set({ instructions: v })} rows={4} placeholder={tt('Vergib Termine für Erstgespräche. Bei Notfällen sofort weiterverbinden. Nenne keine Preise.')} />
      </Field>
      <MoreFields id="voice-ai-persona" values={[s.persona]}>
        <Field label={tt('Persona am Telefon')} hint={tt('Ergänzt Tonfall und Wissen aus „KI-Assistent“.')}>
          <Textarea value={s.persona} onChange={(v) => set({ persona: v })} rows={4} placeholder={tt('Ruhig, freundlich, siezt die Anrufer. Stellt sich als Assistenz der Praxis vor.')} />
        </Field>
      </MoreFields>
      <Field label={tt('Verabschiedung')}>
        <Input value={s.goodbye} onChange={(v) => set({ goodbye: v })} />
      </Field>

      <hr />
      <h3>{tt('Was der Agent darf')}</h3>
      <Check checked={s.booking} onChange={(v) => set({ booking: v })} label={tt('Termine buchen (freie Zeiten aus dem Kalender, Bestätigung mit Datum und Uhrzeit)')} />
      {s.booking && (
        <div className="voice-indent">
          {d.calendars.length ? (
            <>
              <div className="muted small">{tt('Kalender (keiner angehakt = alle aktiven, höchstens drei):')}</div>
              <div className="voice-cals">
                {d.calendars.map((c: any) => (
                  <Check key={c.id} checked={s.calendar_ids.includes(c.id)} onChange={(v) => toggleCal(c.id, v)} label={`${c.name}${c.active ? '' : tt(' (inaktiv)')}`} />
                ))}
              </div>
            </>
          ) : (
            <p className="muted small">
              {tt('Noch kein Kalender –')} <Link to="calendars">{tt('Kalender anlegen')}</Link>.
            </p>
          )}
          <Check checked={s.booking_sms} onChange={(v) => set({ booking_sms: v })} label={tt('Nach der Buchung eine SMS mit Termin und Absage-Link schicken')} />
        </div>
      )}
      <Check checked={s.sms_link} onChange={(v) => set({ sms_link: v })} label={tt('Auf Wunsch den Link zur Online-Buchung per SMS schicken')} />
      <Check checked={s.tasks} onChange={(v) => set({ tasks: v })} label={tt('Nachrichten als Rückruf-Aufgabe anlegen (und Aufgaben auf Wunsch)')} />
      <Check checked={s.transfer} onChange={(v) => set({ transfer: v })} label={tt('An einen Menschen weiterverbinden, wenn der Anrufer das möchte')} />
      {s.transfer && (
        <div className="voice-indent">
          <Field label={tt('Weiterverbinden an')} hint={tt('Leer = wie oben eingestellt{v} plus erreichbare Browser-Telefone. Nimmt niemand ab, nimmt der Agent eine Nachricht auf.', { v: d.forward?.length ? ` (${d.forward.join(', ')})` : '' })}>
            <Input value={s.transfer_number} onChange={(v) => set({ transfer_number: v })} placeholder="+49151…" />
          </Field>
        </div>
      )}
      <div className="grid2">
        <Field label={tt('Opportunity bei Kaufinteresse')} hint={tt('Leer = keine Opportunities')}>
          <Select value={s.pipeline_id} onChange={(v) => set({ pipeline_id: v, stage_id: '' })} placeholder={tt('– aus –')} options={d.pipelines.map((p: any) => [p.id, p.name])} />
        </Field>
        {pipe && (
          <Field label={tt('Stufe')}>
            <Select value={s.stage_id} onChange={(v) => set({ stage_id: v })} placeholder={tt('erste Stufe')} options={pipe.stages.map((st: any) => [st.id, st.name])} />
          </Field>
        )}
      </div>

      <hr />
      <h3>{tt('Grenzen & Benachrichtigung')}</h3>
      <Check checked={s.notify_email} onChange={(v) => set({ notify_email: v })} label={tt('Nach jedem KI-Anruf eine E-Mail mit Zusammenfassung ans Team')} />
      <Check checked={s.notify_push} onChange={(v) => set({ notify_push: v })} label={tt('Push-Benachrichtigung aufs Handy (wenn eingeschaltet)')} />
      <MoreFields id="voice-ai-limits" label={tt('Grenzen und Kosten')}>
      <div className="grid2">
        <Field label={tt('Höchstdauer (Minuten)')}>
          <Input type="number" min={1} max={30} value={s.max_minutes} onChange={(v) => set({ max_minutes: Number(v) })} />
        </Field>
        <Field label={tt('Höchstens Gesprächsrunden je Anruf')} hint={tt('Danach verabschiedet sich der Agent; das Team bekommt die Zusammenfassung.')}>
          <Input type="number" min={2} max={40} value={s.max_turns} onChange={(v) => set({ max_turns: Number(v) })} />
        </Field>
      </div>
      <p className="muted small">
        {tt('Kosten: Jede Gesprächsrunde ist ein Claude-Aufruf und zählt aufs Monatslimit des KI-Assistenten (plus eine Zusammenfassung am Ende). Twilio berechnet Minuten, Spracherkennung und neuronale Stimme extra. Workflow-Auslöser: „KI-Anruf beendet“.')}
      </p>
      </MoreFields>
      {stats.length > 0 && (
        <div className="voice-stats">
          <span className="muted small">{tt('Letzte 30 Tage:')}</span>
          {stats.map(([k, v]) => (
            <Badge key={k} tone={OUTCOME_TONE[k] ?? 'gray'}>
              {d.outcomes[k] ?? k}: {v}
            </Badge>
          ))}
        </div>
      )}
      <p>
        <button className="btn" onClick={save}>
          {tt('Speichern')}
        </button>
      </p>
    </div>
  );
}

/** "KI" badge + transcript modal for a call the agent handled (call log). */
export function AiCallButton({ callId }: { callId: string }) {
  const tt = useT('x_comms');
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn small secondary" onClick={() => setOpen(true)} title={tt('Verlauf des KI-Anrufs')}>
        <Icon name="bot" size={14} /> {tt('KI-Verlauf')}
      </button>
      {open && <AiCallModal callId={callId} onClose={() => setOpen(false)} />}
    </>
  );
}

function AiCallModal({ callId, onClose }: { callId: string; onClose: () => void }) {
  const tt = useT('x_comms');
  const r = useLoad(() => api.get<any>(`/api/voice-ai/calls/${encodeURIComponent(callId)}`), [callId]);
  const v = r.data;
  return (
    <Modal title={tt('KI-Anruf')} onClose={onClose} wide>
      {!v ? (
        r.error ? <Empty>{r.error}</Empty> : <Spinner />
      ) : (
        <div className="voice-call">
          <div className="row" style={{ alignItems: 'center', gap: 8 }}>
            {v.outcome ? <Badge tone={OUTCOME_TONE[v.outcome] ?? 'gray'}>{v.outcome_label}</Badge> : <Badge tone="blue">{tt('läuft')}</Badge>}
            <span className="muted small">
              {dt(v.started_at)} · {v.from_number || tt('Nummer unterdrückt')} {tt('· {turns} Runden', { turns: v.turns })}
            </span>
            {v.contact_id && <Link to={`contacts/${v.contact_id}`}>{v.contact_name || tt('Kontakt')}</Link>}
          </div>
          {v.summary && <p>{v.summary}</p>}
          {v.next_step && (
            <p className="small">
              <strong>{tt('Nächster Schritt:')}</strong> {v.next_step}
            </p>
          )}
          {v.actions.some((a: any) => a.type !== 'invalid') && (
            <ul className="voice-actions small">
              {v.actions
                .filter((a: any) => a.type !== 'invalid')
                .map((a: any, i: number) => (
                  <li key={i} className={a.ok ? '' : 'fail'}>
                    <Icon name={a.ok ? 'ok' : 'fail'} size={14} /> {a.detail}
                  </li>
                ))}
            </ul>
          )}
          <div className="voice-transcript">
            {v.transcript.map((x: any, i: number) => (
              <div key={i} className={`vt ${x.role}`}>
                <span className="who">{x.role === 'caller' ? tt('Anrufer') : x.role === 'agent' ? 'KI' : tt('System')}</span>
                <span>{x.text}</span>
              </div>
            ))}
          </div>
          {v.error && <p className="muted small">{tt('Fehler: {error}', { error: v.error })}</p>}
        </div>
      )}
    </Modal>
  );
}

/** Workflow trigger "KI-Anruf beendet": optional filter by outcome. */
export function VoiceOutcomeFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const tt = useT('x_comms');
  return (
    <Field label={tt('Ergebnis')}>
      <Select value={value} onChange={onChange} placeholder="jedes" options={VOICE_OUTCOMES} />
    </Field>
  );
}
