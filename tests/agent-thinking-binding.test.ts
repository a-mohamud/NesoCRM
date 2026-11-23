/**
 * Regression: "messages.1.content.0: Invalid `signature` in `thinking` block. The block is bound to a different conversation."
 *
 * Opus 5.5 / Sonnet 5.5 bind every thinking block to the exact prefix it was produced for (system, tools, earlier messages).
 * The agent rebuilt older turns on every request (the time/page note moves to the newest message, old tool results are
 * shortened, old images become placeholders), so replaying an earlier turn's thinking block failed from the second message on.
 * The fake model below enforces the same rule as the real API.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pinClock, startTestApp, unpinClock } from './helpers.js';
import { events } from './agent-fakes.js';
import { bindingModel } from './thinking-binding-fake.js';
import { chatWithTools, retry, type Msg } from '../server/services/agent-llm.js';
import { requestMessages, systemPrompt } from '../server/services/agent-runtime.js';

const AKEY = 'sk-ant-api03-bindingtest-abcdefghijklmnopqrstuvwxyz';
const model = bindingModel();
let t: Awaited<ReturnType<typeof startTestApp>>;
let contactA = '';

const chat = async (body: Record<string, unknown>) => {
  const r = await t.api.post('/api/agent/chat', body);
  return { status: r.status, events: typeof r.data === 'string' ? events(r.data) : [], data: r.data };
};
const done = (r: { events: any[] }) => r.events.find((e) => e.type === 'done');
const errors = (r: { events: any[] }) => r.events.filter((e) => e.type === 'error').map((e) => e.message ?? e.error);
const failed = () => model.calls.filter((c) => c.status === 400);

beforeAll(async () => {
  retry.ms = 1;
  t = await startTestApp();
  t.app.services.agentFetch = model.fetch;
  await t.setup();
  contactA = (await t.api.post('/api/contacts', { first_name: 'Wanjiru', last_name: 'Kamau', email: 'wanjiru@kunde.example' })).data.id;
  expect((await t.api.post('/api/ai-connections', { provider: 'anthropic', api_key: AKEY, models: { text: 'claude-opus-5-5' } })).status).toBe(200);
});
afterAll(() => t.close());
beforeEach(() => model.reset());

describe('preserved thinking: follow-up messages keep working', () => {
  it('a conversation of several plain turns never replays a thinking block with a changed prefix', async () => {
    model.reply(model.thinkAndSay('I can help with contacts, deals and more.'), model.thinkAndSay('There are 4 open deals.'), model.thinkAndSay('OK.'));
    const r1 = await chat({ message: 'Hi, what can you help me with?', ui: { route: 'agency', label: 'Agency' } });
    expect(done(r1)).toMatchObject({ status: 'done' });
    const cid = r1.events.find((e) => e.type === 'start').conversation_id;
    const r2 = await chat({ conversation_id: cid, message: 'How many open deals are there?', ui: { route: 'agency', label: 'Agency' } });
    expect(errors(r2)).toEqual([]);
    expect(done(r2)).toMatchObject({ status: 'done' });
    const r3 = await chat({ conversation_id: cid, message: 'Just say OK.', ui: { route: 'contacts', label: 'Contacts' } });
    expect(errors(r3)).toEqual([]);
    expect(done(r3)).toMatchObject({ status: 'done' });
    expect(failed()).toEqual([]);
  });

  it('keeps the current turn’s thinking inside a tool loop, and later turns still work', async () => {
    model.reply(
      model.thinkAndSay('Hello!'),
      () => [{ type: 'thinking', thinking: 'look up', signature: '' }, { type: 'tool_use', id: 'tu_1', name: 'ghl_search_contacts', input: { query: 'Wanjiru' } }],
      model.thinkAndSay('Found Wanjiru Kamau.'),
      model.thinkAndSay('Anything else?'),
    );
    const r1 = await chat({ message: 'Hello' });
    const cid = r1.events.find((e) => e.type === 'start').conversation_id;
    const r2 = await chat({ conversation_id: cid, message: 'Find Wanjiru' });
    expect(errors(r2)).toEqual([]);
    expect(done(r2)).toMatchObject({ status: 'done' });
    // the request after the tool result still carries this turn's thinking block (tool loops need it)
    const afterTool = model.calls.filter((c) => c.status === 200)[2].body.messages;
    expect(afterTool.at(-2).content[0]).toMatchObject({ type: 'thinking' });
    const r3 = await chat({ conversation_id: cid, message: 'Thanks' });
    expect(errors(r3)).toEqual([]);
    expect(failed()).toEqual([]);
  });

  it('a confirmation approved minutes later (other page, new time) still continues', async () => {
    await t.api.put('/api/agent/settings', { default_mode: 'ask' });
    pinClock('2026-11-23T09:00:00Z');
    try {
      model.reply(
        () => [{ type: 'thinking', thinking: 'add note', signature: '' }, { type: 'tool_use', id: 'tu_n', name: 'ghl_add_note', input: { contact_id: contactA, body: 'Called back' } }],
        model.thinkAndSay('Done: note added.'),
      );
      const r = await chat({ message: 'Note on Wanjiru that she called back', ui: { route: 'agency', label: 'Agency' } });
      const card = r.events.find((e) => e.type === 'confirm');
      expect(card).toBeTruthy();
      pinClock('2026-11-23T09:07:00Z');
      const c = await t.api.post('/api/agent/confirm', { pending_id: card.pending_id, token: card.token, approve: true });
      const ev = events(c.data);
      expect(ev.filter((e) => e.type === 'error')).toEqual([]);
      expect(ev.find((e) => e.type === 'done')).toMatchObject({ status: 'done' });
      // the new time note changes the prefix of this turn's thinking: at most one rejected attempt, then it goes through without it
      expect(failed().length).toBeLessThanOrEqual(1);
      expect(model.calls.at(-1)?.status).toBe(200);
    } finally {
      unpinClock();
    }
  });
});

describe('pure parts', () => {
  const history: Msg[] = [
    { role: 'user', content: [{ type: 'text', text: 'first' }] },
    { role: 'assistant', content: [{ type: 'thinking', raw: { type: 'thinking', thinking: 'a', signature: 's1' } }, { type: 'text', text: 'one' }] },
    { role: 'user', content: [{ type: 'text', text: 'second' }] },
    { role: 'assistant', content: [{ type: 'thinking', raw: { type: 'thinking', thinking: 'b', signature: 's2' } }, { type: 'tool_call', id: 't1', name: 'x', args: {} }] },
    { role: 'user', content: [{ type: 'tool_result', id: 't1', name: 'x', content: 'r' }] },
  ];

  it('requestMessages drops thinking of finished turns and keeps the current turn’s', () => {
    const out = requestMessages(history, { contextNote: '[Context]', file: () => null });
    expect(out[1].content.map((p) => p.type)).toEqual(['text']);
    expect(out[3].content.map((p) => p.type)).toEqual(['thinking', 'tool_call']);
  });

  it('chatWithTools retries once without thinking blocks when the API says they are bound to a different conversation', async () => {
    const bodies: any[] = [];
    const msg = 'messages.1.content.0: Invalid `signature` in `thinking` block. The block is bound to a different conversation. Remove the block, or set `thinking.block_binding.prefix_mismatch_behavior` to "drop_block".';
    const fetchImpl = (async (_u: string, init: any) => {
      bodies.push(JSON.parse(init.body));
      if (bodies.length === 1) return new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: msg } }), { status: 400, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn', model: 'claude-opus-5-5' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as any;
    const r = await chatWithTools({ connection: { provider: 'anthropic', wire: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-opus-5-5', headers: {}, options: {} }, system: 's', messages: history, tools: [] }, fetchImpl);
    expect(r.text).toBe('ok');
    expect(bodies).toHaveLength(2);
    expect(JSON.stringify(bodies[0].messages)).toContain('"thinking"');
    expect(JSON.stringify(bodies[1].messages)).not.toContain('"thinking"');
    // the thinking level is kept (this was not an effort problem)
    expect(bodies[1].output_config).toEqual(bodies[0].output_config);
  });

  it('the system prompt names the reply language', () => {
    const base = { brand: 'Neso CRM', agent: { name: 'Neso Agent', mode: 'ask', description: '', instructions: '' } as any, user: { name: 'Ahmed', role: 'admin' } as any, locationName: 'Neso', locationId: 'L1', today: '2026-11-23', automatic: false, memory: [], knowledge: '' };
    const en = systemPrompt({ ...base, language: 'English' });
    expect(en).toMatch(/Reply in English/);
    expect(en).toMatch(/German/);
    expect(systemPrompt({ ...base, language: 'Somali' })).toMatch(/Reply in Somali/);
  });
});
