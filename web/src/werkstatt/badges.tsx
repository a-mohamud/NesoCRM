import type { ReactNode } from 'react';
import { Link } from '../ui';
import './safety.css';
import { useT } from '../i18n';

/**
 * The "Sicherheitsnetz" in the UI: the badge row of a plugin version (static checks, self-tests, review, second
 * opinion, signature, model and Denkstufe), the notice for a model that is too weak for the Werkstatt, the signature
 * notice of an imported bundle and the small "Pro" mark. All facts come from the server; nothing is decided here.
 */

export interface VersionBadgesData {
  static: boolean;
  tests: boolean | null;
  tests_detail: string;
  review: { verdict: 'pass' | 'warn' | 'fail'; model: string } | null;
  second_opinion: { verdict: 'pass' | 'warn' | 'fail'; model: string } | null;
  signature: { state: string; label: string; gohigh: boolean } | null;
  model: string;
  effort: string;
  effort_note: string;
}
export interface DiffData {
  from: string;
  to: string;
  summary: string[];
}
export interface ModelGateData {
  enabled: boolean;
  ok: boolean;
  model: string;
  matched: string;
  message: string;
  link: string;
  via: string;
  stage1_normal: boolean;
  plan_model: string;
  plan_ok: boolean;
  families: { id: string; label: string; on: boolean }[];
  review: { model: string; ok: boolean; differs: boolean };
  effort: { requested: string; applied: string | null; label: string; note: string };
}
export interface SignatureData {
  state: 'signed' | 'untrusted' | 'invalid' | 'unsigned';
  key_id: string;
  label: string;
  gohigh: boolean;
  warning: string;
}

const VERDICT: Record<string, string> = { pass: 'bestanden', warn: 'mit Hinweisen', fail: 'durchgefallen' };
const tone = (v: string) => (v === 'pass' ? 'ok' : v === 'warn' ? 'warn' : 'bad');

export function Chip({ kind = '', title, children }: { kind?: 'ok' | 'warn' | 'bad' | 'muted' | ''; title?: string; children: ReactNode }) {
  return (
    <span className={`wk-chip ${kind}`} title={title}>
      {children}
    </span>
  );
}

export const ProMark = () => {
  const tt = useT('x_ai');
  return (
  <span className="wk-pro" title={tt('Pro-Funktion (Lizenz nötig)')}>
    {tt('Pro')}
  </span>
);
};

/** static ✓ · Tests ✓ · Prüfung bestanden · Zweitmeinung … · von HyperLevel signiert · Modell · Denkstufe */
export function VersionBadges({ b }: { b?: VersionBadgesData }) {
  const tt = useT('x_ai');
  if (!b) return null;
  return (
    <div className="wk-vbadges" data-tour="wk-version-badges">
      <Chip kind={b.static ? 'ok' : 'bad'} title={tt('Statische Prüfung: verbotene Zugriffe, externe Adressen, Berechtigungen')}>
        {b.static ? '✓' : '✗'} {tt('statisch')}
      </Chip>
      <Chip kind={b.tests === null ? 'muted' : b.tests ? 'ok' : 'bad'} title={b.tests_detail || tt('Automatischer Selbsttest in der Sandbox')}>
        {b.tests === null ? '–' : b.tests ? '✓' : '✗'} {tt('Tests')}
      </Chip>
      <Chip kind={b.review ? tone(b.review.verdict) : 'muted'} title={b.review ? tt('Sicherheitsprüfung durch {model}', { model: b.review.model }) : tt('Noch nicht geprüft (nur nötig vor dem Veröffentlichen)')}>
        {b.review ? (b.review.verdict === 'pass' ? '✓' : b.review.verdict === 'warn' ? '!' : '✗') : '–'} {tt('Prüfung')}{b.review ? ` ${tt(VERDICT[b.review.verdict] ?? b.review.verdict)}` : ''}
      </Chip>
      {b.second_opinion && (
        <Chip kind={tone(b.second_opinion.verdict)} title={tt('Zweitmeinung von {model}', { model: b.second_opinion.model })}>
          {b.second_opinion.verdict === 'pass' ? '✓' : b.second_opinion.verdict === 'warn' ? '!' : '✗'} {tt('Zweitmeinung {v}', { v: tt(VERDICT[b.second_opinion.verdict] ?? b.second_opinion.verdict) })}
        </Chip>
      )}
      {b.signature && (
        <Chip kind={b.signature.state === 'signed' ? 'ok' : b.signature.state === 'invalid' ? 'bad' : 'warn'} title={b.signature.label || undefined}>
          {b.signature.state === 'signed' ? (b.signature.gohigh ? tt('✓ von HyperLevel signiert') : tt('✓ signiert ({label})', { label: b.signature.label || tt('bekannter Schlüssel') })) : tt('ungeprüft')}
        </Chip>
      )}
      {b.model && (
        <Chip title={b.effort_note || undefined}>
          {b.model}
          {b.effort ? tt(' · Denkstufe {effort}', { effort: b.effort }) : ''}
        </Chip>
      )}
    </div>
  );
}

export function DiffList({ d }: { d?: DiffData | null }) {
  const tt = useT('x_ai');
  if (!d?.summary?.length) return null;
  return (
    <ul className="wk-diff" aria-label={tt('Änderungen von {from} zu {to}', { from: d.from, to: d.to })}>
      {d.summary.map((s) => (
        <li key={s}>{s}</li>
      ))}
    </ul>
  );
}

/** The model that serves the Werkstatt, and – when it is too weak – the plain German refusal with the link. */
export function ModelGateNotice({ gate, compact }: { gate?: ModelGateData; compact?: boolean }) {
  const tt = useT('x_ai');
  if (!gate) return null;
  if (gate.ok) {
    return compact ? null : (
      <p className="wk-ai" data-tour="wk-model">
        {tt('Modell: {model}', { model: gate.model })}
        {gate.matched && gate.enabled ? ` (${gate.matched})` : ''} {tt('· Denkstufe')} {gate.effort.label || tt('nicht gesendet')}
        {gate.effort.note ? ` – ${gate.effort.note}` : ''}
      </p>
    );
  }
  // The server message ends with the path of the settings page in brackets; here it is a button instead.
  const text = gate.message.replace(/\s*\(\/app\/[^)]*\)/, '');
  return (
    <div className="card wk-gate" role="alert" data-tour="wk-model">
      <strong>{text}</strong>
      <div className="actions">
        <Link to={gate.link.replace(/^\/app\//, '')} className="btn secondary small">
          {tt('Zu den KI-Anbietern')}
        </Link>
      </div>
      {gate.stage1_normal && <p className="muted small" style={{ margin: '6px 0 0' }}>{tt('Einrichtungen (Stufe 1, ohne Code) lassen sich trotzdem planen und bauen.')}</p>}
    </div>
  );
}

/** "Modell · Denkstufe" of a build or version, with the note when the level was lowered. */
export function AiLine({ ai }: { ai?: { model?: string; label?: string; note?: string } | null }) {
  const tt = useT('x_ai');
  if (!ai?.model) return null;
  return (
    <p className="wk-ai">
      {tt('KI: {model}', { model: ai.model })}
      {ai.label ? tt(' · Denkstufe {label}', { label: ai.label }) : ''}
      {ai.note ? ` (${ai.note})` : ''}
    </p>
  );
}

/** Signature of an imported bundle: signed, unknown signer, forged or none ("ungeprüft"). */
export function SignatureNotice({ sig, proRequired }: { sig?: SignatureData; proRequired?: boolean }) {
  const tt = useT('x_ai');
  if (!sig) return null;
  const good = sig.state === 'signed';
  return (
    <div className={`wk-sig ${good ? 'good' : sig.state === 'invalid' ? 'bad' : 'warn'}`} role={good ? 'status' : 'alert'} data-tour="wk-signature">
      {good ? (
        <>
          <strong>{sig.gohigh ? tt('✓ Von HyperLevel signiert') : tt('✓ Signiert von {v}', { v: sig.label || sig.key_id })}</strong>
          <div className="muted small">{tt('Die Signatur stimmt mit dem Inhalt überein.')}{sig.gohigh ? tt(' Installieren signierter Plugins ist eine Pro-Funktion.') : ''}{proRequired ? tt(' – Dafür ist eine Pro-Lizenz nötig, sie fehlt hier.') : ''}</div>
        </>
      ) : (
        <>
          <strong>{sig.state === 'invalid' ? tt('Signatur ungültig') : tt('Ungeprüft')}</strong>
          <div className="small">{sig.warning}</div>
        </>
      )}
    </div>
  );
}
