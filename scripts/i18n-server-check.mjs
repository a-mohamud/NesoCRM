#!/usr/bin/env node
/**
 * Neso fork – translation check for the server (server/i18n). Like i18n-check.mjs, but for server/ and its catalogs.
 *
 *   node scripts/i18n-server-check.mjs            # every area in server/i18n/registry.json
 *   node scripts/i18n-server-check.mjs s03        # one area (prints up to 60 findings, --all for every one)
 *
 * Findings: untranslated – a German text in an area's file that is neither inside t() nor a catalog key (error messages
 * and other data texts count as handled once they are catalog keys); missing – a t() text without an English entry;
 * placeholders – an English entry whose {placeholders} differ from the German. A line may opt out with `i18n-ignore`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { repoRoot, scanSource } from './i18n-check.mjs';

const reg = JSON.parse(readFileSync(join(repoRoot, 'server/i18n/registry.json'), 'utf8'));
const want = process.argv[2] && !process.argv[2].startsWith('--') ? [process.argv[2]] : Object.keys(reg);
const all = process.argv.includes('--all');

function readCatalog(rel) {
  const sf = ts.createSourceFile(rel, readFileSync(join(repoRoot, rel), 'utf8'), ts.ScriptTarget.Latest, true);
  const out = new Map();
  sf.forEachChild((s) => {
    if (!ts.isExportAssignment(s)) return;
    let e = s.expression;
    while (ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isParenthesizedExpression(e)) e = e.expression;
    if (!ts.isObjectLiteralExpression(e)) return;
    for (const p of e.properties) {
      if (!ts.isPropertyAssignment(p) || !p.name) continue;
      const key = ts.isStringLiteral(p.name) || ts.isIdentifier(p.name) || ts.isNoSubstitutionTemplateLiteral(p.name) ? p.name.text : undefined;
      if (key === undefined) continue;
      const v = p.initializer;
      const value = ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v) ? v.text : ts.isObjectLiteralExpression(v) ? Object.fromEntries(v.properties.filter(ts.isPropertyAssignment).map((q) => [q.name.getText(sf), ts.isStringLiteral(q.initializer) ? q.initializer.text : ''])) : undefined;
      out.set(key, { value, line: sf.getLineAndCharacterOfPosition(p.getStart(sf)).line + 1 });
    }
  });
  return out;
}

const cats = Object.fromEntries(Object.keys(reg).map((ns) => [ns, readCatalog(`server/i18n/en/${ns}.ts`)]));
const keys = new Set(Object.values(cats).flatMap((c) => [...c.keys()]));
const findings = [];
const tokens = (s) => new Set([...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
for (const ns of want) {
  for (const f of reg[ns] ?? []) {
    let src;
    try { src = readFileSync(join(repoRoot, f), 'utf8'); } catch { findings.push({ rule: 'registry', file: f, line: 0, text: 'file missing', ns }); continue; }
    const r = scanSource(f, src, { catalogKeys: keys });
    for (const u of r.untranslated) findings.push({ rule: 'untranslated', file: f, line: u.line, text: u.text, ns });
    for (const c of r.calls) if (!keys.has(c.key)) findings.push({ rule: 'missing', file: f, line: c.line, text: c.key, ns });
  }
  for (const [key, { value, line }] of cats[ns]) {
    const vals = typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value) : [];
    for (const v of vals) for (const tok of tokens(v)) if (!tokens(key).has(tok) && tok !== 'n') findings.push({ rule: 'placeholders', file: `server/i18n/en/${ns}.ts`, line, text: `${key} → ${v}`, ns });
  }
}
const seen = new Set();
const uniq = findings.filter((x) => { const k = `${x.rule}|${x.file}|${x.text}`; if (seen.has(k)) return false; seen.add(k); return true; });
const count = {};
for (const x of uniq) count[x.rule] = (count[x.rule] || 0) + 1;
console.log(want.length === 1 ? want[0] : 'server', uniq.length ? JSON.stringify(count) : 'CLEAN');
for (const x of uniq.slice(0, all ? 1e9 : 60)) console.log(`${x.rule}\t${x.file}:${x.line}\t${x.text.slice(0, 160)}`);
process.exitCode = uniq.length ? 1 : 0;
