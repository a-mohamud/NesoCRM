/**
 * Ereignis-Auslöser des Companions (docs/living-boards.md#ereignis-ausloser) – pure: the trigger registry, each trigger's words and
 * next action, and the routing rules (speak now / card / push / digest, rate limit, quiet hours). modules/companion-live.ts listens to
 * the app's events (contact.created, review.received, opportunity.status_changed, payment.failed) and scans what has no event
 * (unanswered messages, invoices that became overdue, appointments about to start, failed automation runs), then asks this file
 * what to say and where it goes. No database, no app – unit-tested in tests/companion-live.test.ts.
 *
 * Words for people may name a contact (they are spoken to the person who may see that record); a next action's prompt for the
 * HyperLevel Agent never carries third-party text – the record travels as the agent's selected entity, like the briefing's steps.
 */

import { translator } from '../i18n/index.js';

export type TriggerPriority = 'interrupt' | 'digest';
export type Lang = 'de' | 'en';

export interface TriggerDef {
  id: string;
  /** label in the settings (German = message id; the browser translates) */
  label: string;
  hint: string;
  defaultPriority: TriggerPriority;
  /** route whose area decides who may hear about it (core/permissions.ts, the same guard as the page) */
  area: string;
  /** how long the same record does not fire this trigger again */
  dedupeMs: number;
}

const H = 3600_000;

export const TRIGGERS: TriggerDef[] = [
  { id: 'lead_new', label: 'Neuer Lead oder Kontakt', hint: 'Formular, Import, Chat, API …', defaultPriority: 'interrupt', area: '/api/contacts', dedupeMs: 7 * 24 * H },
  { id: 'message_unanswered', label: 'Nachricht unbeantwortet', hint: 'Eingehende Nachricht wartet länger als die eingestellte Zeit', defaultPriority: 'interrupt', area: '/api/conversations', dedupeMs: 24 * H },
  { id: 'invoice_overdue', label: 'Rechnung überfällig geworden', hint: 'Zahlungsziel überschritten, noch offen', defaultPriority: 'digest', area: '/api/invoices', dedupeMs: 30 * 24 * H },
  { id: 'appointment_soon', label: 'Termin beginnt in 10 Minuten', hint: 'Bestätigte Termine im Kalender', defaultPriority: 'interrupt', area: '/api/appointments', dedupeMs: 2 * H },
  { id: 'review_negative', label: 'Negative Bewertung (höchstens 2 Sterne)', hint: 'Google und andere Bewertungsquellen', defaultPriority: 'interrupt', area: '/api/reviews', dedupeMs: 30 * 24 * H },
  { id: 'deal_won', label: 'Deal gewonnen', hint: 'Status einer Opportunity auf gewonnen', defaultPriority: 'interrupt', area: '/api/opportunities', dedupeMs: 30 * 24 * H },
  { id: 'deal_lost', label: 'Deal verloren', hint: 'Status einer Opportunity auf verloren', defaultPriority: 'digest', area: '/api/opportunities', dedupeMs: 30 * 24 * H },
  { id: 'payment_failed', label: 'Zahlung fehlgeschlagen', hint: 'Stripe-Abo oder Checkout', defaultPriority: 'interrupt', area: '/api/invoices', dedupeMs: 24 * H },
  { id: 'workflow_failed', label: 'Automation fehlgeschlagen', hint: 'Ein Workflow-Lauf endete mit Fehler', defaultPriority: 'digest', area: '/api/workflows', dedupeMs: 6 * H },
];
export const TRIGGER_IDS: string[] = TRIGGERS.map((t) => t.id);
export const triggerById = (id: string) => TRIGGERS.find((t) => t.id === id);

/** At most one spoken interrupt per person and sub-account in this time; more become a silent card (or wait for the digest). */
export const SPEAK_GAP_MS = 3 * 60_000;
/** The browser polls while the tab is visible – seen within this time counts as "the companion is open". */
export const VISIBLE_MS = 45_000;

export interface EffectiveTrigger {
  id: string;
  on: boolean;
  priority: TriggerPriority;
}

/** A person's stored overrides over the trigger defaults. Pure. */
export function effectiveTriggers(events: { on: boolean; triggers: Partial<Record<string, { on?: boolean; priority?: TriggerPriority }>> } | undefined): EffectiveTrigger[] {
  return TRIGGERS.map((t) => {
    const o = events?.triggers?.[t.id] ?? {};
    return { id: t.id, on: events?.on !== false && o.on !== false, priority: o.priority ?? t.defaultPriority };
  });
}

export type Route = 'speak' | 'card' | 'push' | 'digest';

/**
 * Where one event goes for one person. `digest` waits for the next check-in or briefing; an interrupt is spoken when the companion is
 * open (tab visible) and the last spoken interrupt is older than the gap – else a silent card; with the app closed it is a push.
 * Quiet hours turn every interrupt into the digest (no voice, no push at night). Pure.
 */
export function routeEvent(i: { priority: TriggerPriority; quiet: boolean; visible: boolean; lastSpokenAt: number | null; lastPushAt?: number | null; now: number; gapMs?: number }): Route {
  const gap = i.gapMs ?? SPEAK_GAP_MS;
  if (i.priority === 'digest' || i.quiet) return 'digest';
  if (i.visible) return i.lastSpokenAt && i.now - i.lastSpokenAt < gap ? 'card' : 'speak';
  return i.lastPushAt && i.now - i.lastPushAt < gap ? 'digest' : 'push';
}

/** Same record, same trigger → one key (dedupe per entity). Pure. */
export const dedupeKey = (trigger: string, entity: string) => `${trigger}:${entity}`.slice(0, 200);

/** Whether a key was seen within the trigger's dedupe time. `seen` = key → last time (ms). Pure. */
export function isDuplicate(trigger: string, key: string, seen: Map<string, number> | Record<string, number>, now: number): boolean {
  const at = seen instanceof Map ? seen.get(key) : seen[key];
  const def = triggerById(trigger);
  return !!at && now - at < (def?.dedupeMs ?? 24 * H);
}

// --- words ----------------------------------------------------------------------------------------------------------------

export interface NextAction {
  /** the button and what the companion offers */
  label: string;
  /** for the HyperLevel Agent – never third-party text */
  prompt?: string;
  /** or a page */
  url?: string;
  entity?: { type: string; id: string; label: string };
}
export interface TriggerMessage {
  title: string;
  /** spoken: what happened + the offer ("Soll ich …?") */
  say: string;
  action?: NextAction;
}

const clip = (s: unknown, n: number) => {
  const t = String(s ?? '')
    .replace(/[\u0000-\u001f<>{}[\]`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const personOf = (c: any) => clip([c?.first_name, c?.last_name].filter(Boolean).join(' ') || c?.name || c?.company || c?.email || c?.phone || '', 60);
const euro = (cents: number, lang: Lang, cur = 'EUR') => {
  try {
    return new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'de-DE', { style: 'currency', currency: cur || 'EUR', maximumFractionDigits: 0 }).format((Number(cents) || 0) / 100);
  } catch {
    return `${Math.round((Number(cents) || 0) / 100)} ${cur}`;
  }
};

/**
 * The words for one event. `data` is the event's payload (or the scan's row, same field names). Returns null when the event does
 * not qualify (e.g. a review with three stars). Pure.
 */
export function triggerMessage(trigger: string, data: Record<string, any>, lang: Lang): TriggerMessage | null {
  const t = translator(lang);
  switch (trigger) {
    case 'lead_new': {
      const c = data.contact ?? {};
      const who = personOf(c) || t('Ein neuer Kontakt');
      const src = clip(c.source, 40);
      return {
        title: t('Neuer Lead: {who}', { who }),
        say: src ? t('Neuer Lead: {who} über {src}. Soll ich eine kurze Begrüßung entwerfen?', { who, src }) : t('Neuer Lead: {who}. Soll ich eine kurze Begrüßung entwerfen?', { who }),
        action: { label: t('Begrüßung entwerfen'), prompt: t('Entwirf eine kurze, persönliche Begrüßung für den ausgewählten neuen Kontakt – noch nicht senden, erst zeigen.'), entity: { type: 'contact', id: String(data.contactId ?? c.id ?? ''), label: who } },
      };
    }
    case 'message_unanswered': {
      const who = personOf(data.contact ?? data) || t('Ein Kontakt');
      const mins = Math.max(1, Math.round(Number(data.minutes) || 0));
      const wait = mins >= 120 ? t.plural(Math.floor(mins / 60), { one: '{n} Stunde', other: '{n} Stunden' }) : t.plural(mins, { one: '{n} Minute', other: '{n} Minuten' });
      return {
        title: t('{who} wartet seit {wait}', { who, wait }),
        say: t('{who} wartet seit {wait} auf eine Antwort. Soll ich antworten?', { who, wait }),
        action: { label: t('Antwort entwerfen'), prompt: t('Entwirf eine Antwort auf die letzte Nachricht der ausgewählten Konversation – noch nicht senden, erst zeigen.'), entity: { type: 'conversation', id: String(data.conversationId ?? ''), label: who } },
      };
    }
    case 'invoice_overdue': {
      const i = data.invoice ?? {};
      const who = personOf(data.contact ?? i) || t('dem Kunden');
      const num = clip(i.number, 30) || t('ohne Nummer');
      const open = euro(Number(i.total_cents ?? 0) - Number(i.paid_cents ?? 0) - Number(i.credited_cents ?? 0) - Number(i.deducted_cents ?? 0), lang, i.currency);
      return {
        title: t('Rechnung {num} ist überfällig', { num }),
        say: t('Die Rechnung {num} von {who} ist jetzt überfällig, {open} offen. Soll ich eine freundliche Erinnerung vorbereiten?', { num, who, open }),
        action: { label: t('Erinnerung vorbereiten'), prompt: t('Bereite für die ausgewählte überfällige Rechnung {num} eine freundliche Zahlungserinnerung vor – erst zeigen, nicht senden.', { num }), entity: { type: 'invoice', id: String(i.id ?? data.invoiceId ?? ''), label: num } },
      };
    }
    case 'appointment_soon': {
      const a = data.appointment ?? {};
      const mins = Math.max(0, Math.round(Number(data.minutesToStart) || 0));
      const title = clip(a.title, 60) || t('Termin');
      return {
        title: t('In {mins} Minuten: {title}', { mins, title }),
        say: t('In {mins} Minuten beginnt „{title}“. Soll ich dich kurz vorbereiten?', { mins, title }),
        action: { label: t('Kurz vorbereiten'), prompt: t('Bereite mich in drei Sätzen auf den ausgewählten Termin vor: wer, worum es geht, worauf ich achten sollte.'), entity: { type: 'appointment', id: String(a.id ?? ''), label: title } },
      };
    }
    case 'review_negative': {
      const rating = Number(data.rating);
      if (!Number.isFinite(rating) || rating <= 0 || rating > 2) return null;
      const who = clip(data.author, 40) || t('Jemand');
      const where = clip(data.platform ?? data.source, 30);
      return {
        title: where ? t('{rating}-Sterne-Bewertung auf {where}', { rating, where }) : t('{rating}-Sterne-Bewertung', { rating }),
        say: rating === 1
          ? where ? t('{who} hat einen Stern gegeben auf {where}. Soll ich eine ruhige, freundliche Antwort entwerfen?', { who, where }) : t('{who} hat einen Stern gegeben. Soll ich eine ruhige, freundliche Antwort entwerfen?', { who })
          : where ? t('{who} hat zwei Sterne gegeben auf {where}. Soll ich eine ruhige, freundliche Antwort entwerfen?', { who, where }) : t('{who} hat zwei Sterne gegeben. Soll ich eine ruhige, freundliche Antwort entwerfen?', { who }),
        action: { label: t('Antwort entwerfen'), prompt: t('Entwirf eine ruhige, freundliche Antwort auf die ausgewählte negative Bewertung – noch nicht veröffentlichen, erst zeigen.'), entity: { type: 'review', id: String(data.reviewId ?? ''), label: who } },
      };
    }
    case 'deal_won':
    case 'deal_lost': {
      const o = data.opportunity ?? {};
      const status = String(data.status ?? o.status ?? '');
      if ((trigger === 'deal_won') !== (status === 'won') || (trigger === 'deal_lost' && status !== 'lost')) return null;
      const name = clip(o.name, 60) || t('Ein Deal');
      const value = euro(Number(o.value ?? 0) * 100, lang, o.currency);
      const entity = { type: 'opportunity', id: String(o.id ?? ''), label: name };
      return trigger === 'deal_won'
        ? {
            title: t('Gewonnen: {name}', { name }),
            say: t('Glückwunsch – „{name}“ ist gewonnen, {value}. Soll ich die Rechnung vorbereiten?', { name, value }),
            action: { label: t('Rechnung vorbereiten'), prompt: t('Bereite für den ausgewählten gewonnenen Deal einen Rechnungsentwurf vor – nicht versenden, erst zeigen.'), entity },
          }
        : {
            title: t('Verloren: {name}', { name }),
            say: t('„{name}“ ist leider verloren, {value}. Soll ich eine kurze Nachbetrachtung mit dem nächsten Schritt vorschlagen?', { name, value }),
            action: { label: t('Nachbetrachtung'), prompt: t('Fasse den ausgewählten verlorenen Deal zusammen und schlag einen sinnvollen nächsten Schritt vor (z. B. Wiedervorlage in drei Monaten) – nichts ändern.'), entity },
          };
    }
    case 'payment_failed': {
      const amount = euro(Number(data.amount_cents ?? 0), lang, data.currency);
      const who = personOf(data.contact ?? {}) || t('eines Kunden');
      return {
        title: t('Zahlung fehlgeschlagen: {amount}', { amount }),
        say: t('Eine Zahlung über {amount} von {who} ist fehlgeschlagen. Soll ich eine freundliche Nachricht mit neuem Zahlungslink vorbereiten?', { amount, who }),
        action: data.contactId ? { label: t('Nachricht vorbereiten'), prompt: t('Die letzte Zahlung des ausgewählten Kontakts ist fehlgeschlagen. Entwirf eine freundliche Nachricht mit der Bitte, die Zahlung zu wiederholen – noch nicht senden.'), entity: { type: 'contact', id: String(data.contactId), label: who } } : { label: t('Mahnwesen öffnen'), url: 'dunning' },
      };
    }
    case 'workflow_failed': {
      const n = Math.max(1, Number(data.count) || 1);
      const name = clip(data.name, 60) || t('eine Automation');
      return {
        title: t('Automation „{name}“ fehlgeschlagen', { name }),
        say: t.plural(n, { one: 'Die Automation „{name}“ ist einmal fehlgeschlagen. Soll ich sie öffnen?', other: 'Die Automation „{name}“ ist {n}-mal fehlgeschlagen. Soll ich sie öffnen?' }, { name }),
        action: { label: t('Automation öffnen'), url: `workflows/${clip(data.workflowId, 64)}` },
      };
    }
  }
  return null;
}

/** The digest line a check-in adds for collected events ("Seit dem letzten Check-in: …"). Pure. */
export function digestSay(titles: string[], lang: Lang): string {
  if (!titles.length) return '';
  const t = translator(lang);
  const top = titles.slice(0, 3).join('; ');
  return titles.length > 3 ? t('Seit dem letzten Check-in: {top} und {n} weitere.', { top, n: titles.length - 3 }) : t('Seit dem letzten Check-in: {top}.', { top });
}
