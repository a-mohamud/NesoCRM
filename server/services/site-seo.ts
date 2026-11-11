import { tApp } from '../i18n/index.js';
/**
 * SEO-Check and schema markup for site pages (pure, no imports from the app).
 *
 * - `checkSeo(html, ctx)` reads a rendered page the way a search engine gets it – title, meta description, headings, alt texts,
 *   links, amount of text, indexing, social preview – and returns findings with a fix hint and a score (0–100).
 * - `siteSeoIssues(pages)` adds what only shows across pages: duplicate titles and descriptions.
 * - `buildSchema(type, data, page)` turns a few form fields (and the page's FAQ blocks) into JSON-LD; `schemaScript` prints it
 *   safely for a `<script type="application/ld+json">` (no `</script>` break-out).
 */

export type SeoLevel = 'error' | 'warning' | 'info';
export interface SeoIssue {
  rule: string;
  level: SeoLevel;
  message: string;
  hint: string;
}
export interface SeoFacts {
  title: string;
  description: string;
  h1: number;
  words: number;
  images: number;
  images_without_alt: number;
  links_internal: number;
  links_external: number;
  noindex: boolean;
  og_image: boolean;
  schema: boolean;
}

const decode = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
const attr = (tag: string, name: string): string | undefined => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? decode(m[2] ?? m[3] ?? m[4] ?? '') : undefined;
};
const textOf = (html: string) =>
  decode(
    html
      .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();

/** The facts of one rendered page. `host` decides which links count as internal. */
export function seoFacts(html: string, host = ''): SeoFacts {
  const head = html.match(/<head\b[\s\S]*?<\/head>/i)?.[0] ?? '';
  const body = html.match(/<body\b[\s\S]*<\/body>/i)?.[0] ?? html;
  const title = textOf(head.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '');
  const metaDesc = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]).find((t) => /name\s*=\s*["']?description/i.test(t));
  const robots = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]).find((t) => /name\s*=\s*["']?robots/i.test(t));
  const ogImage = /property\s*=\s*["']og:image["']/i.test(head);
  const imgs = [...body.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  let internal = 0;
  let external = 0;
  for (const m of body.matchAll(/<a\b[^>]*>/gi)) {
    const href = attr(m[0], 'href') ?? '';
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) continue;
    if (/^https?:\/\//i.test(href)) {
      try {
        if (host && new URL(href).hostname === host) internal++;
        else external++;
      } catch {
        external++;
      }
    } else internal++;
  }
  const words = textOf(body.replace(/<(header|footer|nav)\b[\s\S]*?<\/\1>/gi, ' ')).split(' ').filter((w) => /\p{L}/u.test(w)).length;
  return {
    title,
    description: metaDesc ? (attr(metaDesc, 'content') ?? '').trim() : '',
    h1: (body.match(/<h1\b/gi) ?? []).length,
    words,
    images: imgs.length,
    images_without_alt: imgs.filter((t) => attr(t, 'alt') === undefined || (attr(t, 'alt') === '' && !/role\s*=\s*["']presentation/i.test(t) && !/aria-hidden/i.test(t))).length,
    links_internal: internal,
    links_external: external,
    noindex: !!robots && /noindex/i.test(attr(robots, 'content') ?? ''),
    og_image: ogImage,
    schema: /application\/ld\+json/i.test(html),
  };
}

/** Findings for one page, most important first. */
export function checkSeo(html: string, o: { host?: string; slug?: string } = {}): { facts: SeoFacts; issues: SeoIssue[] } {
  const f = seoFacts(html, o.host);
  const out: SeoIssue[] = [];
  const tx = tApp();
  const addIssue = (rule: string, level: SeoLevel, message: string, hint: string) => out.push({ rule, level, message: tx(message), hint: tx(hint) });
  if (f.noindex) addIssue('noindex', 'warning', 'Die Seite ist auf „noindex“ gestellt.', 'Google zeigt sie nicht an. Gewollt? Sonst unter SEO den Haken „Nicht in Google anzeigen“ entfernen.');
  if (!f.title) addIssue('title_missing', 'error', 'Kein Seitentitel.', 'Unter SEO einen Titel mit dem wichtigsten Suchbegriff eintragen (30–60 Zeichen).');
  else if (f.title.length < 15) addIssue('title_short', 'warning', tx('Seitentitel sehr kurz ({n} Zeichen).', { n: f.title.length }), 'Ein Titel mit 30–60 Zeichen beschreibt die Seite besser und wird häufiger angeklickt.');
  else if (f.title.length > 65) addIssue('title_long', 'warning', tx('Seitentitel zu lang ({n} Zeichen).', { n: f.title.length }), 'Google kürzt nach etwa 60 Zeichen – das Wichtigste nach vorne.');
  if (!f.description) addIssue('description_missing', 'error', 'Keine Meta-Beschreibung.', 'Unter SEO 1–2 Sätze (50–160 Zeichen) eintragen – sie erscheinen in den Suchergebnissen.');
  else if (f.description.length < 50) addIssue('description_short', 'warning', tx('Meta-Beschreibung kurz ({n} Zeichen).', { n: f.description.length }), '50–160 Zeichen nutzen: Nutzen, Angebot, Handlungsaufforderung.');
  else if (f.description.length > 165) addIssue('description_long', 'info', tx('Meta-Beschreibung lang ({n} Zeichen).', { n: f.description.length }), 'Google kürzt nach etwa 160 Zeichen.');
  if (f.h1 === 0) addIssue('h1_missing', 'error', 'Keine Hauptüberschrift (H1).', 'Eine Überschrift der Ebene 1 (z. B. im Hero-Block) mit dem Thema der Seite setzen.');
  else if (f.h1 > 1) addIssue('h1_many', 'warning', tx('{n} Hauptüberschriften (H1).', { n: f.h1 }), 'Genau eine H1 je Seite; weitere Überschriften als H2/H3.');
  if (f.images_without_alt > 0) addIssue('img_alt', 'warning', tx('{n} von {total} Bildern ohne Alternativtext.', { n: f.images_without_alt, total: f.images }), 'Im Bild-Block einen kurzen beschreibenden Alternativtext eintragen – gut für Google-Bildersuche und Barrierefreiheit.');
  if (f.words < 120) addIssue('thin', 'warning', tx('Wenig Text ({n} Wörter).', { n: f.words }), 'Seiten mit mindestens 300 Wörtern ranken meist besser. Leistungen, Fragen und Antworten ergänzen.');
  else if (f.words < 300) addIssue('thin', 'info', tx('Eher wenig Text ({n} Wörter).', { n: f.words }), 'Mehr Inhalt (300+ Wörter) hilft bei Suchbegriffen mit Wettbewerb.');
  if (f.links_internal === 0) addIssue('links_internal', 'info', 'Keine internen Links.', 'Auf andere eigene Seiten verlinken (Leistungen, Kontakt) – so findet Google sie leichter.');
  if (!f.og_image) addIssue('og_image', 'info', 'Kein Vorschaubild für soziale Netzwerke.', 'Unter SEO ein Vorschaubild setzen oder ein Bild auf der Seite einbauen.');
  if (!f.schema) addIssue('schema', 'info', 'Keine strukturierten Daten (Schema.org).', 'Unten unter „Strukturierte Daten“ einen Typ wählen (z. B. Lokales Unternehmen, FAQ) – Google kann dann Rich Results zeigen.');
  if (o.slug && (o.slug.length > 60 || /[^a-z0-9-]/.test(o.slug))) addIssue('slug', 'info', 'Der Pfad der Seite ist lang oder enthält Sonderzeichen.', 'Kurze Pfade aus Kleinbuchstaben und Bindestrichen (z. B. /leistungen).');
  const order: Record<SeoLevel, number> = { error: 0, warning: 1, info: 2 };
  out.sort((a, b) => order[a.level] - order[b.level]);
  return { facts: f, issues: out };
}

/** Extra findings for a page of any website (the SEO audit of external sites): transport, mobile viewport, language. */
export function externalSeoIssues(html: string, o: { url: string; status: number; ms: number; bytes: number }): SeoIssue[] {
  const out: SeoIssue[] = [];
  const tx = tApp();
  const addIssue = (rule: string, level: SeoLevel, message: string, hint: string) => out.push({ rule, level, message: tx(message), hint: tx(hint) });
  if (o.status >= 400) addIssue('status', 'error', tx('Die Seite antwortet mit Status {status}.', { status: o.status }), 'Google nimmt nur erreichbare Seiten auf – Adresse und Server prüfen.');
  if (!o.url.startsWith('https://')) addIssue('https', 'error', 'Die Seite läuft ohne HTTPS.', 'Ein SSL-Zertifikat einrichten (meist kostenlos über den Hoster) – Browser warnen sonst vor der Seite.');
  if (!/<meta[^>]+name\s*=\s*["']?viewport/i.test(html)) addIssue('viewport', 'error', 'Keine Einstellung für Handys (viewport).', 'Ohne `<meta name="viewport">` ist die Seite auf dem Handy winzig – Google bewertet mobil zuerst.');
  if (!/<html[^>]*\slang\s*=/i.test(html)) addIssue('lang', 'info', 'Die Sprache der Seite ist nicht angegeben.', '`<html lang="de">` hilft Suchmaschinen und Screenreadern.');
  if (o.ms > 3000) addIssue('slow', 'warning', tx('Die Seite lädt langsam ({s} s bis zur Antwort).', { s: (o.ms / 1000).toFixed(1) }), 'Hosting, Bildgrößen und Plugins prüfen – unter 1 s ist gut.');
  if (o.bytes > 1_500_000) addIssue('heavy', 'warning', tx('Das HTML ist sehr groß ({kb} KB).', { kb: Math.round(o.bytes / 1024) }), 'Eingebettete Bilder/Skripte auslagern.');
  return out;
}

/** 100 minus 15 per error, 6 per warning, 1 per hint – never below 0. */
export const seoScore = (issues: SeoIssue[]) => Math.max(0, 100 - issues.reduce((n, i) => n + (i.level === 'error' ? 15 : i.level === 'warning' ? 6 : 1), 0));

/** Findings across pages: the same title or description on several pages. */
export function siteSeoIssues(pages: { name: string; facts: SeoFacts }[]): SeoIssue[] {
  const out: SeoIssue[] = [];
  const tx = tApp();
  const dupes = (key: 'title' | 'description') => {
    const by = new Map<string, string[]>();
    for (const p of pages) {
      const v = p.facts[key].trim().toLowerCase();
      if (v) by.set(v, [...(by.get(v) ?? []), p.name]);
    }
    for (const [, names] of by) if (names.length > 1) out.push({ rule: `${key}_duplicate`, level: 'warning', message: key === 'title' ? tx('Gleicher Seitentitel auf {n} Seiten: {pages}.', { n: names.length, pages: names.join(', ') }) : tx('Gleiche Beschreibung auf {n} Seiten: {pages}.', { n: names.length, pages: names.join(', ') }), hint: tx(key === 'title' ? 'Jede Seite braucht einen eigenen Seitentitel, sonst konkurrieren die Seiten miteinander.' : 'Jede Seite braucht eine eigene Beschreibung, sonst konkurrieren die Seiten miteinander.') });
  };
  dupes('title');
  dupes('description');
  return out;
}

// --- schema markup ---------------------------------------------------------------------------------------------------------------

export const SCHEMA_TYPES: Record<string, { label: string; fields: { key: string; label: string; required?: boolean }[] }> = {
  LocalBusiness: {
    label: 'Lokales Unternehmen',
    fields: [
      { key: 'name', label: 'Name', required: true },
      { key: 'telephone', label: 'Telefon' },
      { key: 'email', label: 'E-Mail' },
      { key: 'street', label: 'Straße' },
      { key: 'zip', label: 'PLZ' },
      { key: 'city', label: 'Ort' },
      { key: 'country', label: 'Land (z. B. DE)' },
      { key: 'opening_hours', label: 'Öffnungszeiten (z. B. Mo-Fr 09:00-18:00)' },
      { key: 'price_range', label: 'Preisniveau (z. B. €€)' },
      { key: 'image', label: 'Bild-URL' },
    ],
  },
  Organization: {
    label: 'Organisation / Firma',
    fields: [
      { key: 'name', label: 'Name', required: true },
      { key: 'logo', label: 'Logo-URL' },
      { key: 'telephone', label: 'Telefon' },
      { key: 'email', label: 'E-Mail' },
      { key: 'same_as', label: 'Profile (URLs, durch Komma getrennt)' },
    ],
  },
  FAQPage: { label: 'FAQ (aus den FAQ-Blöcken der Seite)', fields: [] },
  Service: {
    label: 'Dienstleistung',
    fields: [
      { key: 'name', label: 'Leistung', required: true },
      { key: 'description', label: 'Beschreibung' },
      { key: 'provider', label: 'Anbieter' },
      { key: 'area_served', label: 'Einzugsgebiet' },
    ],
  },
  Product: {
    label: 'Produkt',
    fields: [
      { key: 'name', label: 'Produktname', required: true },
      { key: 'description', label: 'Beschreibung' },
      { key: 'image', label: 'Bild-URL' },
      { key: 'brand', label: 'Marke' },
      { key: 'price', label: 'Preis (z. B. 49.00)' },
      { key: 'currency', label: 'Währung (z. B. EUR)' },
    ],
  },
  Event: {
    label: 'Veranstaltung',
    fields: [
      { key: 'name', label: 'Titel', required: true },
      { key: 'start', label: 'Beginn (YYYY-MM-DDTHH:MM)', required: true },
      { key: 'end', label: 'Ende (YYYY-MM-DDTHH:MM)' },
      { key: 'location', label: 'Ort oder „online“' },
      { key: 'description', label: 'Beschreibung' },
    ],
  },
  Article: {
    label: 'Artikel',
    fields: [
      { key: 'headline', label: 'Überschrift', required: true },
      { key: 'author', label: 'Autor' },
      { key: 'published', label: 'Veröffentlicht am (YYYY-MM-DD)' },
      { key: 'image', label: 'Bild-URL' },
    ],
  },
};

const clean = (v: unknown, max = 300) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const isUrl = (v: string) => /^https:\/\/[^\s<>"]+$/i.test(v);
const strip = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();

/** Question/answer pairs of the FAQ blocks of a page (also inside sections). */
export function faqOf(blocks: unknown): { q: string; a: string }[] {
  const out: { q: string; a: string }[] = [];
  const walk = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const b of list as any[]) {
      if (!b || typeof b !== 'object') continue;
      if (b.type === 'faq' && Array.isArray(b.items)) for (const it of b.items) if (it?.q && it?.a) out.push({ q: strip(clean(it.q, 300)), a: strip(clean(it.a, 2000)) });
      for (const k of ['blocks', 'children', 'columns', 'rows']) if (Array.isArray(b[k])) walk(b[k]);
    }
  };
  walk(blocks);
  return out.slice(0, 50);
}

/** JSON-LD for a type and its form fields; `url` is the page's address. Returns null when required fields are missing. */
export function buildSchema(type: string, data: Record<string, unknown>, page: { url: string; blocks?: unknown; title?: string; description?: string }): Record<string, unknown> | null {
  const spec = SCHEMA_TYPES[type];
  if (!spec) return null;
  const d: Record<string, string> = {};
  for (const f of spec.fields) d[f.key] = clean(data?.[f.key], f.key === 'description' ? 1000 : 300);
  if (!d.name && 'name' in d) d.name = clean(page.title);
  if (!d.headline && 'headline' in d) d.headline = clean(page.title);
  if (!d.description && 'description' in d) d.description = clean(page.description, 1000);
  if (spec.fields.some((f) => f.required && !d[f.key])) return null;
  const base: Record<string, unknown> = { '@context': 'https://schema.org', '@type': type, url: page.url };
  const img = (k: string) => (d[k] && isUrl(d[k]) ? d[k] : undefined);
  const put = (o: Record<string, unknown>) => Object.fromEntries(Object.entries({ ...base, ...o }).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)));
  switch (type) {
    case 'LocalBusiness':
      return put({
        name: d.name,
        telephone: d.telephone,
        email: d.email,
        image: img('image'),
        priceRange: d.price_range,
        openingHours: d.opening_hours ? d.opening_hours.split(/[;,]\s*/).filter(Boolean) : undefined,
        address: d.street || d.city ? { '@type': 'PostalAddress', streetAddress: d.street || undefined, postalCode: d.zip || undefined, addressLocality: d.city || undefined, addressCountry: d.country || 'DE' } : undefined, // i18n-ignore – schema.org types
      });
    case 'Organization':
      return put({ name: d.name, logo: img('logo'), telephone: d.telephone, email: d.email, sameAs: d.same_as ? d.same_as.split(/[,\s]+/).filter(isUrl) : undefined });
    case 'FAQPage': {
      const qa = faqOf(page.blocks);
      if (!qa.length) return null;
      return put({ mainEntity: qa.map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })) }); // i18n-ignore – schema.org types
    }
    case 'Service':
      return put({ name: d.name, description: d.description, serviceType: d.name, provider: d.provider ? { '@type': 'Organization', name: d.provider } : undefined, areaServed: d.area_served }); // i18n-ignore – schema.org types
    case 'Product': {
      const price = d.price && /^\d+([.,]\d{1,2})?$/.test(d.price) ? d.price.replace(',', '.') : '';
      return put({
        name: d.name,
        description: d.description,
        image: img('image'),
        brand: d.brand ? { '@type': 'Brand', name: d.brand } : undefined, // i18n-ignore – schema.org types
        offers: price ? { '@type': 'Offer', price, priceCurrency: /^[A-Z]{3}$/.test(d.currency) ? d.currency : 'EUR', availability: 'https://schema.org/InStock', url: page.url } : undefined, // i18n-ignore – schema.org types
      });
    }
    case 'Event': {
      const when = (v: string) => (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(v) ? v : undefined);
      if (!when(d.start)) return null;
      const online = /^online$/i.test(d.location);
      return put({
        name: d.name,
        startDate: when(d.start),
        endDate: when(d.end),
        description: d.description,
        eventAttendanceMode: online ? 'https://schema.org/OnlineEventAttendanceMode' : 'https://schema.org/OfflineEventAttendanceMode',
        location: online ? { '@type': 'VirtualLocation', url: page.url } : d.location ? { '@type': 'Place', name: d.location, address: d.location } : undefined, // i18n-ignore – schema.org types
      });
    }
    case 'Article':
      return put({ headline: d.headline.slice(0, 110), author: d.author ? { '@type': 'Person', name: d.author } : undefined, datePublished: /^\d{4}-\d{2}-\d{2}$/.test(d.published) ? d.published : undefined, image: img('image') }); // i18n-ignore – schema.org types
  }
  return null;
}

/** A `<script type="application/ld+json">` that cannot end early: `<`, `>`, `&` and line separators are escaped. */
export const schemaScript = (json: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(json)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')}</script>`;
