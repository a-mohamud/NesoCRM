import { useState } from 'react';
import { Badge, Field, Input, Tabs, act, confirmAsk, toastError } from '../ui';
import { sizeLabel, type Conn, type SourceInfo, type UFile, type UmzugApi } from './umzug-format';
import { useT } from '../i18n';

/** Schritt 2 des Umzugs: mit der Schnittstelle verbinden (API-Schlüssel) oder Export-Dateien hochladen. */

export function UmzugConnect({
  api,
  src,
  conn,
  files,
  fileKinds,
  maxMb,
  mode,
  onMode,
  selected,
  onSelected,
  onChanged,
  onNext,
}: {
  api: UmzugApi;
  src: SourceInfo;
  conn: Conn | undefined;
  files: UFile[];
  fileKinds: { key: string; label: string }[];
  maxMb: number;
  mode: 'api' | 'file';
  onMode: (m: 'api' | 'file') => void;
  selected: string[];
  onSelected: (ids: string[]) => void;
  onChanged: () => void;
  onNext: () => void;
}) {
  const tt = useT('x_integrations');
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [reconnect, setReconnect] = useState(false);
  const connected = !!conn?.connected && !reconnect;
  const ready = src.credentials.every((c) => c.optional || (creds[c.key] ?? '').trim());

  const connect = async () => {
    setBusy('connect');
    const r = await act(() => api.put(`/api/umzug/connections/${src.key}`, creds), tt('{label} ist verbunden', { label: src.label }));
    setBusy('');
    if (r) {
      setCreds({});
      setReconnect(false);
      onChanged();
    }
  };
  const disconnect = async () => {
    if (!confirmAsk(tt('Verbindung zu {label} trennen? Der gespeicherte Schlüssel wird gelöscht – schon übernommene Daten bleiben.', { label: src.label }))) return;
    await act(() => api.del(`/api/umzug/connections/${src.key}`), tt('Verbindung getrennt'));
    onChanged();
  };

  const upload = async (list: File[], kind: string) => {
    if (!list.length) return;
    setBusy(`up-${kind}`);
    const added: string[] = [];
    for (const file of list) {
      if (file.size > maxMb * 1024 * 1024) {
        toastError(new Error(tt('„{name}“ ist größer als {maxMb} MB', { name: file.name, maxMb: maxMb })));
        continue;
      }
      const r = await act(() => api.upload(src.key, file, kind));
      if (r?.id) added.push(r.id);
    }
    setBusy('');
    if (added.length) {
      onSelected([...selected, ...added]);
      onChanged();
    }
  };
  const remove = async (f: UFile) => {
    if (!(await act(() => api.del(`/api/umzug/files/${f.id}`)))) return;
    onSelected(selected.filter((x) => x !== f.id));
    onChanged();
  };
  const setKind = async (f: UFile, kind: string) => {
    if (await act(() => api.patch(`/api/umzug/files/${f.id}`, { kind }))) onChanged();
  };

  return (
    <div className="um-connect" data-tour="um-connect">
      <Tabs
        tabs={[
          ['api', tt('Mit Schlüssel verbinden')],
          ['file', tt('Export-Datei hochladen')],
        ]}
        value={mode}
        onChange={(m) => onMode(m as 'api' | 'file')}
      />
      {mode === 'api' ? (
        <div className="um-two">
          <div className="card">
            <h3>{src.label} verbinden</h3>
            {connected ? (
              <>
                <p>
                  <Badge tone="green">{tt('verbunden')}</Badge> <strong>{conn?.label || conn?.account}</strong>
                  {conn?.hint && <span className="muted small"> {tt('· Schlüssel {hint}', { hint: conn.hint })}</span>}
                </p>
                <p className="muted small">{tt('Der Schlüssel liegt verschlüsselt auf deinem Server und wird nur für den Umzug gelesen.')}</p>
                <div className="um-actions">
                  <button className="btn" onClick={onNext} data-tour="um-next-preview">
                    {tt('Weiter zur Vorschau')}
                  </button>
                  <button className="btn secondary" onClick={() => setReconnect(true)}>
                    {tt('Anderen Schlüssel eintragen')}
                  </button>
                  <button className="btn ghost" onClick={disconnect}>
                    {tt('Trennen')}
                  </button>
                </div>
              </>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (ready && !busy) void connect();
                }}
              >
                {src.credentials.map((c) => (
                  <Field key={c.key} label={c.label} hint={c.hint}>
                    <Input type={c.secret ? 'password' : 'text'} autoComplete="off" spellCheck={false} placeholder={c.placeholder} value={creds[c.key] ?? ''} onChange={(v) => setCreds({ ...creds, [c.key]: v })} />
                  </Field>
                ))}
                <div className="um-actions">
                  <button className="btn" type="submit" disabled={!ready || !!busy}>
                    {busy === 'connect' ? tt('Prüfe …') : tt('Verbinden und prüfen')}
                  </button>
                  {reconnect && (
                    <button className="btn ghost" type="button" onClick={() => setReconnect(false)}>
                      {tt('Abbrechen')}
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
          <div className="card um-howto">
            <h3>{tt('So kommst du an den Schlüssel')}</h3>
            <ol>
              {src.howto.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ol>
          </div>
        </div>
      ) : (
        <div className="um-two">
          <div className="card" data-tour="um-upload">
            <h3>{tt('Dateien hochladen')}</h3>
            <p className="muted small">{tt('Bis {maxMb} MB je Datei. Die Dateien liegen nur auf deinem Server und werden nach dem Import gelöscht.', { maxMb: maxMb })}</p>
            <div className="um-exports">
              {src.exports.map((x) => (
                <div key={x.key} className="um-export">
                  <div>
                    <strong>{x.label}</strong>
                    <div className="muted small">{x.describe}</div>
                  </div>
                  <label className={`btn secondary${busy ? ' disabled' : ''}`}>
                    {busy === `up-${x.key}` ? tt('Lädt hoch …') : tt('Datei wählen')}
                    <input type="file" hidden multiple disabled={!!busy} accept={x.accept.join(',')} onChange={(e) => {
                      const picked = Array.from(e.target.files ?? []);
                      e.target.value = '';
                      void upload(picked, x.key);
                    }} />
                  </label>
                </div>
              ))}
            </div>
            {files.length > 0 && (
              <div className="um-files">
                <h4>{tt('Bereitliegende Dateien')}</h4>
                {files.map((f) => (
                  <div key={f.id} className="um-file">
                    <input type="checkbox" aria-label={tt('{name} verwenden', { name: f.name })} checked={selected.includes(f.id)} onChange={(e) => onSelected(e.target.checked ? [...selected, f.id] : selected.filter((x) => x !== f.id))} />
                    <div className="um-file-main">
                      <strong>{f.name}</strong>
                      <div className="muted small">
                        {tt('{sizeLabel} · {v} Zeilen', { sizeLabel: sizeLabel(f.size), v: f.rows ?? 0 })}{f.detected ? tt(' · erkannt: {detected}', { detected: f.detected }) : ''}
                      </div>
                      {f.tables && f.tables.length > 0 && <div className="muted small um-cols">{tt('Spalten:')} {f.tables[0].header.slice(0, 8).join(', ')}{f.tables[0].columns > 8 ? ' …' : ''}</div>}
                    </div>
                    <select aria-label={tt('Art von {name}', { name: f.name })} value={f.kind} onChange={(e) => void setKind(f, e.target.value)}>
                      {fileKinds.map((k) => (
                        <option key={k.key} value={k.key}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                    <button className="btn small ghost" onClick={() => void remove(f)} aria-label={tt('{name} löschen', { name: f.name })}>
                      {tt('Löschen')}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="um-actions">
              <button className="btn" disabled={!selected.length} onClick={onNext} data-tour="um-next-preview-file">
                {tt('Weiter zur Vorschau')}
              </button>
            </div>
          </div>
          <div className="card um-howto">
            <h3>{tt('Welche Dateien gehen?')}</h3>
            <ul>
              {src.exports.map((x) => (
                <li key={x.key}>
                  <strong>{x.label}</strong> ({x.accept.join(', ')}) – {x.describe}
                </li>
              ))}
            </ul>
            <p className="muted small">{tt('Die Art einer Datei wird erkannt – stimmt sie nicht, wähle sie in der Liste um.')}</p>
          </div>
        </div>
      )}
      <details className="um-limits">
        <summary>{tt('Was nicht mitkommt')}</summary>
        <ul>
          {src.limits.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
