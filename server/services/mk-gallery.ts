import { render } from '../core/template.js';
import { renderEmailHtml, renderEmailText, type EmailDesign } from './email-render.js';
import { ANGEBOT, NEWSLETTER, WILLKOMMEN } from './mk-gallery-a.js';
import { EVENT, FEIERTAGE, KURS, RECHNUNG, WEBINAR } from './mk-gallery-b.js';
import { B2B, COACH, ECOMMERCE, FEEDBACK, HANDWERK } from './mk-gallery-c.js';
import type { CategoryKey, GalleryTemplate } from './mk-gallery-kit.js';
import type { STFn } from '../i18n/index.js';

/**
 * The template gallery: finished, responsive German e-mail designs in the email builder's own format (so every block can be
 * edited in the designer), sorted by occasion, with search and a preview filled with sample data. The designs themselves are
 * built in mk-gallery-a/b/c.ts from the parts in mk-gallery-kit.ts.
 */

export const CATEGORIES: { key: CategoryKey; label: string; description: string }[] = [
  { key: 'newsletter', label: 'Newsletter', description: 'Regelmäßige Post an deine Liste' },
  { key: 'angebot', label: 'Angebot & Rabatt', description: 'Aktionen, Gutscheine, Sonderpreise' },
  { key: 'willkommen', label: 'Willkommen', description: 'Der erste Eindruck nach der Anmeldung' },
  { key: 'event', label: 'Event & Einladung', description: 'Einladungen, Erinnerungen, Danke-Mails' },
  { key: 'webinar', label: 'Webinar', description: 'Vom Einladen bis zum Nachfassen' },
  { key: 'kurs', label: 'Kurs & Training', description: 'Start, Zugang, Motivation, Zertifikat' },
  { key: 'rechnung', label: 'Rechnung & Zahlung', description: 'Versand, Erinnerung, Mahnung, Bestätigung' },
  { key: 'feiertage', label: 'Feiertage & Saison', description: 'Grüße, Öffnungszeiten, Aktionstage' },
  { key: 'b2b', label: 'B2B & Vertrieb', description: 'Ansprache, Fallstudie, Nachfassen' },
  { key: 'coach', label: 'Coach & Beratung', description: 'Kennenlernen, Impulse, Kundenstimmen' },
  { key: 'handwerk', label: 'Handwerk & Dienstleistung', description: 'Termin, Angebot, Wartung, Bewertung' },
  { key: 'ecommerce', label: 'E-Commerce', description: 'Bestellung, Warenkorb, Versand, Nachkauf' },
  { key: 'feedback', label: 'Feedback & Reaktivierung', description: 'Umfragen und Rückgewinnung' },
];

export const TEMPLATES: GalleryTemplate[] = [...NEWSLETTER, ...ANGEBOT, ...WILLKOMMEN, ...EVENT, ...WEBINAR, ...KURS, ...RECHNUNG, ...FEIERTAGE, ...B2B, ...COACH, ...HANDWERK, ...ECOMMERCE, ...FEEDBACK];

export const templateByKey = (key: string): GalleryTemplate | undefined => TEMPLATES.find((t) => t.key === key);
/** The category's name, in the language of `t` (German source without). */
/** A gallery text in the language of `t`: the gallery's own entry ("gallery|…") first, then the shared one. */
const gx = (t: STFn, s: string) => {
  const own = t(`gallery|${s}`);
  return own !== `gallery|${s}` ? own : t(s);
};
export const categoryLabel = (key: string, t?: STFn) => {
  const label = CATEGORIES.find((c) => c.key === key)?.label;
  return label ? (t ? gx(t, label) : label) : key;
};
/** The categories in one language. */
export const categoriesIn = (t: STFn) => CATEGORIES.map((c) => ({ ...c, label: gx(t, c.label), description: gx(t, c.description) }));

/** Lower case without accents, ß → ss: "Grüße" finds "gruesse" and "grusse" alike. */
export const fold = (s: string): string =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
const loose = (s: string) => fold(s).replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u');

/**
 * Templates matching all words of `q` (in name, description, search words, category, subject), best matches first; optionally one
 * category. With a translator the words are searched in that language as well as in the German source.
 */
export function searchTemplates(q = '', category = '', tr?: STFn): GalleryTemplate[] {
  const words = loose(q).split(/\s+/).filter(Boolean);
  const x = (s: string) => (tr ? `${s} ${gx(tr, s)}` : s);
  const scored = TEMPLATES.filter((t) => !category || t.category === category).map((t) => {
    const name = loose(x(t.name));
    const rest = loose(`${x(t.description)} ${x(t.tags)} ${x(categoryLabel(t.category))} ${x(t.subject)}`);
    let score = 0;
    for (const w of words) {
      if (name.includes(w)) score += 3;
      else if (rest.includes(w)) score += 1;
      else return { t, score: -1 };
    }
    return { t, score };
  });
  return scored.filter((x) => x.score >= 0).sort((a, b) => b.score - a.score).map((x) => x.t);
}

export interface TemplateMeta {
  key: string;
  name: string;
  category: CategoryKey;
  category_label: string;
  description: string;
  subject: string;
  preheader: string;
  formal: 'du' | 'sie';
  service: boolean;
  theme: string;
}

/** A template's data, in the language of `tr` (German source without). */
export const metaOf = (t: GalleryTemplate, tr?: STFn): TemplateMeta => {
  const x = (s: string) => (tr ? gx(tr, s) : s);
  return { key: t.key, name: x(t.name), category: t.category, category_label: categoryLabel(t.category, tr), description: x(t.description), subject: x(t.subject), preheader: x(t.preheader), formal: t.formal, service: t.service, theme: t.theme };
};

/** Merge fields for previews: a sample contact, the company, and the data a workflow trigger would bring. */
export const sampleVars = (location: { name?: string; address?: string } = {}, tr?: STFn) => {
  const x = (s: string) => (tr ? tr(s) : s);
  return {
    contact: { first_name: x('Max'), last_name: x('Mustermann'), name: x('Max Mustermann'), full_name: x('Max Mustermann'), email: 'max@example.com', company: x('Musterfirma GmbH') },
    location: { name: location.name || x('Muster GmbH'), address: location.address || x('Musterstraße 1, 12345 Musterstadt') },
    event: { product_name: x('Online-Kurs'), recovery_url: 'https://example.com/buy/online-kurs', invoice: { number: x('RE-2026-1001') } },
  };
};

/** The finished HTML and text of a template with sample data (for the preview, never sent). */
export function preview(design: EmailDesign, location?: { name?: string; address?: string }, title = '', tr?: STFn): { html: string; text: string } {
  const vars = sampleVars(location, tr);
  return { html: render(renderEmailHtml(design, { title }), vars, { escape: true }), text: render(renderEmailText(design), vars) };
}

/**
 * The steps of the recipe "Warenkorbabbruch-Serie": three e-mails (the designs of the E-Commerce templates), waiting times, and a goal
 * after each wait that ends the series as soon as the contact bought the product (the purchase takes the tag away).
 */
export function ABANDONED_STEPS(tr?: STFn): { type: string; [k: string]: unknown }[] {
  const mail = (key: string) => {
    const t = templateByKey(key)!;
    return { type: 'send_email', subject: tr ? tr(t.subject) : t.subject, design: t.build(tr) };
  };
  const bought = { type: 'goal', conditions: [{ field: 'tag', op: 'not_has', value: 'warenkorbabbruch' }] };
  return [mail('shop-warenkorb-1'), { type: 'wait', amount: 2, unit: 'days' }, bought, mail('shop-warenkorb-2'), { type: 'wait', amount: 3, unit: 'days' }, { ...bought }, mail('shop-warenkorb-3'), { type: 'remove_tag', tags: ['warenkorbabbruch'] }];
}
