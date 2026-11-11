import { MODEL_RE } from './ai-presets.js';
import { MODES, type Mode } from './agent-safety.js';
import { tApp } from '../i18n/index.js';

/**
 * "KI-Agent mit KI erstellen" (pure), like HighLevel's Agent Studio "Build with AI": a description in plain words becomes the
 * config of a custom agent – checked against the custom-agent schema (modules/agent-custom.ts) and the agent's real tool
 * catalogue. The module (modules/agent-ai.ts) asks the AI with the same ask-check-retry loop as the Funnel & Website AI.
 */

export const KNOWLEDGE = ['agent', 'ai', 'kb', 'docs', 'project'] as const;
const CADENCE = ['daily', 'weekdays', 'weekly', 'monthly'] as const;
const DELIVER = ['notification', 'email', 'task'] as const;

export interface CatalogTool {
  name: string;
  title: string;
  group: string;
  klass: string;
}
export interface AgentDraft {
  name: string;
  emoji: string;
  description: string;
  instructions: string;
  model: string;
  tools: string[];
  knowledge: { sources: string[]; text: string };
  mode: Mode;
  max_steps: number;
  starters: string[];
  web_fetch: boolean;
  schedule: { cadence: string; weekday: number; day: number; time: string; prompt: string; deliver: string } | null;
}

export const RULES = `You design a custom AI agent (an "AI team member") for HyperLevel, a CRM. Reply with exactly ONE JSON object:
{"name": "≤ 60 characters", "emoji": "one emoji", "description": "role in one sentence", "instructions": "instructions addressed to the agent as “you”: task, approach, tone, limits", "model": "", "tools": ["tool_name", …], "knowledge": {"sources": [${KNOWLEDGE.map((k) => `"${k}"`).join(', ')}], "text": "fixed knowledge, optional"}, "mode": "read|ask|auto", "max_steps": 1–30, "starters": ["starter prompt", …], "web_fetch": false, "schedule": null or {"cadence": "${CADENCE.join('|')}", "weekday": 0–6, "day": 1–28, "time": "HH:MM", "prompt": "task for the run", "deliver": "${DELIVER.join('|')}"}, "summary": "one sentence", "notes": ["what the person still needs to do"]}
- Write name, description, instructions, starters, summary and notes in the language of the description.
- tools: only names from the TOOL CATALOGUE, only what the agent really needs (usually 4–15). Read tools are enough for reports.
- mode: "read" read-only, "ask" asks before every change (default), "auto" only if the task explicitly requires it. Tools that send, delete or pay ask anyway.
- knowledge.sources: agent = agent knowledge, ai = AI assistant knowledge, kb = help articles, docs = documents, project = project profile.
- schedule only if the description mentions a recurring run (e.g. "every Monday at 8am"); weekday 0 = Monday.
- leave model empty (the connection's default) unless the description names a model ID.
- No invented facts about the business; put unknowns as [placeholders] in the instructions.`;

/** The tool catalogue for the prompt, grouped, one line per tool: `name · title (klass)`. */
export function catalogText(tools: CatalogTool[]): string {
  const groups = new Map<string, CatalogTool[]>();
  for (const t of tools) groups.set(t.group, [...(groups.get(t.group) ?? []), t]);
  return [...groups.entries()].map(([g, list]) => `## ${g}\n${list.map((t) => `${t.name} · ${t.title} (${t.klass})`).join('\n')}`).join('\n');
}

const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.trim() : '').slice(0, max);

export function checkAgent(raw: any, catalog: Map<string, CatalogTool>): { draft?: AgentDraft; summary: string; notes: string[]; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!raw || typeof raw !== 'object') return { errors: ['The answer was not a JSON object.'], warnings, summary: '', notes: [] };
  const name = txt(raw.name, 200);
  if (!name) errors.push('“name” is missing');
  else if (name.length > 60) errors.push(`“name” is ${name.length} characters long, at most 60`);
  const instructions = txt(raw.instructions, 30_000);
  if (instructions.length < 40) errors.push('“instructions” is missing or too short – describe the task, approach and limits');
  if (instructions.length > 20_000) errors.push('“instructions” is too long (at most 20,000 characters)');
  const toolList = Array.isArray(raw.tools) ? raw.tools.map(String) : null;
  if (!toolList) errors.push('“tools” must be a list of tool names');
  const unknown = (toolList ?? []).filter((t: string) => !catalog.has(t));
  if (unknown.length) errors.push(`Unknown tools: ${unknown.slice(0, 10).join(', ')} – only names from the TOOL CATALOGUE`);
  const tools = [...new Set((toolList ?? []).filter((t: string) => catalog.has(t)))] as string[];
  if (toolList && !tools.length && !unknown.length) errors.push('Choose at least one tool');
  if (tools.length > 60) errors.push('At most 60 tools – only what the agent needs');
  const mode = (MODES as readonly string[]).includes(raw.mode) ? (raw.mode as Mode) : (errors.push('“mode” must be read, ask or auto'), 'ask' as Mode);
  if (mode === 'read' && tools.some((t) => catalog.get(t)!.klass !== 'read' && catalog.get(t)!.klass !== 'internal')) warnings.push(tApp()('Modus „nur lesen“: schreibende Werkzeuge werden blockiert'));
  const steps = Number(raw.max_steps ?? 12);
  if (!Number.isInteger(steps) || steps < 1 || steps > 30) errors.push('“max_steps” must be a whole number from 1 to 30');
  const model = txt(raw.model, 160);
  if (model && !MODEL_RE.test(model)) warnings.push(tApp()('Modell „{model}“ ist keine gültige Modell-ID – Standard der Verbindung', { model: model.slice(0, 40) }));
  const k = raw.knowledge && typeof raw.knowledge === 'object' ? raw.knowledge : {};
  const sources = (Array.isArray(k.sources) ? k.sources.map(String) : []) as string[];
  const badSources = sources.filter((s) => !(KNOWLEDGE as readonly string[]).includes(s));
  if (badSources.length) errors.push(`Unbekannte Wissensquellen: ${badSources.join(', ')} – erlaubt: ${KNOWLEDGE.join(', ')}`);
  let schedule: AgentDraft['schedule'] = null;
  if (raw.schedule) {
    const s = raw.schedule;
    if (!(CADENCE as readonly string[]).includes(s.cadence)) errors.push(`schedule.cadence must be ${CADENCE.join(', ')}`);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(s.time ?? ''))) errors.push('schedule.time as HH:MM');
    if (txt(s.prompt, 4000).length < 8) errors.push('schedule.prompt is missing – what should the agent do on each run?');
    if (s.deliver !== undefined && !(DELIVER as readonly string[]).includes(s.deliver)) errors.push(`schedule.deliver must be ${DELIVER.join(', ')}`);
    schedule = { cadence: String(s.cadence), weekday: Math.min(6, Math.max(0, Number(s.weekday) || 0)), day: Math.min(28, Math.max(1, Number(s.day) || 1)), time: String(s.time), prompt: txt(s.prompt, 4000), deliver: (DELIVER as readonly string[]).includes(s.deliver) ? s.deliver : 'notification' };
  }
  const draft: AgentDraft = {
    name,
    emoji: txt(raw.emoji, 16) || '🤖',
    description: txt(raw.description, 1000),
    instructions,
    model: model && MODEL_RE.test(model) ? model : '',
    tools,
    knowledge: { sources: [...new Set(sources.filter((s) => (KNOWLEDGE as readonly string[]).includes(s)))], text: txt(k.text, 30_000) },
    mode,
    max_steps: Number.isInteger(steps) ? Math.min(30, Math.max(1, steps)) : 12,
    starters: (Array.isArray(raw.starters) ? raw.starters : []).map((x: unknown) => txt(x, 200)).filter(Boolean).slice(0, 8),
    web_fetch: raw.web_fetch === true,
    schedule,
  };
  return { draft: errors.length ? undefined : draft, summary: txt(raw.summary, 300), notes: (Array.isArray(raw.notes) ? raw.notes : []).map((n: unknown) => txt(n, 240)).filter(Boolean).slice(0, 6), errors, warnings };
}
