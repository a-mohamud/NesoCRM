import { defaultLocale, tApp } from '../i18n/index.js';
import type { Block } from './site-blocks.js';
import { blockText, walkBlocks } from './site-layout.js';
import { TEMPLATES } from './site-templates.js';
import { AI_BLOCKS, SECTION_LIMITS, blockCatalogText, checkSection, compileSection, decompileSection, h1Count, type AccountRefs, type BlockEnv, type CheckedSection } from './site-ai-schema.js';

export { parseAnswer } from './wfai.js';

/**
 * Funnel & Website AI (pure): the brief ("Briefing"), the two stages the AI answers in – a page plan, then the blocks of every
 * page – the prompts, the checks of both answers against the site block registry and the account (services/site-ai-schema.ts),
 * section commands ("kürzer", "FAQ hinzufügen", "in Du-Form"), the diff for the review step and the cost estimate. The module
 * (modules/site-ai.ts) calls the AI, retries with the errors, stores runs and applies them as drafts.
 */

export const PAGE_TYPES = ['landing', 'funnel', 'website'] as const;
export type PageType = (typeof PAGE_TYPES)[number];
export const GOALS = ['leads', 'booking', 'sale', 'info'] as const;
export type Goal = (typeof GOALS)[number];
export const TONES = ['freundlich', 'professionell', 'locker', 'premium', 'mutig'] as const;
export const LANGS = ['de', 'en'] as const;
export type Lang = (typeof LANGS)[number];
export const LIMITS = { business: 300, offer: 600, audience: 300, extra: 2000, command: 600, pages: { landing: [1, 2], funnel: [2, 6], website: [2, 8] } as Record<PageType, [number, number]> };
const LEGAL = ['impressum', 'datenschutz', 'widerruf', 'agb', 'barrierefreiheit'];
/** Building blocks of a plan (what each page should have), for the plan stage. */
export const PLAN_SECTIONS = ['hero', 'benefits', 'steps', 'stats', 'testimonials', 'pricing', 'faq', 'cta', 'form', 'calendar', 'product', 'text', 'about', 'contact', 'thanks'] as const;

/** Design looks the AI may pick: the gallery templates' tokens (colours, fonts, radius) – the same set the gallery uses. */
export const STYLE_CHOICES = TEMPLATES.map((t) => ({ id: t.id, name: t.name, category: t.category, kind: t.kind, brand: t.tokens.colors?.brand ?? '#2563eb' }));
export const styleOf = (id: unknown) => TEMPLATES.find((t) => t.id === id);
export const defaultStyle = (type: PageType, goal: Goal) => (type === 'website' ? 'agentur' : goal === 'booking' ? 'termin-funnel' : goal === 'sale' ? 'kurs-verkauf' : 'leadmagnet');

export interface Brief {
  business: string;
  offer: string;
  audience: string;
  tone: (typeof TONES)[number];
  address: 'du' | 'sie';
  language: Lang;
  page_type: PageType;
  goal: Goal;
  /** funnel steps or website pages the person asked for (names), optional */
  pages: string[];
  extra: string;
  style?: string;
}

const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const clipText = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : typeof v === 'number' ? String(v) : '');

/** The brief from a request (unknown values fall back to defaults, texts are clipped). */
export function cleanBrief(b: any): Brief {
  const page_type = pick(b?.page_type, PAGE_TYPES, 'landing');
  return {
    business: clipText(b?.business, LIMITS.business),
    offer: clipText(b?.offer, LIMITS.offer),
    audience: clipText(b?.audience, LIMITS.audience),
    tone: pick(b?.tone, TONES, 'freundlich'),
    address: b?.address === 'sie' ? 'sie' : 'du',
    language: pick(b?.language, LANGS, defaultLocale()),
    page_type,
    goal: pick(b?.goal, GOALS, page_type === 'website' ? 'info' : 'leads'),
    pages: (Array.isArray(b?.pages) ? b.pages : typeof b?.pages === 'string' ? b.pages.split(/[,\n]/) : []).map((x: unknown) => clipText(x, 60)).filter(Boolean).slice(0, 8),
    extra: clipText(b?.extra ?? b?.prompt, LIMITS.extra),
    style: typeof b?.style === 'string' && styleOf(b.style) ? b.style : undefined,
  };
}
export const briefProblem = (b: Brief) => (b.business.length + b.offer.length + b.extra.length < 12 ? tApp()('Bitte beschreibe kurz dein Unternehmen und dein Angebot (oder schreibe, was die Seite tun soll).') : null);

const LANG_RULE: Record<Lang, string> = { de: 'Write all page texts in German.', en: 'Write all page texts in English (British spelling is fine).' };
// i18n-ignore – model instructions in English; „du“/„Sie“ name the German forms
const ADDRESS_RULE = { du: 'Address visitors as "you" in a friendly, informal tone (in German: „du“, lower case).', sie: 'Address visitors as "you" in a polite, formal tone (in German: „Sie“).' };
const TYPE_RULE: Record<PageType, string> = {
  landing: 'A landing page: one page (optionally a thank-you page "danke") with exactly one goal.',
  funnel: 'A funnel: 2–6 steps, each step one page, in order (e.g. opt-in → thank you, or sales page → checkout → thank you).',
  website: 'A website with 2–8 pages (home page first; e.g. services, about us, contact).',
};
const GOAL_RULE: Record<Goal, string> = {
  leads: 'Goal: collect enquiries/sign-ups – a form block on the first page, buttons link to #formular.',
  booking: 'Goal: appointments – a calendar block, buttons link to #termin.',
  sale: 'Goal: sales – a product block (checkout) and a thank-you page.',
  info: 'Goal: inform and get in touch – a contact form on the contact page.',
};

export const RULES_COMMON = [
  'You build pages for the HyperLevel website builder. Reply with exactly ONE JSON object and nothing else – no explanations.',
  'Do not invent facts: no prices, figures, awards, client names or quotes that are not in the brief. If something is missing, write a clearly recognisable placeholder in square brackets, e.g. "[Price]", "[Add testimonial]".',
  'No legal texts (legal notice/Impressum, privacy policy, cancellation policy, terms and conditions) – HyperLevel generates them itself from the company details.',
  'No images, videos, HTML or scripts. Short, concrete sentences; benefits before features; every page has exactly one H1 (the hero or a heading with level 1).',
].join('\n');

export const RULES_PLAN = `${RULES_COMMON}

TASK: First create only the PAGE PLAN.
Format: {"site_name": "…", "style": "<style-id>", "summary": "one sentence", "pages": [{"slug": "start", "name": "Home", "purpose": "one sentence", "sections": ["hero", "benefits", …]}]}
- slug: lower-case letters, digits and hyphens, unique; the first page is the home page.
- sections: in order, 3–9 each from: ${PLAN_SECTIONS.join(', ')}.
- style: one of the design ids from the list (matching the industry).
- Page names and the site name are in the language of the page texts.`;

export const RULES_BLOCKS = `${RULES_COMMON}

TASK: Write out the pages of the plan.
Format: {"pages": [{"slug": "<from the plan>", "seo": {"title": "≤ 60 characters", "description": "≤ 155 characters"}, "sections": [SECTION, …]}], "notes": ["what the person still has to do", …]}
SECTION = {"name": "Hero", "style": "plain|soft|brand|dark", "width": "narrow|normal|wide", "anchor": "optional", "layout": "1|2|3|4|7-5|5-7|8-4|4-8", "columns": [[BLOCK, …], [BLOCK, …]]}
- layout sets the columns (twelfths): "1" = one column, "2" = two equal ones, "7-5" = wide + narrow. The number of columns in columns must match.
- A section with the form gets anchor "formular", one with the calendar "termin"; buttons link to them with "#formular"/"#termin", to other pages with "page:<slug>".
- Alternating backgrounds (plain, soft) read well; at most one "brand" or "dark" section per page (e.g. the call to action at the end).
- BLOCK is an object with "type" and the fields below (* = required); there are no other fields.
- The notes are written in the language of the person's brief.

BLOCKS
`;

export const RULES_SECTION = `${RULES_COMMON}

TASK: Change one section of an existing page as instructed.
Format: {"sections": [SECTION, …], "summary": "what you changed, one sentence, in the language of the instruction"}
- The list replaces the selected section. Return the changed section with its "id"; blocks keep their "id"; new sections (e.g. an FAQ) and new blocks have no id.
- If the selected section should stay unchanged and something is only added: put {"id": "<id>", "keep": true} in its place.
- Existing sections in the format {"id", "name", "style", "rows": [{"layout", "columns": [[BLOCK, …]]}]}, new ones as on a new page with "layout" and "columns".
- Keep the language of the existing page texts unless the instruction asks for another language.
SECTION = {"name", "style": "plain|soft|brand|dark", "layout": "1|2|3|4|7-5|5-7|8-4|4-8", "columns": [[BLOCK, …]]} or with "rows" as above.

BLOCKS
`;

/** The person's brief as the AI reads it. */
export function briefText(b: Brief): string {
  return [
    `Type: ${b.page_type} – ${TYPE_RULE[b.page_type]}`,
    GOAL_RULE[b.goal],
    LANG_RULE[b.language],
    ADDRESS_RULE[b.address],
    `Tone: ${b.tone}`,
    b.business && `Business: ${b.business}`,
    b.offer && `Offer: ${b.offer}`,
    b.audience && `Target audience: ${b.audience}`,
    b.pages.length ? `Requested pages/steps: ${b.pages.join(', ')}` : '',
    b.extra && `Further wishes: ${b.extra}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Account context: the ids the AI may use (forms, calendars, products) – names only, nothing about contacts. */
export function refsText(refs: AccountRefs): string {
  const list = <T>(label: string, items: T[], fmt: (x: T) => string) => `${label}: ${items.length ? items.slice(0, 30).map(fmt).join('; ') : 'none available (leave the field empty)'}`;
  return [list('Forms (form_id)', refs.form, (f) => `${f.id} = "${f.name}"`), list('Calendars (calendar_slug)', refs.calendar, (c) => `${c.slug} = "${c.name}"`), list('Products (product_id)', refs.product, (p) => `${p.id} = "${p.name}"${p.price ? ` (${p.price})` : ''}`)].join('\n');
}
export const stylesText = () => {
  const t = tApp();
  return STYLE_CHOICES.map((s) => `${s.id} = ${t(s.name)} (${t(s.category)})`).join('; ');
};
export const catalogFor = (registry: Set<string>) => blockCatalogText(registry);

// --- stage 1: the plan ---------------------------------------------------------------------------------------------------

export interface PlanPage {
  slug: string;
  name: string;
  purpose: string;
  sections: string[];
}
export interface Plan {
  site_name: string;
  style: string;
  summary: string;
  pages: PlanPage[];
}

export function checkPlan(raw: any, brief: Brief): { plan?: Plan; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!raw || typeof raw !== 'object') return { errors: ['The answer was not a JSON object.'], warnings };
  const pages: PlanPage[] = [];
  const list = Array.isArray(raw.pages) ? raw.pages : [];
  const [min, max] = LIMITS.pages[brief.page_type];
  if (list.length < min || list.length > max) errors.push(`${list.length} pages – "${brief.page_type}" allows ${min}–${max}`);
  const seen = new Set<string>();
  list.slice(0, max).forEach((p: any, i: number) => {
    const at = `Page ${i + 1}`;
    const slug = String(p?.slug ?? '').trim();
    if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(slug)) return void errors.push(`${at}: slug "${slug}" – only lower-case letters, digits and hyphens`);
    if (seen.has(slug)) return void errors.push(`${at}: slug "${slug}" is used twice`);
    if (LEGAL.includes(slug)) return void errors.push(`${at}: "${slug}" is a legal page – HyperLevel generates it itself, please leave it out`);
    seen.add(slug);
    const name = clipText(p?.name, 60) || slug;
    const sections = (Array.isArray(p?.sections) ? p.sections : []).map((s: unknown) => String(s));
    const unknown = sections.filter((s: string) => !(PLAN_SECTIONS as readonly string[]).includes(s));
    if (unknown.length) warnings.push(`${at}: unknown sections ignored: ${unknown.join(', ')}`);
    const known = sections.filter((s: string) => (PLAN_SECTIONS as readonly string[]).includes(s)).slice(0, 10);
    if (!known.length) errors.push(`${at}: no sections in "sections"`);
    pages.push({ slug, name, purpose: clipText(p?.purpose, 200), sections: known });
  });
  let style = String(raw.style ?? '');
  if (!styleOf(style)) {
    if (style) warnings.push(`Unknown design "${style}" – the default was used`);
    style = brief.style ?? defaultStyle(brief.page_type, brief.goal);
  }
  if (brief.style) style = brief.style;
  const site_name = clipText(raw.site_name, 80) || brief.business.split(/[,.–-]/)[0].trim().slice(0, 80) || tApp()('Neue Seite');
  return { plan: errors.length ? undefined : { site_name, style, summary: clipText(raw.summary, 300), pages }, errors, warnings };
}

export function planText(plan: Plan): string {
  return [`Name: ${plan.site_name}`, ...plan.pages.map((p, i) => `${i + 1}. ${p.slug} "${p.name}" – ${p.purpose || 'no description'} – sections: ${p.sections.join(', ')}`)].join('\n');
}

// --- stage 2: the pages --------------------------------------------------------------------------------------------------

export interface DraftPage {
  slug: string;
  name: string;
  seo: { title: string; description: string };
  blocks: Block[];
}

/** The pages of the answer: every planned page exactly once, sections and blocks checked, one H1 each. */
export function checkPages(raw: any, plan: Plan, env: Omit<BlockEnv, 'pages'>): { pages?: DraftPage[]; notes: string[]; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.pages)) return { errors: ['Expected: {"pages": [...]}'], warnings, notes: [] };
  const benv: BlockEnv = { ...env, pages: new Set(plan.pages.map((p) => p.slug)) };
  const bySlug = new Map<string, any>();
  for (const p of raw.pages) if (p && typeof p.slug === 'string') bySlug.set(p.slug, p);
  const extra = [...bySlug.keys()].filter((s) => !benv.pages.has(s));
  if (extra.length) errors.push(`Pages that are not in the plan: ${extra.join(', ')}`);
  const pages: DraftPage[] = [];
  for (const pp of plan.pages) {
    const p = bySlug.get(pp.slug);
    if (!p) {
      errors.push(`Page "${pp.slug}" is missing`);
      continue;
    }
    const r = checkPageSections(p.sections, benv, `Page "${pp.slug}"`);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
    const title = clipText(p.seo?.title, 70) || pp.name;
    if (String(p.seo?.title ?? '').length > 70) warnings.push(`Page "${pp.slug}": SEO title shortened`);
    pages.push({ slug: pp.slug, name: pp.name, seo: { title, description: clipText(p.seo?.description, 160) }, blocks: r.blocks });
  }
  const notes = (Array.isArray(raw.notes) ? raw.notes : []).map((n: unknown) => clipText(n, 240)).filter(Boolean).slice(0, 8);
  return { pages: errors.length ? undefined : pages, notes, errors, warnings };
}

/** Sections of one page: limits, each section checked and compiled, the H1 rule. */
export function checkPageSections(list: unknown, env: BlockEnv, where: string): { blocks: Block[]; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!Array.isArray(list) || !list.length) return { blocks: [], errors: [`${where}: "sections" is missing or empty`], warnings };
  if (list.length > SECTION_LIMITS.sectionsPerPage) errors.push(`${where}: at most ${SECTION_LIMITS.sectionsPerPage} sections`);
  const blocks: Block[] = [];
  list.slice(0, SECTION_LIMITS.sectionsPerPage).forEach((s, i) => {
    const r = checkSection(s, env, `${where} section ${i + 1}`);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
    if (r.section && !r.section.keep) blocks.push(compileSection(r.section, { first: i === 0 }));
  });
  const h1 = h1Count(blocks);
  if (!errors.length && h1 !== 1) errors.push(`${where}: ${h1} H1 headings – exactly one (hero or heading level 1), all others level 2 or 3`);
  return { blocks, errors, warnings };
}

// --- section commands ------------------------------------------------------------------------------------------------------

/** Ready-made commands of the builder panel (chips); free text works the same way. */
export const SECTION_COMMANDS = [
  { id: 'shorter', label: 'Kürzer machen', prompt: 'Make this section much shorter and punchier without inventing content.' },
  { id: 'faq', label: 'FAQ hinzufügen', prompt: 'Add an FAQ section with 4–6 fitting questions and answers after this section (the section itself stays unchanged).' },
  // i18n-ignore – the prompt names the German form
  { id: 'du', label: 'In Du-Form umschreiben', prompt: 'Rewrite all texts of this section in a friendly, informal tone (German: „du“ form); content and length stay the same.' },
  // i18n-ignore – the prompt names the German form
  { id: 'sie', label: 'In Sie-Form umschreiben', prompt: 'Rewrite all texts of this section in a polite, formal tone (German: „Sie“ form); content and length stay the same.' },
  { id: 'benefits', label: 'Nutzen betonen', prompt: 'Rewrite this section to focus on benefits: what does the visitor get out of it?' },
  { id: 'cta', label: 'Aufruf ergänzen', prompt: 'Add a short call-to-action section (cta) after this section that leads to the goal of the page.' },
] as const;

/** What the AI gets for a section command: the section (simple format, with ids) and the page around it. */
export function sectionContext(page: Block[], sectionId: string): { section: ReturnType<typeof decompileSection>; outline: string } | null {
  const sec = page.find((b) => b.type === 'section' && b.id === sectionId);
  if (!sec) return null;
  const outline = page
    .map((b, i) => {
      const heads: string[] = [];
      walkBlocks([b], (x) => {
        if (x.type !== 'section' && heads.length < 2) {
          const t = String(x.heading ?? x.text ?? x.quote ?? '').split('\n')[0].slice(0, 70);
          if (t) heads.push(t);
        }
      });
      return `${i + 1}. ${b.id === sectionId ? '>> ' : ''}${String(b.name || b.type)}${heads.length ? `: ${heads.join(' / ')}` : ''}`;
    })
    .join('\n');
  return { section: decompileSection(sec), outline };
}

/** The checked answer of a section command: the sections that replace the selected one. */
export function checkSectionAnswer(raw: any, page: Block[], sectionId: string, env: BlockEnv): { sections?: CheckedSection[]; summary: string; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.sections) || !raw.sections.length) return { errors: ['Expected: {"sections": [...]} with at least one section'], warnings, summary: '' };
  if (raw.sections.length > 4) errors.push('At most 4 sections as a replacement');
  const known = new Set([sectionId]);
  const sections: CheckedSection[] = [];
  raw.sections.slice(0, 4).forEach((s: any, i: number) => {
    const r = checkSection(s, env, `Section ${i + 1}`, known);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
    if (r.section) sections.push(r.section);
  });
  if (sections.filter((s) => s.id === sectionId).length > 1) errors.push('The selected section may appear only once');
  return { sections: errors.length ? undefined : sections, summary: clipText(raw.summary, 300), errors, warnings };
}

// --- review: what changes ------------------------------------------------------------------------------------------------

export interface SectionDiff {
  id: string;
  name: string;
  change: 'new' | 'changed' | 'removed' | 'same';
  blocks: number;
  /** a few words of the first text, to recognise the section */
  preview: string;
}

const sectionKey = (b: Block) => {
  const parts: string[] = [];
  walkBlocks([b], (x) => {
    if (x.type !== 'section') parts.push(`${x.type}:${blockText(x)}`);
  });
  return parts.join('|');
};
const firstText = (b: Block) => {
  let out = '';
  walkBlocks([b], (x) => {
    if (!out && x.type !== 'section') out = blockText(x).slice(0, 90);
  });
  return out;
};
const blockCount = (b: Block) => {
  let n = 0;
  walkBlocks([b], (x) => {
    if (x.type !== 'section') n++;
  });
  return n;
};

/** Section-by-section difference of a page before and after (ids decide; a page without sections counts as one). */
export function diffPage(before: Block[], after: Block[]): { sections: SectionDiff[]; counts: Record<SectionDiff['change'], number> } {
  const old = new Map(before.filter((b) => b.type === 'section').map((b) => [String(b.id), b]));
  const sections: SectionDiff[] = [];
  for (const b of after) {
    const prev = old.get(String(b.id));
    sections.push({ id: String(b.id), name: String(b.name || (AI_BLOCKS[b.type]?.label ? tApp()(AI_BLOCKS[b.type].label) : '') || b.type), change: !prev ? 'new' : sectionKey(prev) === sectionKey(b) && JSON.stringify(prev.bg ?? '') === JSON.stringify(b.bg ?? '') ? 'same' : 'changed', blocks: blockCount(b), preview: firstText(b) });
    old.delete(String(b.id));
  }
  for (const b of before) if (old.has(String(b.id))) sections.push({ id: String(b.id), name: String(b.name || b.type), change: 'removed', blocks: blockCount(b), preview: firstText(b) });
  const counts = { new: 0, changed: 0, removed: 0, same: 0 };
  for (const s of sections) counts[s.change]++;
  return { sections, counts };
}

/** Replaces the selected section by the answer's sections (merged or compiled) – the page after a section command. */
export function applySectionAnswer(page: Block[], sectionId: string, sections: CheckedSection[], merge: (original: Block, s: CheckedSection) => Block): Block[] {
  const at = page.findIndex((b) => b.id === sectionId);
  if (at < 0) return page;
  const original = page[at];
  const replacement = sections.map((s) => (s.id === sectionId ? (s.keep ? original : merge(original, s)) : compileSection(s)));
  return [...page.slice(0, at), ...replacement, ...page.slice(at + 1)];
}

// --- cost -------------------------------------------------------------------------------------------------------------------

/** Tokens a request will roughly take (input includes the instructions and catalogue; output by page count), for the estimate. */
export function estimateTokens(o: { mode: 'site' | 'page' | 'section' | 'write'; pages?: number; systemChars: number; userChars: number }): { input: number; output: number; calls: number } {
  const sys = Math.ceil(o.systemChars / 3.5);
  const user = Math.ceil(o.userChars / 3.5);
  if (o.mode === 'site') {
    const pages = Math.max(1, o.pages ?? 1);
    // plan + pages; one retry is likely on long sites
    return { input: sys * 2 + user * 2 + 800 + (pages > 3 ? sys : 0), output: 700 + pages * 1900, calls: pages > 3 ? 3 : 2 };
  }
  if (o.mode === 'page') return { input: sys + user + 400, output: 2200, calls: 1 };
  if (o.mode === 'section') return { input: sys + user, output: 900, calls: 1 };
  return { input: sys + user, output: 1600, calls: 1 };
}
export const expectedPages = (b: Brief) => (b.pages.length ? Math.min(LIMITS.pages[b.page_type][1], Math.max(LIMITS.pages[b.page_type][0], b.pages.length)) : b.page_type === 'landing' ? 2 : b.page_type === 'funnel' ? 3 : 4);

export function retryText(base: string, previous: string, errors: string[]): string {
  return `${base}\n\nYOUR LAST ANSWER WAS NOT VALID:\n${previous.slice(0, 16_000)}\n\nERRORS:\n${errors.slice(0, 20).map((e) => `- ${e}`).join('\n')}\n\nFix exactly these points and output the COMPLETE answer again as one JSON object.`;
}

// --- writer (blog posts, e-mail text blocks) ----------------------------------------------------------------------------------

export const WRITE_KINDS = ['blog', 'email'] as const;
export type WriteKind = (typeof WRITE_KINDS)[number];
export function writerRules(kind: WriteKind, lang: Lang, address: 'du' | 'sie', tone: string): string {
  return [
    kind === 'blog'
      ? 'You write a blog post. Reply only with JSON: {"title": "≤ 80 characters", "excerpt": "≤ 200 characters", "markdown": "the post in Markdown with ## subheadings, paragraphs and lists"}.'
      : 'You write the text of a text block in an email. Reply only with JSON: {"text": "2–4 short paragraphs separated by a blank line, no subject line, no sign-off at the end; placeholders such as {{contact.first_name|there}} are allowed"}.',
    'No invented facts, figures, prices, studies or quotes; write anything unknown as a [placeholder]. No HTML.',
    LANG_RULE[lang],
    ADDRESS_RULE[address],
    `Tone: ${tone}`,
  ].join('\n');
}
export function checkWritten(raw: any, kind: WriteKind): { out?: { title?: string; excerpt?: string; text: string }; errors: string[] } {
  if (!raw || typeof raw !== 'object') return { errors: ['The answer was not a JSON object.'] };
  const text = clipText(kind === 'blog' ? raw.markdown : raw.text, kind === 'blog' ? 20_000 : 4000);
  if (text.length < 40) return { errors: ['The text is missing or too short.'] };
  if (/<\/?(script|iframe|style|div|p|span|br)\b/i.test(text)) return { errors: ['No HTML – only Markdown or plain text.'] };
  return { out: kind === 'blog' ? { title: clipText(raw.title, 80), excerpt: clipText(raw.excerpt, 200), text } : { text }, errors: [] };
}
