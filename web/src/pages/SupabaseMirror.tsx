import { useState } from 'react';
import { ago, api } from '../api';
import { Badge, Check, CodeBox, Field, Input, Spinner, act, useLoad } from '../ui';
import { SignupLink } from '../referrals';
import { useT } from '../i18n';

/** Agency → Integrationen: one-way mirror of the CRM into Supabase. */
export function SupabaseMirror() {
  const tt = useT('x_integrations');
  const s = useLoad(() => api.get<any>('/api/agency/supabase'), []);
  const [url, setUrl] = useState<string | null>(null);
  const [key, setKey] = useState('');
  const [showSql, setShowSql] = useState(false);
  if (!s.data) return <Spinner />;
  const v = s.data;
  const st = v.state ?? {};
  const save = async (patch: any) => (await act(() => api.patch('/api/agency/supabase', patch), tt('Gespeichert'))) && (setKey(''), setUrl(null), s.reload());
  return (
    <div className="card" data-tour="supabase">
      <h2>{tt('Supabase-Spiegel')} <SignupLink id="supabase" /></h2>
      <p className="muted small">
        {tt('Projekte, Kontakte, Deals, Aufgaben, Rechnungen und Dokumente laufend in deine Supabase (Tabellen')} <code>{tt('ghl_*')}</code>{tt('), damit andere Projekte und der Supabase-MCP darauf zugreifen. Alle 10 Minuten Änderungen, nachts alles inkl. Löschungen.')}
      </p>
      <div className="grid2">
        <Field label={tt('Supabase-Adresse')}>
          <Input value={url ?? v.url} onChange={setUrl} placeholder="https://db.deine-domain.de" />
        </Field>
        <Field label={tt('Service-Role-Key')} hint={tt('Supabase → Einstellungen → API (bleibt verschlüsselt hier)')}>
          <Input type="password" value={key} onChange={setKey} placeholder={v.key_set ? tt('•••••••• (gespeichert)') : ''} autoComplete="off" />
        </Field>
      </div>
      <Check checked={v.enabled} onChange={(enabled) => save({ enabled })} label={tt('Spiegel aktiv')} />
      <p className="actions">
        <button className="btn" onClick={() => save({ url: url ?? v.url, ...(key ? { service_key: key } : {}), enabled: true })}>
          {tt('Speichern & testen')}
        </button>
        <button className="btn secondary" disabled={!v.enabled} onClick={async () => (await act(() => api.post('/api/agency/supabase/sync', { full: true }), tt('Synchronisiert'))) && s.reload()}>
          {tt('Jetzt komplett abgleichen')}
        </button>
        <button className="btn ghost" onClick={() => setShowSql(!showSql)}>
          {showSql ? tt('SQL ausblenden') : tt('SQL für die Tabellen')}
        </button>
      </p>
      {st.last_run && (
        <p className="small">
          {st.last_error ? <Badge tone="red">{tt('Fehler')}</Badge> : <Badge tone="green">ok</Badge>} {tt('Letzter Abgleich {ago}', { ago: ago(st.last_run) })}
          {st.last_full ? tt(' · komplett {ago}', { ago: ago(st.last_full) }) : ''}
          {st.last_error ? <span style={{ color: 'var(--red)' }}> · {st.last_error}</span> : ''}
          {st.counts && !st.last_error && (
            <span className="muted">
              {' · '}
              {Object.entries(st.counts)
                .map(([k, n]) => `${String(k).replace('ghl_', '')} ${n}`)
                .join(', ')}
            </span>
          )}
        </p>
      )}
      {showSql && (
        <>
          <p className="muted small">{tt('Einmal im Supabase-SQL-Editor ausführen (oder per Supabase-MCP „apply_migration“):')}</p>
          <CodeBox text={v.sql} />
        </>
      )}
    </div>
  );
}
