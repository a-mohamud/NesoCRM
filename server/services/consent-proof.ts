import type { App } from '../core/app.js';
import { notFound } from '../core/http.js';
import { toCsv } from '../core/csv.js';
import { contactName, getContact } from './contacts.js';
import {
  ACTION_LABEL,
  CHANNEL_LABEL,
  CHANNELS,
  PURPOSE_LABEL,
  SOURCE_LABEL,
  STATUS_LABEL,
  deStamp,
  deriveAll,
  normText,
  type ConsentChannel,
  type Status,
} from './consent-model.js';
import { eventsOf, doiOf, settingsOf, type EventRow } from './consent.js';
import { A4, Page, latin, pdfOf } from './creator-pdf.js';
import { tLoc, translator, type ServerLocale } from '../i18n/index.js';

/**
 * The proof of consent of one contact: every event with its text version, source, time, IP network and browser fingerprint,
 * the current status per channel, the open and closed confirmations and how many messages went out on which basis. As JSON
 * (privacy export, API), CSV and PDF – what you show an authority, a lawyer or the person asking (Art. 7 Abs. 1 DSGVO).
 */

export interface ProofEvent {
  at: string;
  at_text: string;
  channel: string;
  channel_label: string;
  purpose: string;
  purpose_label: string;
  action: string;
  action_label: string;
  source: string;
  source_kind: string;
  source_label: string;
  text: string;
  text_version: number | null;
  text_digest: string;
  ip_net: string;
  ua_digest: string;
  proof_url: string;
  note: string;
  actor: string;
  doi_id: string;
}

export interface Proof {
  generated_at: string;
  location: { id: string; name: string; address: string; email: string };
  contact: { id: string; name: string; email: string; phone: string; source: string; created_at: string; dnd: boolean };
  policy: string;
  status: Record<string, { status: Status; label: string; legacy: boolean; reason: string; since: string | null; purposes: Record<string, { status: Status; label: string; reason: string; since: string | null }> }>;
  events: ProofEvent[];
  doi: { id: string; status: string; channel: string; purposes: string[]; email: string; requested_at: string; confirmed_at: string | null; expires_at: string; reminded_at: string | null }[];
  messages: { purpose: string; basis: string; count: number }[];
  note: string;
  /** The language the proof is written in (the sub-account's); CSV and PDF use it too. */
  lang: ServerLocale;
}

export function buildProof(app: App, locationId: string, contactId: string): Proof {
  const contact = getContact(app, locationId, contactId);
  const loc = app.location(locationId);
  if (!contact || !loc) throw notFound('Kontakt nicht gefunden');
  const tz = loc.timezone || 'Europe/Berlin';
  const t = tLoc(app, locationId);
  const rows = eventsOf(app, contactId);
  const texts = new Map<string, string>();
  for (const r of rows) if (r.text_id && !texts.has(r.text_id)) texts.set(r.text_id, app.db.get<{ text: string }>('SELECT text FROM consent_texts WHERE id = ?', r.text_id)?.text ?? '');
  const state = deriveAll(rows, { dnd: !!contact.dnd });
  const status: Proof['status'] = {};
  for (const c of CHANNELS) {
    const s = state[c];
    status[c] = {
      status: s.status,
      label: t(STATUS_LABEL[s.status]),
      legacy: s.legacy,
      reason: s.reason ? t(s.reason) : s.status === 'unknown' && s.legacy ? t('Kein Nachweis gespeichert (Quelle des Kontakts: {source})', { source: contact.source || t('unbekannt') }) : '',
      since: s.since,
      purposes: Object.fromEntries(Object.entries(s.purposes).map(([p, x]) => [p, { status: x.status, label: t(STATUS_LABEL[x.status]), reason: x.reason ? t(x.reason) : '', since: x.since }])),
    };
  }
  const events: ProofEvent[] = rows.map((e: EventRow) => ({
    at: e.created_at,
    at_text: deStamp(e.created_at, tz, true, t),
    channel: e.channel,
    channel_label: CHANNEL_LABEL[e.channel as ConsentChannel] ? t(CHANNEL_LABEL[e.channel as ConsentChannel]) : e.channel,
    purpose: e.purpose,
    purpose_label: e.purpose === '*' ? t('alle Zwecke') : PURPOSE_LABEL[e.purpose as keyof typeof PURPOSE_LABEL] ? t(PURPOSE_LABEL[e.purpose as keyof typeof PURPOSE_LABEL]) : e.purpose,
    action: e.action,
    action_label: ACTION_LABEL[e.action] ? t(ACTION_LABEL[e.action]) : e.action,
    source: e.source_label ? `${SOURCE_LABEL[e.source_kind] ? t(SOURCE_LABEL[e.source_kind]) : e.source_kind}: ${e.source_label}` : SOURCE_LABEL[e.source_kind] ? t(SOURCE_LABEL[e.source_kind]) : e.source_kind,
    source_kind: e.source_kind,
    source_label: e.source_label,
    text: e.text_id ? (texts.get(e.text_id) ?? '') : '',
    text_version: e.text_version,
    text_digest: e.text_digest,
    ip_net: e.ip_net,
    ua_digest: e.ua_digest,
    proof_url: e.proof_url,
    note: e.note,
    actor: e.actor,
    doi_id: e.doi_id ?? '',
  }));
  const messages = app.db
    .all<{ purpose: string; consent_basis: string; n: number }>(`SELECT purpose, consent_basis, COUNT(*) n FROM messages WHERE contact_id = ? AND location_id = ? AND direction = 'out' AND purpose != '' GROUP BY purpose, consent_basis ORDER BY purpose, consent_basis`, contactId, locationId)
    .map((m) => ({ purpose: m.purpose, basis: m.consent_basis, count: Number(m.n) }));
  return {
    generated_at: new Date().toISOString(),
    location: { id: loc.id, name: loc.name, address: loc.address ?? '', email: loc.email ?? '' },
    contact: { id: contact.id, name: contactName(contact), email: contact.email, phone: contact.phone, source: contact.source, created_at: contact.created_at, dnd: !!contact.dnd },
    policy: settingsOf(app, locationId).policy === 'confirmed' ? t('Nur bestätigte Einwilligungen') : t('Bestätigte Einwilligungen und Altbestand ohne Nachweis'),
    status,
    events,
    doi: doiOf(app, contactId).map((d) => ({ id: d.id, status: d.status, channel: d.channel, purposes: d.purposes, email: d.email, requested_at: d.requested_at, confirmed_at: d.confirmed_at, expires_at: d.expires_at, reminded_at: d.reminded_at })),
    messages,
    note: t('Nachweis der Einwilligung nach Art. 7 Abs. 1 DSGVO. Gespeichert werden Zeitpunkt, Quelle, Einwilligungstext (mit Version), das IP-Netz (/24 bzw. /48, nicht die volle Adresse) und ein Fingerabdruck des Browsers.'),
    lang: t.locale,
  };
}

export function proofCsv(p: Proof): string {
  const t = translator(p.lang);
  const head = ['Zeitpunkt', 'Kanal', 'Zweck', 'Ereignis', 'Quelle', 'Einwilligungstext', 'Textversion', 'Text-Fingerabdruck', 'IP-Netz', 'Browser-Fingerabdruck', 'Nachweis-Link', 'Notiz', 'Bestätigungs-ID'].map((h) => t(h));
  return (
    '﻿' +
    toCsv([
      head,
      ...p.events.map((e) => [e.at, e.channel_label, e.purpose_label, e.action_label, e.source, normText(e.text), e.text_version ?? '', e.text_digest, e.ip_net, e.ua_digest, e.proof_url, e.note, e.doi_id]),
    ])
  );
}

/** A4 PDF, as many pages as needed. */
export function proofPdf(p: Proof): Buffer {
  const t = translator(p.lang);
  const stamp = (iso: string | null) => deStamp(iso, 'Europe/Berlin', true, t);
  const L = 56;
  const R = A4.w - 56;
  const W = R - L;
  const pages: Page[] = [];
  let page = new Page();
  let y = 0;
  const fresh = () => {
    page = new Page();
    pages.push(page);
    page.rect(0, 0, A4.w, 8, { fill: '#1e3a8a' });
    y = 48;
  };
  fresh();
  const room = (h: number) => {
    if (y + h > A4.h - 56) fresh();
  };
  const para = (s: string, size: number, o: { bold?: boolean; color?: string; gap?: number } = {}) => {
    const lay = estimate(s, W, size);
    room(lay);
    y += page.para(L, y, latin(s), W, size, o);
    y += o.gap ?? 0;
  };

  page.text(L, y, latin(t('Nachweis der Einwilligung')), 20, { bold: true, color: '#1e3a8a' });
  y += 30;
  para(`${p.location.name}${p.location.address ? ` · ${p.location.address.replace(/\s*\n\s*/g, ', ')}` : ''}`, 10, { color: '#64748b', gap: 10 });
  para(t('Person: {name}', { name: p.contact.name }) + (p.contact.email ? ` <${p.contact.email}>` : '') + (p.contact.phone ? ` · ${p.contact.phone}` : ''), 12, { bold: true });
  para(t('Kontakt angelegt: {date} · Quelle: {source}', { date: stamp(p.contact.created_at), source: p.contact.source || '–' }), 10, { color: '#475569' });
  para(t('Erstellt am {date} · Versandregel: {policy}', { date: stamp(p.generated_at), policy: p.policy }), 10, { color: '#475569', gap: 14 });

  para(t('Aktueller Stand'), 13, { bold: true, gap: 4 });
  for (const c of CHANNELS) {
    const s = p.status[c];
    room(20);
    page.text(L, y, latin(t(CHANNEL_LABEL[c])), 11, { bold: true });
    page.text(L + 150, y, latin(s.label), 11, { color: s.status === 'confirmed' ? '#047857' : s.status === 'revoked' ? '#b91c1c' : s.status === 'pending' ? '#b45309' : '#475569' });
    if (s.reason || s.since) page.text(L + 290, y, latin(`${s.reason}${s.since ? `${s.reason ? ' · ' : ''}${t('seit {date}', { date: stamp(s.since) })}` : ''}`.slice(0, 60)), 9, { color: '#64748b' });
    y += 18;
  }
  y += 10;

  para(t.plural(p.events.length, { one: 'Verlauf ({n} Eintrag)', other: 'Verlauf ({n} Einträge)' }), 13, { bold: true, gap: 4 });
  if (!p.events.length) para(t('Keine Einwilligungsereignisse gespeichert (Altbestand oder noch keine Einwilligung).'), 10, { color: '#64748b' });
  for (const e of p.events) {
    const lines: string[] = [];
    lines.push(t('Quelle: {source}', { source: e.source || '–' }) + (e.ip_net ? ` · ${t('IP-Netz {net}', { net: e.ip_net })}` : '') + (e.ua_digest ? ` · ${t('Browser {digest}', { digest: e.ua_digest })}` : ''));
    if (e.text) lines.push(`${e.text_version ? t('Text (Version {version})', { version: e.text_version }) : t('Text')}: „${normText(e.text)}“`);
    if (e.proof_url) lines.push(t('Nachweis-Link: {url}', { url: e.proof_url }));
    if (e.note) lines.push(t('Notiz: {note}', { note: e.note }));
    if (e.doi_id) lines.push(t('Bestätigung Nr. {id}', { id: e.doi_id }));
    const body = lines.join('\n');
    room(22 + estimate(body, W - 12, 9.5) + 8);
    page.line(L, y - 2, R, y - 2, { stroke: '#e2e8f0' });
    y += 4;
    page.text(L, y, latin(`${e.at_text}  ·  ${e.channel_label} · ${e.purpose_label}`), 10.5, { bold: true });
    page.text(R, y, latin(e.action_label), 10.5, { bold: true, anchor: 'end', color: e.action === 'revoked' || e.action === 'expired' ? '#b91c1c' : e.action === 'granted' || e.action === 'confirmed' ? '#047857' : '#475569' });
    y += 17;
    y += page.para(L + 12, y, latin(body), W - 12, 9.5, { color: '#334155', gap: 6 });
  }

  if (p.messages.length) {
    room(60);
    y += 8;
    para(t('Versendete Nachrichten (Zweck / Grundlage)'), 13, { bold: true, gap: 4 });
    const basis: Record<string, string> = { confirmed: t('bestätigte Einwilligung'), legacy: t('Altbestand ohne Nachweis'), exempt: t('Service/Vertrag (keine Einwilligung nötig)'), override: t('bewusst überschrieben (Test/Hand)'), blocked: t('blockiert'), '': '–' };
    for (const m of p.messages) para(`${m.purpose === 'marketing' ? t('Werbung') : m.purpose === 'transactional' ? t('Service/Vertrag') : t('Gespräch')}: ${m.count} × ${basis[m.basis] ?? m.basis}`, 10);
  }
  room(50);
  y += 10;
  para(p.note, 8.5, { color: '#64748b' });
  return pdfOf(pages, { title: t('Nachweis der Einwilligung') });
}

/** Height a wrapped paragraph needs (the Page helper returns it only after drawing, the page break must come first). */
function estimate(s: string, width: number, size: number): number {
  const perLine = Math.max(10, Math.floor(width / (size * 0.52)));
  let lines = 0;
  for (const part of s.split('\n')) lines += Math.max(1, Math.ceil(part.length / perLine));
  return lines * size * 1.4;
}
