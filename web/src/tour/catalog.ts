import type { IconName } from '../icons';
import type { Tour, TourGroup, TourProgress, TourStep } from './types';
import { JOURNEY } from './content/journey';
import { START_TOURS } from './content/start';
import { CRM_TOURS } from './content/crm';
import { MARKETING_TOURS } from './content/marketing';
import { SITES_TOURS } from './content/sites';
import { REVENUE_TOURS } from './content/revenue';
import { AI_TOURS } from './content/ai';
import { SETTINGS_TOURS } from './content/settings';
import { AGENCY_TOURS } from './content/agency';
import { BACKOFFICE_TOURS } from './content/backoffice';
import { SERVICE_TOURS } from './content/service';
import { TEAMTOOLS_TOURS } from './content/teamtools';
import { DATA_TOURS } from './content/data';
import { CONNECT_TOURS } from './content/connect';
import { AGENT_TOURS } from '../agent/tour';
import { CANVAS_TOURS } from '../canvas/tour';
import { WERKSTATT_TOURS } from '../werkstatt/tour';
import { COLLAB_TOURS } from '../pages/collab-tour';
import { FEEDBACK_TOURS } from './content/feedback';
import { GENMEDIA_TOURS } from './content/genmedia';
import { WORKFLOW_TOOLS_TOURS } from './content/workflow-tools';
import { PM_TOURS } from './content/pm';
import { MAILBOX_TOURS } from './content/mailbox';
import { ADS_TOURS } from './content/ads';
import { VOICE_TOURS } from './content/voice';
import { CALC_TOURS } from './content/calc';
import { BOARD_TOURS } from './content/boards';
import { WEBINAR_TOURS } from './content/webinars';
import { CREATOR_TOURS } from './content/creator';
import { SEPA_TOURS } from './content/sepa';
import { XR_TOURS } from './content/xr';
import { UNDO_TOURS } from './content/undo';
import { UMZUG_TOURS } from './content/umzug';
import { MEMORY_TOURS } from './content/memory';
import { CALLS_TOURS } from './content/calls';
import { SALES_TOURS } from './content/sales';
import { COMPANY_TOURS } from './content/company';
import { getLocale, tr, useT } from '../i18n';
import { SOURCE_LOCALE } from '../i18n/registry';

/** All tours: the big journey („Firma übernehmen“, in chapters) and one tour per area. Pure data – no React. */
export { JOURNEY };
export const MODULE_TOURS: Tour[] = [
  ...START_TOURS,
  // the course „Deine Firma mit {brand} führen“ (10 lessons, docs/kurs-firma-fuehren.md)
  ...COMPANY_TOURS,
  ...UNDO_TOURS,
  ...FEEDBACK_TOURS,
  ...CRM_TOURS,
  ...CALLS_TOURS,
  ...TEAMTOOLS_TOURS,
  ...PM_TOURS,
  ...MARKETING_TOURS,
  ...WORKFLOW_TOOLS_TOURS,
  ...DATA_TOURS,
  ...SITES_TOURS,
  ...REVENUE_TOURS,
  ...BACKOFFICE_TOURS,
  ...SERVICE_TOURS,
  ...AI_TOURS,
  ...AGENT_TOURS,
  ...CANVAS_TOURS,
  ...COLLAB_TOURS,
  ...GENMEDIA_TOURS,
  ...WERKSTATT_TOURS,
  ...MAILBOX_TOURS,
  ...ADS_TOURS,
  ...VOICE_TOURS,
  ...CALC_TOURS,
  ...BOARD_TOURS,
  ...WEBINAR_TOURS,
  ...CREATOR_TOURS,
  ...SEPA_TOURS,
  ...XR_TOURS,
  ...SETTINGS_TOURS,
  ...UMZUG_TOURS,
  ...MEMORY_TOURS,
  ...SALES_TOURS,
  ...CONNECT_TOURS,
  ...AGENCY_TOURS,
];
export const TOURS: Tour[] = [...JOURNEY, ...MODULE_TOURS];

export const GROUPS: { id: TourGroup; label: string; icon: IconName }[] = [
  { id: 'start', label: 'Erste Schritte', icon: 'academy' },
  { id: 'company', label: 'Kurs: Deine Firma führen', icon: 'trophy' },
  { id: 'crm', label: 'Kunden & Tagesgeschäft', icon: 'contacts' },
  { id: 'marketing', label: 'Marketing', icon: 'campaigns' },
  { id: 'sites', label: 'Websites, Kurse & Community', icon: 'website' },
  { id: 'revenue', label: 'Umsatz', icon: 'invoices' },
  { id: 'reputation', label: 'Reputation', icon: 'reviews' },
  { id: 'service', label: 'Service & Support', icon: 'service' },
  { id: 'ai', label: 'KI', icon: 'ai' },
  { id: 'settings', label: 'Einstellungen & Kanäle', icon: 'settings' },
  { id: 'agency', label: 'Agentur & Betrieb', icon: 'agency' },
];

// --- language ---------------------------------------------------------------------------------
// Tour texts are module-level data in German (the message ids). They are translated where they are read: every
// function below that hands tours to the screen returns them in the active language (x_tours_a, x_tours_b, core).
const tA = tr('x_tours_a');
const tB = tr('x_tours_b');
const german = () => getLocale() === SOURCE_LOCALE;

/** A German tour text (title, step text, keyword …) in the active language; unknown texts stay German. */
export function tourText(s: string): string;
export function tourText(s: string | undefined): string | undefined;
export function tourText(s: string | undefined): string | undefined {
  if (!s || german()) return s;
  const a = tA(s);
  return a !== s ? a : tB(s);
}

/** Loads both tour catalogs (suspends inside the page's Suspense boundary) and re-renders on a language switch. */
export function useTourText() {
  useT('x_tours_a');
  useT('x_tours_b');
  return tourText;
}

/** A step with its texts in the active language. `demo.fill` changes only when it is a translated sample text. */
export function localizeStep<S extends TourStep>(s: S): S {
  if (german()) return s;
  const demo = s.demo ? { ...s.demo, label: tourText(s.demo.label), fill: tourText(s.demo.fill) } : undefined;
  return { ...s, title: tourText(s.title), text: tourText(s.text), do: tourText(s.do), missing: tourText(s.missing), demo };
}

const localized = new WeakMap<Tour, { l: string; probe: string; out: Tour }>();
/** A tour with every text in the active language (cached per language; renewed once a catalog has loaded). */
export function localizeTour(t: Tour): Tour {
  if (german()) return t;
  const l = getLocale();
  const probe = `${tourText(t.title)}|${tourText(t.steps[0]?.text ?? '')}`;
  const hit = localized.get(t);
  if (hit && hit.l === l && hit.probe === probe) return hit.out;
  const out: Tour = {
    ...t,
    title: tourText(t.title),
    summary: tourText(t.summary),
    keywords: t.keywords && tourText(t.keywords),
    learned: t.learned.map((x) => tourText(x)),
    docs: t.docs && { ...t.docs, label: tourText(t.docs.label) },
    steps: t.steps.map(localizeStep),
  };
  localized.set(t, { l, probe, out });
  return out;
}
const localizeAll = (list: Tour[]) => (german() ? list : list.map(localizeTour));
const rawById = new Map(TOURS.map((t) => [t.id, t]));

/** A group's label in the active language. */
export const groupLabel = (g: { label: string }) => tB(g.label);

export const tourById = (id: string) => {
  const t = rawById.get(id) ?? TOURS.find((x) => x.id === id);
  return t && localizeTour(t);
};

/** Who is looking: agency admin or a (possibly restricted) member. */
export interface Access {
  admin: boolean;
  can: (perm: string) => boolean;
}

export const tourVisible = (t: Pick<Tour, 'admin' | 'perm'>, a: Access) => (!t.admin || a.admin) && (!t.perm || a.can(t.perm));
export const stepVisible = (s: TourStep, a: Access) => (!s.admin || a.admin) && (!s.perm || a.can(s.perm));
export const visibleTours = (a: Access, list: Tour[] = TOURS) => localizeAll(list.filter((t) => tourVisible(t, a)));

/** Tours the „?“ button offers on a page (`settings/telephony`, `contacts/123` …), most specific first. */
export function toursForPath(path: string, a: Access): Tour[] {
  const p = path.replace(/^\/+|\/+$/g, '');
  const score = (t: Tour) => Math.max(-1, ...(t.routes ?? []).map((r) => (p === r || p.startsWith(r + '/') ? r.length : -1)));
  return visibleTours(a, MODULE_TOURS)
    .map((t) => [t, score(t)] as const)
    .filter(([, s]) => s >= 0)
    .sort((x, y) => y[1] - x[1])
    .map(([t]) => t);
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export function searchTours(list: Tour[], q: string): Tour[] {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list.filter((t) => {
    // German and translated texts both count, so a search in either language finds the tour.
    const raw = rawById.get(t.id);
    const texts = (x: Tour) => [x.title, x.summary, x.keywords ?? '', ...x.steps.map((s) => s.title)];
    const hay = norm([...texts(t), ...(raw && raw !== t ? texts(raw) : []), ...(german() ? [] : texts(localizeTour(raw ?? t)))].join(' '));
    return words.every((w) => hay.includes(w));
  });
}

/** Share of the journey's (visible) chapters done, 0–1, plus the chapter to continue with. */
export function journeyStatus(progress: Record<string, TourProgress>, a: Access) {
  const chapters = visibleTours(a, JOURNEY);
  const done = chapters.filter((c) => progress[c.id]?.done).length;
  const next = chapters.find((c) => !progress[c.id]?.done) ?? null;
  return { chapters, done, total: chapters.length, share: chapters.length ? done / chapters.length : 0, next };
}

export interface Badge {
  id: string;
  label: string;
  hint: string;
  icon: IconName;
  earned: boolean;
}

/** Small rewards for finished tours. Group badges only count when the person can see that group. */
export function badges(progress: Record<string, TourProgress>, a: Access): Badge[] {
  const tb = tr('x_tours_b');
  const done = (t: Tour) => !!progress[t.id]?.done;
  const mods = visibleTours(a, MODULE_TOURS);
  const group = (g: TourGroup) => mods.filter((t) => t.group === g);
  const all = (list: Tour[]) => list.length > 0 && list.every(done);
  const out: Badge[] = [
    { id: 'first', label: tb('Erste Tour'), hint: tb('Eine Tour bis zum Ende gemacht'), icon: 'flag', earned: visibleTours(a).some(done) },
    { id: 'start', label: tb('Orientiert'), hint: tb('Alle Touren unter „Erste Schritte“'), icon: 'academy', earned: all(group('start')) },
    { id: 'company', label: tb('Firma im Griff'), hint: tb('Alle Lektionen des Kurses „Deine Firma führen“'), icon: 'trophy', earned: all(group('company')) },
    { id: 'crm', label: tb('CRM-Profi'), hint: tb('Alle Touren zu Kunden & Tagesgeschäft'), icon: 'contacts', earned: all(group('crm')) },
    { id: 'marketing', label: tb('Marketing-Profi'), hint: tb('Alle Marketing-Touren'), icon: 'campaigns', earned: all(group('marketing')) },
    { id: 'sites', label: tb('Seiten-Baumeister'), hint: tb('Alle Touren zu Websites, Kursen & Community'), icon: 'website', earned: all(group('sites')) },
    { id: 'revenue', label: tb('Umsatz-Profi'), hint: tb('Alle Umsatz-Touren'), icon: 'invoices', earned: all(group('revenue')) },
    { id: 'reputation', label: tb('Gut bewertet'), hint: tb('Alle Touren zu Bewertungen und Google'), icon: 'reviews', earned: all(group('reputation')) },
    { id: 'service', label: tb('Service-Held'), hint: tb('Alle Touren zu Service & Support'), icon: 'service', earned: all(group('service')) },
    { id: 'ai', label: tb('KI-Pionier'), hint: tb('Alle KI-Touren'), icon: 'ai', earned: all(group('ai')) },
    { id: 'settings', label: tb('Einstellungs-Kenner'), hint: tb('Alle Touren zu Einstellungen & Kanälen'), icon: 'settings', earned: all(group('settings')) },
  ];
  if (a.admin) out.push({ id: 'agency', label: tb('Agentur-Chef'), hint: tb('Alle Agentur-Touren'), icon: 'agency', earned: all(group('agency')) });
  const j = visibleTours(a, JOURNEY);
  out.push({ id: 'journey', label: tb('Firma übernommen'), hint: tb('Alle Kapitel von „Firma übernehmen“'), icon: 'trophy', earned: all(j) });
  out.push({ id: 'all', label: tb('Absolvent'), hint: tb('Wirklich alle Touren der Akademie'), icon: 'award', earned: all(visibleTours(a)) });
  // Groups this person cannot see at all give no badge.
  return out.filter((b) => !(['start', 'company', 'crm', 'marketing', 'sites', 'revenue', 'reputation', 'service', 'ai', 'settings', 'agency'] as string[]).includes(b.id) || group(b.id as TourGroup).length > 0);
}

export type RunStep = TourStep & { special?: 'context' | 'outro' };

/**
 * The steps this person sees: optional practice intro, the visible steps, and the „Geschafft“ card.
 * A step without its own route plays on the page of the step before – unless that one was an action
 * that changes the screen (click, navigate, wait); this way jumping back or resuming opens the right page.
 */
export function composeSteps(tour: Tour, a: Access): RunStep[] {
  let page: string | undefined;
  const steps: RunStep[] = tour.steps
    .filter((s) => stepVisible(s, a))
    .map((s) => {
      const out = s.route || !page ? s : { ...s, route: page };
      if (s.route) page = s.route;
      if (s.kind === 'click' || s.kind === 'navigate' || s.kind === 'wait') page = undefined;
      return out;
    });
  const tb = tr('x_tours_b');
  const intro: RunStep[] = tour.practice && a.admin ? [{ special: 'context', title: tb('Wo möchtest du üben?'), text: tb('In dieser Tour legst du selbst etwas an. Am besten übst du in der **Übungs-Firma** – dort sind alle Kunden erfunden und nichts wird verschickt.') }] : [];
  return [...intro, ...steps, { special: 'outro', title: tour.chapter ? tb('Kapitel {chapter} geschafft!', { chapter: tour.chapter }) : tb('Geschafft!'), text: tb('Das hast du gelernt:') }];
}

/** Where a resumed tour starts: the step itself, or the last one before it that opens its own page. */
export function resumeIndex(steps: RunStep[], at: number): number {
  let i = Math.max(0, Math.min(at, steps.length - 1));
  while (i > 0 && !steps[i].route && !steps[i].special) i--;
  return i;
}

/** Every `data-tour` key the tours point at (used by the test that checks they exist in the code). */
export function tourTargets(list: Tour[] = TOURS): { tour: string; step: number; target: string }[] {
  const out: { tour: string; step: number; target: string }[] = [];
  for (const t of list) t.steps.forEach((s, i) => s.target && out.push({ tour: t.id, step: i, target: s.target }));
  return out;
}
