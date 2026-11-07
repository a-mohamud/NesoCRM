import { useState } from 'react';
import { ago, api, dt } from '../api';
import { Icon } from '../icons';
import { useSession } from '../session';
import { Badge, Copy, Empty, Field, Input, MergeHint, Modal, Select, Spinner, Tabs, Textarea, act, confirmAsk, toast, useLoad } from '../ui';
import { AgencyAiProvider } from './AiProvider';
import { SignupLink } from '../referrals';
import { useT } from '../i18n';

/**
 * „KI-Werkzeuge verbinden“: Codex, Claude Code, Cursor (key + copy-paste setup), ChatGPT and Claude.ai
 * (OAuth, no key), connection test, keys with „zuletzt benutzt“, connected apps and – per sub-account –
 * GitHub for Codex. The same page exists for the agency (agency keys, admins only).
 */

const TOOLS: [string, string][] = [
  ['codex', 'Codex (CLI, IDE-Erweiterung)'],
  ['claude-code', 'Claude Code'],
  ['cursor', 'Cursor'],
  ['other', 'Anderes KI-Werkzeug'],
];
const TOOL_LABEL: Record<string, string> = { codex: 'Codex', 'claude-code': 'Claude Code', cursor: 'Cursor', other: 'Sonstiges' };
const KEY_PLACEHOLDER = '<DEIN-SCHLÜSSEL>';

/** A copyable multi-line snippet. */
function Snippet({ text, label }: { text: string; label?: string }) {
  return (
    <div className="snippet">
      {label && <div className="snippet-label">{label}</div>}
      <pre>
        <code>{text}</code>
      </pre>
      <div className="snippet-copy">
        <Copy text={text} />
      </div>
    </div>
  );
}

export function codexToml(mcpUrl: string) {
  return `# ~/.codex/config.toml\n[mcp_servers.gohigh]\nurl = "${mcpUrl}"\nbearer_token_env_var = "GOHIGH_API_KEY"`;
}

function agentsMd(o: { brand: string; mcpUrl: string; agency: boolean; locName?: string; locId?: string }) {
  const scope = o.agency
    ? `Die Verbindung gilt für die ganze Agentur: jedes Projekt ist ein Sub-Account – die location_id kommt aus \`ghl_list_projects\`.`
    : `Die Verbindung gilt nur für den Sub-Account „${o.locName ?? ''}“ (location_id \`${o.locId ?? ''}\`); andere Sub-Accounts sind nicht erreichbar.`;
  return `## ${o.brand} (CRM) über MCP

Das CRM zu diesem Projekt läuft in ${o.brand}. Der MCP-Server \`gohigh\` (${o.mcpUrl}) ist verbunden.
${scope}

- Projekt-Steckbrief zuerst lesen: \`ghl_list_projects\`, \`ghl_get_project\` (Ziele, Links, Repos, Kennzahlen).
- Kontakte & Deals: \`ghl_search_contacts\`, \`ghl_get_contact\`, \`ghl_upsert_contact\`, \`ghl_list_opportunities\`, \`ghl_create_opportunity\`, \`ghl_update_opportunity\`.
- Aufgaben: \`ghl_list_tasks\`, \`ghl_create_task\`, \`ghl_complete_task\`.
- Posteingang: \`ghl_list_conversations\`, \`ghl_get_conversation\`; \`ghl_send_message\` verschickt echt – vorher fragen.
- Inhalte: \`ghl_create_social_post\` und \`ghl_create_blog_post\` legen Entwürfe an.
- Arbeit verknüpfen: diese Codex-Aufgabe bzw. Claude-Sitzung mit \`ghl_update_project\` (\`codex_sessions\` / \`claude_sessions\`) am Projekt eintragen.

Regeln: Schreibende Werkzeuge wirken sofort und stehen im Protokoll. Den Schlüssel nie ins Repository schreiben – er liegt in der Umgebungsvariable \`GOHIGH_API_KEY\` (oder die Verbindung läuft per OAuth).`;
}

/** Copy-paste setup for every tool; with a fresh key it is filled in. */
function SetupGuide({ mcpUrl, apiKey, agency, tour }: { mcpUrl: string; apiKey?: string; agency: boolean; tour?: boolean }) {
  const tt = useT('x_ai');
  const session = useSession();
  const [tab, setTab] = useState('codex');
  const key = apiKey || KEY_PLACEHOLDER;
  const loc = session.locations.find((l) => l.id === session.locationId);
  const brand = session.branding.name || 'HyperLevel';
  return (
    <div data-tour={tour ? 'ai-tools-setup' : undefined}>
      <Tabs
        tabs={[
          ['codex', 'Codex'],
          ['claude-code', 'Claude Code'],
          ['cursor', 'Cursor'],
          ['chatgpt', 'ChatGPT'],
          ['claude-ai', 'Claude.ai'],
          ['agents-md', 'AGENTS.md'],
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'codex' && (
        <>
          <p className="small">
            {tt('Gilt für die')} <strong>{tt('Codex CLI')}</strong> {tt('und die')} <strong>{tt('Codex-Erweiterung')}</strong> {tt('in VS Code, Cursor & Co. – beide lesen')} <code>~/.codex/config.toml</code>.
          </p>
          <Snippet label={tt('1. In ~/.codex/config.toml eintragen')} text={codexToml(mcpUrl)} />
          <Snippet label={tt('2. Schlüssel als Umgebungsvariable setzen (z. B. in ~/.zshrc oder ~/.bashrc)')} text={tt('export GOHIGH_API_KEY="{key}"', { key: key })} />
          <Snippet label={tt('Oder alles per Befehl')} text={tt('codex mcp add gohigh --url {mcpUrl} --bearer-token-env-var GOHIGH_API_KEY', { mcpUrl: mcpUrl })} />
          <Snippet label={tt('Ohne Schlüssel (Anmeldung im Browser per OAuth)')} text={tt('codex mcp add gohigh --url {mcpUrl}\ncodex mcp login gohigh', { mcpUrl: mcpUrl })} />
          <p className="muted small">{tt('Prüfen:')} <code>{tt('codex mcp list')}</code> {tt('– in Codex fragt z. B. „Welche Aufgaben sind in {brand} offen?“.', { brand: brand })}</p>
        </>
      )}
      {tab === 'claude-code' && (
        <>
          <Snippet label={tt('Im Terminal')} text={tt('claude mcp add --transport http gohigh {mcpUrl} --header "Authorization: Bearer {key}"', { mcpUrl: mcpUrl, key: key })} />
          <p className="muted small">
            {tt('Mit')} <code>{tt('--scope project')}</code> {tt('landet die Verbindung in')} <code>.mcp.json</code> {tt('des Repos – dann den Schlüssel nicht einchecken. Ohne')} <code>--header</code> {tt('meldet sich Claude Code per OAuth an (')}<code>/mcp</code> {tt('→ „Authenticate“).')}
          </p>
        </>
      )}
      {tab === 'cursor' && (
        <>
          <Snippet label={tt('~/.cursor/mcp.json (oder .cursor/mcp.json im Projekt)')} text={JSON.stringify({ mcpServers: { gohigh: { url: mcpUrl, headers: { Authorization: `Bearer ${key}` } } } }, null, 2)} />
          <p className="muted small">{tt('Danach in Cursor unter Einstellungen → MCP den Server „gohigh“ einschalten. Projekt-Dateien mit Schlüssel nicht einchecken.')}</p>
        </>
      )}
      {tab === 'chatgpt' && (
        <ol className="steps small">
          <li>{tt('ChatGPT → Einstellungen →')} <strong>{tt('Apps & Konnektoren')}</strong> {tt('→ Erweitert →')} <strong>{tt('Entwicklermodus')}</strong> einschalten.</li>
          <li>
            {tt('„Erstellen“ (Konnektor/App): Name')} <strong>{brand}</strong>{tt(', MCP-Server-URL')} <code>{mcpUrl}</code>{tt(', Authentifizierung')} <strong>{tt('OAuth')}</strong>.
          </li>
          <li>{tt('ChatGPT öffnet die {brand}-Anmeldung: einloggen,', { brand: brand })} {agency ? tt('Agentur oder Sub-Account') : tt('Sub-Account')} {tt('wählen, „Zulassen“.')}</li>
          <li>{tt('Im Chat über „+“ → Entwicklermodus den Konnektor auswählen. Getrennt wird hier unter „Verbundene Apps“.')}</li>
        </ol>
      )}
      {tab === 'claude-ai' && (
        <ol className="steps small">
          <li>{tt('Claude.ai (oder Claude Desktop) → Einstellungen →')} <strong>{tt('Konnektoren')}</strong> {tt('→ „Benutzerdefinierten Konnektor hinzufügen“.')}</li>
          <li>
            Name <strong>{brand}</strong>{tt(', URL')} <code>{mcpUrl}</code> {tt('– ohne Client-ID/Secret (die App registriert sich selbst).')}
          </li>
          <li>{tt('„Verbinden“ → {brand}-Anmeldung →', { brand: brand })} {agency ? tt('Agentur oder Sub-Account') : tt('Sub-Account')} {tt('wählen → „Zulassen“.')}</li>
          <li>{tt('Im Chat unter „Suchen und Werkzeuge“ den Konnektor einschalten.')}</li>
        </ol>
      )}
      {tab === 'agents-md' && (
        <>
          <p className="small">{tt('In die')} <code>{tt('AGENTS.md')}</code> {tt('(Codex) oder')} <code>{tt('CLAUDE.md')}</code> {tt('(Claude Code) deiner Repos – damit der Agent weiß, was die {brand}-Werkzeuge können:', { brand: brand })}</p>
          <Snippet text={agentsMd({ brand, mcpUrl, agency, locName: loc?.name, locId: loc?.id })} />
        </>
      )}
    </div>
  );
}

function TestResult({ r }: { r: any }) {
  const tt = useT('x_ai');
  if (!r) return null;
  return r.ok ? (
    <p className="ai-test ok">
      <Icon name="ok" /> {tt('Verbunden mit {server} · Protokoll {protocol} · {tools} Werkzeuge (', { server: r.server, protocol: r.protocol, tools: r.tools })}{r.sample.slice(0, 4).join(', ')} …) · {r.ms} ms
    </p>
  ) : (
    <p className="ai-test err">
      {tt('Fehler bei {step}: {error}', { step: r.step, error: r.error })}
    </p>
  );
}

function TestConnection({ agency }: { agency: boolean }) {
  const tt = useT('x_ai');
  const [key, setKey] = useState('');
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="card" data-tour="ai-tools-test">
      <h2>{tt('Verbindung testen')}</h2>
      <p className="muted small">{tt('Schickt mit dem Schlüssel ein echtes MCP-„initialize“ und „tools/list“ an diese Instanz – genau wie Codex oder Claude Code.')}</p>
      <div className="row">
        <div className="grow">
          <Input type="password" autoComplete="off" value={key} onChange={setKey} placeholder={agency ? tt('pghla_… oder pghl_…') : 'pghl_…'} />
        </div>
        <button
          className="btn secondary"
          disabled={!key.trim() || busy}
          onClick={async () => {
            setBusy(true);
            setRes(await act(() => api.post(agency ? '/api/agency/ai-tools/test' : '/api/ai-tools/test', { key: key.trim() })));
            setBusy(false);
          }}
        >
          {tt('Testen')}
        </button>
      </div>
      <TestResult r={res} />
    </div>
  );
}

function NewKeyModal({ created, mcpUrl, agency, onClose }: { created: any; mcpUrl: string; agency: boolean; onClose: () => void }) {
  const tt = useT('x_ai');
  const [res, setRes] = useState<any>(null);
  return (
    <Modal title={tt('{name} – jetzt einrichten', { name: created.name })} onClose={onClose} wide>
      <p>
        {tt('Der Schlüssel wird')} <strong>{tt('nur dieses eine Mal')}</strong> {tt('angezeigt – gleich einrichten oder im Passwort-Manager speichern.')}{' '}
        {agency ? (created.scope === 'read' ? <Badge>{tt('Agentur · nur lesen')}</Badge> : <Badge tone="purple">{tt('Agentur · lesen & schreiben')}</Badge>) : <Badge tone="blue">{tt('nur dieser Sub-Account')}</Badge>}
      </p>
      <Snippet text={created.key} />
      <p>
        <button className="btn secondary" onClick={async () => setRes(await act(() => api.post(agency ? '/api/agency/ai-tools/test' : '/api/ai-tools/test', { key: created.key })))}>
          {tt('Verbindung testen')}
        </button>
      </p>
      <TestResult r={res} />
      <SetupGuide mcpUrl={mcpUrl} apiKey={created.key} agency={agency} />
    </Modal>
  );
}

export function AiTools({ agency = false }: { agency?: boolean }) {
  const tt = useT('x_ai');
  const session = useSession();
  const base = agency ? '/api/agency/ai-tools' : '/api/ai-tools';
  const data = useLoad(() => api.get<any>(base), [session.locationId, agency]);
  const [tool, setTool] = useState('codex');
  const [label, setLabel] = useState('');
  const [scope, setScope] = useState('write');
  const [created, setCreated] = useState<any>(null);
  if (!data.data) return data.error ? <Empty>{data.error}</Empty> : <Spinner />;
  const d = data.data;
  const loc = session.locations.find((l) => l.id === session.locationId);
  const brand = session.branding.name || 'HyperLevel';
  return (
    <div className="ai-tools">
      <div className="card ai-tools-intro" data-tour="ai-tools-intro">
        <Icon name="aiTools" size={22} />
        <div className="grow">
          <h2>{tt('KI-Werkzeuge verbinden')}</h2>
          <p className="muted small">
            {agency
              ? tt('Codex, Claude Code, Cursor, ChatGPT oder Claude.ai arbeiten direkt mit {brand}: alle Projekte, Kontakte, Deals, Aufgaben, Posteingang, Berichte. Agentur-Schlüssel gelten für alle Sub-Accounts.', { brand: brand })
              : `Codex, Claude Code, Cursor, ChatGPT oder Claude.ai arbeiten direkt mit „${loc?.name ?? tt('diesem Sub-Account')}“: Kontakte, Deals, Aufgaben, Posteingang, Inhalte – nur dieser Sub-Account. Jede Änderung steht im Protokoll.`}
          </p>
          <div className="ai-tools-url">
            <span className="muted small">{tt('MCP-Adresse')}</span>
            <code>{d.mcp_url}</code>
            <Copy text={d.mcp_url} />
          </div>
        </div>
      </div>

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="card" style={{ flex: '1 1 340px' }} data-tour="ai-tools-new">
          <h2>
            <Icon name="key" size={18} /> {tt('Mit Schlüssel: Codex, Claude Code, Cursor')}
          </h2>
          <p className="muted small">{tt('Ein Klick erzeugt einen eigenen Schlüssel je Werkzeug und Gerät – so siehst du, was wann benutzt wurde, und kannst einzeln widerrufen.')}</p>
          <div className="grid2">
            <Field label={tt('Werkzeug')}>
              <Select value={tool} onChange={setTool} options={TOOLS} />
            </Field>
            <Field label={tt('Gerät / Zweck')}>
              <Input value={label} onChange={setLabel} placeholder={tt('z. B. Laptop')} maxLength={60} />
            </Field>
          </div>
          {agency && (
            <Field label={tt('Rechte')} hint={tt('Agentur-Schlüssel gelten für alle Sub-Accounts.')}>
              <Select value={scope} onChange={setScope} options={[['write', 'Lesen & schreiben'], ['read', 'Nur lesen']]} />
            </Field>
          )}
          <button
            className="btn"
            data-tour="ai-tools-create"
            onClick={async () => {
              const r = await act(() => api.post(`${base}/keys`, { tool, label: label.trim() || 'Laptop', ...(agency ? { scope } : {}) }));
              if (r) {
                setCreated(r);
                setLabel('');
                data.reload();
              }
            }}
          >
            {agency ? tt('Agentur-Schlüssel erzeugen') : tt('Schlüssel erzeugen')}
          </button>
          {!agency && <p className="muted small">{tt('Der Schlüssel gilt nur für diesen Sub-Account.')}{session.user.role === 'admin' ? tt(' Agentur-Schlüssel für alle Sub-Accounts gibt es unter Agentur → KI-Werkzeuge.') : ''}</p>}
        </div>
        <div className="card" style={{ flex: '1 1 340px' }} data-tour="ai-tools-oauth">
          <h2>
            <Icon name="consent" size={18} /> {tt('Ohne Schlüssel: ChatGPT & Claude.ai')}
          </h2>
          <p className="muted small">
            {tt('ChatGPT (Konnektoren im Entwicklermodus), Claude.ai-Konnektoren und')} <code>{tt('codex mcp login')}</code> {tt('melden sich per')} <strong>{tt('OAuth')}</strong> {tt('an: einfach die MCP-Adresse eintragen, dann öffnet sich die {brand}-Anmeldung. Dort wählst du', { brand: brand })}{' '}
            {agency ? tt('den Sub-Account oder die ganze Agentur') : tt('den Sub-Account')} {tt('und ob die App nur lesen darf.')}
          </p>
          <p className="muted small">{tt('Zugänge laufen nach einer Stunde ab und werden von der App erneuert; trennen kannst du jederzeit unten unter „Verbundene Apps“.')}</p>
        </div>
      </div>

      <div className="card">
        <h2>{tt('Einrichtung')}</h2>
        <SetupGuide mcpUrl={d.mcp_url} agency={agency} tour />
      </div>

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="card" style={{ flex: '1 1 380px' }} data-tour="ai-tools-keys">
          <h2>{tt('Schlüssel')}</h2>
          {d.keys.length ? (
            <div className="table-wrap">
              <table className="t">
                <tbody>
                  {d.keys.map((k: any) => (
                    <tr key={k.id}>
                      <td>
                        <strong>{k.name}</strong> {k.tool && <Badge tone="blue">{TOOL_LABEL[k.tool] ?? k.tool}</Badge>} {agency && <Badge tone={k.scope === 'read' ? 'gray' : 'purple'}>{k.scope === 'read' ? 'lesen' : 'schreiben'}</Badge>}
                        <div className="muted small">
                          <span className="mono">{k.prefix}…</span> {tt('· angelegt {dt} · zuletzt benutzt', { dt: dt(k.created_at) })} {k.last_used_at ? ago(k.last_used_at) : 'nie'}
                        </div>
                      </td>
                      <td className="actions">
                        <button className="btn small ghost" onClick={async () => confirmAsk(tt('Schlüssel „{name}“ widerrufen? Werkzeuge mit diesem Schlüssel verlieren sofort den Zugang.', { name: k.name })) && (await act(() => api.del(`${base}/keys/${k.id}`), tt('Widerrufen'))) && data.reload()}>
                          {tt('Widerrufen')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>{tt('Noch keine Schlüssel.')}</Empty>
          )}
        </div>
        <div className="card" style={{ flex: '1 1 380px' }} data-tour="ai-tools-apps">
          <h2>{tt('Verbundene Apps (OAuth)')}</h2>
          {d.apps.length ? (
            <div className="table-wrap">
              <table className="t">
                <tbody>
                  {d.apps.map((a: any) => (
                    <tr key={a.id}>
                      <td>
                        <strong>{a.client_name}</strong> <Badge tone={a.access === 'read' ? 'gray' : 'purple'}>{a.access === 'read' ? tt('nur lesen') : tt('lesen & schreiben')}</Badge>
                        <div className="muted small">
                          {tt('{v} · freigegeben von {user_name} {ago} · zuletzt benutzt', { v: a.known ?? a.redirect_host, user_name: a.user_name, ago: ago(a.created_at) })} {a.last_used_at ? ago(a.last_used_at) : 'nie'}
                        </div>
                      </td>
                      <td className="actions">
                        <button className="btn small ghost" onClick={async () => confirmAsk(tt('„{client_name}“ trennen? Die App verliert sofort den Zugang.', { client_name: a.client_name })) && (await act(() => api.del(`${base}/apps/${a.id}`), tt('Getrennt'))) && data.reload()}>
                          {tt('Trennen')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>{tt('Noch keine App per OAuth verbunden.')}</Empty>
          )}
        </div>
      </div>

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 380px' }}>
          <TestConnection agency={agency} />
        </div>
        <div style={{ flex: '1 1 380px' }}>{agency ? <AgencyAiProvider /> : <GithubCodex />}</div>
      </div>

      {created && <NewKeyModal created={created} mcpUrl={d.mcp_url} agency={agency} onClose={() => setCreated(null)} />}
    </div>
  );
}

/** GitHub token + default repository for the workflow action „GitHub-Issue für Codex anlegen“. */
export function GithubCodex() {
  const tt = useT('x_ai');
  const s = useLoad(() => api.get<any>('/api/github-codex/settings'), []);
  const [token, setToken] = useState('');
  const [repo, setRepo] = useState<string | null>(null);
  if (!s.data) return s.error ? <Empty>{s.error}</Empty> : <Spinner />;
  const save = async (patch: any) => {
    const r = await act(() => api.put('/api/github-codex/settings', patch), tt('Gespeichert'));
    if (r) (s.setData(r), setToken(''), setRepo(null));
  };
  return (
    <div className="card" data-tour="ai-tools-github">
      <h2>
        <Icon name="github" size={18} /> {tt('GitHub für Codex')} <SignupLink id="github" />
      </h2>
      <p className="muted small">
        {tt('Für die Workflow-Aktion „GitHub-Issue für Codex anlegen“: Sie legt ein Issue mit dem Kontext des Kontakts und einer Zeile')} <code>{tt('@codex …')}</code> {tt('an – Codex übernimmt es als Aufgabe. Im Repository muss die Codex-GitHub-Integration eingeschaltet sein.')}
      </p>
      <Field label={tt('GitHub-Token')} hint={tt('Fein granularer Token mit „Issues: lesen & schreiben“ für die gewünschten Repositories. Wird verschlüsselt gespeichert und nie wieder angezeigt.')}>
        {s.data.token_set && !token ? (
          <div className="row" style={{ alignItems: 'center' }}>
            <Badge tone="green">hinterlegt {s.data.token_hint}</Badge>
            <button className="btn small secondary" onClick={() => setToken(' ')}>
              {tt('Ersetzen')}
            </button>
            <button className="btn small secondary" onClick={() => confirmAsk(tt('Token entfernen?')) && save({ token: null })}>
              {tt('Entfernen')}
            </button>
          </div>
        ) : (
          <Input type="password" autoComplete="off" value={token.trim()} onChange={setToken} placeholder="github_pat_…" />
        )}
      </Field>
      <Field label={tt('Standard-Repository')}>
        <Input value={repo ?? s.data.default_repo} onChange={setRepo} placeholder="besitzer/repository" />
      </Field>
      <div className="row">
        <button className="btn" onClick={() => save({ ...(token.trim() ? { token: token.trim() } : {}), ...(repo !== null ? { default_repo: repo } : {}) })}>
          {tt('Speichern')}
        </button>
        <button
          className="btn secondary"
          disabled={!s.data.token_set}
          onClick={async () => {
            const r = await act(() => api.post('/api/github-codex/test', {}));
            if (r) toast(tt('Zugriff ok: {repo}', { repo: r.repo }));
          }}
        >
          {tt('Zugriff prüfen')}
        </button>
      </div>
    </div>
  );
}

/** Workflow step „GitHub-Issue für Codex anlegen“. */
export function GithubIssueStep({ step, set }: { step: any; set: (p: any) => void }) {
  const tt = useT('x_ai');
  const s = useLoad(() => api.get<any>('/api/github-codex/settings'), []);
  return (
    <>
      {s.data && !s.data.token_set && <p className="muted small">{tt('Erst unter Einstellungen → KI-Werkzeuge → „GitHub für Codex“ einen Token hinterlegen.')}</p>}
      <Field label={tt('Repository')} hint={tt('besitzer/name – leer = Standard{v}. Codex muss dort per GitHub-Integration aktiv sein.', { v: s.data?.default_repo ? ` (${s.data.default_repo})` : '' })}>
        <Input value={step.repo} onChange={(v) => set({ repo: v })} placeholder={s.data?.default_repo || 'acme/website'} />
      </Field>
      <Field label={tt('Titel')}>
        <Input value={step.title} onChange={(v) => set({ title: v })} placeholder={tt('Fehler gemeldet von {{contact.first_name}}')} />
      </Field>
      <Field label={tt('Beschreibung (optional)')} hint={tt('Kontakt, E-Mail, Firma und ein Link zum Kontakt werden automatisch angehängt.')}>
        <Textarea value={step.body} onChange={(v) => set({ body: v })} rows={4} />
      </Field>
      <Field label={tt('Coding-Agent')}>
        <Select value={step.agent ?? 'codex'} onChange={(v) => set({ agent: v })} options={[['codex', '@codex'], ['claude', '@claude']]} />
      </Field>
      <Field label={tt('Auftrag an den Agenten')} hint={tt('Steht im Issue als Zeile „@codex …“ bzw. „@claude …“ – der Agent übernimmt das Issue dann als Aufgabe.')}>
        <Textarea value={step.prompt} onChange={(v) => set({ prompt: v })} rows={3} placeholder={tt('Bitte den Fehler finden, beheben und einen Pull Request öffnen.')} />
      </Field>
      <Field label={tt('Labels (optional, mit Komma)')}>
        <Input value={step.labels} onChange={(v) => set({ labels: v })} placeholder={tt('bug, kunde')} />
      </Field>
      <MergeHint />
    </>
  );
}
