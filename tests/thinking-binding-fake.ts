/**
 * A fake Anthropic Messages API that enforces preserved-thinking prefix binding the way the real API does for
 * Opus 5.5 / Sonnet 5.5 and newer (docs: build-with-claude/preserved-thinking/prefix-checks):
 *
 * - every thinking block it returns is bound to the request it was produced for: `system`, `tools` and every earlier
 *   message (parsed JSON, `cache_control` markers ignored, thinking blocks themselves not part of the comparison);
 * - thinking blocks sent back must still have that exact prefix, and may only be left out from the oldest end, the
 *   newest end, or all together – never one in between;
 * - a mismatch is answered with the same 400 the real API sends.
 *
 * Used by the vitest regression test and by the Playwright end-to-end check (scripts can import it too).
 */
import { createHash, randomBytes } from 'node:crypto';
import { anthropicSse, chunked, type Block } from './agent-fakes.js';

const BINDING_ERROR = (path: string) =>
  `${path}: Invalid \`signature\` in \`thinking\` block. The block is bound to a different conversation. Remove the block, or set \`thinking.block_binding.prefix_mismatch_behavior\` to "drop_block". That setting requires the \`thinking-binding-controls-2026-08-01\` beta header.`;

const isThinking = (b: any) => b && (b.type === 'thinking' || b.type === 'redacted_thinking');

/** Parsed-JSON comparison: keys sorted, cache_control dropped (the API ignores both). */
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) if (k !== 'cache_control') out[k] = canon((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

const asBlocks = (content: unknown) => (typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content : []);

/** Fingerprint of everything before messages[mi].content[bi] (thinking blocks excluded). */
function prefixHash(body: any, mi: number, bi: number): string {
  const msgs = (body.messages ?? []).slice(0, mi + 1).map((m: any, i: number) => {
    const blocks = asBlocks(m.content).filter((b: any) => !isThinking(b));
    const upto = i === mi ? asBlocks(m.content).slice(0, bi).filter((b: any) => !isThinking(b)) : blocks;
    return { role: m.role, content: upto };
  });
  return createHash('sha256')
    .update(JSON.stringify(canon({ system: body.system ?? null, tools: body.tools ?? null, messages: msgs })))
    .digest('hex');
}

interface Bound {
  prefix: string;
  /** Signature of the thinking block that came before this one when it was produced ('' = none). */
  prev: string;
  /** Order in which blocks were produced (to tell "left out in between" from "left out at an end"). */
  seq: number;
}

export function bindingModel() {
  const bound = new Map<string, Bound>();
  let seq = 0;
  const calls: { body: any; status: number; error?: string }[] = [];
  /** Replies per call: blocks the fake answers with (thinking blocks are signed automatically). */
  let script: ((body: any) => Block[])[] = [];

  /** null when every thinking block checks out, else the 400 message. */
  function verify(body: any): string | null {
    const found: { path: string; sig: string; mi: number; bi: number }[] = [];
    (body.messages ?? []).forEach((m: any, mi: number) =>
      asBlocks(m.content).forEach((b: any, bi: number) => {
        if (isThinking(b)) found.push({ path: `messages.${mi}.content.${bi}`, sig: String(b.signature ?? b.data ?? ''), mi, bi });
      }),
    );
    let lastSeq = -1;
    for (let k = 0; k < found.length; k++) {
      const f = found[k];
      const rec = bound.get(f.sig);
      if (!rec) return BINDING_ERROR(f.path);
      if (rec.prefix !== prefixHash(body, f.mi, f.bi)) return BINDING_ERROR(f.path);
      // blocks may be dropped from the oldest end only: every later block must follow the one before it directly
      if (k > 0 && rec.prev !== found[k - 1].sig) return BINDING_ERROR(f.path);
      if (rec.seq <= lastSeq) return BINDING_ERROR(f.path);
      lastSeq = rec.seq;
    }
    return null;
  }

  const fetchImpl = (async (_url: string, init: any = {}) => {
    const body = init.body ? JSON.parse(init.body) : {};
    const problem = verify(body);
    if (problem) {
      calls.push({ body, status: 400, error: problem });
      return new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: problem } }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
    const next = script.shift();
    if (!next) {
      calls.push({ body, status: 500, error: 'no scripted reply' });
      return new Response(JSON.stringify({ error: { message: 'no scripted reply' } }), { status: 500, headers: { 'content-type': 'application/json' } });
    }
    calls.push({ body, status: 200 });
    // sign the new thinking blocks against this request (+ the assistant blocks before them in the reply)
    let prevSig = '';
    for (const m of body.messages ?? []) for (const b of asBlocks(m.content)) if (isThinking(b)) prevSig = String(b.signature ?? '');
    const produced: any[] = [];
    const blocks = next(body).map((b) => {
      if (b.type !== 'thinking') {
        produced.push(b);
        return b;
      }
      const signature = randomBytes(12).toString('base64url');
      const withReply = { ...body, messages: [...(body.messages ?? []), { role: 'assistant', content: [...produced] }] };
      bound.set(signature, { prefix: prefixHash(withReply, withReply.messages.length - 1, produced.length), prev: prevSig, seq: seq++ });
      prevSig = signature;
      const signed = { ...b, signature };
      produced.push(signed);
      return signed;
    });
    return new Response(chunked(anthropicSse(blocks, undefined, String(body.model ?? 'claude-opus-5-5'))), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }) as unknown as typeof fetch;

  return {
    fetch: fetchImpl,
    calls,
    reply(...fns: ((body: any) => Block[])[]) {
      script.push(...fns);
    },
    reset() {
      calls.length = 0;
      script = [];
    },
    /** Convenience: think, then say `text`. */
    thinkAndSay: (text: string) => () => [{ type: 'thinking', thinking: `Planning: ${text.slice(0, 20)}`, signature: '' }, { type: 'text', text }] as Block[],
  };
}
