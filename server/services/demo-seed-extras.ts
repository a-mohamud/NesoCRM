import type { App } from '../core/app.js';
import type { User } from '../core/http.js';
import { id, now, token } from '../core/util.js';
import { AGENCY_NAME, type LocPlan } from './demo-seed-data.js';
import { getOrCreateConversation } from './messaging.js';
import { type STFn } from '../i18n/index.js';

/**
 * The showcases of the demo seed beyond the CRM basics (services/demo-seed.ts): deal quotes, an XRechnung, a recurring
 * appointment, inbox notes and WhatsApp, a workflow with a paused step on the canvas, imported reviews, call scripts, a project
 * with a Gantt chart and time entries, Office documents, a webinar, report dashboards, the online store with orders and a gift
 * card, a course with a community, custom objects and lead scoring. Each part only runs where the plan asks for it; failures
 * are collected by the kit, never thrown.
 */

export interface Kit {
  app: App;
  me: User;
  L: string;
  /** The plan in the sub-account's language (localisePlan) – and as written (German: the ids the history matches by). */
  plan: LocPlan;
  raw: LocPlan;
  /** The sub-account's translator: every text the seed writes goes through it. */
  t: STFn;
  /** VAT rate of the sub-account's country (19 Germany, 16 Kenya). */
  vat: number;
  contacts: any[];
  contact: (i: number) => any;
  call: <T = any>(method: string, path: string, body?: Record<string, any>) => Promise<T | undefined>;
  step: (label: string, fn: () => unknown) => Promise<void>;
  inDays: (d: number, hour: number, minute?: number) => string;
  ymd: (d: number) => string;
  rand: () => number;
  /** The moment the seed counts from (its `now` option): nothing is dated after it. */
  nowMs: number;
  /** Ids of rows whose dates the history already set (demo-seed-history.ts) – the final backdating leaves them alone. */
  dated: Set<string>;
}

const SALUTATION = (c: any) => `${c.first_name} ${c.last_name}`.trim();

/** Two deal quotes: one sent (waiting for the customer), one draft. */
export async function seedQuotes(k: Kit, deals: { id: string; name: string; value: number; status: string }[], products: any[]) {
  const open = deals.filter((d) => d.status === 'open').slice(0, 2);
  for (const [i, d] of open.entries()) {
    const p = products[i % Math.max(products.length, 1)];
    const items = [{ name: d.name, qty: 1, price_cents: Math.round(d.value * 100 * 0.84), tax_rate: k.vat }, ...(p ? [{ name: p.name, qty: 1, price_cents: p.price_cents, tax_rate: k.vat }] : [])];
    const q = await k.call('POST', '/api/quotes', { deal_id: d.id, title: k.t('Angebot: {name}', { name: d.name }), valid_days: 30, items });
    if (q?.id && i === 0) await k.call('POST', `/api/quotes/${q.id}/send`, {});
  }
}

/** One invoice to a public authority with a Leitweg-ID – downloadable as XRechnung. */
export async function seedXRechnung(k: Kit, product: any) {
  const c = k.contact(5);
  await k.call('POST', '/api/invoices', {
    contact_id: c.id,
    title: k.t('{name} – Rahmenvertrag Stadtverwaltung', { name: product.name }),
    items: [{ name: product.name, qty: 4, price_cents: product.price_cents, tax_rate: k.vat }],
    leitweg_id: '04011000-1234512345-35',
    buyer_ref: k.t('Bestellung 2026-0815'),
    issued_at: k.inDays(-3, 9),
    due_at: k.inDays(27, 12),
  });
}

/** A weekly series that started three weeks ago and runs on – the calendar shows it in the past and the future. */
export async function seedSeries(k: Kit, calendarId: string) {
  const [title, day] = k.plan.series;
  const offset = ((['MO', 'TU', 'WE', 'TH', 'FR'].indexOf(day) + 1 - new Date(k.inDays(-21, 12)).getDay() + 7) % 7) - 21;
  await k.call('POST', '/api/appointment-series', { calendar_id: calendarId, contact_id: k.contact(2).id, title, start: k.inDays(offset, 16), recurrence: `FREQ=WEEKLY;BYDAY=${day};COUNT=10`, force: true });
}

/** WhatsApp threads (inbound, an answer that is only stored) and internal notes on conversations. */
export async function seedInboxExtras(k: Kit) {
  const db = k.app.db;
  const lines: [string, string][] = [
    ['Hallo! Ist morgen Vormittag noch etwas frei?', 'Ja, 10:30 Uhr ginge – soll ich den Termin eintragen?'],
    ['Danke für die schnelle Antwort 🙌', ''],
    ['Kann ich auch per Rechnung zahlen?', 'Klar, die Rechnung kommt per E-Mail – 14 Tage Zahlungsziel.'],
  ];
  for (const [i, [textDe, answerDe]] of lines.entries()) {
    const c = k.contact(i * 4 + 3);
    const text = k.t(textDe);
    const answer = answerDe ? k.t(answerDe) : '';
    await k.step('whatsapp', () => {
      const conv = getOrCreateConversation(k.app, k.L, c.id);
      const msg = (direction: 'in' | 'out', body: string) =>
        db.insert('messages', { id: id(), location_id: k.L, conversation_id: conv, contact_id: c.id, channel: 'whatsapp', direction, subject: '', body, status: direction === 'in' ? 'received' : 'logged', error: '', source: direction === 'in' ? k.t('eingehend') : 'Demo', created_at: now() });
      msg('in', text);
      if (answer) msg('out', answer);
      db.run('UPDATE conversations SET last_message_at = ?, last_message = ?, unread = unread + ? WHERE id = ?', now(), (answer || text).slice(0, 120), answer ? 0 : 1, conv);
    });
  }
  const convs = db.all<{ id: string }>('SELECT id FROM conversations WHERE location_id = ? ORDER BY last_message_at DESC LIMIT 3', k.L);
  const notes = ['Interne Notiz: Kunde bevorzugt Rückrufe am Vormittag.', 'Angebot ist raus – in drei Tagen nachfassen.', 'Bitte Rechnung mit Bestellnummer neu ausstellen.'];
  for (const [i, c] of convs.entries()) await k.call('POST', `/api/inbox/conversations/${c.id}/notes`, { body: k.t(notes[i % notes.length]) });
}

/** The first workflow gets a paused step and a sticky note on the canvas (docs/workflow-actions.md). */
export async function seedWorkflowCanvas(k: Kit, workflowId: string) {
  const wf = await k.call('GET', `/api/workflows/${workflowId}`);
  const steps: any[] = Array.isArray(wf?.steps) ? wf.steps : [];
  if (steps.length < 2) return;
  const paused = steps.length > 2 ? 1 : steps.length - 1;
  await k.call('PATCH', `/api/workflows/${workflowId}`, {
    steps: steps.map((s, i) => (i === paused ? { ...s, disabled: true } : s)),
    settings: { ...(wf.settings ?? {}), layout: { v: 1, notes: [{ id: 'demo-hinweis', x: 360, y: 40, w: 240, h: 120, text: k.t('Demo: Schritt {n} ist pausiert – der Workflow überspringt ihn und macht mit dem nächsten weiter.', { n: paused + 1 }), color: 'yellow' }] } },
  });
}

/** Reviews from other platforms (an import source per portal, as for platforms without an API). */
export async function seedReviewPlatforms(k: Kit) {
  const texts = ['Sehr freundlich und zuverlässig – klare Empfehlung.', 'Schnelle Antwort, faire Preise.', 'Termin hat gepasst, alles sauber erledigt.', 'Gute Beratung, nur die Wartezeit war etwas lang.', 'Top! Gerne wieder.', 'Hat alles bestens geklappt.'];
  for (const [pi, platform] of k.plan.platforms.entries()) {
    const src = await k.call('POST', '/api/review-sources', { source: 'import', platform_label: platform, label: platform, profile_url: `https://${k.t('bewertungen.example.org')}/${k.plan.key}/${pi}` });
    if (!src?.id) continue;
    const rows = Array.from({ length: 9 + ((pi + k.plan.key.length) % 4) }, (_, i) => {
      const rating = i % 6 === 2 ? 4 : i % 13 === 7 ? 3 : 5;
      const who = SALUTATION(k.contact(pi * 5 + i)).replace(/,/g, '');
      return `${who},${rating},"${k.t(texts[(i + pi) % texts.length])}",${k.ymd(-(3 + i * 27 + pi * 5))}`;
    });
    await k.call('POST', `/api/review-sources/${src.id}/import`, { csv: ['author,rating,text,date', ...rows].join('\n') });
  }
}

/** A call script with branches (shown next to the browser phone and the power dialer). */
export async function seedCallScript(k: Kit) {
  if (!k.plan.script) return;
  const t = k.t;
  await k.call('POST', '/api/call-scripts', {
    name: k.plan.script,
    steps: [
      { id: 'start', title: t('Begrüßung'), text: t('Hallo, hier ist {{user.name}} von {name}. Sie hatten bei uns angefragt – passt es gerade für fünf Minuten?', { name: k.plan.name }), options: [{ label: t('Ja'), next: 'bedarf' }, { label: t('Später'), next: 'rueckruf' }] },
      { id: 'bedarf', title: t('Bedarf klären'), text: t('Worum geht es genau, bis wann soll es fertig sein und gibt es schon ein Budget?'), options: [{ label: t('Passt zu uns'), next: 'termin' }, { label: t('Passt nicht'), next: '' }] },
      { id: 'termin', title: t('Termin vereinbaren'), text: t('Dann schlage ich einen Termin vor – vormittags oder nachmittags?'), options: [] },
      { id: 'rueckruf', title: t('Rückruf'), text: t('Wann darf ich Sie zurückrufen? Ich trage es mir als Aufgabe ein.'), options: [] },
    ],
  });
}

/** A project with dated tasks (Gantt chart) and time entries over the last two weeks. */
export async function seedProject(k: Kit) {
  const pm = k.plan.pm;
  if (!pm) return;
  const p = await k.call('POST', '/api/pm/projects', { name: pm.name, color: '#0f766e', ...(pm.template ? { template: pm.template, start: k.ymd(-10) } : {}) });
  if (!p?.id) return;
  for (const [title, start, days, milestone] of pm.tasks ?? [])
    await k.call('POST', '/api/pm/tasks', { project_id: p.id, title, start_at: k.ymd(start), due_at: k.ymd(start + days - 1), ...(milestone ? { milestone: true } : {}) });
  const tasks = k.app.db.all<{ id: string; title: string }>('SELECT id, title FROM tasks WHERE project_id = ? AND parent_id IS NULL ORDER BY start_at LIMIT 6', p.id);
  // a couple of tasks already done, so the chart shows progress
  for (const task of tasks.slice(0, 2)) await k.call('PATCH', `/api/pm/tasks/${task.id}`, { done: true });
  for (let i = 0; i < 8 && tasks.length; i++) {
    const task = tasks[i % Math.min(tasks.length, 3)];
    await k.call('POST', '/api/pm/time', { task_id: task.id, minutes: 30 + ((i * 47) % 180), date: k.ymd(-(1 + i * 2)), note: k.t('Arbeit an „{task}“', { task: task.title }), billable: i % 4 !== 3 });
  }
}

/** Office documents (generated locally – no document engine needed for the list). */
export async function seedOffice(k: Kit) {
  const t = k.t;
  for (const [kind, name] of k.plan.office ?? []) {
    if (kind === 'docx') await k.call('POST', '/api/office/files', { kind, name, text: `${name}\n\n${k.plan.name}\n\n${t('Dieses Dokument ist erfunden und gehört zur Demo. Es darf frei bearbeitet werden.')}` });
    else
      await k.call('POST', '/api/office/files', {
        kind,
        name,
        rows: [
          [t('Posten'), t('Stückzahl'), t('Einzelpreis (€)'), t('Summe (€)')],
          [t('Material'), 12, 18.5, 222],
          [t('Arbeitszeit (Std.)'), 16, 78, 1248],
          [t('Anfahrt'), 3, 39, 117],
        ],
      });
  }
}

/** A published on-demand webinar with registrations. */
export async function seedWebinar(k: Kit) {
  if (!k.plan.webinar) return;
  const w = await k.call('POST', '/api/webinars', {
    title: k.plan.webinar,
    description: k.t('Erfundenes Demo-Webinar: 45 Minuten mit Fragerunde.'),
    presenter_name: k.me.name,
    video: { type: 'url', url: 'https://videos.example.org/demo-webinar.mp4' },
    duration_s: 2700,
    schedule: { ondemand: { enabled: true } },
  });
  if (w?.id) await k.call('PATCH', `/api/webinars/${w.id}`, { status: 'published' });
  if (w?.id) for (let i = 0; i < 16; i++) await k.call('POST', `/api/webinars/${w.id}/registrations`, { contact_id: k.contact(i + 7).id });
}

/** The online store: open, products published, orders in every state and a gift card. */
export async function seedStore(k: Kit, products: any[]) {
  if (!k.plan.store || !products.length) return;
  const t = k.t;
  await k.call('PUT', '/api/store/settings', { enabled: true, name: k.plan.name, slug: t('hafenbohne'), notify_email: '' });
  for (const p of products) await k.call('PUT', `/api/store/products/${p.id}`, { published: true, kind: 'physical', weight_g: 520 });
  const states: [status: string, fulfilment: string][] = [
    ['paid', 'delivered'], ['paid', 'delivered'], ['paid', 'shipped'], ['paid', 'shipped'], ['paid', 'processing'], ['paid', 'unfulfilled'],
    ['paid', 'delivered'], ['pending', 'unfulfilled'], ['refunded', 'cancelled'], ['paid', 'delivered'], ['paid', 'delivered'], ['paid', 'unfulfilled'],
  ];
  await k.step('store orders', () => {
    const db = k.app.db;
    for (const [i, [status, fulfilment]] of states.entries()) {
      const c = k.contact(i * 2 + 1);
      const lines = [products[i % products.length], ...(i % 3 === 0 ? [products[(i + 1) % products.length]] : [])].map((p, j) => {
        const qty = 1 + ((i + j) % 2);
        const unit = Math.round(p.price_cents * 1.07);
        return { product_id: p.id, article_id: null, name: p.name, variant: '', sku: '', qty, unit_cents: unit, total_cents: unit * qty, kind: 'physical', image: '', stock: null };
      });
      const goods = lines.reduce((n, l) => n + l.total_cents, 0);
      const shipping = goods >= 4000 ? 0 : 490;
      const created = k.inDays(-(2 + i * 7), 10 + (i % 8));
      const seq = db.get<{ seq: number }>('UPDATE store_settings SET seq = seq + 1 WHERE location_id = ? RETURNING seq', k.L)?.seq ?? 1000 + i;
      db.insert('store_orders', {
        id: id(), location_id: k.L, number: `B-${seq}`, token: token(18), contact_id: c.id, email: c.email, name: SALUTATION(c), phone: c.phone ?? '',
        address: { company: '', street: t('Hafenweg {n}', { n: i + 2 }), postal_code: t('24103'), city: t('Kiel'), country: t.locale === 'de' ? 'DE' : 'KE' },
        items: lines, invoice_items: [], tax_mode: 'standard', shipping: { id: 'standard', name: t('Standardversand'), price_cents: shipping },
        goods_cents: goods, shipping_cents: shipping, tax_cents: Math.round((goods + shipping) * 0.065), total_cents: goods + shipping, gift_cents: 0,
        refunded_cents: status === 'refunded' ? goods + shipping : 0, currency: 'EUR', status, fulfilment,
        carrier: ['shipped', 'delivered'].includes(fulfilment) ? 'dhl' : '', tracking_number: ['shipped', 'delivered'].includes(fulfilment) ? `00340434${String(161094 + i * 37).padStart(10, '0')}` : '',
        provider: status === 'pending' ? '' : 'demo', note: i === 4 ? t('Bitte als Geschenk verpacken.') : '', meta: { demo: true },
        created_at: created, paid_at: status === 'pending' ? null : created, shipped_at: ['shipped', 'delivered'].includes(fulfilment) ? created : null, delivered_at: fulfilment === 'delivered' ? created : null, updated_at: created,
      });
    }
  });
  await k.call('POST', '/api/gift-cards', { amount_cents: 5000, contact_id: k.contact(4).id, recipient_name: SALUTATION(k.contact(9)), recipient_email: k.contact(9).email, message: t('Alles Gute zum Geburtstag – lass es dir schmecken!'), note: t('Im Laden verkauft') });
  await k.call('POST', '/api/gift-cards', { amount_cents: 2500, note: t('Gewinnspiel Instagram') });
}

/** Online coach: a community with posts and an affiliate programme (the courses come from demo-seed-depth.ts). */
export async function seedCreator(k: Kit) {
  const t = k.t;
  const group = await k.call('POST', '/api/community/groups', { name: t('FitWerk Community'), description: t('Austausch, Fragen und Erfolge der Teilnehmer.') });
  if (group?.id)
    for (const [title, body, pinned] of [
      ['Willkommen in der Community!', 'Stell dich gern kurz vor: Wer bist du und was ist dein Ziel für die nächsten 30 Tage?', true],
      ['Live-Q&A am Donnerstag', 'Donnerstag um 19 Uhr beantworten wir eure Fragen live.', false],
      ['Rezept der Woche: Overnight Oats', 'Haferflocken, Joghurt, Beeren – abends vorbereiten, morgens genießen.', false],
      ['Tag 12 geschafft 💪', 'Heute zum ersten Mal 20 Liegestütze am Stück. Danke für die Motivation hier!', false],
      ['Frage: Training bei Muskelkater?', 'Lieber Pause oder locker weitermachen? Wie handhabt ihr das?', false],
    ] as const)
      await k.call('POST', `/api/community/groups/${group.id}/posts`, { title: t(title), body: t(body), pinned });
  const program = await k.call('POST', '/api/affiliates/programs', { name: t('FitWerk Partnerprogramm'), commission_type: 'percent', commission_value: 25, cookie_days: 60 });
  if (program?.id)
    for (const [name, mail] of [
      ['Lisa Bewegt (Instagram)', 'lisa.bewegt@example.net'],
      ['Podcast „Gesund & Glücklich“', 'redaktion@gesund-gluecklich.example'],
    ])
      await k.call('POST', '/api/affiliates', { program_id: program.id, name: t(name), email: t(mail), status: 'active' });
}

/** Agency: a custom object „Projekte“ and a lead-scoring model. */
export async function seedAgencyObjects(k: Kit) {
  const t = k.t;
  const projects = await k.call('POST', '/api/object-types', {
    singular: t('Projekt'),
    plural: t('Projekte'),
    description: t('Kundenprojekte der Agentur'),
    properties: [
      { label: t('Status'), type: 'select', options: [t('Angebot'), t('Läuft'), t('Fertig')] },
      { label: t('Budget'), type: 'number' },
    ],
  });
  if (projects?.key)
    for (const [i, [name, status, budget]] of ([
      ['Relaunch Bäckerei Morgenrot', 'Läuft', 6800],
      ['Shop Holzwerk Brandt', 'Angebot', 12500],
      ['SEO Kanzlei Seidel', 'Fertig', 4200],
    ] as const).entries())
      await k.call('POST', `/api/objects/${projects.key}/records`, { properties: { name: t(name), status: t(status), budget }, associations: [{ type: 'contact', id: k.contact(i).id }] });
  await k.call('POST', '/api/lead-scoring/models', {
    name: t('Lead-Score'),
    rules: [
      // the tags and sources as the sub-account has them (localisePlan)
      { kind: 'property', field: 'tag', op: 'has', value: t('VIP'), points: 40 },
      { kind: 'property', field: 'tag', op: 'has', value: t('Interessent'), points: 20 },
      { kind: 'property', field: 'source', op: 'equals', value: t('Empfehlung'), points: 20 },
      { kind: 'event', event: 'form.submitted', points: 10, max_points: 30 },
      { kind: 'event', event: 'appointment.booked', points: 25 },
    ],
    decay: { percent: 10, days: 30 },
    max_score: 100,
  });
}

/** White-label: the client sub-accounts log in under the agency's name and colour. */
export async function seedClientBranding(k: Kit) {
  if (k.plan.key === 'agency') return;
  const agency = k.t(AGENCY_NAME);
  await k.call('PATCH', `/api/agency/locations/${k.L}/branding`, { name: agency, color: '#0f766e', login_title: k.t('{name} – Kundenportal', { name: k.plan.name }), login_text: k.t('Betreut von {agency}. Alles hier ist erfunden.', { agency }) });
}
