import type { Module } from '../core/app.js';
import { HttpError, bad, notFound } from '../core/http.js';
import { now } from '../core/util.js';
import type { ConnectorConfig, ConnectorDef } from '../services/connectors.js';
import { openSecret, sealSecret } from './mail-sync.js';
import { tApp, tCtx, type STFn } from '../i18n/index.js';

/**
 * The native connector framework (Apps → Direkt-Verbindungen): values per sub-account and
 * connector, secrets sealed and never returned, "Verbindung testen", status for the catalogue.
 * Connectors register themselves with `registerConnector` (services/connectors.ts) – see
 * connector-chat.ts, connector-notion.ts and connector-sheets.ts.
 */

const MASK = '••••••';

export const connectorsModule: Module = {
  name: 'connectors',
  migrations: [
    [
      '001-init',
      `
      CREATE TABLE connector_settings (
        location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE, key TEXT NOT NULL,
        data TEXT NOT NULL DEFAULT '{}', last_test_at TEXT, last_result TEXT NOT NULL DEFAULT '', last_ok INTEGER,
        updated_at TEXT NOT NULL, PRIMARY KEY (location_id, key)
      );
      `,
    ],
  ],
  register(app) {
    const { db, router } = app;
    const defs = (): ConnectorDef[] => app.services.connectors ?? [];
    const defOf = (key: string) => {
      const d = defs().find((x) => x.key === key && !x.custom);
      if (!d) throw notFound('Unbekannte Verbindung');
      return d;
    };
    const row = (loc: string, key: string) => db.get('SELECT * FROM connector_settings WHERE location_id = ? AND key = ?', loc, key);
    const stored = (loc: string, key: string): Record<string, string> => JSON.parse(row(loc, key)?.data || '{}');

    /** Opened values of a connector, or null while a required field is missing. */
    const config = (loc: string, key: string): ConnectorConfig | null => {
      const d = defs().find((x) => x.key === key);
      const r = row(loc, key);
      if (!d || !r) return null;
      const data = JSON.parse(r.data || '{}');
      const out: ConnectorConfig = {};
      for (const f of d.fields) {
        const v = data[f.key];
        if (v === undefined || v === '') continue;
        if (f.secret) {
          try {
            out[f.key] = openSecret(app, v);
          } catch {
            return null;
          }
        } else out[f.key] = String(v);
      }
      return d.fields.every((f) => !f.required || out[f.key]) ? out : null;
    };
    app.services.connectorConfig = config;
    app.services.connectorStatus = (loc: string, key: string, t: STFn = tApp()) => {
      const r = row(loc, key);
      if (!config(loc, key)) return { status: 'missing', detail: r ? t('Unvollständig') : t('Nicht eingerichtet') };
      if (r?.last_ok === 0) return { status: 'partial', detail: t('Test fehlgeschlagen: {result}', { result: String(r.last_result).slice(0, 80) }) };
      return { status: 'ok', detail: r?.last_ok === 1 ? (r.last_result ? String(r.last_result).slice(0, 100) : t('Verbunden')) : t('Gespeichert') };
    };

    const view = (loc: string, t: STFn) =>
      defs().map((d) => {
        const r = row(loc, d.key);
        const data = JSON.parse(r?.data || '{}');
        return {
          key: d.key,
          name: t(d.name),
          icon: d.icon,
          category: t(d.category),
          description: t(d.description),
          credentials: t(d.credentials),
          guide: (d.guide ?? []).map((g) => t(g)),
          custom: !!d.custom,
          steps: (d.steps ?? []).map((s) => t(s)),
          can_test: !!d.test,
          fields: d.fields.map((f) => ({ key: f.key, label: t(f.label), secret: !!f.secret, required: !!f.required, placeholder: f.placeholder ? t(f.placeholder) : '', help: f.help ? t(f.help) : '' })),
          values: Object.fromEntries(d.fields.map((f) => [f.key, f.secret ? (data[f.key] ? MASK : '') : String(data[f.key] ?? '')])),
          configured: !!config(loc, d.key),
          last_test_at: r?.last_test_at ?? null,
          last_result: r?.last_result ?? '',
          last_ok: r?.last_ok === null || r?.last_ok === undefined ? null : !!r.last_ok,
        };
      });

    router.get('/api/connectors', 'location', (ctx) => view(ctx.locationId, tCtx(ctx)));
    router.put('/api/connectors/:key', 'location', (ctx) => {
      const d = defOf(ctx.params.key);
      const t = tCtx(ctx);
      const input = ctx.body?.values ?? ctx.body ?? {};
      const data = stored(ctx.locationId, d.key);
      for (const f of d.fields) {
        const v = input[f.key];
        if (v === undefined || (f.secret && v === MASK)) continue;
        if (v === null || String(v).trim() === '') {
          delete data[f.key];
          continue;
        }
        const s = String(v).trim();
        if (s.length > (f.max ?? 500)) throw bad(t('{label} ist zu lang', { label: t(f.label) }));
        if (f.pattern && !f.pattern.test(s)) throw bad(f.patternHint ? t(f.patternHint) : t('{label} sieht nicht richtig aus', { label: t(f.label) }));
        data[f.key] = f.secret ? sealSecret(app, s) : s;
      }
      const missing = d.fields.filter((f) => f.required && !data[f.key]).map((f) => t(f.label));
      if (missing.length) throw bad(t('Fehlt: {fields}', { fields: missing.join(', ') }));
      db.run(
        `INSERT INTO connector_settings (location_id, key, data, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(location_id, key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, last_ok = NULL, last_result = ''`,
        ctx.locationId,
        d.key,
        JSON.stringify(data),
        now(),
      );
      return view(ctx.locationId, t).find((x) => x.key === d.key);
    });
    router.delete('/api/connectors/:key', 'location', (ctx) => {
      const d = defOf(ctx.params.key);
      db.run('DELETE FROM connector_settings WHERE location_id = ? AND key = ?', ctx.locationId, d.key);
      return { ok: true };
    });
    router.post('/api/connectors/:key/test', 'location', async (ctx) => {
      const d = defOf(ctx.params.key);
      const cfg = config(ctx.locationId, d.key);
      if (!cfg) throw new HttpError(409, 'Erst die Zugangsdaten speichern.');
      if (!d.test) return { ok: true, detail: tCtx(ctx)('Gespeichert') };
      let ok = true;
      let detail: string;
      try {
        detail = await d.test(app, cfg);
      } catch (e) {
        ok = false;
        detail = (e as Error).message;
      }
      db.run('UPDATE connector_settings SET last_test_at = ?, last_result = ?, last_ok = ? WHERE location_id = ? AND key = ?', now(), detail.slice(0, 300), ok ? 1 : 0, ctx.locationId, d.key);
      if (!ok) throw new HttpError(400, detail);
      return { ok, detail };
    });
  },
};
