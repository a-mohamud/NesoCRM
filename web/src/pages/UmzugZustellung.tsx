import { useState } from 'react';
import { api, dt } from '../api';
import { Badge, CodeBox, Empty, Field, Input, Modal, Select, Spinner, act, confirmAsk, navigate, useLoad } from '../ui';
import { DOMAIN_STATUS } from './umzug-format';
import './umzug.css';
import { tr, useT } from '../i18n';

/**
 * E-Mail-Zustellung prüfen: Domain eintragen → SPF, DKIM, DMARC und MX werden per DNS geprüft → die fehlenden Einträge zum Kopieren
 * (mit Anleitung auf Deutsch) → erneut prüfen. Dasselbe Ergebnis liest die Warnung im Versand-Dialog der Kampagnen.
 */

interface DnsRec {
  type: string;
  host: string;
  fqdn: string;
  value: string;
  priority?: number;
  note?: string;
}
interface CheckFull {
  key: string;
  label: string;
  status: string;
  summary: string;
  found: string[];
  problems: string[];
  steps: string[];
  records: DnsRec[];
  optional?: boolean;
}
interface DomainBrief {
  id: string;
  domain: string;
  provider: string;
  provider_label: string;
  selector: string;
  status: string;
  checked_at: string | null;
  summary: string;
  checks: { key: string; label: string; status: string; summary: string; optional: boolean }[];
}
interface DomainFull extends DomainBrief {
  result: { checked_at: string; summary: string; checks: CheckFull[]; notes: string[] } | null;
}
interface Overview {
  domains: DomainBrief[];
  sender: { from_email: string; domain: string | null; provider: string; provider_label: string; active: boolean; added: boolean; configured_provider: string };
  providers: { key: string; label: string; configured: boolean }[];
  smtp_hint: string | null;
  rules: { label: string; key: string }[];
}

const statusBadge = (s: string) => {
  const [text, tone] = DOMAIN_STATUS[s] ?? [s, 'gray' as const];
  return <Badge tone={tone}>{tr('x_integrations')(text)}</Badge>;
};

function Records({ records }: { records: DnsRec[] }) {
  const tt = useT('x_integrations');
  return (
    <div className="um-recs" data-tour="dl-records">
      {records.map((r, i) => (
        <div key={i} className="um-rec">
          <div className="um-rec-type">
            <Badge tone="blue">{r.type}</Badge>
            {r.priority !== undefined && <span className="muted small">{tt('Priorität {priority}', { priority: r.priority })}</span>}
          </div>
          <div className="um-rec-f">
            <span className="muted small">{tt('Name / Host')}</span>
            <CodeBox text={r.host} />
          </div>
          <div className="um-rec-f wide">
            <span className="muted small">{tt('Wert')}</span>
            <CodeBox text={r.value} />
          </div>
          <div className="muted small um-rec-note">
            {tt('Vollständiger Name: {fqdn}', { fqdn: r.fqdn })}
            {r.note ? ` · ${r.note}` : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

function CheckView({ c }: { c: CheckFull }) {
  const tt = useT('x_integrations');
  const todo = c.status !== 'ok';
  return (
    <div className={`um-check ${c.status}`}>
      <div className="um-check-head">
        <strong>{c.label}</strong> {statusBadge(c.status)}
        {c.optional && <span className="muted small">{tt('Empfehlung')}</span>}
      </div>
      <p>{c.summary}</p>
      {c.problems.filter((p) => p !== c.summary).length > 0 && (
        <ul className="um-problems">
          {c.problems.filter((p) => p !== c.summary).map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {todo && c.steps.length > 0 && (
        <>
          <h4>{tt('So behebst du es')}</h4>
          <ol className="um-steps-list">
            {c.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </>
      )}
      {c.records.length > 0 && (todo ? <Records records={c.records} /> : <details><summary>{tt('Einträge anzeigen')}</summary><Records records={c.records} /></details>)}
      {c.found.length > 0 && (
        <details className="um-found">
          <summary>{tt('Das habe ich im DNS gefunden')}</summary>
          <ul>
            {c.found.map((f) => (
              <li key={f}>
                <code>{f}</code>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function SetupModal({ d, providers, onClose, onSaved }: { d: DomainBrief; providers: Overview['providers']; onClose: () => void; onSaved: () => void }) {
  const tt = useT('x_integrations');
  const [provider, setProvider] = useState(d.provider);
  const [selector, setSelector] = useState(d.selector);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={tt('Anbieter für {domain}', { domain: d.domain })}
      onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={onClose}>
            {tt('Abbrechen')}
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await act(() => api.patch(`/api/mail-domains/${d.id}`, { provider, selector }), tt('Gespeichert'));
              setBusy(false);
              if (r) onSaved();
            }}
          >
            {tt('Speichern und neu prüfen')}
          </button>
        </>
      }
    >
      <p className="muted small">{tt('Der Anbieter bestimmt, welchen DKIM-Eintrag und welchen SPF-Teil ich suche. „Automatisch“ nimmt den Anbieter aus Einstellungen → E-Mail & SMS.')}</p>
      <Field label={tt('Versand-Anbieter')}>
        <Select value={provider} onChange={setProvider} placeholder={tt('Automatisch')} options={providers.map((p) => [p.key, p.configured ? `${p.label} (eingerichtet)` : p.label] as [string, string])} />
      </Field>
      <Field label={tt('DKIM-Selektor (optional)')} hint={tt('Nur nötig, wenn dein Anbieter einen eigenen Selektor vergeben hat, z. B. „s1“ oder „mail“. Er steht in der DKIM-Anleitung deines Anbieters vor „._domainkey“.')}>
        <Input value={selector} onChange={setSelector} maxLength={80} placeholder={tt('z. B. s1')} />
      </Field>
    </Modal>
  );
}

function DomainCard({ d, providers, onChanged }: { d: DomainBrief; providers: Overview['providers']; onChanged: () => void }) {
  const tt = useT('x_integrations');
  const [open, setOpen] = useState(d.status === 'warn' || d.status === 'fail');
  const [full, setFull] = useState<DomainFull | null>(null);
  const [busy, setBusy] = useState('');
  const [setup, setSetup] = useState(false);
  const detail = useLoad(async () => {
    if (!open) return null;
    const r = await api.get<DomainFull>(`/api/mail-domains/${d.id}`);
    setFull(r);
    return r;
  }, [open, d.id, d.checked_at]);
  const shown = full ?? detail.data ?? null;
  const check = async () => {
    setBusy('check');
    const r = await act(() => api.post<DomainFull>(`/api/mail-domains/${d.id}/check`), tt('Geprüft'));
    setBusy('');
    if (r) {
      setFull(r);
      setOpen(true);
      onChanged();
    }
  };
  const remove = async () => {
    if (!confirmAsk(tt('{domain} aus der Liste entfernen? Am DNS ändert sich nichts.', { domain: d.domain }))) return;
    if (await act(() => api.del(`/api/mail-domains/${d.id}`))) onChanged();
  };
  const result = shown?.result;
  return (
    <div className="card um-domain" data-tour="dl-domain">
      <div className="um-domain-head">
        <div>
          <h3>
            {d.domain} {statusBadge(d.status)}
          </h3>
          <div className="muted small">
            {d.provider_label || tt('Anbieter automatisch')}
            {d.selector ? tt(' · Selektor {selector}', { selector: d.selector }) : ''}
            {d.checked_at ? tt(' · geprüft {dt}', { dt: dt(d.checked_at) }) : ''}
          </div>
        </div>
        <div className="um-actions">
          <button className="btn" disabled={!!busy} onClick={() => void check()} data-tour="dl-recheck">
            {busy === 'check' ? tt('Prüfe …') : d.checked_at ? tt('Erneut prüfen') : tt('Jetzt prüfen')}
          </button>
          <button className="btn secondary" onClick={() => setSetup(true)}>
            {tt('Anbieter')}
          </button>
          <button className="btn ghost" onClick={() => void remove()}>
            {tt('Entfernen')}
          </button>
        </div>
      </div>
      {d.checks.length > 0 && (
        <div className="um-pills" data-tour="dl-badges">
          {d.checks.map((c) => (
            <span key={c.key} className={`um-pill ${c.status}`} title={c.summary}>
              {c.label}: {tt((DOMAIN_STATUS[c.status] ?? [c.status])[0])}
            </span>
          ))}
        </div>
      )}
      <p className="um-summary">{d.summary}</p>
      {d.checked_at && (
        <button className="btn small ghost um-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? tt('Details ausblenden') : tt('Details und Anleitung zeigen')}
        </button>
      )}
      {open && detail.loading && !shown && <Spinner />}
      {open && result && (
        <div className="um-checks">
          {result.checks.map((c) => (
            <CheckView key={c.key} c={c} />
          ))}
          {result.notes.length > 0 && (
            <ul className="muted small">
              {result.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {setup && (
        <SetupModal
          d={d}
          providers={providers}
          onClose={() => setSetup(false)}
          onSaved={() => {
            setSetup(false);
            setFull(null);
            onChanged();
            void act(() => api.post(`/api/mail-domains/${d.id}/check`)).then(() => onChanged());
          }}
        />
      )}
    </div>
  );
}

export function UmzugZustellung({ embedded }: { embedded?: boolean }) {
  const tt = useT('x_integrations');
  const ov = useLoad(() => api.get<Overview>('/api/mail-domains'), []);
  const [domain, setDomain] = useState('');
  const [provider, setProvider] = useState('');
  const [selector, setSelector] = useState('');
  const [busy, setBusy] = useState(false);
  const o = ov.data;
  if (ov.error) return <div className="card um-err">{ov.error}</div>;
  if (!o) return <Spinner />;

  const add = async (name: string, prov = '', sel = '') => {
    setBusy(true);
    const r = await act(async () => {
      const row = await api.post<DomainBrief>('/api/mail-domains', { domain: name, provider: prov, selector: sel });
      return api.post(`/api/mail-domains/${row.id}/check`);
    }, tt('Domain geprüft'));
    setBusy(false);
    if (r) {
      setDomain('');
      setSelector('');
      void ov.reload();
    }
  };
  const s = o.sender;

  return (
    <div className="um-page" data-tour="dl-page">
      {!embedded && <h1>{tt('E-Mail-Zustellung prüfen')}</h1>}
      <p className="muted um-intro">
        {tt('Gmail, Yahoo und Co. sortieren Mails aus, deren Absender-Domain nicht sauber eingerichtet ist. Hier prüfe ich SPF, DKIM, DMARC und MX deiner Domain und zeige dir die fehlenden Einträge zum Kopieren.')}
      </p>

      <div className="card" data-tour="dl-sender">
        <h3>{tt('Dein Absender')}</h3>
        {s.domain ? (
          <p>
            {tt('Mails gehen von')} <strong>{s.from_email}</strong> {tt('über')} <strong>{s.provider_label}</strong>.
            {!s.active && <span className="muted"> {tt('Der Versand steht auf „Testmodus“ – es wird noch nichts verschickt.')}</span>}
          </p>
        ) : (
          <p>
            {tt('Es ist noch keine Absender-Adresse eingestellt.')}{' '}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                navigate('settings/messaging');
              }}
            >
              {tt('Einstellungen → E-Mail & SMS')}
            </a>
          </p>
        )}
        {s.domain && !s.added && (
          <button className="btn" disabled={busy} onClick={() => void add(s.domain!, '', '')} data-tour="dl-check-sender">
            {busy ? tt('Prüfe …') : tt('{domain} jetzt prüfen', { domain: s.domain })}
          </button>
        )}
      </div>

      {o.domains.length === 0 && !s.domain && <Empty>{tt('Noch keine Domain in der Liste. Trag unten die Domain ein, von der du Mails verschickst.')}</Empty>}
      {o.domains.map((d) => (
        <DomainCard key={d.id} d={d} providers={o.providers} onChanged={() => void ov.reload()} />
      ))}

      <div className="card" data-tour="dl-add">
        <h3>{tt('Weitere Domain prüfen')}</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (domain.trim() && !busy) void add(domain.trim(), provider, selector);
          }}
        >
          <div className="grid2">
            <Field label={tt('Domain')} hint={tt('Nur der Teil hinter dem @, z. B. meinefirma.de')}>
              <Input value={domain} onChange={setDomain} placeholder="meinefirma.de" autoComplete="off" spellCheck={false} />
            </Field>
            <Field label={tt('Versand-Anbieter')}>
              <Select value={provider} onChange={setProvider} placeholder={tt('Automatisch')} options={o.providers.map((p) => [p.key, p.configured ? `${p.label} (eingerichtet)` : p.label] as [string, string])} />
            </Field>
          </div>
          <Field label={tt('DKIM-Selektor (optional)')} hint={tt('Nur wenn dein Anbieter einen eigenen vergeben hat.')}>
            <Input value={selector} onChange={setSelector} maxLength={80} placeholder={tt('z. B. s1')} />
          </Field>
          <button className="btn" type="submit" disabled={!domain.trim() || busy}>
            {busy ? tt('Prüfe …') : tt('Hinzufügen und prüfen')}
          </button>
        </form>
      </div>

      <div className="card" data-tour="dl-rules">
        <h3>{tt('Was die großen Postfach-Anbieter verlangen')}</h3>
        <ul className="um-rules">
          {o.rules.map((r) => (
            <li key={r.key}>{r.label}</li>
          ))}
        </ul>
        {o.smtp_hint && <p className="muted small">{tt('Dein SMTP-Server sieht nach {smtp_hint} aus – die Anleitung nimmt darauf Rücksicht.', { smtp_hint: o.smtp_hint })}</p>}
      </div>
    </div>
  );
}
