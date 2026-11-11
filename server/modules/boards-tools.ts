import type { Module } from '../core/app.js';
import type { Ctx } from '../core/http.js';
import { checkArea, bodyLocation, scope } from '../services/mobile.js';
import { OP_NAMES } from '../services/boards-patch.js';
import { LIMITS, parseSpec } from '../services/boards-model.js';
import type { BoardRow } from '../services/boards-store.js';
import type { Tool } from './mcp.js';
import { tApp } from '../i18n/index.js';

/**
 * Living Boards for agents and the phone: four MCP tools (list, get, apply a patch, the widget catalogue) plus one to
 * create a board – thin relays onto the REST routes (modules/boards.ts), so the key's sub-account, member rights, the
 * audit log and the versions apply – and the read-only mobile endpoints /api/mobile/boards*. The HyperLevel Agent gets
 * the tools automatically (app.services.mcpTools) and a short hint on how to use them.
 */

const LOC = { location_id: { type: 'string', description: 'Sub-Account/Projekt-ID (aus ghl_list_projects)' } };
const obj = (props: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties: props, required, additionalProperties: false });
const RO = { readOnlyHint: true, openWorldHint: false };
const W = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const link = (id: string) => `/app/boards/${id}`;
/** Widget types that touch the outside: adding them always needs the person's confirmation. */
const HIGH = new Set(['embed', 'actions']);

// Written for AI models (MCP clients and the in-app agent), so in English; the German accent codes are the values the patch takes. i18n-ignore
const OPS_DOC = `ops = list of changes (at most ${LIMITS.ops}), each an object with "op" and only the matching fields – unknown fields and types are errors:
• add: type (widget type from ghl_board_widgets), optional title, config {field: value}, ref (your own label for later steps), w/h (size in the 12-column grid), placement ("top", "bottom", "beside:<id|ref>", "below:<id|ref>", "above:<id|ref>") or x/y
• remove: id
• move: id and placement or x/y (bp: lg|md|sm; sm = order on the phone)
• resize: id and w/h or dw/dh (relative, e.g. dw 2 = two columns wider)
• configure: id and config (only the fields to change; null resets a field) and/or title
• rename: name and/or icon
• theme: accent (blau = blue, grün = green, violett = violet, orange, rot = red, türkis = turquoise, rosa = pink, grau = grey, or #rrggbb; "" = reset)
Order matters. With dry_run: true the patch is only checked and the preview (changes, risk) is returned – nothing is saved.`;

export const BOARD_TOOLS: Tool[] = [
  {
    name: 'ghl_board_list',
    title: 'Living Boards: Liste',
    description: 'Die Boards (Arbeitsbereiche aus Widgets), die die Person im Sub-Account sehen darf: eigene persönliche und geteilte. Mit Name, Symbol, Zugriff (owner/edit/view), Version, Anzahl Widgets und dem Board, das als Startseite gesetzt ist.',
    inputSchema: obj({ ...LOC }, ['location_id']),
    annotations: RO,
    run: async (call, a) => {
      const r = await call.api('GET', '/api/boards', { location: a.location_id });
      return {
        boards: (r.boards as any[]).map((b) => ({ id: b.id, name: b.name, icon: b.icon, scope: b.scope, access: b.access, version: b.version, widgets: b.widgets, owner: b.owner_name, updated_at: b.updated_at, home: b.home, link: link(b.id) })),
        home: r.home,
      };
    },
  },
  {
    name: 'ghl_board_get',
    title: 'Living Boards: Board lesen',
    description: 'Ein Board mit allen Widgets: id, Typ, Titel, Einstellungen (config) und Platz im 12-Spalten-Raster (layout.lg: x, y, w, h), Version und Zugriff. Mit with_data: true auch, was die Widgets gerade für die Person zeigen (Zahlen, Listen …) – so lässt sich ein Board zusammenfassen oder erklären.',
    inputSchema: obj({ ...LOC, board_id: { type: 'string' }, with_data: { type: 'boolean', description: 'Auch die aktuellen Daten der Widgets liefern (Standard false)' } }, ['location_id', 'board_id']),
    annotations: RO,
    run: async (call, a) => {
      const id = encodeURIComponent(a.board_id);
      const b = await call.api('GET', `/api/boards/${id}`, { location: a.location_id });
      const widgets = (b.spec.widgets as any[]).map((w) => ({ id: w.id, type: w.type, title: w.title, config: w.config, layout: { lg: w.layout.lg } }));
      const data = a.with_data ? (await call.api('GET', `/api/boards/${id}/data`, { location: a.location_id })).data : undefined;
      return {
        id: b.id,
        name: b.name,
        icon: b.icon,
        accent: b.accent,
        scope: b.scope,
        access: b.access,
        can_edit: b.access !== 'view',
        version: b.version,
        can_undo: b.can_undo,
        widgets: widgets.map((w) => ({ ...w, ...(data?.[w.id] ? { data: data[w.id].view } : {}) })),
        link: link(b.id),
      };
    },
  },
  {
    name: 'ghl_board_apply_patch',
    title: 'Living Boards: Board ändern',
    description: `Changes a board with a validated patch: add, remove, move, resize and configure widgets, rename the board, set the accent colour. Every change becomes a version (the person can undo it at once in the app) and appears live for everyone who has the board open. Anything invalid is refused with reasons; nothing is applied halfway. Read ghl_board_widgets (types and fields) and ghl_board_get (ids, version) first; check with dry_run when unsure. If you add or change an embed or quick-action buttons (actions), ask the person first and then set confirm_external: true. ${OPS_DOC}`,
    inputSchema: obj(
      {
        ...LOC,
        board_id: { type: 'string' },
        ops: { type: 'array', items: { type: 'object', properties: { op: { type: 'string', enum: OP_NAMES } }, required: ['op'] }, description: 'Die Änderungen (siehe Beschreibung)' },
        dry_run: { type: 'boolean', description: 'Nur prüfen und Vorschau liefern' },
        expected_version: { type: 'integer', description: 'Version aus ghl_board_get: schlägt mit 409 fehl, wenn das Board sich inzwischen geändert hat' },
        summary: { type: 'string', description: 'Kurzer Satz für den Versionsverlauf (sonst automatisch)' },
        confirm_external: { type: 'boolean', description: 'Die Person hat bestätigt, dass Adressen eingebettet bzw. Knöpfe angelegt werden dürfen' },
      },
      ['location_id', 'board_id', 'ops'],
    ),
    annotations: W,
    klassFor: (a) => (a.dry_run ? 'read' : Array.isArray(a.ops) && (a.ops as any[]).some((o) => o?.op === 'add' && HIGH.has(String(o?.type))) ? 'sensitive' : 'write'),
    run: async (call, a) => {
      const id = encodeURIComponent(a.board_id);
      // A check is a read (its own route); only the real thing writes.
      const r = a.dry_run === true ? await call.api('POST', `/api/boards/${id}/preview`, { location: a.location_id, body: { ops: a.ops } }) : await call.api('POST', `/api/boards/${id}/patch`, { location: a.location_id, body: { ops: a.ops, expected_version: a.expected_version, summary: a.summary, confirm_external: a.confirm_external === true } });
      return { ...(r.board ? { board: { id: r.board.id, name: r.board.name, version: r.board.version, widgets: r.board.widgets } } : {}), ok: r.ok, ...(r.errors ? { errors: r.errors } : {}), unchanged: r.unchanged, version: r.version, summary: r.summary, risk: r.risk, changes: r.changes, created: r.created, saved: a.dry_run ? false : !r.unchanged, link: link(a.board_id) };
    },
  },
  {
    name: 'ghl_board_widgets',
    title: 'Living Boards: Widget-Katalog',
    description: 'Alle Widget-Typen, die ein Board enthalten kann – mit Beschreibung, Standardgröße, den Einstellungsfeldern (key, Beschriftung, Art, erlaubte Werte) und dem Bereich, dessen Rechte für die Daten gelten. Module können weitere Typen ergänzen. Grundlage für ghl_board_apply_patch.',
    inputSchema: obj({ location_id: { type: 'string', description: 'Sub-Account-ID (bei Agentur-Schlüsseln nötig)' } }),
    annotations: RO,
    run: async (call, a) => {
      const r = await call.api('GET', '/api/boards/widgets', { location: a.location_id });
      return {
        widgets: (r.widgets as any[]).map((w) => ({ type: w.type, label: w.label, description: w.description, category: w.category_label, size: w.size, risk: w.risk, access: w.access_label || undefined, fields: (w.fields as any[]).filter((f) => !f.hidden || f.type === 'json').map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options?.map(([v, l]: [string, string]) => `${v || '(empty)'}=${l}`), from: f.optionsFrom, min: f.min, max: f.max, default: f.default, only_if: f.showIf ? `${f.showIf.key} in ${f.showIf.in.join('|')}` : undefined, item: f.item?.map((i: any) => i.key) })) })),
        limits: r.limits,
        hint: tApp()('ids für Felder wie pipeline_id, report_id, workflow_id liefern die Werkzeuge der jeweiligen Bereiche (ghl_list_pipelines, ghl_list_dashboards …); ohne Angabe gelten Standardwerte.'),
      };
    },
  },
  {
    name: 'ghl_board_create',
    title: 'Living Boards: Board anlegen',
    description: 'Legt ein neues Board an – leer oder aus einer Vorlage (solo-cockpit, vertrieb, agentur, service, projekte oder die ID einer eigenen Vorlage des Sub-Accounts). scope personal (nur die Person) oder shared (Team, Standard nur lesen). Danach mit ghl_board_apply_patch anpassen.',
    inputSchema: obj({ ...LOC, name: { type: 'string' }, template: { type: 'string', description: 'Vorlage: solo-cockpit, vertrieb, agentur, service, projekte oder Vorlagen-ID' }, scope: { type: 'string', enum: ['personal', 'shared'] }, team_access: { type: 'string', enum: ['view', 'edit'] } }, ['location_id']),
    annotations: W,
    run: async (call, a) => {
      const b = await call.api('POST', '/api/boards', { location: a.location_id, body: { name: a.name, template: a.template, scope: a.scope ?? (call.agency ? 'shared' : 'personal'), team_access: a.team_access } });
      return { id: b.id, name: b.name, scope: b.scope, version: b.version, widgets: b.widgets, link: link(b.id) };
    },
  },
];

export const boardsToolsModule: Module = {
  name: 'boards-tools',
  register(app) {
    const { router } = app;
    app.services.mcpTools = [...(app.services.mcpTools ?? []), ...BOARD_TOOLS];

    // The HyperLevel Agent knows what boards are and how to change them.
    app.services.agentPromptExtras = [
      ...(app.services.agentPromptExtras ?? []),
      (i: { user: any; locationId: string; automatic: boolean }) =>
        i.automatic
          ? ''
          : [
              '# Living Boards',
              'Boards are workspaces made of widgets (key figures, charts, lists, pipeline, appointments, tasks …), personal or shared. When a board should change ("show me the open deals at the top", "make the revenue chart bigger"): ghl_board_list → ghl_board_get (ids, version) → ghl_board_widgets (types and fields) → ghl_board_apply_patch. Check uncertain patches with dry_run first and tell the person in one sentence what changes. Every change is a version; "Undo" in the app reverts it at once.',
              'Embeds (embed) and quick-action buttons (actions) touch the outside world: ask the person first and only then set confirm_external. If no widget can do what is asked, invent nothing – suggest having a suitable widget built in the Workshop (plugins can provide widgets).',
            ].join('\n'),
    ];

    // --- native app (bearer ghm_…): read only --------------------------------------------------------------------------------
    const B = () => app.services.boards as any;
    /** Loads a board the way the web app would for this person, in the sub-account the app names. */
    const open = (ctx: Ctx) => {
      const l = bodyLocation(app, ctx, ctx.query.get('location'));
      checkArea(app, ctx, l.id, 'dashboard');
      const c: Ctx = { ...ctx, locationId: l.id };
      return { l, c, ...(B().load(c, ctx.params.id, 'view') as { board: BoardRow; access: string }) };
    };

    router.get('/api/mobile/boards', 'user', (ctx) => {
      const locs = scope(app, ctx, 'dashboard', { strict: false });
      const out: Record<string, unknown>[] = [];
      for (const l of locs) {
        const c: Ctx = { ...ctx, locationId: l.id };
        const home = B().homeId(c);
        for (const { board, access } of B().list(c) as { board: BoardRow; access: string }[]) {
          out.push({ id: board.id, location_id: l.id, location_name: l.name, name: board.name, icon: board.icon, accent: board.accent, scope: board.scope, access, widgets: parseSpec(board.spec).widgets.length, version: board.head, updated_at: board.updated_at, home: home === board.id });
        }
      }
      return { boards: out };
    });
    router.get('/api/mobile/boards/:id', 'user', (ctx) => {
      const { l, c, board, access } = open(ctx);
      const spec = parseSpec(board.spec);
      return {
        id: board.id,
        location_id: l.id,
        name: board.name,
        icon: board.icon,
        accent: board.accent,
        scope: board.scope,
        access,
        version: board.head,
        updated_at: board.updated_at,
        // The phone shows one column: the "sm" order, with the heights in grid rows.
        widgets: spec.widgets
          .map((w) => ({ id: w.id, type: w.type, title: w.title || B().registry.get(w.type)?.label || w.type, layout: { sm: w.layout.sm ?? { x: 0, y: 0, w: 1, h: w.layout.lg.h }, lg: w.layout.lg } }))
          .sort((a, b) => a.layout.sm.y - b.layout.sm.y),
        home: B().homeId(c) === board.id,
      };
    });
    router.get('/api/mobile/boards/:id/data', 'user', async (ctx) => {
      const { c, board } = open(ctx);
      ctx.skipAfterWrite = true;
      const ids = String(ctx.query.get('ids') ?? '').split(',').filter(Boolean).slice(0, LIMITS.widgets);
      const data = await B().data(c, board, ids.length ? ids : undefined);
      return { version: board.head, data };
    });
  },
};
