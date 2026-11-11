import type { Manifest } from './manifest.js';
import { tApp } from '../../i18n/index.js';

/**
 * What a new version changed against the one before it, in words ("Ändern lassen" → v2): permissions, entry
 * points, size of the UI and server code. Shown in the chat, in the version list and in the build log.
 */

export interface VersionLike {
  version: string;
  manifest: Manifest;
  ui_html: string;
  server_js: string;
  steps: unknown;
}

export interface VersionDiff {
  from: string;
  to: string;
  scopes_added: string[];
  scopes_removed: string[];
  entries_added: string[];
  entries_removed: string[];
  ui: { added: number; removed: number };
  server: { added: number; removed: number };
  steps_changed: boolean;
  /** Plain German, one line each, for the chat card. */
  summary: string[];
}

const lines = (s: string) => (s ? s.split('\n').map((l) => l.trim()).filter(Boolean) : []);

/** Added and removed lines (LCS on trimmed non-empty lines; very large inputs fall back to a set comparison). */
export function lineDiff(a: string, b: string): { added: number; removed: number } {
  const x = lines(a);
  const y = lines(b);
  if (x.length * y.length > 4_000_000) {
    const sx = new Set(x);
    const sy = new Set(y);
    return { added: y.filter((l) => !sx.has(l)).length, removed: x.filter((l) => !sy.has(l)).length };
  }
  const dp: number[] = new Array(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    let prev = 0;
    for (let j = 1; j <= y.length; j++) {
      const tmp = dp[j];
      dp[j] = x[i - 1] === y[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  const common = dp[y.length];
  return { added: y.length - common, removed: x.length - common };
}

const entryNames = (m: Manifest): string[] => [
  ...(m.entries.page ? [tApp()('Seite')] : []),
  ...(m.entries.panels ?? []).map((p) => tApp()('Panel „{name}“', { name: p.title })),
  ...(m.entries.widgets ?? []).map((w) => tApp()('Widget „{name}“', { name: w.title })),
  ...(m.entries.actions ?? []).map((a) => tApp()('Workflow-Aktion „{name}“', { name: a.label })),
  ...(m.entries.jobs ?? []).map((j) => tApp()('Job „{name}“', { name: j.label })),
];

export function diffVersions(prev: VersionLike, next: VersionLike): VersionDiff {
  const ps = new Set(prev.manifest.scopes);
  const ns = new Set(next.manifest.scopes);
  const pe = entryNames(prev.manifest);
  const ne = entryNames(next.manifest);
  const ui = lineDiff(prev.ui_html, next.ui_html);
  const server = lineDiff(prev.server_js, next.server_js);
  const steps_changed = JSON.stringify(prev.steps ?? null) !== JSON.stringify(next.steps ?? null);
  const d: VersionDiff = {
    from: prev.version,
    to: next.version,
    scopes_added: [...ns].filter((s) => !ps.has(s)),
    scopes_removed: [...ps].filter((s) => !ns.has(s)),
    entries_added: ne.filter((e) => !pe.includes(e)),
    entries_removed: pe.filter((e) => !ne.includes(e)),
    ui,
    server,
    steps_changed,
    summary: [],
  };
  const s = d.summary;
  if (d.scopes_added.length) s.push(tApp().plural(d.scopes_added.length, { one: 'Neue Berechtigung: {list} – braucht deine Bestätigung.', other: 'Neue Berechtigungen: {list} – braucht deine Bestätigung.' }, { list: d.scopes_added.join(', ') }));
  if (d.scopes_removed.length) s.push(tApp()('Weniger Berechtigungen: {list}.', { list: d.scopes_removed.join(', ') }));
  if (d.entries_added.length) s.push(tApp()('Neu: {list}.', { list: d.entries_added.join(', ') }));
  if (d.entries_removed.length) s.push(tApp()('Entfernt: {list}.', { list: d.entries_removed.join(', ') }));
  if (ui.added || ui.removed) s.push(tApp()('Oberfläche: {added} Zeilen neu, {removed} entfernt.', { added: ui.added, removed: ui.removed }));
  if (server.added || server.removed) s.push(tApp()('Server-Logik: {added} Zeilen neu, {removed} entfernt.', { added: server.added, removed: server.removed }));
  if (steps_changed) s.push(tApp()('Die deklarativen Schritte wurden angepasst.'));
  if (!s.length) s.push(tApp()('Keine inhaltliche Änderung gegenüber der Vorversion.'));
  return d;
}
