/**
 * Living Boards: the widget registry. A widget type is a definition – label, description, size, a declarative list of
 * config fields (they validate the config AND draw the settings panel) and a `data()` function that returns one of a
 * few standard *views* for the person who looks at the board. Because the views are standard, a module can add a
 * widget on the server alone: no browser code needed (docs/living-boards.md → "Widgets for module authors").
 *
 *   app.services.boardWidgets.register({ type: 'tickets_open', label: 'Offene Tickets', … data: (w) => ({ kind: 'number', value: 7 }) });
 *
 * `access` names the API route whose member right and SaaS plan decide who may see the widget's data – the same
 * guards the app runs for that route. A widget therefore never shows more than the viewer could open on its own page.
 */

import type { App } from '../core/app.js';
import type { Ctx, User } from '../core/http.js';
import { DEFAULT_LIMITS, type Limits } from './boards-layout.js';
import { cleanLine, cleanText } from './boards-model.js';
import { tApp, type STFn } from '../i18n/index.js';

export type Tone = 'gray' | 'green' | 'red' | 'blue' | 'yellow' | 'purple';
export type NumberFormat = 'number' | 'money' | 'percent' | 'days' | 'minutes';

export interface ListRow {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  /** A point in time the browser shows relative to now ("vor 5 Min.") */
  at?: string;
  badge?: { text: string; tone?: Tone };
  /** Internal page ("contacts/<id>") or https address */
  url?: string;
  /** A task that can be ticked off right in the list (the browser calls the regular task route) */
  check?: { task_id: string; done: boolean };
}
export interface ActionView {
  id: string;
  label: string;
  icon?: string;
  kind: 'workflow' | 'form' | 'page' | 'task' | 'contact';
  /** workflow / form id, internal page route; empty for task and contact */
  target: string;
  enabled: boolean;
  why?: string;
  /** form: the public address; page: the internal route */
  href?: string;
}

/** What `data()` returns. The browser draws each kind; unknown kinds fall back to a short message. `title` is the heading the widget suggests for itself (the person's own title wins). */
export type View = ViewBody & { title?: string };
type ViewBody =
  | { kind: 'number'; value: string | number | null; label?: string; format?: NumberFormat; delta?: number | null; hint?: string; url?: string; tone?: Tone }
  | { kind: 'numbers'; items: { label: string; value: string | number | null; format?: NumberFormat; tone?: Tone }[]; url?: string; hint?: string }
  | { kind: 'report'; viz: string; result: unknown; url?: string }
  | { kind: 'list'; rows: ListRow[]; total?: number; empty?: string; url?: string }
  | { kind: 'table'; columns: { key: string; label: string; align?: 'right' }[]; rows: Record<string, string | number | null>[]; total?: number; empty?: string; url?: string }
  | { kind: 'kanban'; columns: { id: string; title: string; count: number; sum?: number; cards: { id: string; title: string; subtitle?: string; meta?: string; url?: string }[] }[]; url?: string; empty?: string }
  | { kind: 'agenda'; days: { date: string; label: string; items: { id: string; time: string; title: string; subtitle?: string; url?: string; tone?: Tone }[] }[]; empty?: string; url?: string }
  | { kind: 'markdown'; text: string; url?: string }
  | { kind: 'embed'; url: string }
  | { kind: 'actions'; actions: ActionView[] }
  | { kind: 'frame'; plugin_id: string; entry: string }
  | { kind: 'message'; text: string; tone?: Tone; action?: { label: string; url: string } }
  | { kind: 'locked'; reason: string };

export type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'bool' | 'url' | 'multi' | 'list' | 'json';
/** Where the settings panel gets the choices of an id field (GET /api/boards/options/:source), always from the viewer's own data. */
export type OptionSource = 'pipelines' | 'stages' | 'reports' | 'workflows' | 'forms' | 'wiki_pages' | 'scenarios' | 'plugins' | 'plugin_widgets' | 'smart_lists' | 'calendars' | 'projects' | 'tags';

export interface ConfigField {
  key: string;
  label: string;
  type: FieldType;
  hint?: string;
  placeholder?: string;
  /** select / multi: the allowed values with their labels */
  options?: [value: string, label: string][];
  /** select / multi: ids from the viewer's data instead of a fixed list */
  optionsFrom?: OptionSource;
  /** stages are listed per pipeline: the key of the pipeline field */
  dependsOn?: string;
  default?: unknown;
  min?: number;
  max?: number;
  maxLength?: number;
  /** Only shown (and meaningful) when another field has one of these values */
  showIf?: { key: string; in: string[] };
  /** list: the fields of one entry and how many entries */
  item?: ConfigField[];
  maxItems?: number;
  /** Not drawn in the settings panel (set by an agent or the API) */
  hidden?: boolean;
  /** An id of this sub-account: it does not travel in a template */
  local?: boolean;
  /** Changing it only changes how the widget looks, not what it shows */
  cosmetic?: boolean;
}

export const CATEGORIES: [key: string, label: string][] = [
  ['zahlen', 'Zahlen & Diagramme'],
  ['listen', 'Listen & Pipeline'],
  ['planung', 'Planung & Posteingang'],
  ['wissen', 'Wissen & Notizen'],
  ['aktionen', 'Aktionen'],
  ['extern', 'Einbettungen & Plugins'],
];

export interface WidgetCtx {
  app: App;
  /** The request of the person looking at the board (their rights, their sub-account). */
  ctx: Ctx;
  locationId: string;
  tz: string;
  user?: User;
  now: Date;
  /** May the viewer use the area behind this API route (member right and SaaS plan)? */
  allowed(path: string): boolean;
  /** Runs another API route in-process as the viewer – guards, validation and sub-account included. */
  call<T = any>(method: string, path: string, body?: Record<string, any>): Promise<T>;
}

export interface WidgetDef {
  /** `a-z0-9_`, starts with a letter */
  type: string;
  label: string;
  description: string;
  /** Key of the web app's icon map; unknown names show a puzzle piece */
  icon: string;
  category: string;
  keywords?: string[];
  /** The API route whose member right and plan decide who sees the data, e.g. '/api/opportunities' */
  access?: string;
  /** Name of that area for the message "Dafür fehlt dir das Recht …" */
  accessLabel?: string;
  /** Default size in grid units (12 columns) and the limits for resizing */
  size: { w: number; h: number } & Partial<Limits>;
  /** `high`: touches the outside (addresses, buttons that start things) – an agent's patch with it always needs a confirmation */
  risk?: 'normal' | 'high';
  fields: ConfigField[];
  /** More checks on a cleaned config (hosts, report queries …): German problems, empty = fine */
  validate?: (config: Record<string, unknown>, env: { app: App; locationId: string }) => string[];
  data?: (w: WidgetCtx, config: Record<string, unknown>) => View | Promise<View>;
  /** Which module registered it ('core' for the built-in ones) */
  source?: string;
}

export interface Described {
  type: string;
  label: string;
  description: string;
  icon: string;
  category: string;
  category_label: string;
  keywords: string[];
  access: string;
  access_label: string;
  size: { w: number; h: number; minW: number; minH: number; maxW: number; maxH: number };
  risk: 'normal' | 'high';
  fields: ConfigField[];
  source: string;
}

const TYPE = /^[a-z][a-z0-9_]{1,30}$/;
const FIELD_KEY = /^[a-z][a-z0-9_]{0,40}$/;
const ID_VALUE = /^[A-Za-z0-9_:.-]{0,80}$/;

function checkFields(type: string, fields: ConfigField[], depth = 0) {
  const t = tApp();
  const seen = new Set<string>();
  for (const f of fields) {
    if (!FIELD_KEY.test(f.key)) throw new Error(t('Widget „{type}“: ungültiger Feldname „{key}“', { type, key: f.key }));
    if (seen.has(f.key)) throw new Error(t('Widget „{type}“: Feld „{key}“ doppelt', { type, key: f.key }));
    seen.add(f.key);
    if ((f.type === 'select' || f.type === 'multi') && !f.options?.length && !f.optionsFrom) throw new Error(t('Widget „{type}“: Feld „{key}“ braucht options oder optionsFrom', { type, key: f.key }));
    if (f.type === 'list') {
      if (!f.item?.length || depth > 0) throw new Error(t('Widget „{type}“: Feld „{key}“ (list) braucht item (eine Ebene)', { type, key: f.key }));
      checkFields(type, f.item, depth + 1);
    }
  }
}

/** Per-instance registry; `app.services.boardWidgets` is one of these (see boardWidgets()). */
export class WidgetRegistry {
  private defs = new Map<string, WidgetDef>();
  /** Fixed once the board module has registered the built-in widgets: nothing can replace those. */
  private locked = new Set<string>();

  register(def: WidgetDef): void {
    const t = tApp();
    if (!TYPE.test(def.type)) throw new Error(t('Widget-Typ „{type}“ ist ungültig (a–z, 0–9, _; beginnt mit einem Buchstaben)', { type: def.type }));
    if (!def.label?.trim() || !def.description?.trim()) throw new Error(t('Widget „{type}“ braucht label und description', { type: def.type }));
    if (!def.size || !(def.size.w >= 1 && def.size.w <= 12) || !(def.size.h >= 1 && def.size.h <= 12)) throw new Error(t('Widget „{type}“: size.w/h müssen 1–12 sein', { type: def.type }));
    if (!CATEGORIES.some(([k]) => k === def.category)) throw new Error(t('Widget „{type}“: unbekannte Kategorie „{category}“', { type: def.type, category: def.category }));
    checkFields(def.type, def.fields ?? []);
    const old = this.defs.get(def.type);
    if (old && (this.locked.has(def.type) || (old.source ?? 'core') !== (def.source ?? 'core'))) throw new Error(t('Widget-Typ „{type}“ ist schon vergeben ({source})', { type: def.type, source: old.source ?? 'core' }));
    this.defs.set(def.type, { ...def, source: def.source ?? 'core', fields: def.fields ?? [] });
  }
  /** The built-in widgets cannot be replaced by another module. */
  lock(): void {
    for (const t of this.defs.keys()) this.locked.add(t);
  }
  unregister(type: string): void {
    if (!this.locked.has(type)) this.defs.delete(type);
  }
  get(type: string): WidgetDef | undefined {
    return this.defs.get(type);
  }
  has(type: string): boolean {
    return this.defs.has(type);
  }
  list(): WidgetDef[] {
    return [...this.defs.values()];
  }
  limits(type: string): Limits {
    const d = this.defs.get(type);
    if (!d) return DEFAULT_LIMITS;
    return { minW: d.size.minW ?? Math.min(2, d.size.w), minH: d.size.minH ?? Math.min(2, d.size.h), maxW: d.size.maxW ?? 12, maxH: d.size.maxH ?? 12 };
  }
  /** A widget type for the settings panel, the catalogue and the AI, in the language of `t` (German texts are the catalog keys). */
  describe(def: WidgetDef, t: STFn = tApp()): Described {
    const l = this.limits(def.type);
    const keywords = def.keywords ?? [];
    const category = CATEGORIES.find(([k]) => k === def.category)?.[1];
    return {
      type: def.type,
      label: t(def.label),
      description: t(def.description),
      icon: def.icon,
      category: def.category,
      category_label: category ? t(category) : def.category,
      // the German keywords stay searchable next to their translations
      keywords: [...new Set([...keywords, ...keywords.map((k) => t(k))])],
      access: def.access ?? '',
      access_label: def.accessLabel ? t(def.accessLabel) : '',
      size: { w: def.size.w, h: def.size.h, ...l },
      risk: def.risk ?? 'normal',
      fields: translateFields(def.fields, t),
      source: def.source ?? 'core',
    };
  }
  catalogue(t: STFn = tApp()): Described[] {
    return this.list().map((d) => this.describe(d, t));
  }
}

/** Config fields with their visible texts (label, hint, placeholder, option labels) in the language of `t`. */
export function translateFields(fields: ConfigField[], t: STFn): ConfigField[] {
  return fields.map((f) => ({
    ...f,
    label: t(f.label),
    ...(f.hint ? { hint: t(f.hint) } : {}),
    ...(f.placeholder ? { placeholder: t(f.placeholder) } : {}),
    ...(f.options ? { options: f.options.map(([v, label]) => [v, t(label)] as [string, string]) } : {}),
    ...(f.item ? { item: translateFields(f.item, t) } : {}),
  }));
}

/**
 * A widget's view in the viewer's language: the fixed texts a widget writes (messages, empty states, hints, labels,
 * reasons) are catalog keys. Rows, cards and titles are data and stay as they are.
 */
export function translateView(view: View, t: STFn): View {
  const v = { ...view } as any;
  if (typeof v.text === 'string' && v.kind === 'message') v.text = t(v.text);
  if (v.action?.label) v.action = { ...v.action, label: t(v.action.label) };
  if (typeof v.reason === 'string') v.reason = t(v.reason);
  if (typeof v.empty === 'string') v.empty = t(v.empty);
  if (typeof v.hint === 'string') v.hint = t(v.hint);
  if (v.kind === 'number' && typeof v.label === 'string') v.label = t(v.label);
  if (v.kind === 'numbers' && Array.isArray(v.items)) v.items = v.items.map((i: any) => ({ ...i, label: t(i.label) }));
  if (v.kind === 'table' && Array.isArray(v.columns)) v.columns = v.columns.map((c: any) => ({ ...c, label: t(c.label) }));
  if (v.kind === 'actions' && Array.isArray(v.actions)) v.actions = v.actions.map((a: any) => (a.why ? { ...a, why: t(a.why) } : a));
  return v as View;
}

/** The registry of this app, created on first use – a module may call this before or after the board module registered. */
export function boardWidgets(app: App): WidgetRegistry {
  return (app.services.boardWidgets ??= new WidgetRegistry());
}

// --- config cleaning ---------------------------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

function cleanValue(f: ConfigField, v: unknown, where: string, strict: boolean, errors: string[]): unknown {
  const t = tApp();
  const label = t(f.label);
  const bad = (msg: string) => {
    errors.push(`${where}: ${msg}`);
    return undefined;
  };
  switch (f.type) {
    case 'text': {
      if (v === null || v === undefined || v === '') return f.default ?? '';
      if (typeof v !== 'string' && typeof v !== 'number') return bad(t('„{label}“ muss Text sein', { label }));
      return cleanLine(v, f.maxLength ?? 200);
    }
    case 'textarea': {
      if (v === null || v === undefined || v === '') return f.default ?? '';
      if (typeof v !== 'string') return bad(t('„{label}“ muss Text sein', { label }));
      return cleanText(v, f.maxLength ?? 8000);
    }
    case 'url': {
      if (v === null || v === undefined || v === '') return '';
      if (typeof v !== 'string' || v.length > 600 || /\s/.test(v.trim())) return bad(t('„{label}“ ist keine gültige Adresse', { label }));
      return v.trim();
    }
    case 'number': {
      if (v === null || v === undefined || v === '') return f.default ?? null;
      const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
      if (!Number.isFinite(n)) return bad(t('„{label}“ muss eine Zahl sein', { label }));
      if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) {
        if (strict) return bad(t('„{label}“ muss zwischen {min} und {max} liegen', { label, min: f.min ?? '−∞', max: f.max ?? '∞' }));
        return Math.max(f.min ?? -Infinity, Math.min(f.max ?? Infinity, n));
      }
      return n;
    }
    case 'bool': {
      if (v === null || v === undefined || v === '') return f.default ?? false;
      if (typeof v !== 'boolean') return bad(t('„{label}“ muss ja oder nein sein', { label }));
      return v;
    }
    case 'select': {
      if (v === null || v === undefined || v === '') return f.default ?? '';
      if (typeof v !== 'string') return bad(t('„{label}“ muss ein Wert aus der Liste sein', { label }));
      if (f.options) {
        if (!f.options.some(([val]) => val === v)) return bad(t('„{label}“: „{value}“ ist nicht erlaubt (erlaubt: {list})', { label, value: String(v).slice(0, 40), list: f.options.map(([val]) => val).join(', ') }));
        return v;
      }
      if (!ID_VALUE.test(v)) return bad(t('„{label}“ ist keine gültige ID', { label }));
      return v;
    }
    case 'multi': {
      if (v === null || v === undefined || v === '') return f.default ?? [];
      if (!Array.isArray(v)) return bad(t('„{label}“ muss eine Liste sein', { label }));
      const out: string[] = [];
      for (const x of v.slice(0, f.maxItems ?? 20)) {
        if (typeof x !== 'string') return bad(t('„{label}“ muss eine Liste aus Text sein', { label }));
        if (f.options && !f.options.some(([val]) => val === x)) return bad(t('„{label}“: „{value}“ ist nicht erlaubt', { label, value: x.slice(0, 40) }));
        if (!f.options && !ID_VALUE.test(x)) return bad(t('„{label}“ enthält eine ungültige ID', { label }));
        if (!out.includes(x)) out.push(x);
      }
      return out;
    }
    case 'list': {
      if (v === null || v === undefined || v === '') return f.default ?? [];
      if (!Array.isArray(v)) return bad(t('„{label}“ muss eine Liste sein', { label }));
      if (v.length > (f.maxItems ?? 10)) return bad(t('„{label}“: höchstens {n} Einträge', { label, n: f.maxItems ?? 10 }));
      const out: Record<string, unknown>[] = [];
      for (const [i, entry] of v.entries()) {
        if (!isObj(entry)) return bad(t('„{label}“ #{n} ist kein Eintrag', { label, n: i + 1 }));
        const r = cleanFields(f.item!, entry, `${where} → ${label} #${i + 1}`, strict);
        errors.push(...r.errors);
        out.push(r.config);
      }
      return out;
    }
    case 'json': {
      if (v === null || v === undefined || v === '') return f.default ?? null;
      if (!isObj(v)) return bad(t('„{label}“ muss ein Objekt sein', { label }));
      const text = JSON.stringify(v);
      if (text.length > (f.maxLength ?? 4000)) return bad(t('„{label}“ ist zu groß', { label }));
      return JSON.parse(text);
    }
  }
}

function cleanFields(fields: ConfigField[], input: Record<string, unknown>, where: string, strict: boolean): { config: Record<string, unknown>; errors: string[] } {
  const errors: string[] = [];
  const config: Record<string, unknown> = {};
  if (strict) for (const k of Object.keys(input)) if (!fields.some((f) => f.key === k)) errors.push(`${where}: ${tApp()('unbekanntes Feld „{key}“', { key: k.slice(0, 40) })}`);
  for (const f of fields) {
    const v = cleanValue(f, input[f.key], where, strict, errors);
    if (v !== undefined) config[f.key] = v;
    else if (f.default !== undefined) config[f.key] = f.default;
  }
  return { config, errors };
}

/**
 * A widget config in its stored form: every field of the type present (default when absent), values coerced and
 * checked. `strict` (agents, API, MCP) refuses unknown fields and out-of-range numbers; the settings panel and old data
 * are cleaned leniently (unknown fields dropped, numbers clamped).
 */
export function cleanConfig(def: WidgetDef, input: unknown, opts: { strict?: boolean; where?: string } = {}): { config: Record<string, unknown>; errors: string[] } {
  const src = isObj(input) ? input : {};
  return cleanFields(def.fields, src, opts.where ?? `Widget „${tApp()(def.label)}“`, !!opts.strict);
}

/** The values of a config that differ from the defaults of the type (for compact prompts and diffs). */
export function nonDefault(def: WidgetDef, config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of def.fields) {
    const v = config[f.key];
    const d = f.default ?? (f.type === 'bool' ? false : f.type === 'multi' || f.type === 'list' ? [] : f.type === 'number' || f.type === 'json' ? null : '');
    if (JSON.stringify(v) !== JSON.stringify(d) && v !== undefined) out[f.key] = v;
  }
  return out;
}
