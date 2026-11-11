import { createHash } from 'node:crypto';
import type { Account, Batch, Consent, CountRow, PartKey, RContact, RCourse, REnrollment, RLesson, RMembership, RModule, RProduct, RReference, RTagRec, RTemplate, SourceDef, SourceField, StdTarget, StepCtx, StepDef } from './umzug-core.js';
import { UmzugError, VendorHttp } from './umzug-http.js';
import { arg, cell, draft, mailStep, noteStep, waitFor, type Json } from './umzug-flow.js';
import { clip, convertMergeTags, stripHtml, toIso } from './umzug-text.js';
import { translator, tApp, type ServerLocale } from '../i18n/index.js';

/**
 * systeme.io (public API, https://api.systeme.io/api, header `X-API-Key`): contacts with tags, custom fields and state, products with
 * price plans, courses with modules and lectures (structure only – the API gives no lesson content), course access and community
 * memberships, newsletters as templates, e-mail campaigns and automation rules as workflow drafts, funnels with their steps as a
 * reference list in the wiki. Cursor pagination: `limit` (10–100) + `startingAfter` (id of the last item) until `hasMore` is false.
 */

const BASE = 'https://api.systeme.io/api';
const PER = 100;
/** The preview counts by walking pages; huge accounts are counted up to this many pages ("mindestens"). */
const COUNT_PAGES = 60;

const http = (creds: Record<string, string>, _meta: Record<string, string>, deps: { fetch?: any; sleep?: any; pauseMs?: number }) =>
  new VendorHttp({
    vendor: 'systeme.io',
    base: BASE,
    headers: () => ({ 'x-api-key': creds.api_key ?? '' }),
    fetch: deps.fetch,
    sleep: deps.sleep,
    pauseMs: deps.pauseMs ?? 250,
    errorText: (b) => (typeof b?.detail === 'string' ? b.detail : typeof b?.message === 'string' ? b.message : typeof b?.title === 'string' ? b.title : undefined),
  });

/** Cursor pages by id; ascending, so a resumed job continues where it stopped. */
async function* pages(h: VendorHttp, path: string, ctx: StepCtx, query: Record<string, unknown> = {}, after?: number): AsyncGenerator<{ items: any[]; next: number | undefined }> {
  let cur = after;
  for (;;) {
    if (ctx.cancelled()) return;
    const j = await h.get(path, { limit: PER, order: 'asc', ...query, ...(cur ? { startingAfter: cur } : {}) });
    const items: any[] = Array.isArray(j?.items) ? j.items : [];
    const last = items.length ? Number(items[items.length - 1].id) : undefined;
    const next = j?.hasMore && last ? last : undefined;
    yield { items, next };
    if (next === undefined) return;
    cur = next;
  }
}
async function everything(h: VendorHttp, path: string, ctx: StepCtx, query: Record<string, unknown> = {}): Promise<any[]> {
  const out: any[] = [];
  for await (const pg of pages(h, path, ctx, query)) out.push(...pg.items);
  return out;
}
const stub = (h: VendorHttp, parts: PartKey[]): StepCtx => ({ http: h, creds: {}, meta: {}, cursor: undefined, cancelled: () => false, warn: () => undefined, limit: Infinity, options: { merge: 'fill' }, parts });

/** Slugs of systeme.io's own contact fields → our standard fields. */
const STD_SLUG: Record<string, StdTarget> = { first_name: 'first_name', surname: 'last_name', last_name: 'last_name', phone_number: 'phone', phone: 'phone', company_name: 'company', company: 'company', street_address: 'address', address: 'address', city: 'city', postcode: 'postal_code', zip: 'postal_code', country: 'country', website: 'website', birthday: 'date_of_birth', birthdate: 'date_of_birth' };

const typeOfField = (slug: string): SourceField['type'] => (/phone/.test(slug) ? 'phone' : /birth|date/.test(slug) ? 'date' : /website|url/.test(slug) ? 'url' : 'text');

async function describe(h: VendorHttp, parts: PartKey[], lang?: ServerLocale) {
  const t = translator(lang);
  const counts: CountRow[] = [];
  const fields: SourceField[] = [];
  const warnings: string[] = [];
  const s = stub(h, parts);
  /** Counts by walking the pages (the API has no totals); capped for very big accounts. */
  const count = async (part: PartKey, key: string, label: string, path: string, query: Record<string, unknown> = {}) => {
    try {
      let n = 0;
      let capped = false;
      let walked = 0;
      for await (const pg of pages(h, path, s, query)) {
        n += pg.items.length;
        if (++walked >= COUNT_PAGES && pg.next !== undefined) {
          capped = true;
          break;
        }
      }
      counts.push({ part, key, label: capped ? t('{label} (mindestens)', { label: t(label) }) : label, total: n });
    } catch (e) {
      counts.push({ part, key, label, total: null, error: (e as Error).message });
      if (e instanceof UmzugError && e.fatal) throw e;
    }
  };
  if (parts.includes('contacts')) {
    await count('contacts', 'contacts', 'Kontakte', '/contacts');
    await count('contacts', 'tags', 'Tags', '/tags');
    fields.push({ ref: 'email', label: 'E-Mail', type: 'email', std: 'email', group: 'standard' });
    try {
      const j = await h.get('/contact_fields');
      for (const f of Array.isArray(j?.items) ? j.items : []) {
        const slug = String(f.slug ?? '');
        if (!slug) continue;
        const std = STD_SLUG[slug];
        fields.push({ ref: `f:${slug}`, label: String(f.fieldName ?? slug), type: typeOfField(slug), std, group: std ? 'standard' : 'custom' });
      }
    } catch (e) {
      if (!(e instanceof UmzugError && e.skippable)) throw e;
      warnings.push(t('Eigene Felder nicht lesbar: {reason}', { reason: e.message }));
    }
    fields.push({ ref: 'source_url', label: 'Anmelde-Seite (sourceURL)', type: 'url', preset: '', group: 'custom' }, { ref: 'locale', label: 'Sprache', type: 'text', preset: '', group: 'custom' });
  }
  if (parts.includes('products')) await count('products', 'products', 'Digitale Produkte', '/payment/digital-products');
  if (parts.includes('courses')) await count('courses', 'courses', 'Kurse', '/school/courses');
  if (parts.includes('students')) {
    await count('students', 'enrollments', 'Kurs-Zugänge', '/school/enrollments');
    await count('students', 'memberships', 'Community-Mitgliedschaften', '/community/memberships');
  }
  if (parts.includes('templates')) await count('templates', 'newsletters', 'Newsletter', '/mailing/newsletters');
  if (parts.includes('automations')) {
    await count('automations', 'campaigns', 'E-Mail-Kampagnen (Folgen)', '/mailing/campaigns');
    await count('automations', 'rules', 'Automatisierungs-Regeln', '/automation/rules');
  }
  if (parts.includes('reference')) await count('reference', 'funnels', 'Funnels', '/funnels');
  if (parts.includes('students') && !parts.includes('courses')) warnings.push('Kurs-Zugänge werden nur für Kurse angelegt, die schon übernommen wurden – nimm „Kurse“ mit dazu.');
  return { counts, fields, warnings };
}

const CONSENT = (c: any): Consent => (c.unsubscribed ? 'unsubscribed' : c.bounced ? 'bounced' : c.needsConfirmation ? 'pending' : 'ok');

const interval = (v: unknown): 'month' | 'year' | 'week' => (/^year/.test(String(v)) ? 'year' : /^(week|day)/.test(String(v)) ? 'week' : 'month');

/** Names for ids that rules and products mention (tags, courses, campaigns), loaded once per step. */
async function names(ctx: StepCtx, path: string, key = 'name'): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  try {
    for (const x of await everything(ctx.http, path, ctx)) m.set(String(x.id), String(x[key] ?? x.id));
  } catch (e) {
    if (!(e instanceof UmzugError && e.skippable)) throw e;
  }
  return m;
}

const TRIGGERS: Record<string, string> = { tag_added: 'contact.tag_added', tag_removed: 'contact.tag_removed', form_subscribed: 'form.submitted', booking_created: 'appointment.booked', new_sale: 'product.purchased', enrolled_in_course: 'course.enrolled', subscription_payment_failed: 'payment.failed' };

/** One automation rule → workflow draft. The detail's exact field names are read defensively; whatever is not understood stays as a note with the original. */
export function ruleDraft(rule: Json, look: { tag: (id: unknown) => string | undefined; course: (id: unknown) => string | undefined; campaign: (id: unknown) => string | undefined }) {
  const t = tApp();
  const warnings: string[] = [];
  const triggers: Json[] = Array.isArray(rule.triggers) ? rule.triggers : [];
  const actions: Json[] = Array.isArray(rule.actions) ? rule.actions : [];
  const first = triggers[0];
  const type = String(first?.type ?? '');
  const config: Json = {};
  let tname = '';
  if (type === 'tag_added' || type === 'tag_removed') {
    const tag = arg(first, 'tag.name', 'tagName') ?? look.tag(arg(first, 'tagId', 'tag.id', 'tag'));
    if (tag) config.tag = String(tag);
    tname = tag ? ` „${tag}“` : '';
  }
  const mapped = TRIGGERS[type];
  if (!mapped) warnings.push(type ? t('Auslöser „{type}“ hat keine direkte Entsprechung – auf „Manuell“ gesetzt', { type }) : 'Auslöser unbekannt – auf „Manuell“ gesetzt');
  if (type === 'form_subscribed') warnings.push('Auslöser „Formular“: den Funnel-Schritt bitte im Formular-Filter nachbauen');
  if (triggers.length > 1) warnings.push(t('Die Regel hatte {n} Auslöser – übernommen wurde nur der erste ({type})', { n: triggers.length, type }));
  const steps: Json[] = [];
  for (const a of actions) {
    const kind = String(a?.type ?? '');
    const tag = () => String(arg(a, 'tag.name', 'tagName') ?? look.tag(arg(a, 'tagId', 'tag.id', 'tag')) ?? '');
    if (kind === 'add_tag' || kind === 'remove_tag') {
      const n = tag();
      if (n) steps.push({ type: kind, tags: [n] });
      else {
        steps.push(noteStep('systeme.io', t('Tag unbekannt'), a));
        warnings.push(t('Aktion „{kind}“: Tag-Name unbekannt', { kind }));
      }
    } else if (kind === 'send_sms') steps.push({ type: 'send_sms', body: String(arg(a, 'message', 'text', 'body') ?? t('[SMS-Text einfügen]')) });
    else if (kind === 'send_webhook' && /^https?:\/\//.test(String(arg(a, 'url', 'webhookUrl') ?? ''))) steps.push({ type: 'webhook', url: String(arg(a, 'url', 'webhookUrl')), method: 'POST' });
    else if (kind === 'subscribe_to_campaign' || kind === 'unsubscribe_from_campaign') {
      const c = look.campaign(arg(a, 'campaignId', 'campaign.id', 'campaign')) ?? '';
      steps.push({ type: 'add_note', body: `${kind === 'subscribe_to_campaign' ? t('Hier die E-Mail-Folge starten') : t('Hier die E-Mail-Folge beenden')}${c ? t(': „{name}“ (siehe Workflow-Entwurf „Folge: {name}“)', { name: c }) : ''}` });
      warnings.push(t('Aktion „{action}“ als Notiz übernommen – die Folge ist ein eigener Entwurf, bitte verknüpfen', { action: kind === 'subscribe_to_campaign' ? t('Zu Kampagne hinzufügen') : t('Aus Kampagne entfernen') }));
    } else if (kind === 'enroll_in_course' || kind === 'revoke_access_to_course') {
      const c = look.course(arg(a, 'courseId', 'course.id', 'course')) ?? '';
      steps.push({ type: 'add_note', body: `${kind === 'enroll_in_course' ? t('Hier Zugang zum Kurs geben') : t('Hier Kurszugang entziehen')}${c ? `: „${c}“` : ''}` });
      warnings.push(t('Aktion „{kind}“ als Notiz übernommen – bitte durch den Schritt „Kurszugang“ ersetzen', { kind }));
    } else if (kind === 'send_email' || kind === 'send_email_to_specific_address') {
      steps.push(noteStep('systeme.io', t('E-Mail-Aktion (Inhalt liefert die Regel-API nicht)'), a));
      warnings.push('E-Mail-Aktion: der Text liegt bei systeme.io – bitte neu einfügen');
    } else {
      steps.push(noteStep('systeme.io', t('Aktion „{kind}“', { kind: kind || '?' }), a));
      warnings.push(t('Aktion „{kind}“ hat keine Entsprechung', { kind: kind || '?' }));
    }
  }
  if (!actions.length) warnings.push('Die Regel hatte keine lesbaren Aktionen');
  if (rule.state?.isActive === false) warnings.push('In systeme.io war die Regel inaktiv');
  return draft(`r:${rule.id}`, `${t('Regel {id}', { id: rule.id })}${type ? `: ${type.replace(/_/g, ' ')}${tname}` : ''}`, { type: mapped ?? 'manual', config }, steps, warnings);
}

const steps = (): StepDef[] => [
  {
    id: 'tags',
    label: 'Tags',
    part: 'contacts',
    async *run(ctx): AsyncGenerator<Batch> {
      const tags = await everything(ctx.http, '/tags', ctx);
      yield { records: tags.filter((t) => t.name).map((t): RTagRec => ({ kind: 'tag', name: String(t.name) })), cursor: undefined };
    },
  },
  {
    id: 'contacts',
    label: 'Kontakte',
    part: 'contacts',
    async *run(ctx): AsyncGenerator<Batch> {
      const t = translator(ctx.lang);
      for await (const pg of pages(ctx.http, '/contacts', ctx, {}, ctx.cursor ? Number(ctx.cursor) : undefined)) {
        const records: RContact[] = pg.items.map((c) => {
          const values: Record<string, unknown> = { email: c.email, source_url: c.sourceURL ?? undefined, locale: c.locale };
          for (const f of Array.isArray(c.fields) ? c.fields : []) if (f?.slug && f.value !== null && f.value !== undefined && f.value !== '') values[`f:${f.slug}`] = f.value;
          const consent = CONSENT(c);
          const at = toIso(c.registeredAt);
          return {
            kind: 'contact',
            ext: `c:${c.id}`,
            values,
            tags: (Array.isArray(c.tags) ? c.tags : []).map((t: any) => String(t.name ?? '')).filter(Boolean),
            consent,
            native_status: consent === 'ok' ? undefined : c.unsubscribed ? 'unsubscribed' : c.bounced ? 'bounced' : 'needsConfirmation',
            created_at: at,
            // systeme.io says "subscribed" and when/where the person registered – that is no consent proof of its own.
            // A person who has not confirmed yet gets no line at all (they never said yes; DND protects them).
            proof: consent === 'pending' ? undefined : consent === 'ok' ? { basis: 'legacy', at, method: c.sourceURL ? t('Anmeldung über eine systeme.io-Seite') : t('Anmeldung bei systeme.io'), url: typeof c.sourceURL === 'string' ? c.sourceURL : undefined } : { basis: 'revoked' },
          };
        });
        yield { records, cursor: pg.next };
      }
    },
  },
  {
    id: 'products',
    label: 'Produkte und Preispläne',
    part: 'products',
    async *run(ctx): AsyncGenerator<Batch> {
      const t = translator(ctx.lang);
      const courseName = await names(ctx, '/school/courses');
      for await (const pg of pages(ctx.http, '/payment/digital-products', ctx, {}, ctx.cursor ? Number(ctx.cursor) : undefined)) {
        const records: RProduct[] = [];
        for (const p of pg.items) {
          const d: Json = await ctx.http.get(`/payment/digital-products/${p.id}`);
          const plans: Json[] = Array.isArray(d.pricePlans) ? d.pricePlans : [];
          const gives = (Array.isArray(d.resources) ? d.resources : [])
            .map((r: Json) => (r.type === 'membership_course' ? t('Kurs „{name}“', { name: courseName.get(String(r.courseId)) ?? r.courseId }) : r.type === 'systemeio_tag' ? `Tag ${r.value ?? ''}`.trim() : r.type === 'community_access' ? t('Community-Zugang') : r.type === 'downloadable_file' ? 'Download' : r.type === 'booking_event' ? t('Buchungstermin') : ''))
            .filter(Boolean);
          if (!plans.length) ctx.warn(t('Produkt „{name}“ hat in systeme.io keinen Preisplan – nicht übernommen', { name: clip(p.name, 60) }));
          for (const plan of plans) {
            const ro = plan.recurringOptions;
            const recurring = plan.type !== 'one_shot' && ro ? { interval: interval(ro.interval), count: Number(ro.intervalCount) || 1 } : undefined;
            const label = plans.length > 1 ? `${d.name ?? p.name} – ${plan.name}` : String(d.name ?? p.name);
            if (recurring && (recurring.count ?? 1) > 1) ctx.warn(t('Produkt „{label}“ wird alle {count} {unit} abgerechnet – HyperLevel kennt Monat und Jahr; bitte prüfen', { label: clip(label, 60), count: recurring.count, unit: recurring.interval === 'year' ? t('Jahre') : recurring.interval === 'week' ? t('Wochen') : t('Monate') }));
            if (plan.type === 'limited_subscription') ctx.warn(t('Produkt „{label}“: begrenzt auf {limitOfPayments} Zahlungen – die Begrenzung bitte prüfen', { label: clip(label, 60), limitOfPayments: ro?.limitOfPayments ?? '?' }));
            if (ro && Number(ro.trialPeriod) > 0) ctx.warn(t('Produkt „{label}“ hatte eine Testphase ({trialPeriod} {trialInterval}) – bitte nachbauen', { label: clip(label, 60), trialPeriod: ro.trialPeriod, trialInterval: ro.trialInterval }));
            records.push({
              kind: 'product',
              ext: `pp:${plan.id}`,
              name: clip(label, 200),
              description: t('Aus dem systeme.io-Produkt „{name}“{contents}', { name: d.name ?? p.name, contents: gives.length ? t('. Enthält: {gives}', { gives: gives.join(', ') }) : '' }),
              price_cents: Math.max(0, Math.round(Number(plan.amount) || 0)),
              currency: plan.currency ? String(plan.currency).toUpperCase() : undefined,
              recurring,
            });
          }
        }
        yield { records, cursor: pg.next };
      }
    },
  },
  {
    id: 'courses',
    label: 'Kurse mit Modulen und Lektionen',
    part: 'courses',
    async *run(ctx): AsyncGenerator<Batch> {
      const t = translator(ctx.lang);
      let noted = false;
      for await (const pg of pages(ctx.http, '/school/courses', ctx, {}, ctx.cursor ? Number(ctx.cursor) : undefined)) {
        const records: RCourse[] = [];
        for (const c of pg.items) {
          const j: Json = await ctx.http.get(`/school/courses/${c.id}/modules-with-lectures`, { limit: PER });
          const mods: Json[] = (Array.isArray(j?.items) ? j.items : []).flatMap((x: Json) => (Array.isArray(x.modules) ? x.modules : []));
          if (j?.hasMore) ctx.warn(t('Kurs „{name}“ hat mehr Module, als die API auf einmal liefert – bitte prüfen', { name: clip(c.name, 60) }));
          const modules: RModule[] = mods
            .slice()
            .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
            .map((m) => ({
              ext: `m:${m.id}`,
              title: String(m.name ?? t('Modul {id}', { id: m.id })),
              lessons: (Array.isArray(m.lectures) ? m.lectures : [])
                .slice()
                .sort((a: Json, b: Json) => Number(a.position ?? 0) - Number(b.position ?? 0))
                .map((l: Json): RLesson => {
                  const delay = Number(l.delayBeforePreviousLecture) || 0;
                  noted = true;
                  return { ext: `l:${l.id}`, title: String(l.name ?? t('Lektion {id}', { id: l.id })), published: l.active !== false, body: t('*Der Inhalt dieser Lektion (Video, Text, Dateien) liegt bei systeme.io – die API liefert nur den Aufbau. Bitte hier einfügen.*{drip}', { drip: delay ? t.plural(delay, { one: '\n\n*In systeme.io wird sie {n} Tag nach der vorigen Lektion freigeschaltet.*', other: '\n\n*In systeme.io wird sie {n} Tage nach der vorigen Lektion freigeschaltet.*' }) : '' }) };
                }),
            }));
          records.push({ kind: 'course', ext: `c:${c.id}`, title: String(c.name ?? t('Kurs {id}', { id: c.id })), description: stripHtml(c.description ?? ''), modules });
        }
        yield { records, cursor: pg.next };
      }
      if (noted) ctx.warn('Kurse: systeme.io liefert Module und Lektionen mit Titel und Reihenfolge, aber nicht die Inhalte – Videos, Texte und Dateien musst du neu einfügen (in jeder Lektion steht ein Hinweis).');
    },
  },
  {
    id: 'enrollments',
    label: 'Kurs-Zugänge',
    part: 'students',
    async *run(ctx): AsyncGenerator<Batch> {
      for await (const pg of pages(ctx.http, '/school/enrollments', ctx, {}, ctx.cursor ? Number(ctx.cursor) : undefined)) {
        const records: REnrollment[] = pg.items
          .filter((e) => e.active !== false && e.course?.id && e.contact?.id)
          .map((e) => ({ kind: 'enrollment', ext: `e:${e.id}`, course: `c:${e.course.id}`, contact: `c:${e.contact.id}`, email: e.contact.email, enrolled_at: toIso(e.contact.registeredAt) }));
        yield { records, cursor: pg.next };
      }
    },
  },
  {
    id: 'memberships',
    label: 'Community-Mitgliedschaften',
    part: 'students',
    async *run(ctx): AsyncGenerator<Batch> {
      const communities = await names(ctx, '/community/communities');
      for await (const pg of pages(ctx.http, '/community/memberships', ctx, {}, ctx.cursor ? Number(ctx.cursor) : undefined)) {
        const records: RMembership[] = pg.items
          .filter((m) => m.contact?.id)
          .map((m) => ({ kind: 'membership', contact: `c:${m.contact.id}`, tags: [`Community: ${m.community?.name ?? communities.get(String(m.community?.id)) ?? 'systeme.io'}`] }));
        yield { records, cursor: pg.next };
      }
    },
  },
  {
    id: 'newsletters',
    label: 'Newsletter → Vorlagen',
    part: 'templates',
    async *run(ctx): AsyncGenerator<Batch> {
      const t = translator(ctx.lang);
      for await (const pg of pages(ctx.http, '/mailing/newsletters', ctx, {}, ctx.cursor ? Number(ctx.cursor) : undefined)) {
        const records: RTemplate[] = [];
        for (const n of pg.items) {
          const d: Json = await ctx.http.get(`/mailing/newsletters/${n.id}`);
          const c: Json = d.content ?? n.content ?? {};
          const subject = String(c.subject ?? `Newsletter ${n.id}`);
          if (!c.bodyHtml) ctx.warn(t('Newsletter „{subject}“ wurde im visuellen Editor gebaut – die API liefert dafür kein HTML; die Vorlage ist leer', { subject: clip(subject, 60) }));
          records.push({ kind: 'template', ext: `n:${n.id}`, name: subject, subject, html: c.bodyHtml ? String(c.bodyHtml) : '', note: c.previewText ? t('Vorschautext: {text}', { text: c.previewText }) : undefined });
        }
        yield { records, cursor: pg.next };
      }
    },
  },
  {
    id: 'campaigns',
    label: 'E-Mail-Folgen → Workflow-Entwürfe',
    part: 'automations',
    async *run(ctx): AsyncGenerator<Batch> {
      const t = translator(ctx.lang);
      for await (const pg of pages(ctx.http, '/mailing/campaigns', ctx, {}, ctx.cursor ? Number(ctx.cursor) : undefined)) {
        const records = [];
        for (const camp of pg.items) {
          const list = (await everything(ctx.http, `/mailing/campaigns/${camp.id}/steps`, ctx)).slice().sort((a, b) => Number(a.state?.position ?? 0) - Number(b.state?.position ?? 0));
          const out: Json[] = [];
          const warnings: string[] = [t('In systeme.io startet eine Automatisierungs-Regel diese Folge – bitte mit dem passenden Workflow-Entwurf („Regel …“) verknüpfen')];
          for (const s of list) {
            const d: Json = await ctx.http.get(`/mailing/campaign-steps/${s.id}`);
            const delay = d.activation?.delay;
            if (out.length && delay?.value) out.push(waitFor(delay.value, delay.unit));
            else if (out.length) out.push(waitFor(1, 'day'));
            else if (delay?.value) out.push(waitFor(delay.value, delay.unit));
            const subject = String(d.content?.subject ?? s.content?.subject ?? t('E-Mail {n}', { n: out.length + 1 }));
            const m = mailStep('systeme.io', subject, d.content?.bodyHtml, (t) => convertMergeTags('systeme', t).text);
            if (m.missing) warnings.push(t('E-Mail „{subject}“ im visuellen Editor: die API liefert kein HTML – Text bitte neu einfügen', { subject: clip(subject, 60) }));
            if (d.state?.isActive === false || s.state?.isActive === false) warnings.push(`E-Mail „${clip(subject, 60)}“ war in systeme.io deaktiviert`);
            if (d.activation?.sendAtLocalTime) warnings.push(t('E-Mail „{subject}“ wurde um {sendAtLocalTime} Uhr Ortszeit gesendet – bitte Versandzeit prüfen', { subject: clip(subject, 60), sendAtLocalTime: d.activation.sendAtLocalTime }));
            out.push(m.step);
          }
          if (!list.length) out.push({ type: 'add_note', body: t('Die Kampagne „{name}“ hat in systeme.io keine E-Mails.', { name: clip(camp.name, 80) }) });
          records.push(draft(`k:${camp.id}`, t('Folge: {name}', { name: camp.name ?? camp.id }), { type: 'manual' }, out, warnings));
        }
        yield { records, cursor: pg.next };
      }
    },
  },
  {
    id: 'rules',
    label: 'Regeln → Workflow-Entwürfe',
    part: 'automations',
    async *run(ctx): AsyncGenerator<Batch> {
      const tags = await names(ctx, '/tags');
      const courses = await names(ctx, '/school/courses');
      const campaigns = await names(ctx, '/mailing/campaigns');
      const look = { tag: (id: unknown) => tags.get(String(id)), course: (id: unknown) => courses.get(String(id)), campaign: (id: unknown) => campaigns.get(String(id)) };
      for await (const pg of pages(ctx.http, '/automation/rules', ctx, {}, ctx.cursor ? Number(ctx.cursor) : undefined)) {
        const records = [];
        for (const r of pg.items) {
          let full: Json = r;
          try {
            full = await ctx.http.get(`/automation/rules/${r.id}`);
          } catch (e) {
            if (!(e instanceof UmzugError && e.skippable)) throw e;
          }
          records.push(ruleDraft({ ...r, ...full }, look));
        }
        yield { records, cursor: pg.next };
      }
    },
  },
  {
    id: 'funnels',
    label: 'Funnels → Referenzliste',
    part: 'reference',
    async *run(ctx): AsyncGenerator<Batch> {
      const t = translator(ctx.lang);
      const funnels = await everything(ctx.http, '/funnels', ctx);
      const lines: string[] = [t('# Funnels aus systeme.io'), '', t('Stand: {date}. Diese Liste ist eine **Gedächtnisstütze**: die Funnel-Seiten und ihr Design stellt die systeme.io-API nicht bereit, sie müssen in HyperLevel neu gebaut werden. Namen, Schritte und Adressen stehen hier, damit nichts vergessen geht – und damit Weiterleitungen eingerichtet werden können, bevor das alte Konto gekündigt wird.', { date: new Date().toISOString().slice(0, 10) }), ''];
      if (!funnels.length) lines.push(t('_Im Konto gibt es keine Funnels._'));
      for (const f of funnels) {
        lines.push(`## ${cell(f.name) || `Funnel ${f.id}`}${f.isActive === false ? t(' (inaktiv)') : ''}`, '');
        let list: Json[] = [];
        try {
          list = (await everything(ctx.http, `/funnels/${f.id}/steps`, ctx)).slice().sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
        } catch (e) {
          if (!(e instanceof UmzugError && e.skippable)) throw e;
          lines.push(t('_Schritte nicht lesbar: {reason}_', { reason: cell(e.message) }), '');
          continue;
        }
        if (!list.length) lines.push(t('_Keine Schritte._'), '');
        else {
          lines.push(t('| # | Schritt | Art | Adresse |'), '| --- | --- | --- | --- |');
          list.forEach((s, i) => lines.push(`| ${i + 1} | ${cell(s.name)} | ${cell(String(s.type ?? '').replace(/_/g, ' '))} | ${cell(s.url) || '–'} |`));
          lines.push('');
        }
        if (f.saleSettingsId) lines.push(t('Verkaufseinstellungen in systeme.io: {id} (Produkte und Preise siehe Produktliste im Umzug)', { id: cell(f.saleSettingsId) }), '');
      }
      if (funnels.length) ctx.warn(t.plural(funnels.length, { one: 'Funnels: {n} Funnel als Referenzliste im Wiki (Bereich „Umzug“) – die Seiten selbst musst du neu bauen.', other: 'Funnels: {n} Funnels als Referenzliste im Wiki (Bereich „Umzug“) – die Seiten selbst musst du neu bauen.' }));
      yield { records: [{ kind: 'reference', ext: 'funnels', title: t('Funnels aus systeme.io'), body: lines.join('\n') } satisfies RReference], cursor: undefined };
    },
  },
];

export const SYSTEME: SourceDef = {
  key: 'systeme',
  label: 'systeme.io',
  tagline: 'Kontakte mit Tags und Feldern, Produkte, Kurse, Zugänge, Newsletter, E-Mail-Folgen, Regeln und die Funnel-Liste',
  credentials: [{ key: 'api_key', label: 'API-Schlüssel', secret: true, hint: 'systeme.io → Profilbild → Einstellungen → „MCP & API-Schlüssel“ → „Erstellen“' }],
  howto: [
    'In systeme.io oben rechts auf dein Profilbild → „Einstellungen“ → „MCP & API-Schlüssel“.',
    'Bei „Öffentliche API-Schlüssel“ auf „Erstellen“, einen Namen vergeben und den Schlüssel hier einfügen (pro Konto sind drei möglich).',
    'Nach dem Umzug löschst du den Schlüssel dort wieder. Gelesen wird nur – in deinem systeme.io-Konto ändert HyperLevel nichts.',
  ],
  limits: [
    'Funnel-Seiten und ihr Design – die API nennt nur Namen, Schritte und Adressen (sie kommen als Referenzliste ins Wiki)',
    'Die Inhalte der Lektionen (Videos, Texte, Dateien) – die API liefert nur den Aufbau',
    'Bestellungen, Rechnungen und laufende Abos (bleiben beim Zahlungsanbieter; neue Zahlungen richtest du in HyperLevel ein)',
    'Gutscheine, Buchungskalender, SMS-Vorlagen und Newsletter, die im visuellen Editor gebaut wurden (die API liefert kein HTML dafür)',
  ],
  parts: [
    { key: 'contacts', label: 'Kontakte, Tags und eigene Felder', on: true, note: 'Abgemeldete, unzustellbare und noch unbestätigte Adressen werden zu „Nicht stören“ plus Tag. Im Einwilligungs-Nachweis steht „aus systeme.io übernommen (Altbestand)“ mit der Anmelde-Seite.' },
    { key: 'products', label: 'Digitale Produkte mit Preisplänen → Produkte', on: true, note: 'Monatlich und jährlich passt direkt; andere Takte, Testphasen und begrenzte Abos stehen als Hinweis im Bericht.' },
    { key: 'courses', label: 'Kurse mit Modulen und Lektionen (als Entwurf)', on: true, note: 'Nur der Aufbau – die Inhalte der Lektionen liefert die API nicht.' },
    { key: 'students', label: 'Kurs-Zugänge und Community-Mitgliedschaften', on: true, note: 'Zugänge gehen an Kontakte; die Community-Mitgliedschaft wird zum Tag „Community: …“.' },
    { key: 'templates', label: 'Newsletter → E-Mail-Vorlagen', on: true },
    { key: 'automations', label: 'E-Mail-Folgen und Regeln → Workflow-Entwürfe (bitte prüfen)', on: false, note: 'Häufige Auslöser und Aktionen werden übersetzt, der Rest wird eine Notiz mit dem Original.' },
    { key: 'reference', label: 'Funnels → Referenzliste im Wiki', on: true, note: 'Namen, Schritte und Adressen – als Gedächtnisstütze zum Neubauen.' },
  ],
  exports: [{ key: 'contacts', label: 'Kontakte-Export (CSV)', accept: ['.csv'], describe: 'Kontakte → Exportieren (CSV). Ohne API bekommst du Kontakte und Tags, aber keine Produkte, Kurse und Zugänge.', part: 'contacts' }],
  http,
  async connect(creds, deps): Promise<Account> {
    const h = http(creds, {}, deps);
    await h.get('/contacts', { limit: 10 });
    let account = '';
    try {
      const j = await h.get('/domains', { limit: 100 });
      const list: Json[] = Array.isArray(j?.items) ? j.items : [];
      const main = list.find((d) => d.type === 'platform_subdomain') ?? list.find((d) => d.default) ?? list[0];
      account = String(main?.name ?? '').toLowerCase();
    } catch (e) {
      if (!(e instanceof UmzugError && e.skippable)) throw e;
    }
    if (!/^[a-z0-9.-]{3,120}$/.test(account)) account = `key-${createHash('sha256').update(String(creds.api_key ?? '')).digest('hex').slice(0, 10)}`;
    return { account, label: account.startsWith('key-') ? 'systeme.io-Konto' : account, meta: {} };
  },
  describe: (h, parts, c) => describe(h, parts, c.lang),
  steps: (parts) => steps().filter((s) => parts.includes(s.part)),
};
