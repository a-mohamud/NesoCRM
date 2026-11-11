import type { App } from '../../core/app.js';
import { CATALOG, type CogneeType } from './model.js';
import { tApp, tLoc } from '../../i18n/index.js';

/**
 * What HyperLevel records become documents for the memory: one `KindDef` per kind of record. A kind knows
 *  - `next`: the records changed after a cursor (updated_at, id), oldest first – index-driven, every query filters on the sub-account;
 *  - `build`: the text sent to Cognee (null = not eligible any more);
 *  - `alive`: SQL that finds a record again by the mapping row `i` – an anti-join on it finds records that were deleted,
 *    trashed or made private since;
 *  - `describe`: title and link of a record, looked up live (nothing about it is stored next to the mapping).
 * Only what the data-type description promises is read: no addresses, birthdays, tokens, files.
 */

export interface Row {
  /** The record id stored in the mapping. */
  rid: string;
  /** updated_at (created_at for immutable records) – the cursor position. */
  at: string;
  data: any;
}

export interface Built {
  title: string;
  body: string;
  contactId?: string | null;
  parentId?: string | null;
}

export interface KindDef {
  key: string;
  type: CogneeType;
  alive: string;
  next(app: App, loc: string, after: { at: string; id: string }, limit: number): Row[];
  build(app: App, loc: string, row: Row): Built | null;
  describe(app: App, loc: string, recordId: string, parentId: string | null): { title: string; link: string } | null;
}

/** Longest document sent (characters); longer texts are cut with a note. */
export const MAX_CHARS = 40_000;
const MSG_CHARS = 2_000;

const day = (iso: string) => String(iso ?? '').slice(0, 16).replace('T', ' ');
const nameOf = (c: { first_name?: string; last_name?: string; company?: string } | undefined) => [c?.first_name, c?.last_name].filter(Boolean).join(' ') || c?.company || tApp()('Kontakt ohne Namen');

/** Markup out, line breaks kept. */
export function plain(s: unknown): string {
  return String(s ?? '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

const cut = (s: string, n = MAX_CHARS) => (s.length > n ? `${s.slice(0, n)}\n${tApp()('[gekürzt]')}` : s);
const after = (col: string, idCol: string) => `(${col} > ? OR (${col} = ? AND ${idCol} > ?))`;
const monthEnd = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return m >= 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
};
const host = (u: string) => {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' ? `${x.origin}${x.pathname}` : '';
  } catch {
    return '';
  }
};

// --- wiki & documents ---------------------------------------------------------------------------------------------------

const WIKI_PAGE: KindDef = {
  key: 'page',
  type: 'wiki',
  alive: `SELECT 1 FROM wiki_pages p JOIN wiki_spaces s ON s.id = p.space_id WHERE p.id = i.record_id AND p.location_id = i.location_id AND p.trashed_at IS NULL AND s.team_access != 'none'`,
  next: (app, loc, a, limit) =>
    app.db
      .all(
        `SELECT p.id, p.title, p.text, p.updated_at, s.name AS space_name FROM wiki_pages p JOIN wiki_spaces s ON s.id = p.space_id
         WHERE p.location_id = ? AND p.trashed_at IS NULL AND s.team_access != 'none' AND ${after('p.updated_at', 'p.id')} ORDER BY p.updated_at, p.id LIMIT ?`,
        loc, a.at, a.at, a.id, limit,
      )
      .map((r) => ({ rid: r.id, at: r.updated_at, data: r })),
  build: (app, loc, r) => {
    const t = tLoc(app, loc);
    return { title: r.data.title, body: cut(`${t('Wiki-Seite: {title}', { title: r.data.title })}\n${t('Bereich: {area}', { area: r.data.space_name })}\n\n${r.data.text}`) };
  },
  describe: (app, loc, id) => {
    const p = app.db.get('SELECT id, title FROM wiki_pages WHERE id = ? AND location_id = ? AND trashed_at IS NULL', id, loc);
    return p ? { title: p.title, link: `/app/wiki/${p.id}` } : null;
  },
};

const DOC: KindDef = {
  key: 'doc',
  type: 'wiki',
  alive: `SELECT 1 FROM docs d WHERE d.id = i.record_id AND d.location_id = i.location_id`,
  next: (app, loc, a, limit) =>
    app.db
      .all(`SELECT id, title, kind, source, summary, url, updated_at FROM docs WHERE location_id = ? AND ${after('updated_at', 'id')} ORDER BY updated_at, id LIMIT ?`, loc, a.at, a.at, a.id, limit)
      .map((r) => ({ rid: r.id, at: r.updated_at, data: r })),
  // The link without its query string: capability links must not end up in the memory.
  build: (app, loc, r) => {
    const t = tLoc(app, loc);
    return { title: r.data.title, body: cut(`${t('Dokument: {title}', { title: r.data.title })}\n${t('Art: {kind}', { kind: r.data.kind })}${r.data.source ? `\n${t('Quelle: {source}', { source: r.data.source })}` : ''}${host(r.data.url) ? `\nLink: ${host(r.data.url)}` : ''}${r.data.summary ? `\n\n${r.data.summary}` : ''}`) };
  },
  describe: (app, loc, id) => {
    const d = app.db.get('SELECT title, url FROM docs WHERE id = ? AND location_id = ?', id, loc);
    return d ? { title: d.title, link: host(d.url) } : null;
  },
};

// --- notes ---------------------------------------------------------------------------------------------------------------

const NOTE: KindDef = {
  key: 'note',
  type: 'notes',
  alive: `SELECT 1 FROM notes n WHERE n.id = i.record_id AND n.location_id = i.location_id`,
  next: (app, loc, a, limit) =>
    app.db
      .all(
        `SELECT n.id, n.body, n.created_at, n.contact_id, c.first_name, c.last_name, c.company FROM notes n JOIN contacts c ON c.id = n.contact_id
         WHERE n.location_id = ? AND ${after('n.created_at', 'n.id')} ORDER BY n.created_at, n.id LIMIT ?`,
        loc, a.at, a.at, a.id, limit,
      )
      .map((r) => ({ rid: r.id, at: r.created_at, data: r })),
  build: (app, loc, r) => {
    const t = tLoc(app, loc);
    return { title: t('Notiz zu {name}', { name: nameOf(r.data) }), body: cut(`${t('Notiz zu Kontakt „{name}“ vom {date}:', { name: nameOf(r.data), date: day(r.data.created_at) })}\n${r.data.body}`), contactId: r.data.contact_id };
  },
  describe: (app, loc, id) => {
    const n = app.db.get('SELECT n.contact_id, c.first_name, c.last_name, c.company FROM notes n JOIN contacts c ON c.id = n.contact_id WHERE n.id = ? AND n.location_id = ?', id, loc);
    return n ? { title: tLoc(app, loc)('Notiz zu {name}', { name: nameOf(n) }), link: `/app/contacts/${n.contact_id}` } : null;
  },
};

// --- tickets, helpdesk, knowledge base -------------------------------------------------------------------------------------

const WHO: Record<string, string> = { created: 'Kunde', customer_reply: 'Kunde', reply: 'Team', auto_reply: 'Automatische Antwort', note: 'Interne Notiz' };

const TICKET: KindDef = {
  key: 'ticket',
  type: 'tickets',
  alive: `SELECT 1 FROM tickets t WHERE t.id = i.record_id AND t.location_id = i.location_id AND t.merged_into IS NULL`,
  next: (app, loc, a, limit) =>
    app.db
      .all(`SELECT t.* FROM tickets t WHERE t.location_id = ? AND t.merged_into IS NULL AND ${after('t.updated_at', 't.id')} ORDER BY t.updated_at, t.id LIMIT ?`, loc, a.at, a.at, a.id, limit)
      .map((r) => ({ rid: r.id, at: r.updated_at, data: r })),
  build: (app, loc, r) => {
    const t = r.data;
    const events = app.db.all(
      `SELECT type, body, created_at FROM ticket_events WHERE ticket_id = ? AND location_id = ? AND type IN ('created','customer_reply','reply','note','auto_reply') AND body != '' ORDER BY created_at, rowid LIMIT 80`,
      t.id,
      loc,
    );
    const contact = t.contact_id ? app.db.get('SELECT first_name, last_name, company FROM contacts WHERE id = ? AND location_id = ?', t.contact_id, loc) : undefined;
    const tr = tLoc(app, loc);
    const lines = events.map((e) => `[${day(e.created_at)}] ${WHO[e.type] ? tr(WHO[e.type]) : e.type}: ${plain(e.body).slice(0, MSG_CHARS)}`);
    const head = [`Ticket #${t.number}: ${t.subject}`, t.category ? tr('Status: {status}, Priorität: {priority}, Kategorie: {category}', { status: t.status_kind, priority: t.priority, category: t.category }) : tr('Status: {status}, Priorität: {priority}', { status: t.status_kind, priority: t.priority }), ...(contact ? [tr('Kontakt: {name}', { name: nameOf(contact) })] : [])];
    const body = events.some((e) => e.type === 'created') ? lines.join('\n') : [t.description ? plain(t.description).slice(0, MSG_CHARS) : '', ...lines].filter(Boolean).join('\n');
    return { title: `#${t.number} ${t.subject}`, body: cut(`${head.join('\n')}\n\n${body}`), contactId: t.contact_id ?? null };
  },
  describe: (app, loc, id) => {
    const t = app.db.get('SELECT id, number, subject FROM tickets WHERE id = ? AND location_id = ?', id, loc);
    return t ? { title: `Ticket #${t.number} ${t.subject}`, link: `/app/tickets/${t.id}` } : null;
  },
};

const KB: KindDef = {
  key: 'kb',
  type: 'tickets',
  alive: `SELECT 1 FROM kb_articles a WHERE a.id = i.record_id AND a.location_id = i.location_id AND a.status = 'published'`,
  next: (app, loc, a, limit) =>
    app.db
      .all(
        `SELECT a.id, a.title, a.body, a.updated_at, c.name AS category FROM kb_articles a LEFT JOIN kb_categories c ON c.id = a.category_id
         WHERE a.location_id = ? AND a.status = 'published' AND ${after('a.updated_at', 'a.id')} ORDER BY a.updated_at, a.id LIMIT ?`,
        loc, a.at, a.at, a.id, limit,
      )
      .map((r) => ({ rid: r.id, at: r.updated_at, data: r })),
  build: (app, loc, r) => {
    const t = tLoc(app, loc);
    return { title: r.data.title, body: cut(`${t('Wissensdatenbank-Artikel: {title}', { title: r.data.title })}${r.data.category ? `\n${t('Kategorie: {category}', { category: r.data.category })}` : ''}\n\n${plain(r.data.body)}`) };
  },
  describe: (app, loc, id) => {
    const a = app.db.get(`SELECT title FROM kb_articles WHERE id = ? AND location_id = ? AND status = 'published'`, id, loc);
    return a ? { title: a.title, link: '/app/help-center' } : null;
  },
};

// --- course content ----------------------------------------------------------------------------------------------------------

const LESSON_FROM = `FROM course_lessons l JOIN course_modules m ON m.id = l.module_id JOIN courses c ON c.id = l.course_id`;
const LESSON_LIVE = `l.published = 1 AND m.published = 1 AND c.status = 'published'`;

const LESSON: KindDef = {
  key: 'lesson',
  type: 'courses',
  alive: `SELECT 1 ${LESSON_FROM} WHERE l.id = i.record_id AND l.location_id = i.location_id AND ${LESSON_LIVE}`,
  next: (app, loc, a, limit) =>
    app.db
      .all(
        `SELECT l.id, l.title, l.body, l.updated_at, m.title AS module_title, c.title AS course_title ${LESSON_FROM}
         WHERE l.location_id = ? AND ${LESSON_LIVE} AND ${after('l.updated_at', 'l.id')} ORDER BY l.updated_at, l.id LIMIT ?`,
        loc, a.at, a.at, a.id, limit,
      )
      .map((r) => ({ rid: r.id, at: r.updated_at, data: r })),
  build: (app, loc, r) => {
    const t = tLoc(app, loc);
    return { title: `${r.data.course_title}: ${r.data.title}`, body: cut(`${t('Kurs: {name}', { name: r.data.course_title })}\n${t('Modul: {name}', { name: r.data.module_title })}\n${t('Lektion: {name}', { name: r.data.title })}\n\n${plain(r.data.body)}`) };
  },
  describe: (app, loc, id) => {
    const l = app.db.get(`SELECT l.title, l.course_id, c.title AS course_title ${LESSON_FROM} WHERE l.id = ? AND l.location_id = ?`, id, loc);
    return l ? { title: `${l.course_title}: ${l.title}`, link: `/app/courses/${l.course_id}` } : null;
  },
};

// --- conversations: one document per conversation and month -----------------------------------------------------------------

const THREAD: KindDef = {
  key: 'thread',
  type: 'conversations',
  // Alive while the conversation still has messages (a single deleted message changes the month on its next sync).
  alive: `SELECT 1 FROM conversations v WHERE v.id = i.parent_id AND v.location_id = i.location_id AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = v.id)`,
  next: (app, loc, a, limit) =>
    app.db
      .all(
        `SELECT m.conversation_id AS cid, substr(m.created_at, 1, 7) AS month, MAX(m.created_at) AS at, v.contact_id AS contact_id
         FROM messages m JOIN conversations v ON v.id = m.conversation_id
         WHERE m.location_id = ? AND m.status != 'draft' AND m.created_at >= ?
         GROUP BY m.conversation_id, substr(m.created_at, 1, 7)
         HAVING MAX(m.created_at) > ? OR (MAX(m.created_at) = ? AND (m.conversation_id || ':' || substr(m.created_at, 1, 7)) > ?)
         ORDER BY at, cid LIMIT ?`,
        loc, a.at, a.at, a.at, a.id, limit,
      )
      .map((r) => ({ rid: `${r.cid}:${r.month}`, at: r.at, data: r })),
  build: (app, loc, r) => {
    const { cid, month, contact_id: contactId } = r.data;
    const msgs = app.db.all(
      `SELECT channel, direction, subject, body, created_at FROM messages WHERE location_id = ? AND conversation_id = ? AND status != 'draft' AND created_at >= ? AND created_at < ? ORDER BY created_at, rowid LIMIT 200`,
      loc,
      cid,
      `${month}-01`,
      monthEnd(month),
    );
    if (!msgs.length) return null;
    const contact = app.db.get('SELECT first_name, last_name, company FROM contacts WHERE id = ? AND location_id = ?', contactId, loc);
    const t = tLoc(app, loc);
    const lines = msgs.map((m) => `[${day(m.created_at)}] ${m.direction === 'in' ? t('Kontakt') : 'Team'} (${m.channel}${m.subject ? `, ${m.subject}` : ''}): ${plain(m.body).slice(0, MSG_CHARS)}`);
    return { title: t('Gespräch mit {name} ({month})', { name: nameOf(contact), month }), body: cut(`${t('Gesprächsverlauf mit {name}, {month}', { name: nameOf(contact), month })}\n\n${lines.join('\n')}`), contactId, parentId: cid };
  },
  describe: (app, loc, id, parent) => {
    const month = id.split(':')[1] ?? '';
    const c = app.db.get('SELECT c.first_name, c.last_name, c.company FROM conversations v JOIN contacts c ON c.id = v.contact_id WHERE v.id = ? AND v.location_id = ?', parent ?? '', loc);
    return c ? { title: month ? tLoc(app, loc)('Gespräch mit {name} ({month})', { name: nameOf(c), month }) : tLoc(app, loc)('Gespräch mit {name}', { name: nameOf(c) }), link: `/app/conversations/${parent}` } : null;
  },
};

// --- contacts ------------------------------------------------------------------------------------------------------------------

const CONTACT: KindDef = {
  key: 'contact',
  type: 'contacts',
  alive: `SELECT 1 FROM contacts c WHERE c.id = i.record_id AND c.location_id = i.location_id`,
  next: (app, loc, a, limit) =>
    app.db
      .all(`SELECT c.* FROM contacts c WHERE c.location_id = ? AND ${after('c.updated_at', 'c.id')} ORDER BY c.updated_at, c.id LIMIT ?`, loc, a.at, a.at, a.id, limit)
      .map((r) => ({ rid: r.id, at: r.updated_at, data: r })),
  build: (app, loc, r) => {
    const t = tLoc(app, loc);
    const c = r.data;
    const tags = safeJson<string[]>(c.tags, []);
    const custom = Object.entries(safeJson<Record<string, unknown>>(c.custom, {})).filter(([, v]) => v !== '' && v !== null && typeof v !== 'object');
    const lines = [
      t('Kontakt: {name}', { name: nameOf(c) }),
      c.company && t('Firma: {company}', { company: c.company }),
      (c.city || c.country) && t('Ort: {place}', { place: [c.city, c.country].filter(Boolean).join(', ') }),
      c.source && t('Quelle: {source}', { source: c.source }),
      tags.length && `Tags: ${tags.join(', ')}`,
      c.email && t('E-Mail: {email}', { email: c.email }),
      c.phone && t('Telefon: {phone}', { phone: c.phone }),
      ...custom.map(([k, v]) => `${k}: ${String(v).slice(0, 300)}`),
    ].filter(Boolean);
    return { title: nameOf(c), body: cut(lines.join('\n')), contactId: c.id };
  },
  describe: (app, loc, id) => {
    const c = app.db.get('SELECT id, first_name, last_name, company FROM contacts WHERE id = ? AND location_id = ?', id, loc);
    return c ? { title: nameOf(c), link: `/app/contacts/${c.id}` } : null;
  },
};

// --- manual notes to remember -------------------------------------------------------------------------------------------------

const MEMORY: KindDef = {
  key: 'memory',
  type: 'memory',
  alive: `SELECT 1 FROM cognee_memories x WHERE x.id = i.record_id AND x.location_id = i.location_id`,
  next: (app, loc, a, limit) =>
    app.db
      .all(`SELECT id, text, created_by_name, created_at, updated_at FROM cognee_memories WHERE location_id = ? AND ${after('updated_at', 'id')} ORDER BY updated_at, id LIMIT ?`, loc, a.at, a.at, a.id, limit)
      .map((r) => ({ rid: r.id, at: r.updated_at, data: r })),
  build: (app, loc, r) => {
    const t = tLoc(app, loc);
    return { title: t('Gemerkter Hinweis vom {date}', { date: day(r.data.created_at).slice(0, 10) }), body: cut(`${r.data.created_by_name ? t('Gemerkter Hinweis vom {date} ({name}):', { date: day(r.data.created_at), name: r.data.created_by_name }) : t('Gemerkter Hinweis vom {date}:', { date: day(r.data.created_at) })}\n${r.data.text}`) };
  },
  describe: (app, loc, id) => {
    const m = app.db.get('SELECT created_at FROM cognee_memories WHERE id = ? AND location_id = ?', id, loc);
    return m ? { title: tLoc(app, loc)('Gemerkter Hinweis vom {date}', { date: day(m.created_at).slice(0, 10) }), link: '' } : null;
  },
};

function safeJson<T>(v: unknown, fallback: T): T {
  try {
    return typeof v === 'string' && v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const KINDS: KindDef[] = [WIKI_PAGE, DOC, NOTE, TICKET, KB, LESSON, THREAD, CONTACT, MEMORY];

export const kindsOf = (type: CogneeType) => KINDS.filter((k) => k.type === type);
export const kindOf = (type: CogneeType, key: string) => KINDS.find((k) => k.type === type && k.key === key);

/**
 * The text that is sent: a header line that names the source and the record (so a text can never be read as a path or address,
 * and two records never share one data item), then the body.
 */
export function documentText(type: CogneeType, kind: string, recordId: string, b: Built): string {
  return `HyperLevel · ${CATALOG[type].label} · ${kind}:${recordId}\n\n${b.body}`;
}
