/**
 * Neso fork – the server's language layer (docs/translating.md has the web side).
 *
 * German is the source language of the server too: the texts in the code are German and are the message ids. The
 * catalogs in server/i18n/<lang>/*.ts map them (`'Kontakt gespeichert': 'Contact saved'`); a missing text stays German.
 *
 *   const t = tCtx(ctx);              // in a route: the signed-in user's language, else the browser's, else the default
 *   const t = tLoc(app, locationId);  // content for a sub-account's contacts (emails, booking pages, invoices, seeds)
 *   const t = tApp();                 // no request, no sub-account: the instance default (PGHL_LOCALE, English here)
 *   t('Neuer Kontakt')  ·  t('{n} Kontakte', { n })  ·  t.plural(n, { one: '{n} Kontakt', other: '{n} Kontakte' })
 *
 * Error messages (`new HttpError(400, '…')`, `bad('…')`) need no wrapping: core/app.ts translates the `error` of every
 * JSON answer into the requester's language. Only messages with variables are written as `t('… {x}', { x })`.
 */
import type { IncomingMessage } from 'node:http';
import en from './en/index.js';
import so from './so/index.js';

export const SERVER_LOCALES = ['en', 'so', 'de'] as const;
export type ServerLocale = (typeof SERVER_LOCALES)[number];
export type Vars = Record<string, string | number>;
export interface PluralForms { zero?: string; one?: string; two?: string; few?: string; many?: string; other: string }
export type Catalog = Record<string, string | PluralForms>;
export interface STFn {
  (text: string, vars?: Vars): string;
  plural(n: number, forms: PluralForms, vars?: Vars): string;
  readonly locale: ServerLocale;
}

const CATALOGS: Partial<Record<ServerLocale, Catalog>> = { en, so };
/** Where a missing text is looked up next: Somali (Beta) falls back to English, never to the German source. */
const FALLBACK: Partial<Record<ServerLocale, ServerLocale>> = { so: 'en' };
const isLocale = (v: unknown): v is ServerLocale => typeof v === 'string' && (SERVER_LOCALES as readonly string[]).includes(v);

/** The instance default: PGHL_LOCALE (en | so | de); English in this fork. */
export function defaultLocale(): ServerLocale {
  const v = String(process.env.PGHL_LOCALE ?? '').toLowerCase();
  return isLocale(v) ? v : 'en';
}

export function interpolate(s: string, vars?: Vars): string {
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m)) : s;
}

const rules = new Map<string, Intl.PluralRules>();
const pluralOf = (locale: string, n: number) => {
  let r = rules.get(locale);
  if (!r) rules.set(locale, (r = new Intl.PluralRules(locale)));
  return r.select(n);
};

/** A translator for one language. */
export function translator(locale: ServerLocale = defaultLocale()): STFn {
  const chain = [CATALOGS[locale], FALLBACK[locale] && CATALOGS[FALLBACK[locale]!]].filter((c): c is Catalog => !!c);
  const look = (text: string) => chain.find((c) => Object.prototype.hasOwnProperty.call(c, text))?.[text];
  const fn = ((text: string, vars?: Vars) => {
    const hit = look(text);
    const s = typeof hit === 'string' ? hit : hit && typeof hit === 'object' ? hit.other : text;
    return interpolate(s, vars);
  }) as STFn;
  fn.plural = (n: number, forms: PluralForms, vars?: Vars) => {
    const hit = look(forms.other);
    const f: PluralForms = typeof hit === 'object' && hit ? hit : typeof hit === 'string' ? { other: hit } : forms;
    const cat2 = n === 0 && f.zero ? 'zero' : (pluralOf(locale === 'de' ? 'de' : locale, n) as keyof PluralForms);
    return interpolate((f[cat2] as string | undefined) ?? f.other, { n, ...vars });
  };
  Object.defineProperty(fn, 'locale', { value: locale });
  return fn;
}

/** `en-US,en;q=0.9,de;q=0.8` → the best supported language, or undefined. */
export function fromAcceptLanguage(header: string | string[] | undefined): ServerLocale | undefined {
  const raw = (Array.isArray(header) ? header.join(',') : (header ?? '')).slice(0, 1000);
  const ranked = raw
    .split(',')
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.map((p) => /^\s*q=([01](?:\.\d{1,3})?)\s*$/.exec(p)?.[1]).find(Boolean);
      return { base: tag.trim().toLowerCase().split(/[-_]/)[0], q: q === undefined ? 1 : Number(q), i };
    })
    .filter((x) => x.base && x.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  return ranked.map((x) => x.base).find(isLocale) as ServerLocale | undefined;
}

/** The language of a request: the signed-in user's saved choice, else the browser's, else the default. */
export function requestLocale(req: IncomingMessage | undefined): ServerLocale {
  const saved = (req as { __lang?: string } | undefined)?.__lang;
  if (isLocale(saved)) return saved;
  return fromAcceptLanguage(req?.headers['accept-language']) ?? defaultLocale();
}

/** In a route handler. */
export const tCtx = (ctx: { req: IncomingMessage }) => translator(requestLocale(ctx.req));
/**
 * Content for a sub-account's contacts and records. Today every sub-account uses the instance default; a per-sub-account
 * language (needed for Somali customer pages) plugs in here without touching the callers.
 */
export const tLoc = (_app: unknown, _locationId?: string | null) => translator(defaultLocale());
/** Background work without a request or sub-account. */
export const tApp = () => translator(defaultLocale());
/** For a person (notifications to a team member): their saved language. */
export const tUser = (app: { db: { get: <T>(sql: string, ...a: unknown[]) => T | undefined } }, userId: string | null | undefined) => {
  const lang = userId ? app.db.get<{ lang: string | null }>('SELECT lang FROM users WHERE id = ?', userId)?.lang : undefined;
  return translator(isLocale(lang) ? lang : defaultLocale());
};
