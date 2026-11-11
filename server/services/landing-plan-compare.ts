import { escapeHtml as h } from '../core/template.js';

/**
 * The fold-out feature comparison under the price cards: self-hosted and the three cloud plans, row by row.
 * It mirrors docs/cloud.md – every plan has every feature, except white-label, client accounts and custom
 * domains (Agentur only) and the SaaS mode (self-hosted only); `entitlements()` in services/cloud.ts is the source.
 */

/** y = included, n = not included, any other text is shown as it is. */
type Cell = 'y' | 'n' | string;
type Row = [label: string, self: Cell, solo: Cell, team: Cell, agency: Cell];
type Group = { title: string; rows: Row[] };
type CompareCopy = { summary: string; hint: string; yes: string; no: string; feature: string; groups: Group[] };

const all = (label: string): Row => [label, 'y', 'y', 'y', 'y'];
const agencyOnly = (label: string): Row => [label, 'y', 'n', 'n', 'y'];

const COPY: Record<'de' | 'en', CompareCopy> = {
  de: {
    summary: 'Alle Funktionen im Vergleich', // i18n-ignore
    hint: 'Jeder Tarif hat jede Funktion – nur White-Label, Kunden-Accounts und eigene Domains gibt es allein im Tarif Agentur.', // i18n-ignore
    yes: 'enthalten',
    no: 'nicht enthalten', // i18n-ignore
    feature: 'Funktion', // i18n-ignore
    groups: [
      {
        title: 'Für alle Tarife', // i18n-ignore
        rows: [
          ['Nutzer', 'unbegrenzt', '1', 'unbegrenzt', 'unbegrenzt'],
          all('Kontakte, Funnels und Workflows ohne Limit'), // i18n-ignore
          all('CRM, Pipelines und Deals'), // i18n-ignore
          all('Funnels, Websites und Blog'), // i18n-ignore
          all('E-Mail-Marketing und Kampagnen'), // i18n-ignore
          all('Posteingang: E-Mail, SMS, WhatsApp, Social'),
          all('Workflows und Automationen'), // i18n-ignore
          all('Kalender und Online-Buchung'), // i18n-ignore
          all('Kurse, Mitgliederbereich und Community'), // i18n-ignore
          all('Rechnungen, Angebote, ZUGFeRD und XRechnung'), // i18n-ignore
          all('Helpdesk und Wissensdatenbank'), // i18n-ignore
          all('Social-Media-Planer'),
          all('Jarvis, KI-Agenten und Sprachassistent'), // i18n-ignore
          all('MCP für Claude, ChatGPT, Codex und Cursor'), // i18n-ignore
          all('REST-API und Webhooks'), // i18n-ignore
          all('Akademie mit geführten Touren'), // i18n-ignore
          all('XR-Modus für Brillen und Headsets'), // i18n-ignore
          all('Designs, Themes und Icon-Packs'), // i18n-ignore
          all('Android-App und iPhone-Web-App'), // i18n-ignore
        ],
      },
      {
        title: 'Agentur und White-Label', // i18n-ignore
        rows: [
          agencyOnly('Kunden-Sub-Accounts mit eigenen Logins'), // i18n-ignore
          agencyOnly('White-Label: dein Name, Logo und Farben'), // i18n-ignore
          agencyOnly('Eigene Login-Domain und Domains für Kunden'), // i18n-ignore
          agencyOnly('App mit deinem Namen und Icon'), // i18n-ignore
          ['SaaS-Modus: eigene Tarife über dein Stripe verkaufen', 'y', 'n', 'n', 'n'], // i18n-ignore
        ],
      },
      {
        title: 'Betrieb',
        rows: [
          ['Hosting, Updates und Backups', 'machst du', 'y', 'y', 'y'], // i18n-ignore
          ['Serverstandort', 'dein Server', 'Frankfurt', 'Frankfurt', 'Frankfurt'], // i18n-ignore
          ['Support', 'Community', 'E-Mail', 'E-Mail', 'E-Mail'],
        ],
      },
    ],
  },
  en: {
    summary: 'Compare every feature', // i18n-ignore
    hint: 'Every plan has every feature – only white-label, client accounts and custom domains are Agency-only.',
    yes: 'included',
    no: 'not included',
    feature: 'Feature', // i18n-ignore
    groups: [
      {
        title: 'In every plan', // i18n-ignore
        rows: [
          ['Users', 'unlimited', '1', 'unlimited', 'unlimited'], // i18n-ignore
          all('Unlimited contacts, funnels and workflows'),
          all('CRM, pipelines and deals'),
          all('Funnels, websites and blog'),
          all('Email marketing and campaigns'),
          all('Inbox: email, SMS, WhatsApp, social'),
          all('Workflows and automations'),
          all('Calendar and online booking'),
          all('Courses, members area and community'),
          all('Invoices, quotes, ZUGFeRD and XRechnung'),
          all('Helpdesk and knowledge base'),
          all('Social media planner'),
          all('Jarvis, AI agents and voice assistant'),
          all('MCP for Claude, ChatGPT, Codex and Cursor'),
          all('REST API and webhooks'),
          all('Academy with guided tours'),
          all('XR mode for glasses and headsets'),
          all('Designs, themes and icon packs'),
          all('Android app and iPhone web app'),
        ],
      },
      {
        title: 'Agency and white-label', // i18n-ignore
        rows: [
          agencyOnly('Client sub-accounts with their own logins'),
          agencyOnly('White-label: your name, logo and colours'),
          agencyOnly('Your own login domain and client domains'),
          agencyOnly('App with your name and icon'),
          ['SaaS mode: sell your own plans through your Stripe', 'y', 'n', 'n', 'n'],
        ],
      },
      {
        title: 'Operations', // i18n-ignore
        rows: [
          ['Hosting, updates and backups', 'you', 'y', 'y', 'y'],
          ['Server location', 'your server', 'Frankfurt', 'Frankfurt', 'Frankfurt'], // i18n-ignore
          ['Support', 'community', 'email', 'email', 'email'],
        ],
      },
    ],
  },
};

const TICK = '<svg class="pc-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
const DASH = '<svg class="pc-i pc-no" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg>';

function cell(c: Cell, t: CompareCopy): string {
  if (c === 'y') return `<td>${TICK}<span class="sr">${h(t.yes)}</span></td>`;
  if (c === 'n') return `<td>${DASH}<span class="sr">${h(t.no)}</span></td>`;
  return `<td class="pc-t">${h(c)}</td>`;
}

/** `names`: the column heads – self-hosted, Solo, Team & Company, Agentur – as the price cards call them. */
export function planCompare(lang: 'de' | 'en', names: [string, string, string, string]): string {
  const t = COPY[lang];
  const head = `<thead><tr><th scope="col">${h(t.feature)}</th>${names.map((n, i) => `<th scope="col"${i === 3 ? ' class="pc-wl"' : ''}>${h(n)}</th>`).join('')}</tr></thead>`;
  const body = t.groups
    .map((g) => `<tbody><tr class="pc-g"><th scope="rowgroup" colspan="5">${h(g.title)}</th></tr>${g.rows.map(([label, ...cells]) => `<tr><th scope="row">${h(label)}</th>${cells.map((c) => cell(c, t)).join('')}</tr>`).join('')}</tbody>`)
    .join('');
  return `<details class="pc"><summary>${h(t.summary)}</summary><p class="pc-hint">${h(t.hint)}</p><div class="pc-scroll" tabindex="0" role="region" aria-label="${h(t.summary)}"><table>${head}${body}</table></div></details>`;
}

/** Rows and labels for tests. */
export const PLAN_COMPARE_COPY = COPY;

export const PLAN_COMPARE_CSS = `
/* the fold-out feature comparison under the price cards */
.pc{margin:22px 0 0;background:var(--card);border:1px solid var(--line);border-radius:22px;max-width:100%;min-width:0;overflow:hidden}
.pc-scroll{max-width:100%;position:relative}
.pc summary{cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 22px;font-family:var(--display);font-weight:600;font-size:18px;min-height:44px}
.pc summary::-webkit-details-marker{display:none}
.pc summary::after{content:"";width:10px;height:10px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(45deg);transition:transform .2s;margin-right:4px}
.pc[open] summary::after{transform:rotate(-135deg)}
.pc summary:focus-visible{outline:3px solid var(--accent);outline-offset:2px;border-radius:22px}
.pc-hint{margin:0 22px 12px;color:var(--muted);font-size:15px}
.pc-scroll{overflow-x:auto;padding:0 8px 14px;-webkit-overflow-scrolling:touch}
.pc table{width:100%;min-width:640px;border-collapse:collapse;font-size:15px}
.pc th,.pc td{padding:9px 12px;text-align:center;border-bottom:1px solid var(--line)}
.pc thead th{font-size:14px;font-weight:600;position:sticky;top:0;background:var(--card)}
.pc thead th.pc-wl{color:var(--accent2)}
.pc tbody th[scope=row]{text-align:left;font-weight:500}
.pc .pc-g th{text-align:left;font-family:var(--display);font-weight:600;font-size:14px;letter-spacing:.02em;color:var(--muted);padding-top:18px;border-bottom:none}
.pc-i{width:18px;height:18px;fill:none;stroke:var(--ok);stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round;vertical-align:middle}
.pc-i.pc-no{stroke:#b9bcc4}
.pc td.pc-t{font-size:14px;color:var(--muted)}
`;
