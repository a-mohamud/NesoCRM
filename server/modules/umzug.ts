import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { App, Module } from '../core/app.js';
import { parseJson } from '../core/db.js';
import { HttpError, bad, clampLimit, notFound, str, type Ctx } from '../core/http.js';
import { openSecret, sealSecret } from '../core/secrets.js';
import { id, now } from '../core/util.js';
import { PART_KEYS, parseTarget, cleanOptions, type Mapping, type PartKey, type SourceDef, type SourceField, type SourceKey, isSourceKey, type CountRow } from '../services/umzug-core.js';
import { Cancelled, buildPreview, emptyProgress, jobRow, reportLines, runJob, undoJob, type JobInput, type JobRow, type Progress, type PreviewResult } from '../services/umzug-engine.js';
import { FILE_KINDS, detectLabel, fileContactFields, fileCounts, fileParts, fileSteps, guessKind, isFileKind, parseUpload, tableInfo, type FileKind, type LoadedFile, type Table } from '../services/umzug-files.js';
import { UmzugError } from '../services/umzug-http.js';
import { SOURCES, sourceList } from '../services/umzug-sources.js';
import { tCtx, tLoc, type STFn } from '../i18n/index.js';

/**
 * Umzug zu HyperLevel: the wizard behind Einstellungen → Umzug (API connections, export files, preview with field
 * mapping, dry run, resumable import as a background job, report, undo). The sources live in
 * services/umzug-*.ts; this module owns the tables, the credentials (sealed, never returned), the uploaded files
 * and the routes. Test hooks: app.services.umzugFetch / umzugSleep / umzugPauseMs (all vendor HTTP).
 */

const maxMb = () => Math.max(1, Math.min(500, Number(process.env.PGHL_UMZUG_MAX_MB) || 50));
const FILE_TTL_DAYS = 14;
const UNDO_DAYS = 30;

/** One job (import, dry run or undo) per sub-account at a time. */
const running = new Map<string, { jobId: string; cancel: boolean }>();

const MAP_MAX = 600;
/** A mapping from the browser: refs are only labels (unknown ones never match), every target is parsed again. */
export function looseMapping(input: unknown): Mapping {
  const out: Mapping = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  let n = 0;
  for (const [ref, t] of Object.entries(input as Record<string, unknown>)) {
    if (++n > MAP_MAX || ref.length > 200) break;
    const p = parseTarget(t);
    out[ref] = p.kind === 'skip' ? '' : p.kind === 'new' ? `new:${p.type}:${p.label}` : p.kind === 'tag' ? `tag:${p.prefix}`.replace(/^tag:$/, 'tag') : p.kind === 'custom' ? `custom:${p.key}` : p.kind === 'std' ? p.field : 'note';
  }
  return out;
}

/** The source registry is German data (services/umzug-*.ts); it is translated here, for the person asking. */
const publicSource = (d: SourceDef, t: STFn) => ({
  key: d.key,
  label: d.label,
  tagline: t(d.tagline),
  credentials: d.credentials.map((c) => ({ key: c.key, label: t(c.label), secret: !!c.secret, placeholder: c.placeholder ? t(c.placeholder) : '', hint: c.hint ? t(c.hint) : '', optional: !!c.optional })),
  howto: d.howto.map((x) => t(x)),
  limits: d.limits.map((x) => t(x)),
  parts: d.parts.map((x) => ({ ...x, label: t(x.label), ...(x.note ? { note: t(x.note) } : {}) })),
  exports: d.exports.map((x) => ({ ...x, label: t(x.label), describe: t(x.describe) })),
});

export const umzugModule: Module = {
  name: 'umzug',
  migrations: [
    [
      '001-init',
      `
      CREATE TABLE umzug_connections (
        id TEXT PRIMARY KEY, location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
        source TEXT NOT NULL, label TEXT NOT NULL DEFAULT '', account TEXT NOT NULL,
        secret_sealed TEXT NOT NULL, hint TEXT NOT NULL DEFAULT '', meta TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(location_id, source)
      );
      CREATE TABLE umzug_files (
        id TEXT PRIMARY KEY, location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
        source TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, size INTEGER NOT NULL, file TEXT NOT NULL,
        meta TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
      );
      CREATE INDEX umzug_files_loc ON umzug_files(location_id, created_at);
      CREATE TABLE umzug_jobs (
        id TEXT PRIMARY KEY, location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
        source TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, origin TEXT NOT NULL DEFAULT 'api',
        connection_id TEXT, file_ids TEXT NOT NULL DEFAULT '[]', parts TEXT NOT NULL DEFAULT '[]',
        options TEXT NOT NULL DEFAULT '{}', mapping TEXT NOT NULL DEFAULT '{}', progress TEXT NOT NULL DEFAULT '{}',
        result TEXT, log TEXT NOT NULL DEFAULT '[]', warnings TEXT NOT NULL DEFAULT '[]', error TEXT,
        created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, finished_at TEXT, undone_at TEXT
      );
      CREATE INDEX umzug_jobs_loc ON umzug_jobs(location_id, created_at);
      CREATE TABLE umzug_ids (
        location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
        ns TEXT NOT NULL, kind TEXT NOT NULL, ext_id TEXT NOT NULL, local_id TEXT NOT NULL, extra TEXT,
        job_id TEXT, updated_at TEXT NOT NULL, PRIMARY KEY (location_id, ns, kind, ext_id)
      );
      CREATE INDEX umzug_ids_local ON umzug_ids(location_id, local_id);
      CREATE TABLE umzug_items (
        job_id TEXT NOT NULL REFERENCES umzug_jobs(id) ON DELETE CASCADE,
        kind TEXT NOT NULL, local_id TEXT NOT NULL, ext_id TEXT NOT NULL DEFAULT '',
        created INTEGER NOT NULL DEFAULT 1, before TEXT, PRIMARY KEY (job_id, kind, local_id)
      );
      `,
    ],
  ],
  register(app) {
    const { db, router } = app;
    const dir = join(app.config.dataDir, 'umzug');
    // A restart stops running jobs – they continue with "Fortsetzen" (undo: call it again).
    db.run(`UPDATE umzug_jobs SET status = 'interrupted', updated_at = ? WHERE status IN ('running', 'undoing')`, now());

    const deps = () => ({ fetch: app.services.umzugFetch, sleep: app.services.umzugSleep, pauseMs: app.services.umzugPauseMs });
    const uiOnly = (ctx: Ctx) => {
      if (ctx.viaApiKey || (ctx.via && ctx.via !== 'session' && ctx.via !== 'app')) throw new HttpError(403, 'Zugangsdaten trägst du nur in der Oberfläche ein');
    };
    const actor = (ctx: Ctx) => (ctx.user && ctx.via !== 'agency_key' && ctx.via !== 'mcp' && ctx.via !== 'api_key' ? ctx.user.id : null);

    // --- the vendor connections (credentials sealed as one blob) ------------------------------------------------------
    const connRow = (loc: string, source: string) => db.get<any>('SELECT * FROM umzug_connections WHERE location_id = ? AND source = ?', loc, source);
    const connOut = (c: any) => (c ? { connected: true, source: c.source, label: c.label, hint: c.hint, account: c.account, updated_at: c.updated_at } : { connected: false });
    const credsOf = (c: any): Record<string, string> => {
      try {
        return JSON.parse(openSecret(app, c.secret_sealed));
      } catch {
        throw bad('Gespeicherte Zugangsdaten sind nicht lesbar – bitte neu verbinden');
      }
    };

    router.get('/api/umzug', 'location', (ctx) => ({
      sources: sourceList().map((d) => publicSource(d, tCtx(ctx))),
      file_kinds: FILE_KINDS.map((k) => ({ ...k, label: tCtx(ctx)(k.label), describe: tCtx(ctx)(k.describe) })),
      connections: Object.fromEntries(sourceList().map((s) => [s.key, connOut(connRow(ctx.locationId, s.key))])),
      jobs: parseJobs(ctx.locationId, 10, tCtx(ctx)),
      files: filesOf(ctx.locationId),
      max_upload_mb: maxMb(),
    }));

    router.put('/api/umzug/connections/:source', 'location', async (ctx) => {
      uiOnly(ctx);
      const t = tCtx(ctx);
      const def = sourceOf(ctx.params.source);
      const creds: Record<string, string> = {};
      for (const f of def.credentials) {
        let v = str(ctx.body?.[f.key], t(f.label), { max: 400 });
        if ((f.secret || f.key === 'api_key') && !f.password) v = v.replace(/\s+/g, '');
        if (!v && !f.optional) throw bad(t('{label} fehlt', { label: t(f.label) }));
        if (v) creds[f.key] = v;
      }
      if (running.has(ctx.locationId)) throw bad('Es läuft gerade ein Umzug – bitte erst abwarten oder pausieren');
      let acc;
      try {
        acc = await def.connect(creds, deps());
      } catch (e) {
        if (e instanceof UmzugError) throw bad(e.message);
        throw bad(t('{source} nicht erreichbar: {reason}', { source: def.label, reason: (e as Error).message }));
      }
      // The hint shows the last characters of the key – never of a password.
      const secretKey = def.credentials.find((c) => c.secret && !c.password)?.key ?? (def.credentials.some((c) => c.password) ? '' : def.credentials[0].key);
      const row = { label: acc.label.slice(0, 120), account: acc.account.slice(0, 120), secret_sealed: sealSecret(app, JSON.stringify(acc.secrets ?? creds)), hint: secretKey ? `…${String(creds[secretKey] ?? '').replace(/-[a-z]{2,4}\d{1,3}$/, '').slice(-4)}` : '', meta: acc.meta ?? {}, updated_at: now() };
      if (connRow(ctx.locationId, def.key)) db.update('umzug_connections', connRow(ctx.locationId, def.key).id, row);
      else db.insert('umzug_connections', { id: id(), location_id: ctx.locationId, source: def.key, created_at: now(), ...row });
      return connOut(connRow(ctx.locationId, def.key));
    });
    router.delete('/api/umzug/connections/:source', 'location', (ctx) => {
      uiOnly(ctx);
      const def = sourceOf(ctx.params.source);
      if (running.has(ctx.locationId)) throw bad('Es läuft gerade ein Umzug');
      db.run('DELETE FROM umzug_connections WHERE location_id = ? AND source = ?', ctx.locationId, def.key);
      return connOut(undefined);
    });

    // --- uploaded export files ---------------------------------------------------------------------------------------------
    const prev = app.services.rawBodyLimit;
    app.services.rawBodyLimit = (method: string, path: string, req: any, cookies: Record<string, string>): number | undefined =>
      method === 'POST' && path === '/api/umzug/files' && (cookies.pghl_session || req.headers.authorization) ? maxMb() * 1024 * 1024 + 4096 : prev?.(method, path, req, cookies);

    const fileOut = (r: any) => ({ id: r.id, source: r.source, kind: r.kind, name: r.name, size: r.size, created_at: r.created_at, ...(typeof r.meta === 'string' ? JSON.parse(r.meta) : r.meta) });
    const filesOf = (loc: string) => db.all<any>('SELECT * FROM umzug_files WHERE location_id = ? ORDER BY created_at DESC LIMIT 50', loc).map(fileOut);
    const filePath = (f: { location_id: string; file: string }) => join(dir, f.location_id, f.file);
    const removeFile = (f: any) => {
      rmSync(filePath(f), { force: true });
      db.run('DELETE FROM umzug_files WHERE id = ?', f.id);
    };
    /** Parsed tables of a few recent files stay in memory (preview → dry run → import read the same file). */
    const cache = new Map<string, { at: number; tables: Table[] }>();
    const tablesOf = (f: any, t: STFn): Table[] => {
      const hit = cache.get(f.id);
      if (hit) return hit.tables;
      const p = filePath(f);
      if (!existsSync(p)) throw bad(t('Die Datei „{name}“ ist nicht mehr da – bitte noch einmal hochladen', { name: f.name }));
      const tables = parseUpload(f.name, readFileSync(p));
      cache.set(f.id, { at: Date.now(), tables });
      while (cache.size > 3) cache.delete([...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0][0]);
      return tables;
    };
    const loadFiles = (loc: string, ids: unknown, t: STFn = tLoc(app, loc)): LoadedFile[] => {
      const list = (Array.isArray(ids) ? ids : []).map(String).slice(0, 20);
      return list.map((fid) => {
        const f = db.get<any>('SELECT * FROM umzug_files WHERE id = ? AND location_id = ?', fid, loc);
        if (!f) throw notFound('Datei nicht gefunden');
        return { id: f.id, name: f.name, kind: f.kind as FileKind, tables: tablesOf(f, t) };
      });
    };

    router.post('/api/umzug/files', 'location', (ctx) => {
      const t = tCtx(ctx);
      const source = ctx.query.get('source') ?? '';
      if (!isSourceKey(source)) throw bad('Quelle fehlt oder unbekannt');
      const name = str(ctx.query.get('name'), t('Dateiname'), { required: true, max: 200 }).replace(/[\\/\u0000-\u001f]/g, '_');
      const buf = ctx.rawBuffer;
      if (!buf?.length) throw bad('Die Datei fehlt (Inhalt als Rohdaten im Body)');
      if (buf.length > maxMb() * 1024 * 1024) throw bad(t('Datei größer als {mb} MB (einstellbar mit PGHL_UMZUG_MAX_MB)', { mb: maxMb() }));
      if (Number(db.get<{ n: number }>('SELECT COUNT(*) n FROM umzug_files WHERE location_id = ?', ctx.locationId)?.n ?? 0) >= 30) throw bad('Es liegen schon 30 Dateien bereit – bitte alte löschen');
      let tables: Table[];
      try {
        tables = parseUpload(name, buf);
      } catch (e) {
        throw bad((e as Error).message);
      }
      const asked = ctx.query.get('kind');
      const kind: FileKind = isFileKind(asked) ? asked : guessKind(tables);
      const fid = id();
      const file = `${fid}-${randomBytes(6).toString('hex')}.bin`;
      mkdirSync(join(dir, ctx.locationId), { recursive: true });
      writeFileSync(join(dir, ctx.locationId, file), buf, { mode: 0o600 });
      const meta = { detected: detectLabel(source, tables, kind, t), tables: tables.slice(0, 20).map(tableInfo), rows: tables.reduce((n, t) => n + t.rows.length, 0) };
      db.insert('umzug_files', { id: fid, location_id: ctx.locationId, source, kind, name, size: buf.length, file, meta, created_at: now() });
      cache.set(fid, { at: Date.now(), tables });
      return fileOut(db.get('SELECT * FROM umzug_files WHERE id = ?', fid));
    });
    router.patch('/api/umzug/files/:id', 'location', (ctx) => {
      const f = db.get<any>('SELECT * FROM umzug_files WHERE id = ? AND location_id = ?', ctx.params.id, ctx.locationId);
      if (!f) throw notFound();
      if (!isFileKind(ctx.body?.kind)) throw bad('Unbekannte Art der Datei');
      db.update('umzug_files', f.id, { kind: ctx.body.kind }, ctx.locationId);
      return fileOut(db.get('SELECT * FROM umzug_files WHERE id = ?', f.id));
    });
    router.delete('/api/umzug/files/:id', 'location', (ctx) => {
      const f = db.get<any>('SELECT * FROM umzug_files WHERE id = ? AND location_id = ?', ctx.params.id, ctx.locationId);
      if (!f) throw notFound();
      cache.delete(f.id);
      removeFile(f);
      return { ok: true };
    });

    // --- preview ---------------------------------------------------------------------------------------------------------------
    const hits = new Map<string, number[]>();
    const throttle = (loc: string) => {
      const t = Date.now();
      const list = (hits.get(loc) ?? []).filter((x) => t - x < 3_600_000);
      if (list.length >= 30) throw new HttpError(429, 'Zu viele Vorschauen – bitte in einer Weile wieder versuchen');
      hits.set(loc, [...list, t]);
    };
    const cleanParts = (def: SourceDef | undefined, v: unknown, allowed: PartKey[]): PartKey[] => {
      const wanted = Array.isArray(v) && v.length ? v.map(String) : (def?.parts.filter((p) => p.on !== false).map((p) => p.key) ?? allowed);
      const parts = wanted.filter((p): p is PartKey => (PART_KEYS as readonly string[]).includes(p) && allowed.includes(p as PartKey));
      if (!parts.length) throw bad('Mindestens einen Teil wählen');
      return parts;
    };

    /** The input of a run: connection → vendor account, or the uploaded files. */
    const inputFor = (loc: string, job: { source: SourceKey; origin: 'api' | 'file'; connection_id: string | null; file_ids: string[] }): JobInput => {
      const def = SOURCES[job.source];
      if (job.origin === 'file') {
        const files = loadFiles(loc, job.file_ids);
        return { def: null, ns: `${job.source}:file`, creds: {}, meta: {}, deps: deps(), fileSteps: (parts) => fileSteps(job.source, files, parts) };
      }
      const c = job.connection_id ? db.get<any>('SELECT * FROM umzug_connections WHERE id = ? AND location_id = ?', job.connection_id, loc) : connRow(loc, job.source);
      if (!c) throw bad(tLoc(app, loc)('Erst {source} verbinden', { source: def.label }));
      return { def, ns: `${job.source}:${c.account}`, creds: credsOf(c), meta: JSON.parse(c.meta || '{}'), deps: deps() };
    };

    /** Which source, where from (connection or files) and which parts – no call to the vendor yet. */
    const resolve = (loc: string, body: any, t: STFn) => {
      const source = sourceOf(body?.source).key;
      const def = SOURCES[source];
      const fileIds: string[] = Array.isArray(body?.file_ids) ? body.file_ids.map(String) : [];
      if (fileIds.length || body?.origin === 'file') {
        const files = loadFiles(loc, fileIds, t);
        if (!files.length) throw bad('Bitte mindestens eine Datei hochladen');
        const parts = cleanParts(undefined, body?.parts, fileParts(files));
        return { source, def, origin: 'file' as const, connection: null as any, files, parts, ns: `${source}:file` };
      }
      const c = connRow(loc, source);
      if (!c) throw bad(t('Erst {source} verbinden oder eine Export-Datei hochladen', { source: def.label }));
      return { source, def, origin: 'api' as const, connection: c, files: [] as LoadedFile[], parts: cleanParts(def, body?.parts, def.parts.map((p) => p.key)), ns: `${source}:${c.account}` };
    };

    const previewOf = async (loc: string, body: any, t: STFn): Promise<{ preview: PreviewResult; origin: 'api' | 'file'; connection_id: string | null; file_ids: string[]; parts: PartKey[] }> => {
      const r = resolve(loc, body, t);
      if (r.origin === 'file') {
        const counts = fileCounts(r.files).filter((c) => r.parts.includes(c.part));
        const fields = fileContactFields(r.files.filter((f) => f.kind === 'contacts').flatMap((f) => f.tables), t);
        const preview = buildPreview(app, loc, r.source, 'file', translateDescribed({ counts, fields: r.parts.includes('contacts') ? fields : [], warnings: fileWarnings(r.files, r.def, t) }, t), r.ns, body?.mapping);
        return { preview, origin: 'file', connection_id: null, file_ids: r.files.map((f) => f.id), parts: r.parts };
      }
      const creds = credsOf(r.connection);
      const meta = JSON.parse(r.connection.meta || '{}');
      let described: { counts: CountRow[]; fields: SourceField[]; warnings: string[] };
      try {
        described = await r.def.describe(r.def.http(creds, meta, deps()), r.parts, { creds, meta, lang: t.locale });
      } catch (e) {
        throw bad(e instanceof UmzugError ? e.message : t('{source}: {reason}', { source: r.def.label, reason: (e as Error).message }));
      }
      const preview = buildPreview(app, loc, r.source, 'api', translateDescribed(described, t), r.ns, body?.mapping);
      if (r.parts.includes('students') && !r.parts.includes('contacts') && !preview.existing.contact) preview.warnings.push(t('Zugänge werden nur für Personen angelegt, die schon übernommen wurden – nimm „Kontakte“ mit dazu.'));
      return { preview, origin: 'api', connection_id: r.connection.id, file_ids: [], parts: r.parts };
    };
    /**
     * Labels and fixed warnings of a source are German catalog keys; texts built with a translator pass unchanged. Before
     * the automatic mapping, so a new custom field gets the label in the person's language.
     */
    const translateDescribed = (p: { counts: CountRow[]; fields: SourceField[]; warnings: string[] }, t: STFn) => ({
      ...p,
      counts: p.counts.map((c) => ({ ...c, label: t(c.label) })),
      fields: p.fields.map((f) => ({ ...f, label: t(f.label) })),
      warnings: p.warnings.map((w) => t(w)),
    });
    const fileWarnings = (files: LoadedFile[], def: SourceDef, t: STFn) => {
      const w: string[] = [];
      for (const f of files) if (f.kind === 'contacts' && !f.tables.some((tb) => tb.header.some((h) => /e-?mail/i.test(h)))) w.push(t('In „{name}“ habe ich keine E-Mail-Spalte gefunden – Kontakte ohne E-Mail und Telefon werden übersprungen.', { name: f.name }));
      if (files.some((f) => f.kind === 'students') && !files.some((f) => f.kind === 'contacts')) w.push(t('Zugänge legen die Personen bei Bedarf selbst an (per E-Mail).'));
      void def;
      return w;
    };

    router.post('/api/umzug/preview', 'location', async (ctx) => {
      throttle(ctx.locationId);
      const r = await previewOf(ctx.locationId, ctx.body, tCtx(ctx));
      return { ...r.preview, parts: r.parts, file_ids: r.file_ids };
    });

    // --- jobs -----------------------------------------------------------------------------------------------------------------------
    const parseJobs = (loc: string, limit: number, t: STFn) =>
      db
        .all<any>(`SELECT id, source, kind, status, origin, parts, progress, result, error, created_at, updated_at, finished_at, undone_at FROM umzug_jobs WHERE location_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`, loc, limit)
        .map((j) => jobSummary(parseJson({ ...j }, ['parts', 'progress', 'result']), t));
    // Stored labels (steps, report) are translated again on the way out: rows written in another language still read right.
    const jobSummary = (j: any, t: STFn) => ({ id: j.id, source: j.source, source_label: SOURCES[j.source as SourceKey]?.label ?? j.source, kind: j.kind, status: j.status, origin: j.origin, parts: j.parts, error: j.error ? t(j.error) : j.error, created_at: j.created_at, updated_at: j.updated_at, finished_at: j.finished_at, undone_at: j.undone_at, ...progressOut(j.progress, t), report: (j.result?.report ?? (j.progress?.stats ? reportLines(j.progress.stats, t) : [])).map((l: any) => ({ ...l, label: t(l.label) })), undo: j.result?.undo ? { ...j.result.undo, notes: (j.result.undo.notes ?? []).map((n: string) => t(n)) } : null });
    const progressOut = (p: Progress, t: STFn) => {
      const steps = p?.steps ?? [];
      const done = p?.done_steps ?? [];
      const real = steps.filter((s) => s.id !== 'fields');
      const stepLabel = steps.find((s) => s.id === p?.step)?.label;
      return { step: p?.step ?? '', step_label: stepLabel ? t(stepLabel) : p?.step === 'fertig' ? t('Fertig') : (p?.step ?? ''), processed: p?.processed ?? 0, total: p?.total ?? null, percent: real.length ? Math.round((real.filter((s) => done.includes(s.id)).length / real.length) * 100) : 0, steps: real.map((s) => ({ ...s, label: t(s.label), done: done.includes(s.id) })), notes: (p?.notes ?? []).map((n) => t(n)) };
    };
    const jobOut = (loc: string, jobId: string, t: STFn) => {
      const j = jobRow(app, jobId, loc);
      if (!j) throw notFound();
      return { ...jobSummary(j, t), warnings: (j.warnings ?? []).map((w) => t(w)), log: (j.log ?? []).slice(-200), options: j.options, mapping_size: Object.keys(j.mapping ?? {}).length };
    };

    const save = (jobId: string, p: Progress, warnings: string[], log?: string[]) =>
      db.run(`UPDATE umzug_jobs SET progress = ?, warnings = ?${log ? ', log = ?' : ''}, updated_at = ? WHERE id = ?`, JSON.stringify(p), JSON.stringify(warnings.slice(0, 300)), ...(log ? [JSON.stringify(log.slice(-200))] : []), now(), jobId);
    const audit = (job: JobRow, action: string, summary: string, userId?: string | null) => app.services.audit?.({ action, locationId: job.location_id, entityId: job.id, summary: summary.slice(0, 400), userId: userId ?? job.created_by, actor: userId || job.created_by ? undefined : tLoc(app, job.location_id)('Umzug') });
    const summaryLine = (p: Progress, t: STFn) =>
      reportLines(p.stats, t)
        .filter((l) => l.created + l.updated > 0 || l.failed)
        .map((l) => (l.failed ? t('{label}: {created} neu, {updated} aktualisiert, {failed} Fehler', { label: l.label, created: l.created, updated: l.updated, failed: l.failed }) : t('{label}: {created} neu, {updated} aktualisiert', { label: l.label, created: l.created, updated: l.updated })))
        .join('; ');

    const pending = new Set<Promise<unknown>>();
    const track = <T>(p: Promise<T>) => {
      pending.add(p);
      void p.finally(() => pending.delete(p));
      return p;
    };

    function start(jobId: string) {
      let job = jobRow(app, jobId)!;
      const loc = job.location_id;
      const flag = { jobId, cancel: false };
      running.set(loc, flag);
      const log: string[] = [...(job.log ?? [])];
      const t = tLoc(app, loc);
      const say = (s: string) => {
        log.push(`${new Date().toLocaleTimeString(t.locale === 'de' ? 'de-DE' : 'en-GB', { timeZone: 'Europe/Berlin' })} ${s}`);
        db.run('UPDATE umzug_jobs SET log = ?, updated_at = ? WHERE id = ?', JSON.stringify(log.slice(-200)), now(), jobId);
      };
      db.run(`UPDATE umzug_jobs SET status = 'running', error = NULL, updated_at = ? WHERE id = ?`, now(), jobId);
      const run = (async () => {
        try {
          job = jobRow(app, jobId)!;
          const input = inputFor(loc, job);
          say(job.progress?.done_steps?.length ? t('Fortgesetzt bei „{step}“', { step: t(job.progress.steps?.find((s) => s.id === job.progress.step)?.label ?? job.progress.step) }) : job.kind === 'dry_run' ? t('Probelauf gestartet') : t('Import gestartet'));
          const p = await runJob(app, job, input, { cancelled: () => flag.cancel, log: say, save: (pr, w) => save(jobId, pr, w) });
          const report = reportLines(p.stats, t);
          db.run(`UPDATE umzug_jobs SET status = 'done', finished_at = ?, updated_at = ?, result = ? WHERE id = ?`, now(), now(), JSON.stringify({ report }), jobId);
          say(job.kind === 'dry_run' ? t('Probelauf fertig – es wurde nichts geschrieben') : t('Fertig'));
          audit(job, job.kind === 'dry_run' ? 'umzug.dryrun.done' : 'umzug.import.done', `${SOURCES[job.source].label}: ${summaryLine(p, t) || t('nichts zu tun')}`);
          // Uploaded exports hold personal data: they go once the import is through (a dry run keeps them).
          if (job.kind === 'import' && job.origin === 'file' && !job.options?.keep_files) for (const fid of job.file_ids) {
            const f = db.get<any>('SELECT * FROM umzug_files WHERE id = ?', fid);
            if (f) (cache.delete(f.id), removeFile(f));
          }
        } catch (e) {
          const paused = e instanceof Cancelled;
          const msg = t((e as Error).message);
          say(paused ? t('Pausiert – mit „Fortsetzen“ geht es an derselben Stelle weiter') : t('Abgebrochen: {reason}', { reason: msg }));
          db.run(`UPDATE umzug_jobs SET status = ?, error = ?, updated_at = ? WHERE id = ?`, paused ? 'interrupted' : 'failed', paused ? null : msg.slice(0, 500), now(), jobId);
          if (!paused) audit(job, job.kind === 'dry_run' ? 'umzug.dryrun.failed' : 'umzug.import.failed', msg);
        } finally {
          running.delete(loc);
        }
      })();
      return track(run);
    }

    const create = async (ctx: Ctx, kind: 'dry_run' | 'import') => {
      if (running.has(ctx.locationId)) throw bad('Es läuft schon ein Umzug in diesem Sub-Account');
      const t = tCtx(ctx);
      const r = resolve(ctx.locationId, ctx.body, t);
      // Without a mapping from the wizard (MCP, API) the automatic one is used – that needs the source's field list.
      const mapping = ctx.body?.mapping ? looseMapping(ctx.body.mapping) : looseMapping((await previewOf(ctx.locationId, ctx.body, t)).preview.mapping);
      if (running.has(ctx.locationId)) throw bad('Es läuft schon ein Umzug in diesem Sub-Account');
      const options = cleanOptions(ctx.body?.options);
      const jobId = id();
      db.insert('umzug_jobs', { id: jobId, location_id: ctx.locationId, source: r.source, kind, status: 'running', origin: r.origin, connection_id: r.connection?.id ?? null, file_ids: r.files.map((f) => f.id), parts: r.parts, options, mapping, progress: emptyProgress(), log: [], warnings: [], created_by: actor(ctx), created_at: now(), updated_at: now() });
      audit(jobRow(app, jobId)!, kind === 'dry_run' ? 'umzug.dryrun.start' : 'umzug.import.start', `${r.def.label}: ${r.parts.join(', ')}`, actor(ctx));
      void start(jobId);
      return jobOut(ctx.locationId, jobId, t);
    };
    router.post('/api/umzug/dry-run', 'location', (ctx) => create(ctx, 'dry_run'));
    router.post('/api/umzug/jobs', 'location', (ctx) => create(ctx, 'import'));
    router.get('/api/umzug/jobs', 'location', (ctx) => parseJobs(ctx.locationId, clampLimit(ctx.query.get('limit'), 20, 50), tCtx(ctx)));
    router.get('/api/umzug/jobs/:id', 'location', (ctx) => jobOut(ctx.locationId, ctx.params.id, tCtx(ctx)));

    router.post('/api/umzug/jobs/:id/pause', 'location', (ctx) => {
      const r = running.get(ctx.locationId);
      if (!r || r.jobId !== ctx.params.id) throw bad('Dieser Umzug läuft nicht');
      r.cancel = true;
      return { ok: true };
    });
    router.post('/api/umzug/jobs/:id/resume', 'location', (ctx) => {
      const j = jobRow(app, ctx.params.id, ctx.locationId);
      if (!j) throw notFound();
      if (running.has(ctx.locationId)) throw bad('Es läuft schon ein Umzug in diesem Sub-Account');
      if (!['failed', 'interrupted'].includes(j.status) || j.result?.phase === 'undo') throw bad('Nur abgebrochene oder pausierte Umzüge lassen sich fortsetzen');
      void start(j.id);
      return jobOut(ctx.locationId, j.id, tCtx(ctx));
    });

    router.post('/api/umzug/jobs/:id/undo', 'location', (ctx) => {
      const j = jobRow(app, ctx.params.id, ctx.locationId);
      if (!j) throw notFound();
      if (j.kind !== 'import') throw bad('Ein Probelauf hat nichts angelegt');
      if (running.has(ctx.locationId)) throw bad('Es läuft gerade ein Umzug in diesem Sub-Account');
      if (j.status === 'undone') throw bad('Dieser Umzug ist schon rückgängig gemacht');
      if (!['done', 'failed', 'interrupted'].includes(j.status)) throw bad('Dieser Umzug läuft noch');
      const t = tLoc(app, ctx.locationId);
      const flag = { jobId: j.id, cancel: false };
      running.set(ctx.locationId, flag);
      db.run(`UPDATE umzug_jobs SET status = 'undoing', result = ?, updated_at = ? WHERE id = ?`, JSON.stringify({ ...(j.result ?? {}), phase: 'undo' }), now(), j.id);
      audit(j, 'umzug.undo.start', t('{source}: Umzug vom {date} wird rückgängig gemacht', { source: SOURCES[j.source].label, date: j.created_at.slice(0, 10) }), actor(ctx));
      track(
        undoJob(app, j, (done, total) => db.run('UPDATE umzug_jobs SET updated_at = ?, progress = ? WHERE id = ?', now(), JSON.stringify({ ...j.progress, undo: { done, total } }), j.id))
          .then((res) => {
            db.run(`UPDATE umzug_jobs SET status = 'undone', undone_at = ?, updated_at = ?, result = ? WHERE id = ?`, now(), now(), JSON.stringify({ ...(j.result ?? {}), undo: res }), j.id);
            audit(j, 'umzug.undo.done', t('{deleted} gelöscht, {restored} Kontakte zurückgesetzt', { deleted: Object.entries(res.deleted).map(([k, n]) => `${n} ${k}`).join(', ') || t('nichts'), restored: res.restored }), actor(ctx));
          })
          .catch((e) => {
            db.run(`UPDATE umzug_jobs SET status = 'failed', error = ?, updated_at = ? WHERE id = ?`, t('Rückgängig: {reason}', { reason: t((e as Error).message) }).slice(0, 500), now(), j.id);
            audit(j, 'umzug.undo.failed', (e as Error).message, actor(ctx));
          })
          .finally(() => running.delete(ctx.locationId)),
      );
      return jobOut(ctx.locationId, j.id, tCtx(ctx));
    });

    // --- housekeeping: uploaded files do not stay forever ---------------------------------------------------------------------------
    let swept = 0;
    app.onTick(() => {
      if (Date.now() - swept < 6 * 3_600_000) return;
      swept = Date.now();
      const cutoff = new Date(Date.now() - FILE_TTL_DAYS * 864e5).toISOString();
      for (const f of db.all<any>('SELECT * FROM umzug_files WHERE created_at < ?', cutoff)) removeFile(f);
      // The "before" copies of merged contacts (they make the undo exact) are kept for 30 days.
      db.run('UPDATE umzug_items SET before = NULL WHERE before IS NOT NULL AND job_id IN (SELECT id FROM umzug_jobs WHERE created_at < ?)', new Date(Date.now() - UNDO_DAYS * 864e5).toISOString());
      // Files of deleted sub-accounts (the rows cascaded away) and half-written uploads.
      if (!existsSync(dir)) return;
      const known = new Set(db.all<{ file: string }>('SELECT file FROM umzug_files').map((r) => r.file));
      for (const loc of readdirSync(dir)) {
        const d = join(dir, loc);
        if (!statSync(d).isDirectory()) continue;
        for (const f of readdirSync(d)) if (!known.has(f) && Date.now() - statSync(join(d, f)).mtimeMs > 864e5) rmSync(join(d, f), { force: true });
      }
    });

    // GDPR: erasing a contact forgets what the id map and the undo list remember about it.
    app.services.privacyErase = [
      ...(app.services.privacyErase ?? []),
      (_a: App, loc: string, contact: { id: string }) => {
        db.run('DELETE FROM umzug_ids WHERE location_id = ? AND local_id = ?', loc, contact.id);
        db.run(`DELETE FROM umzug_items WHERE local_id = ? AND job_id IN (SELECT id FROM umzug_jobs WHERE location_id = ?)`, contact.id, loc);
      },
    ];

    app.services.umzug = {
      /** Resolves when no import, dry run or undo is running any more (tests). */
      idle: async () => {
        while (pending.size) await Promise.allSettled([...pending]);
      },
      sources: SOURCES,
    };

    function sourceOf(v: unknown): SourceDef {
      if (!isSourceKey(v)) throw bad('Unbekannte Quelle');
      return SOURCES[v];
    }
  },
};

