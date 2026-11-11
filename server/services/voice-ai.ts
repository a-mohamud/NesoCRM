import { bad, num, str } from '../core/http.js';
import { hmInTz } from '../core/time.js';
import { normalizePhone } from '../core/util.js';
import { EMAIL_RE, redactSecrets } from './ai-context.js';
import { E164, attrs, clientNoun, twiml, xml, type DialClient } from './twilio.js';
import { defaultLocale, tApp } from '../i18n/index.js';

/**
 * Pure building blocks of the KI-Telefonagent: settings, TwiML for the speech loop (<Gather> →
 * Claude → <Say>), the prompt, strict validation of the model's tool call and the call outcome.
 * No database, no network – the module (server/modules/voice-ai.ts) wires it to calls and Claude.
 */

// --- settings -------------------------------------------------------------------------

export const VOICE_MODES = ['off', 'always', 'after_hours', 'no_answer'] as const;
export type VoiceMode = (typeof VOICE_MODES)[number];

/** German neural voices Twilio's <Say> offers (Amazon Polly and Google). */
const VOICES_DE: { id: string; label: string }[] = [ // i18n-ignore – German voices
  { id: 'Polly.Vicki-Neural', label: 'Vicki – weiblich (Amazon Polly, neural)' }, // i18n-ignore – German voices
  { id: 'Polly.Daniel-Neural', label: 'Daniel – männlich (Amazon Polly, neural)' }, // i18n-ignore – German voices
  { id: 'Google.de-DE-Neural2-F', label: 'Google Neural2 F – weiblich' }, // i18n-ignore – German voices
  { id: 'Google.de-DE-Neural2-C', label: 'Google Neural2 C – weiblich' }, // i18n-ignore – German voices
  { id: 'Google.de-DE-Neural2-B', label: 'Google Neural2 B – männlich' }, // i18n-ignore – German voices
  { id: 'Google.de-DE-Neural2-D', label: 'Google Neural2 D – männlich' }, // i18n-ignore – German voices
  { id: 'Google.de-DE-Wavenet-F', label: 'Google WaveNet F – weiblich' }, // i18n-ignore – German voices
  { id: 'Google.de-DE-Wavenet-B', label: 'Google WaveNet B – männlich' }, // i18n-ignore – German voices
];
/** Neso fork: British English neural voices for an English-speaking instance (PGHL_LOCALE=en). */
const VOICES_EN: { id: string; label: string }[] = [
  { id: 'Polly.Amy-Neural', label: 'Amy – female (Amazon Polly, neural)' },
  { id: 'Polly.Brian-Neural', label: 'Brian – male (Amazon Polly, neural)' },
  { id: 'Polly.Emma-Neural', label: 'Emma – female (Amazon Polly, neural)' },
  { id: 'Google.en-GB-Neural2-A', label: 'Google Neural2 A – female' },
  { id: 'Google.en-GB-Neural2-B', label: 'Google Neural2 B – male' },
  { id: 'Google.en-GB-Neural2-C', label: 'Google Neural2 C – female' },
  { id: 'Google.en-GB-Neural2-D', label: 'Google Neural2 D – male' },
  { id: 'Google.en-GB-Wavenet-A', label: 'Google WaveNet A – female' },
];
/** The phone agent speaks and listens in the instance language (sub-accounts use it too – i18n tLoc). */
const GERMAN = defaultLocale() === 'de';
export const VOICES: { id: string; label: string }[] = GERMAN ? VOICES_DE : VOICES_EN;
export const LANGUAGE = GERMAN ? 'de-DE' : 'en-GB';
/** The name of that language, for the model's instructions. */
export const LANGUAGE_NAME = GERMAN ? 'German' : 'English'; // i18n-ignore – for the model

export interface VoiceAiSettings {
  mode: VoiceMode;
  greeting: string;
  persona: string;
  instructions: string;
  voice: string;
  language: string;
  max_minutes: number;
  max_turns: number;
  transfer: boolean;
  transfer_number: string;
  booking: boolean;
  calendar_ids: string[];
  booking_sms: boolean;
  sms_link: boolean;
  tasks: boolean;
  pipeline_id: string;
  stage_id: string;
  notify_email: boolean;
  notify_push: boolean;
  goodbye: string;
}

export const DEFAULT_GREETING = 'Guten Tag, Sie sprechen mit dem digitalen Assistenten von {{location.name}}. Wie kann ich Ihnen helfen?';
export const DEFAULT_GOODBYE = 'Vielen Dank für Ihren Anruf. Auf Wiederhören!';

export function defaultVoiceSettings(): VoiceAiSettings {
  const t = tApp();
  return {
    mode: 'off',
    greeting: t(DEFAULT_GREETING),
    persona: '',
    instructions: '',
    voice: VOICES[0].id,
    language: LANGUAGE,
    max_minutes: 8,
    max_turns: 16,
    transfer: true,
    transfer_number: '',
    booking: true,
    calendar_ids: [],
    booking_sms: true,
    sms_link: true,
    tasks: true,
    pipeline_id: '',
    stage_id: '',
    notify_email: true,
    notify_push: true,
    goodbye: t(DEFAULT_GOODBYE),
  };
}

/** Stored settings over the defaults (unknown keys dropped). */
export function withVoiceDefaults(stored: Partial<VoiceAiSettings> | null | undefined): VoiceAiSettings {
  const d = defaultVoiceSettings();
  const s = { ...d, ...(stored ?? {}) } as Record<string, unknown>;
  return Object.fromEntries(Object.keys(d).map((k) => [k, s[k]])) as unknown as VoiceAiSettings;
}

const bool = (v: unknown) => v === true || v === 'true' || v === 1;
const clampInt = (v: unknown, min: number, max: number, field: string) => {
  const n = Math.round(num(v, NaN));
  if (!Number.isFinite(n) || n < min || n > max) throw bad(tApp()('{field}: {min} bis {max}', { field: tApp()(field), min, max }));
  return n;
};

/** Validates a settings patch from the browser (calendar and pipeline ids are checked by the module). */
export function cleanVoiceSettings(b: any, cur: VoiceAiSettings): VoiceAiSettings {
  const out: VoiceAiSettings = { ...cur, calendar_ids: [...cur.calendar_ids] };
  if (b.mode !== undefined) {
    if (!VOICE_MODES.includes(b.mode)) throw bad('Unbekannter Modus');
    out.mode = b.mode;
  }
  if (b.greeting !== undefined) out.greeting = str(b.greeting, 'Begrüßung', { max: 500 }) || tApp()(DEFAULT_GREETING);
  if (b.goodbye !== undefined) out.goodbye = str(b.goodbye, 'Verabschiedung', { max: 300 }) || tApp()(DEFAULT_GOODBYE);
  if (b.persona !== undefined) out.persona = str(b.persona, 'Persona', { max: 2000 });
  if (b.instructions !== undefined) out.instructions = str(b.instructions, 'Anweisungen', { max: 6000 });
  if (b.voice !== undefined) {
    if (!VOICES.some((v) => v.id === b.voice)) throw bad('Unbekannte Stimme');
    out.voice = b.voice;
  }
  if (b.language !== undefined && b.language !== LANGUAGE) throw bad(tApp()('Sprache: nur {language}', { language: LANGUAGE }));
  if (b.max_minutes !== undefined) out.max_minutes = clampInt(b.max_minutes, 1, 30, 'Höchstdauer (Minuten)');
  if (b.max_turns !== undefined) out.max_turns = clampInt(b.max_turns, 2, 40, 'Höchstzahl Gesprächsrunden');
  if (b.transfer_number !== undefined) {
    const n = normalizePhone(String(b.transfer_number ?? ''));
    if (n && !E164.test(n)) throw bad('Weiterleitungsnummer: bitte im Format +49…');
    out.transfer_number = n;
  }
  if (b.calendar_ids !== undefined) {
    if (!Array.isArray(b.calendar_ids)) throw bad('Kalender als Liste');
    out.calendar_ids = [...new Set(b.calendar_ids.map((x: unknown) => String(x)).filter(Boolean))].slice(0, 10) as string[];
  }
  for (const k of ['transfer', 'booking', 'booking_sms', 'sms_link', 'tasks', 'notify_email', 'notify_push'] as const) if (b[k] !== undefined) out[k] = bool(b[k]);
  if (b.pipeline_id !== undefined) out.pipeline_id = str(b.pipeline_id, 'Pipeline', { max: 64 });
  if (b.stage_id !== undefined) out.stage_id = str(b.stage_id, 'Stufe', { max: 64 });
  return out;
}

/** Does the agent take this call? `inbound` = before anyone rings, `unanswered` = nobody picked up / closed. */
export function shouldAnswer(mode: VoiceMode, stage: 'inbound' | 'unanswered', open: boolean): boolean {
  if (mode === 'always') return stage === 'inbound';
  if (mode === 'after_hours') return stage === 'inbound' ? !open : false;
  if (mode === 'no_answer') return stage === 'unanswered';
  return false;
}

// --- TwiML ----------------------------------------------------------------------------------

export const sayWith = (text: string, voice: string) => (text.trim() ? `<Say${attrs({ voice, language: LANGUAGE })}>${xml(text.trim())}</Say>` : '');

/**
 * Says the text inside a speech <Gather> (the caller may interrupt it – barge-in) and posts what was
 * said to `action`. actionOnEmptyResult makes silence reach the action too.
 */
export function gatherTwiml(o: { say: string; voice: string; action: string; timeout?: number }): string {
  return twiml(
    `<Gather${attrs({ input: 'speech', language: LANGUAGE, speechTimeout: 'auto', timeout: o.timeout ?? 6, action: o.action, method: 'POST', actionOnEmptyResult: true, bargeIn: true })}>${sayWith(o.say, o.voice)}</Gather><Redirect method="POST">${xml(o.action)}</Redirect>`,
  );
}

export const sayHangup = (text: string, voice: string) => twiml(`${sayWith(text, voice)}<Hangup/>`);

/** While Claude still thinks: a short line, then Twilio asks again. */
export const fillerTwiml = (text: string, voice: string, redirect: string) => twiml(`${sayWith(text, voice)}<Redirect method="POST">${xml(redirect)}</Redirect>`);

/** Hands the caller to people: numbers and browser phones ring at once, the action learns the result. */
export function transferTwiml(o: { say: string; voice: string; numbers: string[]; clients: DialClient[]; action: string; timeout: number }): string {
  return twiml(
    `${sayWith(o.say, o.voice)}<Dial${attrs({ timeout: o.timeout, action: o.action, method: 'POST', answerOnBridge: true })}>${o.numbers.map((n) => `<Number>${xml(n)}</Number>`).join('')}${o.clients.map(clientNoun).join('')}</Dial>`,
  );
}

// --- speech --------------------------------------------------------------------------------

/** Text the TTS can read well: no links, markdown, emoji or markup; clipped at a sentence end. */
export function speakable(text: string, max = 600): string {
  let s = String(text ?? '')
    .replace(/https?:\/\/\S+|www\.\S+/gi, '')
    .replace(/[*_#`|~[\]{}<>]+/g, ' ')
    .replace(/\p{Extended_Pictographic}|️/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length > max) {
    const cut = s.slice(0, max);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
    s = end > max / 2 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, '')} …`;
  }
  return s;
}

/** "Montag, 5. Oktober, um 10 Uhr 30" (English: "Monday 5 October at 10:30") in the calendar's zone. */
export function spokenWhen(at: Date | string, tz: string): string {
  const d = typeof at === 'string' ? new Date(at) : at;
  const date = new Intl.DateTimeFormat(GERMAN ? 'de-DE' : 'en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  const [h, m] = hmInTz(d, tz).split(':').map(Number);
  return GERMAN ? `${date}, um ${h} Uhr${m ? ` ${m}` : ''}` : `${date} at ${h}:${String(m).padStart(2, '0')}`; // i18n-ignore – spoken date format
}

const WEEKDAY = new Intl.DateTimeFormat(GERMAN ? 'de-DE' : 'en-GB', { weekday: 'long', timeZone: 'UTC' });
/** Free slots per day for the prompt: "2026-10-05 (Montag): 09:00, 09:30". */
export function slotLines(days: { date: string; times: string[] }[]): string {
  return days
    .filter((d) => d.times.length)
    .map((d) => `${d.date} (${WEEKDAY.format(new Date(`${d.date}T12:00:00Z`))}): ${d.times.join(', ')}`)
    .join('\n');
}

// --- tools: the model's structured answer ------------------------------------------------------

export const VOICE_ACTIONS = ['none', 'check_slots', 'book_appointment', 'take_message', 'create_task', 'create_opportunity', 'send_booking_link', 'transfer', 'end_call'] as const;
export type VoiceAction = (typeof VOICE_ACTIONS)[number];

export interface VoiceArgs {
  calendar_id: string;
  date: string;
  time: string;
  first_name: string;
  last_name: string;
  email: string;
  message: string;
  title: string;
  reason: string;
}
export interface VoiceOutput {
  say: string;
  action: VoiceAction;
  args: VoiceArgs;
}

const ARG_KEYS: (keyof VoiceArgs)[] = ['calendar_id', 'date', 'time', 'first_name', 'last_name', 'email', 'message', 'title', 'reason'];
const ARG_MAX: Record<keyof VoiceArgs, number> = { calendar_id: 64, date: 10, time: 5, first_name: 80, last_name: 80, email: 200, message: 1500, title: 200, reason: 300 };

/** JSON schema for structured outputs; parseVoiceOutput checks the same contract (and more). */
export const VOICE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['say', 'action', 'args'],
  properties: {
    say: { type: 'string' },
    action: { type: 'string', enum: [...VOICE_ACTIONS] },
    args: { type: 'object', additionalProperties: false, required: ARG_KEYS, properties: Object.fromEntries(ARG_KEYS.map((k) => [k, { type: 'string' }])) },
  },
};

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const NAME_RE = /^[\p{L}][\p{L}\p{M}' .-]{0,79}$/u;
const validDate = (s: string) => DATE_RE.test(s) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;

/**
 * Strictly validates the model's tool call: exact keys and types, a known and allowed action, sane
 * lengths, real dates/times, plausible names and e-mail, and the arguments each action needs.
 */
export function parseVoiceOutput(raw: string, allowed: readonly VoiceAction[] = VOICE_ACTIONS): Parsed<VoiceOutput> {
  let v: unknown;
  try {
    v = JSON.parse(String(raw ?? '').trim());
  } catch {
    return { ok: false, error: 'no valid JSON' };
  }
  // Diagnostics of the model's answer (shown in the call log as they are).
  if (!isObj(v)) return { ok: false, error: 'JSON object expected' };
  const keys = Object.keys(v);
  if (keys.length !== 3 || !['say', 'action', 'args'].every((k) => k in v)) return { ok: false, error: 'fields say, action, args expected' };
  const { say, action, args } = v as Record<string, unknown>;
  if (typeof say !== 'string' || say.length > 800) return { ok: false, error: 'say invalid' };
  if (typeof action !== 'string' || !(VOICE_ACTIONS as readonly string[]).includes(action)) return { ok: false, error: 'action unknown' };
  if (!allowed.includes(action as VoiceAction)) return { ok: false, error: `tool ${action} is not allowed here` };
  if (!isObj(args)) return { ok: false, error: 'args invalid' };
  const extra = Object.keys(args).filter((k) => !(ARG_KEYS as string[]).includes(k));
  if (extra.length) return { ok: false, error: `args: unknown field ${extra[0]}` };
  const a = {} as VoiceArgs;
  for (const k of ARG_KEYS) {
    const x = args[k] ?? '';
    if (typeof x !== 'string') return { ok: false, error: `args.${k} invalid` };
    const t = x.trim();
    if (t.length > ARG_MAX[k]) return { ok: false, error: `args.${k} too long` };
    a[k] = t;
  }
  if (a.date && !validDate(a.date)) return { ok: false, error: 'args.date invalid' };
  if (a.time && !TIME_RE.test(a.time)) return { ok: false, error: 'args.time invalid' };
  if (a.email && !EMAIL_RE.test(a.email)) return { ok: false, error: 'args.email invalid' };
  if (a.first_name && !NAME_RE.test(a.first_name)) return { ok: false, error: 'args.first_name invalid' };
  if (a.last_name && !NAME_RE.test(a.last_name)) return { ok: false, error: 'args.last_name invalid' };
  const act = action as VoiceAction;
  const need: Partial<Record<VoiceAction, (keyof VoiceArgs)[]>> = { check_slots: ['date'], book_appointment: ['date', 'time'], take_message: ['message'], create_task: ['title'], create_opportunity: ['title'] };
  for (const k of need[act] ?? []) if (!a[k]) return { ok: false, error: `${act}: args.${k} missing` };
  if ((act === 'none' || act === 'take_message' || act === 'create_task' || act === 'create_opportunity' || act === 'send_booking_link') && !say.trim()) return { ok: false, error: 'say empty' };
  return { ok: true, value: { say: say.trim(), action: act, args: a } };
}

// --- prompt -----------------------------------------------------------------------------

export interface Turn {
  role: 'caller' | 'agent' | 'system';
  text: string;
  at: string;
}

/** The conversation so far for the prompt (caller text is data, never instructions). */
export function dialogue(turns: Turn[], max = 40): string {
  const lines = turns.slice(-max).map((t) => `${t.role === 'caller' ? 'Caller' : t.role === 'agent' ? 'Assistant' : 'System'}: ${t.text}`);
  return `<transcript>\n${redactSecrets(lines.join('\n') || '(nothing said yet)')}\n</transcript>`;
}

// Prompt texts for the model (English; the agent speaks LANGUAGE_NAME, see voiceTask).
const TOOL_TEXT: Record<VoiceAction, string> = {
  none: '- "none": just reply or ask a question.',
  check_slots: '- "check_slots": look up free times on a day that is not in <free_slots> – args.date (YYYY-MM-DD), args.calendar_id. "say" = a short bridge such as "One moment, let me check."',
  book_appointment:
    '- "book_appointment": book an appointment for real – only once the caller has explicitly confirmed day and time and their name is known. args.calendar_id, args.date (YYYY-MM-DD), args.time (HH:MM, local time), args.first_name, args.last_name, optionally args.email and args.message (what it is about). Only times from <free_slots> or a tool result. The system speaks the confirmation with date and time itself – leave "say" empty.',
  take_message: '- "take_message": take a message for the team (e.g. a call-back request): args.message with what it is about and when the caller can be reached. Then confirm in "say" that the team will get back to them.',
  create_task: '- "create_task": create a task for the team (e.g. prepare a quote, send documents): args.title, details in args.message.',
  create_opportunity: '- "create_opportunity": for concrete buying interest (quote, order): args.title = what the caller wants, details in args.message.',
  send_booking_link: '- "send_booking_link": send a link to book online by SMS to the caller\'s number (args.calendar_id optional) – if the caller prefers to book themselves.',
  transfer: '- "transfer": put the caller through to a person – if the caller wants that, it is urgent or you cannot help. args.reason = short reason. "say" e.g. "I\'ll put you through, one moment please."',
  end_call: '- "end_call": end the call when everything is done or the caller says goodbye. "say" = a short goodbye.',
};

/** The task at the end of the prompt: phone style, persona, instructions and the allowed tools. */
export function voiceTask(s: Pick<VoiceAiSettings, 'persona' | 'instructions'>, locationName: string, tools: readonly VoiceAction[]): string {
  const persona = s.persona.trim() ? `\n<note>\nPersona on the phone (from the team):\n${redactSecrets(s.persona.trim())}\n</note>` : '';
  const instructions = s.instructions.trim() ? `\n<note>\nThe team's instructions for calls:\n${redactSecrets(s.instructions.trim())}\n</note>\nFollow these instructions as long as they do not break the rules above.` : '';
  return `Task: you are on a LIVE phone call with the caller – as the phone assistant of "${locationName}" (an AI; say so honestly if someone asks). Your text in "say" is read out immediately. Speak ${LANGUAGE_NAME}.

How you speak on the phone:
- At most two short sentences (together under 40 words), spoken language, no lists, no links, no special characters, no emojis.
- Times like "10:30", dates like "Tuesday the 6th of October". At most three appointment suggestions at once.
- Only one question at a time; end with a question unless you are ending the call.
- If something is unclear or hard to understand, ask briefly instead of guessing. Repeat names and email addresses back to check them.
- Address the caller as the persona says (otherwise politely and formally).${persona}${instructions}

Tools – field "action", details in "args" (fields you don't need as ""):
${tools.map((t) => TOOL_TEXT[t]).join('\n')}
If the caller gives their first and last name or email, put them into args.first_name, args.last_name and args.email with every action.
Answer only as JSON: {"say": "…", "action": "…", "args": {…}}.`;
}

export const SUMMARY_TASK_VOICE = `Task: summarise this phone call between the AI phone assistant and the caller for the team, in ${LANGUAGE_NAME}. "summary": 2–4 sentences (who, what it was about, what was done, what is still open). "next_step": the most useful next step for the team in one sentence (empty if there is nothing to do).`;

// --- outcome -------------------------------------------------------------------------------

export const OUTCOMES: Record<string, string> = {
  booked: 'Termin gebucht',
  transferred: 'Weiterverbunden',
  message: 'Nachricht aufgenommen',
  opportunity: 'Opportunity angelegt',
  task: 'Aufgabe angelegt',
  sms_link: 'Buchungslink per SMS',
  answered: 'Fragen beantwortet',
  hangup: 'Aufgelegt ohne Anliegen',
  voicemail: 'Voicemail',
  limit: 'Limit erreicht',
  error: 'Technischer Fehler',
};
const PRIORITY = ['booked', 'transferred', 'message', 'opportunity', 'task', 'sms_link'];

/** The headline result of a call: the strongest thing done, else how it ended. */
export function resolveOutcome(s: { outcomes: string[]; turns: number; end: string }): string {
  for (const o of PRIORITY) if (s.outcomes.includes(o)) return o;
  if (s.end === 'voicemail') return 'voicemail';
  if (s.end === 'error') return 'error';
  if (s.end === 'limit') return 'limit';
  return s.turns > 0 ? 'answered' : 'hangup';
}
