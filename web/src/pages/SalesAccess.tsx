import { useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, Check, Empty, Field, Input, Modal, Select, Spinner, act, confirmAsk, useLoad } from '../ui';
import { Section } from './SalesKit';
import { useT } from '../i18n';

/**
 * Datensatz-Zugriff und Teams: wer welche Kontakte, Firmen, Deals, Aufgaben und Konversationen sieht – alle, nur das eigene Team oder
 * nur die eigenen – und welche Felder ausgeblendet sind. Gilt überall (Listen, Suche, Berichte, Export, KI, Handy-App).
 * Standard ist „Alle sehen alle“ – wer nichts einstellt, merkt keinen Unterschied.
 */

type RuleSet = { levels: Record<string, string>; hidden: Record<string, string[]> };
const empty = (): RuleSet => ({ levels: {}, hidden: {} });
const clean = (r: RuleSet): RuleSet => ({ levels: Object.fromEntries(Object.entries(r.levels).filter(([, v]) => v)), hidden: Object.fromEntries(Object.entries(r.hidden).filter(([, v]) => v.length)) });

function RuleBox({ info, rules, onChange, inherit }: { info: any; rules: RuleSet; onChange: (r: RuleSet) => void; inherit?: boolean }) {
  const tt = useT('x_finance');
  const [more, setMore] = useState<string | null>(null);
  return (
    <table className="matrix">
      <thead>
        <tr>
          <th>{tt('Datensatz')}</th>
          <th>{tt('Wer sieht welche?')}</th>
          <th>{tt('Ausgeblendete Felder')}</th>
        </tr>
      </thead>
      <tbody>
        {info.entities.map((e: any) => {
          const hidden = rules.hidden[e.key] ?? [];
          const custom = e.key === 'contacts' || e.key === 'companies' ? info.custom_fields : [];
          return (
            <tr key={e.key}>
              <td>
                <b>{e.label}</b>
              </td>
              <td>
                <select aria-label={tt('Sichtbarkeit {label}', { label: e.label })} value={rules.levels[e.key] ?? ''} onChange={(ev) => onChange({ ...rules, levels: { ...rules.levels, [e.key]: ev.target.value } })}>
                  {inherit && <option value="">{tt('wie Standard')}</option>}
                  {info.levels.map((l: any) => (
                    <option key={l.key} value={l.key}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <div className="chips">
                  {e.hideable.map((h: any) => (
                    <label className="chip" key={h.key} style={{ minHeight: 44 }}>
                      <input type="checkbox" checked={hidden.includes(h.key)} onChange={(ev) => onChange({ ...rules, hidden: { ...rules.hidden, [e.key]: ev.target.checked ? [...hidden, h.key] : hidden.filter((x) => x !== h.key) } })} />
                      {h.label}
                    </label>
                  ))}
                  {custom.length > 0 && hidden.includes('custom') === false && (
                    <button className="btn small secondary" onClick={() => setMore(more === e.key ? null : e.key)}>
                      {tt('Einzelne eigene Felder…')}
                    </button>
                  )}
                </div>
                {more === e.key && (
                  <div className="chips" style={{ marginTop: 6 }}>
                    {custom.map((c: any) => (
                      <label className="chip" key={c.key} style={{ minHeight: 44 }}>
                        <input type="checkbox" checked={hidden.includes(`custom.${c.key}`)} onChange={(ev) => onChange({ ...rules, hidden: { ...rules.hidden, [e.key]: ev.target.checked ? [...hidden, `custom.${c.key}`] : hidden.filter((x) => x !== `custom.${c.key}`) } })} />
                        {c.label}
                      </label>
                    ))}
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TeamEditor({ team, people, onClose, onSaved }: { team?: any; people: any[]; onClose: () => void; onSaved: () => void }) {
  const tt = useT('x_finance');
  const [nameV, setName] = useState(team?.name ?? '');
  const [desc, setDesc] = useState(team?.description ?? '');
  const [members, setMembers] = useState<{ user_id: string; role: string }[]>((team?.members ?? []).map((m: any) => ({ user_id: m.user_id, role: m.role })));
  const has = (id: string) => members.find((m) => m.user_id === id);
  const save = async () => {
    const body = { name: nameV, description: desc, members };
    const r = await act(() => (team ? api.patch(`/api/sales/teams/${team.id}`, body) : api.post('/api/sales/teams', body)), tt('Team gespeichert'));
    if (r) onSaved();
  };
  return (
    <Modal
      title={team ? tt('Team „{name}“', { name: team.name }) : tt('Neues Team')}
      className="sales-modal"
      onClose={onClose}
      footer={
        <>
          {team && (
            <button className="btn danger" onClick={async () => confirmAsk(tt('Team „{name}“ löschen? Die Personen bleiben, nur die Zuordnung entfällt.', { name: team.name })) && (await act(() => api.del(`/api/sales/teams/${team.id}`), tt('Team gelöscht'))) && onSaved()}>
              {tt('Löschen')}
            </button>
          )}
          <button className="btn" onClick={save}>
            {tt('Speichern')}
          </button>
        </>
      }
    >
      <Field label="Name">
        <Input value={nameV} onChange={setName} maxLength={80} placeholder={tt('Vertrieb Nord')} />
      </Field>
      <Field label={tt('Beschreibung (optional)')}>
        <Input value={desc} onChange={setDesc} maxLength={300} />
      </Field>
      <Field label={tt('Mitglieder')} hint={tt('Wer im selben Team ist, sieht bei „Nur das Team“ die Datensätze der anderen.')}>
        {people.map((p) => (
          <div className="row" key={p.id} style={{ alignItems: 'center' }}>
            <Check checked={!!has(p.id)} onChange={(v) => setMembers(v ? [...members, { user_id: p.id, role: 'member' }] : members.filter((m) => m.user_id !== p.id))} label={`${p.name}`} />
            {has(p.id) && (
              <div style={{ width: 150 }}>
                <Select value={has(p.id)!.role} onChange={(role) => setMembers(members.map((m) => (m.user_id === p.id ? { ...m, role } : m)))} options={[['member', 'Mitglied'], ['lead', 'Teamleitung']]} />
              </div>
            )}
          </div>
        ))}
      </Field>
    </Modal>
  );
}

export function SalesAccess() {
  const tt = useT('x_finance');
  const a = useLoad(() => api.get<any>('/api/sales/access'), []);
  const [enabled, setEnabled] = useState(false);
  const [unassigned, setUnassigned] = useState('show');
  const [def, setDef] = useState<RuleSet>(empty());
  const [users, setUsers] = useState<Record<string, RuleSet>>({});
  const [teams, setTeams] = useState<Record<string, RuleSet>>({});
  const [pick, setPick] = useState('');
  const [team, setTeam] = useState<any | 'new' | null>(null);
  const info = a.data;
  useEffect(() => {
    if (!info) return;
    setEnabled(info.enabled);
    setUnassigned(info.unassigned);
    setDef({ levels: info.rules.default.levels ?? {}, hidden: info.rules.default.hidden ?? {} });
    setUsers(Object.fromEntries(Object.entries<any>(info.rules.users).map(([k, v]) => [k, { levels: v.levels ?? {}, hidden: v.hidden ?? {} }])));
    setTeams(Object.fromEntries(Object.entries<any>(info.rules.teams).map(([k, v]) => [k, { levels: v.levels ?? {}, hidden: v.hidden ?? {} }])));
  }, [info]);
  if (!info) return a.error ? <p className="error">{a.error}</p> : <Spinner />;
  const edit = info.can_configure;
  const save = async () => {
    const mapOf = (now: Record<string, RuleSet>, was: Record<string, unknown>) => ({ ...Object.fromEntries(Object.keys(was).filter((k) => !(k in now)).map((k) => [k, null])), ...Object.fromEntries(Object.entries(now).map(([k, v]) => [k, Object.keys(clean(v).levels).length || Object.keys(clean(v).hidden).length ? clean(v) : null])) });
    const r = await act(() => api.put('/api/sales/access', { enabled, unassigned, rules: { default: clean(def), users: mapOf(users, info.rules.users), teams: mapOf(teams, info.rules.teams) } }), tt('Zugriffsregeln gespeichert'));
    if (r) a.reload();
  };
  const subjects: { key: string; label: string; kind: 'user' | 'team'; id: string }[] = [
    ...info.people.map((p: any) => ({ key: `user:${p.id}`, label: p.name, kind: 'user' as const, id: p.id })),
    ...info.teams.map((t: any) => ({ key: `team:${t.id}`, label: `Team ${t.name}`, kind: 'team' as const, id: t.id })),
  ];
  const withRules = subjects.filter((s) => (s.kind === 'user' ? users[s.id] : teams[s.id]));
  const setFor = (s: { kind: 'user' | 'team'; id: string }, r: RuleSet) => (s.kind === 'user' ? setUsers({ ...users, [s.id]: r }) : setTeams({ ...teams, [s.id]: r }));
  return (
    <div data-tour="access-page">
      <p className="muted">
        {tt('Standardmäßig sieht jede Person mit Zugriff auf einen Bereich alle Datensätze darin. Hier legst du fest, dass Mitarbeitende nur ihre eigenen oder die ihres Teams sehen – und welche Felder ausgeblendet bleiben. Admins, API-Schlüssel und Automationen sehen immer alles.')}
      </p>
      <Section title={tt('Datensatz-Zugriff')}>
        <Check checked={enabled} onChange={setEnabled} label={tt('Regeln einschalten')} tour="access-enable" />
        {enabled && (
          <>
            <Check checked={unassigned === 'show'} onChange={(v) => setUnassigned(v ? 'show' : 'hide')} label={tt('Datensätze ohne Zuständigen sind für alle sichtbar (Pool zum Übernehmen)')} />
            <h4>{tt('Standard für alle')}</h4>
            <RuleBox info={info} rules={def} onChange={setDef} />
            <h4>{tt('Ausnahmen für Personen und Teams')}</h4>
            {withRules.map((s) => (
              <div className="team-card" key={s.key}>
                <div className="sales-sec-head">
                  <b>{s.label}</b>
                  <button className="btn small secondary" onClick={() => (s.kind === 'user' ? setUsers(Object.fromEntries(Object.entries(users).filter(([k]) => k !== s.id))) : setTeams(Object.fromEntries(Object.entries(teams).filter(([k]) => k !== s.id))))}>
                    {tt('Ausnahme entfernen')}
                  </button>
                </div>
                <RuleBox info={info} rules={s.kind === 'user' ? users[s.id] : teams[s.id]} onChange={(r) => setFor(s, r)} inherit />
              </div>
            ))}
            <div className="sales-bar">
              <div style={{ width: 280 }}>
                <Select value={pick} onChange={setPick} placeholder={tt('Ausnahme hinzufügen für…')} options={subjects.filter((s) => !withRules.includes(s)).map((s) => [s.key, s.label] as [string, string])} />
              </div>
              <button className="btn secondary" disabled={!pick} onClick={() => { const s = subjects.find((x) => x.key === pick)!; setFor(s, empty()); setPick(''); }}>
                {tt('Hinzufügen')}
              </button>
            </div>
            <p className="muted small">{tt('Die großzügigste Regel gilt: Hat jemand eine eigene Regel, schlägt sie die Team-Regel, und die schlägt den Standard. Bei mehreren Teams zählt das großzügigste.')}</p>
          </>
        )}
        {edit ? (
          <button className="btn" onClick={save} data-tour="access-save">
            {tt('Speichern')}
          </button>
        ) : (
          <p className="muted">{tt('Nur Admins ändern diese Regeln.')}</p>
        )}
      </Section>

      <Section title={tt('Vertriebsteams')} tour="access-teams" actions={edit && <button className="btn" onClick={() => setTeam('new')}>{tt('+ Team')}</button>}>
        {info.teams.length === 0 ? (
          <Empty>{tt('Teams fassen Personen zusammen: „Nur das Team“ zeigt Datensätze aller Teammitglieder, und Quoten gibt es auch je Team.')}</Empty>
        ) : (
          info.teams.map((t: any) => (
            <div className="team-card" key={t.id}>
              <div className="sales-sec-head">
                <b>{t.name}</b>
                {edit && (
                  <button className="btn small secondary" onClick={() => setTeam(t)}>
                    {tt('Bearbeiten')}
                  </button>
                )}
              </div>
              {t.description && <p className="muted small">{t.description}</p>}
              <div className="chips">
                {t.members.map((m: any) => (
                  <span className="chip" key={m.user_id}>
                    {m.name} {m.role === 'lead' && <Badge tone="blue">{tt('Leitung')}</Badge>}
                  </span>
                ))}
                {!t.members.length && <span className="muted small">{tt('noch keine Mitglieder')}</span>}
              </div>
            </div>
          ))
        )}
      </Section>
      {team && <TeamEditor team={team === 'new' ? undefined : team} people={info.people} onClose={() => setTeam(null)} onSaved={() => (setTeam(null), a.reload())} />}
    </div>
  );
}
