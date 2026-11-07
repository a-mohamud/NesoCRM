import { useEffect, useState } from 'react';
import { api, dt } from '../api';
import { Icon } from '../icons';
import { useSession } from '../session';
import { Badge, Check, Field, Input, Modal, Select, Spinner, act, confirmAsk, toast, useLoad } from '../ui';
import { Note, PostureBadge, PurgeDialog, type Json } from './CogneeKit';
import './cognee.css';
import { useT } from '../i18n';

/**
 * Agentur → Integrationen → Einrichtung → „Wissensgedächtnis (Cognee)“ (docs/cognee.md): the address and the login of the
 * self-hosted Cognee server, a test of every step, and all sub-accounts at a glance (what they share, item counts, last sync,
 * errors) with a login of their own per sub-account for stronger separation.
 */

export function CogneeAgencySetup() {
  const tt = useT('x_ai');
  const s = useLoad(() => api.get<Json>('/api/agency/cognee'), []);
  const [f, setF] = useState<Json | null>(null);
  const [test, setTest] = useState<Json | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const v = s.data;
    if (v && !f) setF({ base_url: v.base_url ?? '', auth_mode: v.auth_mode ?? 'password', email: v.email ?? '', secret: '', allow_private: v.configured ? !!v.allow_private : false, locations_may_enable: v.configured ? v.locations_may_enable !== false : true, allow_open_server: !!v.allow_open_server });
  }, [s.data, f]);
  if (!s.data || !f) return <Spinner />;
  const v = s.data;
  const set = (p: Json) => setF({ ...f, ...p });
  const password = f.auth_mode === 'password';
  const body = () => ({ base_url: f.base_url, auth_mode: f.auth_mode, ...(password ? { email: f.email, ...(f.secret ? { password: f.secret } : {}) } : f.secret ? { api_key: f.secret } : {}), allow_private: f.allow_private, locations_may_enable: f.locations_may_enable, allow_open_server: f.allow_open_server });
  const runTest = async () => setTest((await act(() => api.post<Json>('/api/agency/cognee/test', {}))) ?? null);
  const save = async () => {
    setBusy(true);
    const r = await act(() => api.put<Json>('/api/agency/cognee', body()), tt('Gespeichert'));
    setBusy(false);
    if (!r) return;
    set({ secret: '' });
    await s.reload();
    await runTest();
  };
  const hostLooksInternal = /^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|[a-z0-9-]+(:\d+)?(\/|$))/i.test(f.base_url);

  return (
    <div className="card" style={{ flex: '1 1 420px' }} data-tour="cognee-agency">
      <h2>{tt('Wissensgedächtnis (Cognee)')}</h2>
      <p className="muted small">
        {tt('Verbindet HyperLevel mit einem selbst gehosteten')} <a href="https://github.com/topoteretes/cognee" target="_blank" rel="noopener">{tt('Cognee')}</a>{tt('-Server (Wissensgraph, Apache-2.0) über dessen REST-Schnittstelle. Jeder Sub-Account entscheidet selbst, ob und welche Daten er teilt – Standard: aus. Jeder Sub-Account bekommt eigene Datasets (')}<code>{tt('gh_<ID>_<Typ>')}</code>{tt('), andere Datasets werden nie gelesen oder beschrieben. Einrichtung, Server-Einstellungen und was gesendet wird:')} <code>docs/cognee.md</code>
      </p>
      <Note level="info">{tt('Auf dem Cognee-Server muss')} <code>{tt('ENABLE_BACKEND_ACCESS_CONTROL=true')}</code> {tt('gesetzt sein, und HyperLevel sollte einen eigenen Cognee-Nutzer bekommen – so liegt jedes Dataset getrennt.')}</Note>
      {v.configured && v.posture?.state === 'open' && (
        <Note level="critical">
          {tt('Der Cognee-Server antwortet ohne Anmeldung – die Zugriffskontrolle ist aus. Es wird nichts übertragen, bis')} <code>{tt('ENABLE_BACKEND_ACCESS_CONTROL=true')}</code> {tt('gesetzt ist. {reason}', { reason: v.posture.reason })}
        </Note>
      )}
      <Field label={tt('Adresse des Cognee-Servers')} hint={tt('z. B. https://cognee.example.com – oder http://cognee:8000 im selben Docker-Netz. Ohne http:// nur im eigenen Netz.')}>
        <Input value={f.base_url} onChange={(x) => set({ base_url: x })} placeholder="https://cognee.example.com" autoComplete="off" />
      </Field>
      <Field label={tt('Anmeldung')}>
        <Select value={f.auth_mode} onChange={(x) => set({ auth_mode: x, secret: '' })} options={[['password', 'E-Mail und Passwort (Cognee-Nutzer für HyperLevel)'], ['api_key', 'API-Schlüssel (Cognee → /api/v1/auth/api-keys)']]} />
      </Field>
      {password && (
        <Field label={tt('E-Mail des Cognee-Nutzers')}>
          <Input type="email" value={f.email} onChange={(x) => set({ email: x })} placeholder="gohigh@example.com" autoComplete="off" />
        </Field>
      )}
      <Field label={password ? tt('Passwort') : tt('API-Schlüssel')} hint={tt('Wird verschlüsselt gespeichert und nie wieder angezeigt. Leer lassen = bisherigen Wert behalten.')}>
        <Input type="password" value={f.secret} onChange={(x) => set({ secret: x })} autoComplete="new-password" placeholder={v.configured && v.secret_set && v.auth_mode === f.auth_mode ? `•••••••• ${v.hint}` : ''} />
      </Field>
      <Check checked={f.allow_private} onChange={(x) => set({ allow_private: x })} label={`Internes Netz erlauben (Cognee läuft im selben Docker-Netz oder LAN)${hostLooksInternal && !f.allow_private ? tt(' – vermutlich nötig') : ''}`} />
      <Check checked={f.locations_may_enable} onChange={(x) => set({ locations_may_enable: x })} label={tt('Sub-Account-Admins dürfen das Gedächtnis selbst einschalten (aus: nur die Agentur)')} />
      <button type="button" className="btn small ghost" onClick={() => setMore(!more)}>
        {more ? '▾' : '▸'} {tt('Weitere Einstellungen')}
      </button>
      {more && <Check checked={f.allow_open_server} onChange={(x) => set({ allow_open_server: x })} label={tt('Auch an einen Server ohne Zugriffskontrolle senden (nicht empfohlen – Sub-Accounts liegen dort nicht getrennt)')} />}
      <div className="row" style={{ gap: 6, marginTop: 8 }}>
        <button className="btn" disabled={busy || !f.base_url || (password && !f.email) || (!v.configured && !f.secret)} onClick={save} data-tour="cognee-save">
          {tt('Speichern & testen')}
        </button>
        {v.configured && (
          <button className="btn secondary" onClick={runTest} data-tour="cognee-test">
            {tt('Verbindung testen')}
          </button>
        )}
        {v.configured && (
          <button
            className="btn ghost"
            onClick={async () => {
              if (!confirmAsk(tt('Verbindung zu Cognee entfernen? Das geht nur, wenn kein Sub-Account mehr Daten teilt oder in Cognee liegen hat.'))) return;
              try {
                await api.del('/api/agency/cognee');
                toast(tt('Entfernt'));
                setF(null);
                setTest(null);
                void s.reload();
              } catch (e) {
                if (confirmAsk(tt('{message}\n\nTrotzdem entfernen? Die Daten bleiben dann auf dem Server und lassen sich über HyperLevel nicht mehr löschen.', { message: (e as Error).message }))) {
                  await act(() => api.del('/api/agency/cognee?force=1'), tt('Entfernt'));
                  setF(null);
                  setTest(null);
                  void s.reload();
                }
              }
            }}
          >
            {tt('Entfernen')}
          </button>
        )}
      </div>
      {test && <TestResult r={test} />}
      {v.configured && !test && v.last_test && (
        <p className="muted small">
          {tt('Letzter Test {dt}:', { dt: dt(v.last_test.at) })} {v.last_test.ok ? <Badge tone="green">ok</Badge> : <Badge tone="red">fehlgeschlagen</Badge>} <PostureBadge state={v.posture?.state} />
        </p>
      )}
      {v.configured && <CogneeOverview />}
    </div>
  );
}

function TestResult({ r }: { r: Json }) {
  const tt = useT('x_ai');
  return (
    <div data-tour="cognee-test-result">
      <ul className="cg-steps">
        {r.steps.map((st: Json) => (
          <li key={st.key}>
            <Badge tone={st.ok ? (st.warn ? 'yellow' : 'green') : 'red'}>{st.ok ? (st.warn ? 'unklar' : 'ok') : tt('Fehler')}</Badge>
            <span className="cg-step-label">{st.label}</span>
            <span className="muted small">{st.detail}</span>
          </li>
        ))}
      </ul>
      {r.ok && <Note level="ok">{tt('Verbunden')}{r.version ? tt(' mit Cognee {version}', { version: r.version }) : ''}{tt('. Sub-Accounts können das Gedächtnis jetzt unter Einstellungen → Gedächtnis einschalten.')}</Note>}
    </div>
  );
}

/** All sub-accounts: what is shared, counts, last sync, errors – and the agency's own switches. */
function CogneeOverview() {
  const tt = useT('x_ai');
  const o = useLoad(() => api.get<Json>('/api/agency/cognee/overview'), []);
  const [purge, setPurge] = useState<{ id: string; types: string[]; labels: Record<string, string> } | null>(null);
  const [account, setAccount] = useState<Json | null>(null);
  const session = useSession();
  if (!o.data) return <Spinner />;
  const rows: Json[] = o.data.locations;
  const active = rows.filter((r) => r.enabled).length;
  return (
    <div style={{ marginTop: 16 }} data-tour="cognee-overview">
      <h3 style={{ marginBottom: 4 }}>{tt('Sub-Accounts im Überblick')}</h3>
      <p className="muted small">
        {tt('{active} von {length} Sub-Accounts teilen Daten. Eingeschaltet wird in den Einstellungen des Sub-Accounts (Reiter „Gedächtnis“); hier siehst du den Stand und kannst ausschalten.', { active: active, length: rows.length })}
      </p>
      <div className="table-wrap">
        <table className="t cg-status">
          <thead>
            <tr>
              <th>{tt('Sub-Account')}</th>
              <th>{tt('Freigabe')}</th>
              <th>{tt('Einträge')}</th>
              <th>{tt('Letzter Abgleich')}</th>
              <th>{tt('Zugang')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>
                  {r.enabled ? <Badge tone="green">an</Badge> : <Badge>aus</Badge>} {r.enabled && <span className="muted small">{tt('{length} Datentyp', { length: r.types.length })}{r.types.length === 1 ? '' : 'en'}</span>}
                  {r.errors > 0 && (
                    <>
                      {' '}
                      <Badge tone="red">{tt('{errors} Fehler', { errors: r.errors })}</Badge>
                    </>
                  )}
                </td>
                <td>
                  {r.items}
                  {r.pending_deletions > 0 && <span className="muted small"> {tt('· {pending_deletions} Löschung(en) offen', { pending_deletions: r.pending_deletions })}</span>}
                </td>
                <td>{r.last_sync_at ? dt(r.last_sync_at) : '–'}</td>
                <td>
                  <button className="btn small ghost" onClick={() => setAccount(r)}>
                    {r.account === 'override' ? <Badge tone="blue">eigener: {r.account_label}</Badge> : tt('Agentur-Zugang')}
                  </button>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {r.enabled && (
                    <button
                      className="btn small secondary"
                      onClick={async () => {
                        if (!confirmAsk(tt('Teilen für „{name}“ ausschalten? Es wird nichts mehr übertragen; die vorhandenen Daten in Cognee kannst du danach löschen.', { name: r.name }))) return;
                        const res = await act(() => api.put<Json>(`/api/agency/cognee/locations/${r.id}/settings`, { enabled: false }), tt('Ausgeschaltet'));
                        if (res) {
                          const labels = Object.fromEntries((res.settings.catalog as Json[]).map((c) => [c.key, c.label]));
                          if (res.offer_delete.length) setPurge({ id: r.id, types: res.offer_delete, labels });
                          void o.reload();
                        }
                      }}
                    >
                      {tt('Ausschalten')}
                    </button>
                  )}
                  {!r.enabled && r.items > 0 && (
                    <button
                      className="btn small secondary"
                      onClick={() => setPurge({ id: r.id, types: Object.keys(r.by_type).filter((t) => r.by_type[t] > 0), labels: o.data!.labels })}
                    >
                      {tt('Daten löschen …')}
                    </button>
                  )}{' '}
                  <button className="btn small ghost" onClick={() => session.switchLocation(r.id, 'settings/memory')} title={tt('Einstellungen → Gedächtnis dieses Sub-Accounts')}>
                    <Icon name="settings" size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {purge && (
        <PurgeDialog
          types={purge.types}
          labels={purge.labels}
          url={`/api/agency/cognee/locations/${purge.id}/purge`}
          onClose={() => {
            setPurge(null);
            void o.reload();
          }}
        />
      )}
      {account && (
        <AccountDialog
          row={account}
          onClose={() => {
            setAccount(null);
            void o.reload();
          }}
        />
      )}
    </div>
  );
}

/** A Cognee login of its own for one sub-account: even Cognee then keeps its data apart from the others. */
function AccountDialog({ row, onClose }: { row: Json; onClose: () => void }) {
  const tt = useT('x_ai');
  const [mode, setMode] = useState('password');
  const [email, setEmail] = useState('');
  const [secret, setSecret] = useState('');
  const [result, setResult] = useState<Json | null>(null);
  const own = row.account === 'override';
  return (
    <Modal
      title={tt('Cognee-Zugang für {name}', { name: row.name })}
      onClose={onClose}
      footer={
        <>
          {own && (
            <button
              className="btn ghost danger-text"
              onClick={async () => {
                if (await act(() => api.del(`/api/agency/cognee/locations/${row.id}/account`), tt('Zugang entfernt'))) onClose();
              }}
            >
              {tt('Eigenen Zugang entfernen')}
            </button>
          )}
          <button
            className="btn"
            disabled={!secret || (mode === 'password' && !email)}
            onClick={async () => {
              if (await act(() => api.put(`/api/agency/cognee/locations/${row.id}/account`, mode === 'password' ? { auth_mode: 'password', email, password: secret } : { auth_mode: 'api_key', api_key: secret }), tt('Gespeichert'))) {
                setSecret('');
                setResult((await act(() => api.post<Json>(`/api/agency/cognee/locations/${row.id}/test`, {}))) ?? null);
              }
            }}
          >
            {tt('Speichern & testen')}
          </button>
        </>
      }
    >
      <p className="muted small">
        {tt('Standard ist der Zugang der Agentur (ein Cognee-Nutzer für alle). Mit einem eigenen Cognee-Nutzer für diesen Sub-Account gehören seine Datasets diesem Nutzer – die Trennung gilt dann auch in Cognee selbst. Wechseln geht nur, solange in Cognee noch keine Daten dieses Sub-Accounts liegen.')}
      </p>
      <p>
        {tt('Jetzt:')} {own ? <Badge tone="blue">{tt('eigener Zugang ({account_label})', { account_label: row.account_label })}</Badge> : <Badge>{tt('Zugang der Agentur')}</Badge>}
      </p>
      <Field label={tt('Anmeldung')}>
        <Select value={mode} onChange={setMode} options={[['password', 'E-Mail und Passwort'], ['api_key', 'API-Schlüssel']]} />
      </Field>
      {mode === 'password' && (
        <Field label={tt('E-Mail des Cognee-Nutzers')}>
          <Input type="email" value={email} onChange={setEmail} autoComplete="off" />
        </Field>
      )}
      <Field label={mode === 'password' ? tt('Passwort') : tt('API-Schlüssel')}>
        <Input type="password" value={secret} onChange={setSecret} autoComplete="new-password" />
      </Field>
      {result && <TestResult r={result} />}
    </Modal>
  );
}
