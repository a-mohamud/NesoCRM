import { useEffect, useState } from 'react';
import './teamtools.css';
import { Icon } from '../icons';
import { api, dt } from '../api';
import { can, useSession } from '../session';
import { useTags } from '../tags';
import { Badge, Check, Empty, Field, Input, Modal, Select, Spinner, TagInput, Tabs, act, confirmAsk, useLoad } from '../ui';
import { when } from './TeamInboxKit';
import { MoreFields } from '../areas/fields';
import { SortableGrid } from '../sortable/Sortable';
import { fmtNumber, intlLocale, tr, useT } from '../i18n';

/**
 * Settings of the Team-Posteingang (Einstellungen → Team-Posteingang, and from the conversation page as a dialog):
 * who gets new conversations (rules, round robin), answer deadlines, business hours, automatic closing, everybody's
 * availability and out-of-office entries, and the numbers (response times, volume per person, SLA rate).
 */

const DAYS: [string, string][] = [
  ['mon', 'Montag'],
  ['tue', 'Dienstag'],
  ['wed', 'Mittwoch'],
  ['thu', 'Donnerstag'],
  ['fri', 'Freitag'],
  ['sat', 'Samstag'],
  ['sun', 'Sonntag'],
];
const CHANNELS: [string, string][] = [
  ['email', 'E-Mail'],
  ['sms', 'SMS'],
  ['chat', 'Website-Chat'],
  ['whatsapp', 'WhatsApp'],
  ['messenger', 'Messenger'],
  ['instagram', 'Instagram'],
  ['telegram', 'Telegram'],
  ['discord', 'Discord'],
];
const fmtMin = (v: number | null | undefined) => {
  const t = tr('x_comms');
  return v == null ? '–' : v < 60 ? t('{n} Min.', { n: Math.round(v) }) : v < 1440 ? t('{n} Std.', { n: fmtNumber(v / 60, { maximumFractionDigits: 1 }) }) : t('{n} T.', { n: fmtNumber(v / 1440, { maximumFractionDigits: 1 }) });
};
const pct = (v: number | null | undefined) => (v == null ? '–' : `${Math.round(v)} %`);
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

// --- the dialog and the settings page ---------------------------------------------------------------------------------

export function TeamInboxModal({ tab, onClose }: { tab?: string; onClose: () => void }) {
  const tt = useT('x_comms');
  return (
    <Modal title={tt('Team-Posteingang')} wide onClose={onClose}>
      <TeamInboxSettings tab={tab} embedded />
    </Modal>
  );
}

export function TeamInboxSettings({ tab: initial, embedded }: { tab?: string; embedded?: boolean }) {
  const tt = useT('x_comms');
  const session = useSession();
  const admin = can(session, 'settings');
  const tabs: [string, string][] = [
    ...(admin ? ([['assign', tt('Zuweisung')], ['sla', tt('Antwortfristen')], ['hours', tt('Zeiten & Aufräumen')]] as [string, string][]) : []),
    ['people', tt('Verfügbarkeit')],
    ...(can(session, 'reports') ? ([['stats', tt('Auswertung')]] as [string, string][]) : []),
  ];
  const [tab, setTab] = useState(tabs.some(([k]) => k === initial) ? initial! : tabs[0][0]);
  return (
    <div className="tx-set" data-tour="inbox-settings-panel">
      {!embedded && <p className="muted">{tt('Wer neue Konversationen bekommt, bis wann geantwortet sein soll und wer gerade erreichbar ist – für alle Kanäle im Posteingang.')}</p>}
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {admin && ['assign', 'sla', 'hours'].includes(tab) && <Rules tab={tab} />}
      {tab === 'people' && <People />}
      {tab === 'stats' && <Stats />}
    </div>
  );
}

// --- rules, SLA, hours (one draft, one save) --------------------------------------------------------------------------

function Rules({ tab }: { tab: string }) {
  const tt = useT('x_comms');
  const loaded = useLoad(() => api.get<any>('/api/inbox/settings'), []);
  const [draft, setDraft] = useState<any>(null);
  const [dirty, setDirty] = useState(false);
  const tags = useTags();
  useEffect(() => {
    if (loaded.data) (setDraft(structuredClone({ assignment: loaded.data.assignment, sla: loaded.data.sla, business_hours: loaded.data.business_hours, holidays: loaded.data.holidays, auto_close_days: loaded.data.auto_close_days, reply_sets_waiting: loaded.data.reply_sets_waiting, notifications: loaded.data.notifications })), setDirty(false));
  }, [loaded.data]);
  if (loaded.error) return <Empty>{loaded.error}</Empty>;
  if (!loaded.data || !draft) return <Spinner />;
  const people: { id: string; name: string }[] = loaded.data.people ?? [];
  const teams: { id: string; name: string }[] = loaded.data.teams ?? [];
  const edit = (fn: (d: any) => void) => {
    const next = structuredClone(draft);
    fn(next);
    setDraft(next);
    setDirty(true);
  };
  const a = draft.assignment;
  const save = async () => {
    const r = await act(() => api.put('/api/inbox/settings', draft), tt('Gespeichert'));
    if (r) loaded.setData(r), setDirty(false);
  };
  return (
    <>
      {tab === 'assign' && (
        <>
          <div className="grid2">
            <Field label={tt('Neue Konversationen zuweisen')} hint={tt('Von Hand: niemand bekommt sie automatisch. Reihum: der Reihe nach. Geringste Auslastung: wer am wenigsten offene hat.')} tour="inbox-mode">
              <Select value={a.mode} onChange={(v) => edit((d) => (d.assignment.mode = v))} options={[['manual', tt('Von Hand')], ['round_robin', tt('Reihum (Round Robin)')], ['least_busy', tt('Geringste Auslastung')]]} />
            </Field>
            <Field label={tt('Wer ist im Topf?')} hint={loaded.data.pool_preview?.length ? tt.plural(loaded.data.pool_preview.length, { one: 'Aktuell {n} Person', other: 'Aktuell {n} Personen' }) : undefined}>
              <Select value={a.pool} onChange={(v) => edit((d) => (d.assignment.pool = v))} options={[['all', tt('Alle mit Zugriff auf Konversationen')], ['team', tt('Ein Team')], ['users', tt('Bestimmte Personen')]]} />
            </Field>
          </div>
          {a.pool === 'team' && (
            <Field label="Team">
              <Select value={a.team_id} onChange={(v) => edit((d) => (d.assignment.team_id = v))} placeholder={tt('– Team wählen –')} options={teams.map((t) => [t.id, t.name])} />
            </Field>
          )}
          {a.pool === 'users' && (
            <div className="tx-people-pick" role="group" aria-label={tt('Personen im Topf')}>
              {people.map((p) => (
                <Check key={p.id} checked={a.user_ids.includes(p.id)} onChange={(on) => edit((d) => (d.assignment.user_ids = on ? [...d.assignment.user_ids, p.id] : d.assignment.user_ids.filter((x: string) => x !== p.id)))} label={p.name} />
              ))}
            </div>
          )}
          <MoreFields id="inbox-assign-options" values={[!a.respect_availability, !a.prefer_contact_owner, !a.reassign_when_away, !a.assign_on_reply]}>
          <div className="tx-checks">
            <Check checked={a.respect_availability} onChange={(v) => edit((d) => (d.assignment.respect_availability = v))} label={tt('Abwesende und pausierte Personen überspringen')} />
            <Check checked={a.prefer_contact_owner} onChange={(v) => edit((d) => (d.assignment.prefer_contact_owner = v))} label={tt('Zuständige Person des Kontakts zuerst')} />
            <Check checked={a.reassign_when_away} onChange={(v) => edit((d) => (d.assignment.reassign_when_away = v))} label={tt('Ist die zuständige Person abwesend, geht die nächste Nachricht an jemand anderen')} />
            <Check checked={a.assign_on_reply} onChange={(v) => edit((d) => (d.assignment.assign_on_reply = v))} label={tt('Wer eine nicht zugewiesene Konversation beantwortet, bekommt sie')} />
          </div>
          </MoreFields>
          <h3 className="tx-h">{tt('Regeln')}</h3>
          <p className="muted small">{tt('Von oben nach unten: die erste passende Regel gewinnt. Ohne passende Regel gilt der Topf oben.')}</p>
          {a.rules.length === 0 && <Empty>{tt('Noch keine Regeln – zum Beispiel „WhatsApp → Anna“ oder „Tag VIP → Team Vertrieb“.')}</Empty>}
          {a.rules.map((r: any, i: number) => (
            <div key={r.id || i} className={`tx-rule${r.enabled ? '' : ' off'}`} data-tour="inbox-rule">
              <div className="tx-rule-head">
                <Input value={r.name} aria-label={tt('Name der Regel')} onChange={(v) => edit((d) => (d.assignment.rules[i].name = v))} />
                <Check checked={r.enabled} onChange={(v) => edit((d) => (d.assignment.rules[i].enabled = v))} label={tt('Aktiv')} />
                <button type="button" className="tx-btn" aria-label={tt('Regel nach oben')} disabled={i === 0} onClick={() => edit((d) => d.assignment.rules.splice(i - 1, 0, ...d.assignment.rules.splice(i, 1)))}>
                  <Icon name="up" size={16} />
                </button>
                <button type="button" className="tx-btn" aria-label={tt('Regel nach unten')} disabled={i === a.rules.length - 1} onClick={() => edit((d) => d.assignment.rules.splice(i + 1, 0, ...d.assignment.rules.splice(i, 1)))}>
                  <Icon name="down" size={16} />
                </button>
                <button type="button" className="tx-btn danger" aria-label={tt('Regel löschen')} onClick={() => confirmAsk(tt('Regel „{name}“ löschen?', { name: r.name })) && edit((d) => d.assignment.rules.splice(i, 1))}>
                  <Icon name="trash" size={16} />
                </button>
              </div>
              <div className="tx-rule-body">
                <div>
                  <div className="tx-label">{tt('Kanäle (leer = alle)')}</div>
                  <div className="tx-chips" role="group" aria-label={tt('Kanäle')}>
                    {CHANNELS.map(([k, l]) => (
                      <button key={k} type="button" className={`tx-toggle${r.channels.includes(k) ? ' on' : ''}`} aria-pressed={r.channels.includes(k)} onClick={() => edit((d) => (d.assignment.rules[i].channels = r.channels.includes(k) ? r.channels.filter((x: string) => x !== k) : [...r.channels, k]))}>
                        {tt(l)}
                      </button>
                    ))}
                  </div>
                </div>
                <Field label={tt('Tags des Kontakts (mindestens eines, leer = alle)')}>
                  <TagInput value={r.tags} onChange={(v) => edit((d) => (d.assignment.rules[i].tags = v))} suggestions={tags} />
                </Field>
                <div className="grid3">
                  <Field label={tt('Zuweisen an')}>
                    <Select value={r.target.type} onChange={(v) => edit((d) => (d.assignment.rules[i].target = { type: v, id: '' }))} options={[['user', tt('Eine Person')], ['team', tt('Ein Team')], ['pool', tt('Den Topf (reihum)')]]} />
                  </Field>
                  {r.target.type !== 'pool' && (
                    <Field label={r.target.type === 'user' ? tt('Person') : 'Team'}>
                      <Select value={r.target.id} onChange={(v) => edit((d) => (d.assignment.rules[i].target.id = v))} placeholder={tt('– wählen –')} options={(r.target.type === 'user' ? people : teams).map((x) => [x.id, x.name])} />
                    </Field>
                  )}
                  <Field label={tt('Priorität setzen')}>
                    <Select value={r.priority} onChange={(v) => edit((d) => (d.assignment.rules[i].priority = v))} options={[['', tt('Unverändert')], ['low', tt('Niedrig')], ['normal', tt('Normal')], ['high', tt('Hoch')], ['urgent', tt('Dringend')]]} />
                  </Field>
                </div>
              </div>
            </div>
          ))}
          <button type="button" className="tx-btn" onClick={() => edit((d) => d.assignment.rules.push({ id: '', name: `Regel ${a.rules.length + 1}`, enabled: true, channels: [], tags: [], target: { type: 'pool', id: '' }, priority: '' }))}>
            {tt('+ Regel hinzufügen')}
          </button>
          <MoreFields id="inbox-notifications" label={tt('Benachrichtigungen')} values={[draft.notifications.assign_email, draft.notifications.mention_email]}>
          <div className="tx-checks">
            <Check checked={draft.notifications.assign_push} onChange={(v) => edit((d) => (d.notifications.assign_push = v))} label={tt('Zuweisung per Push und in der App melden')} />
            <Check checked={draft.notifications.assign_email} onChange={(v) => edit((d) => (d.notifications.assign_email = v))} label={tt('Zuweisung zusätzlich per E-Mail')} />
            <Check checked={draft.notifications.mention_email} onChange={(v) => edit((d) => (d.notifications.mention_email = v))} label={tt('Erwähnungen in Notizen zusätzlich per E-Mail')} />
          </div>
          </MoreFields>
        </>
      )}
      {tab === 'sla' && (
        <>
          <Check checked={draft.sla.enabled} onChange={(v) => edit((d) => (d.sla.enabled = v))} label={tt('Antwortfristen überwachen')} tour="inbox-sla-on" />
          <p className="muted small">{tt('Die Frist startet, wenn ein Kontakt schreibt, und endet mit der ersten menschlichen Antwort.')}</p>
          <div className={`grid2${draft.sla.enabled ? '' : ' tx-dim'}`}>
            <Field label={tt('Erste Antwort (Minuten)')} hint={fmtMin(draft.sla.first_response_min)}>
              <Input type="number" min={1} value={draft.sla.first_response_min} onChange={(v) => edit((d) => (d.sla.first_response_min = Number(v)))} />
            </Field>
            <Field label={tt('Weitere Antworten (Minuten)')} hint={fmtMin(draft.sla.next_response_min)}>
              <Input type="number" min={1} value={draft.sla.next_response_min} onChange={(v) => edit((d) => (d.sla.next_response_min = Number(v)))} />
            </Field>
          </div>
          <MoreFields id="inbox-sla-options" values={[draft.sla.warn_percent !== 80, !draft.sla.business_hours, !draft.sla.notify_assignee, draft.sla.notify_email]}>
          <div className="grid3">
            <Field label={tt('Warnung bei … % der Frist')}>
              <Input type="number" min={1} max={99} value={draft.sla.warn_percent} onChange={(v) => edit((d) => (d.sla.warn_percent = Number(v)))} />
            </Field>
          </div>
          <div className="tx-checks">
            <Check checked={draft.sla.business_hours} onChange={(v) => edit((d) => (d.sla.business_hours = v))} label={tt('Nur Geschäftszeiten zählen (Tab „Zeiten & Aufräumen“)')} />
            <Check checked={draft.sla.notify_assignee} onChange={(v) => edit((d) => (d.sla.notify_assignee = v))} label={tt('Zuständige Person bei Warnung und Überfälligkeit benachrichtigen')} />
            <Check checked={draft.sla.notify_email} onChange={(v) => edit((d) => (d.sla.notify_email = v))} label={tt('Zusätzlich per E-Mail')} />
          </div>
          <p className="muted small">{tt('Verpasste Fristen starten außerdem den Workflow-Auslöser „Antwortfrist im Posteingang überschritten“.')}</p>
          </MoreFields>
        </>
      )}
      {tab === 'hours' && (
        <>
          <h3 className="tx-h">{tt('Geschäftszeiten')}</h3>
          <div className="tx-hours">
            {DAYS.map(([k, l]) => {
              const h = draft.business_hours[k];
              return (
                <div key={k} className="tx-hours-row">
                  <Check checked={h.open} onChange={(v) => edit((d) => (d.business_hours[k].open = v))} label={tt(l)} />
                  <input type="time" aria-label={tt('{l} von', { l: tt(l) })} disabled={!h.open} value={h.from} onChange={(e) => edit((d) => (d.business_hours[k].from = e.target.value))} />
                  <span>–</span>
                  <input type="time" aria-label={tt('{l} bis', { l: l })} disabled={!h.open} value={h.to} onChange={(e) => edit((d) => (d.business_hours[k].to = e.target.value))} />
                </div>
              );
            })}
          </div>
          <Holidays list={draft.holidays} onChange={(v) => edit((d) => (d.holidays = v))} />
          <h3 className="tx-h">{tt('Aufräumen')}</h3>
          <div className="grid2">
            <Field label={tt('Automatisch erledigen nach … Tagen ohne Antwort (0 = nie)')} hint={tt('Gilt, wenn unsere letzte Nachricht so lange unbeantwortet blieb.')}>
              <Input type="number" min={0} max={365} value={draft.auto_close_days} onChange={(v) => edit((d) => (d.auto_close_days = Number(v)))} />
            </Field>
          </div>
          <Check checked={draft.reply_sets_waiting} onChange={(v) => edit((d) => (d.reply_sets_waiting = v))} label={tt('Nach unserer Antwort auf „Wartet auf Kontakt“ setzen')} />
        </>
      )}
      <div className="tx-savebar">
        <button type="button" className="tx-btn primary" disabled={!dirty} onClick={save} data-tour="inbox-save">
          {tt('Speichern')}
        </button>
        {dirty && <span className="muted small">{tt('Ungespeicherte Änderungen')}</span>}
      </div>
    </>
  );
}

function Holidays({ list, onChange }: { list: string[]; onChange: (v: string[]) => void }) {
  const tt = useT('x_comms');
  const [day, setDay] = useState('');
  return (
    <>
      <h3 className="tx-h">{tt('Feiertage und freie Tage')}</h3>
      <p className="muted small">{tt('An diesen Tagen läuft keine Antwortfrist.')}</p>
      <div className="tx-chips">
        {list.map((d) => (
          <span key={d} className="tx-tag">
            {new Date(`${d}T12:00:00`).toLocaleDateString(intlLocale(), { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}
            <button type="button" aria-label={tt('{d} entfernen', { d: d })} onClick={() => onChange(list.filter((x) => x !== d))}>
              ✕
            </button>
          </span>
        ))}
      </div>
      <div className="tx-inline">
        <input type="date" aria-label={tt('Freier Tag')} value={day} onChange={(e) => setDay(e.target.value)} />
        <button type="button" className="tx-btn" disabled={!day || list.includes(day)} onClick={() => (onChange([...list, day].sort()), setDay(''))}>
          {tt('Hinzufügen')}
        </button>
      </div>
    </>
  );
}

// --- availability -------------------------------------------------------------------------------------------------------

const DEFAULT_HOURS = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri'].map((d) => [d, [['09:00', '17:00']]]));

function People() {
  const tt = useT('x_comms');
  const session = useSession();
  const list = useLoad(() => api.get<any[]>('/api/team-people'), []);
  const [edit, setEdit] = useState('');
  const mayEditOthers = can(session, 'settings');
  const state = (p: any) => (p.paused ? ['yellow', tt('Pausiert')] : p.away_now ? ['red', p.back_on ? tt('Abwesend bis {when}', { when: when(p.back_on) }) : tt('Abwesend')] : ['green', tt('Erreichbar')]) as [any, string];
  return (
    <>
      <p className="muted small">{tt('Pausierte oder abwesende Personen bekommen keine neuen Konversationen und keine Round-Robin-Termine. Genehmigte Urlaube aus dem Personal-Bereich zählen automatisch.')}</p>
      <div className="tx-mine card">
        <h3>{tt('Meine Verfügbarkeit')}</h3>
        <Availability userId="me" onChanged={list.reload} />
      </div>
      <h3 className="tx-h">Team</h3>
      {!list.data ? (
        <Spinner />
      ) : (
        <div className="tx-team">
          {list.data.map((p) => {
            const [tone, text] = state(p);
            return (
              <div key={p.id} className="tx-person">
                <div className="grow">
                  <strong>{p.name}</strong>
                  {p.me && <span className="muted"> {tt('(ich)')}</span>}
                  <div className="muted small">{p.email}{p.has_hours ? tt(' · feste Arbeitszeiten') : ''}</div>
                </div>
                <Badge tone={tone}>{text}</Badge>
                {!p.me && mayEditOthers && (
                  <button type="button" className="tx-btn" onClick={() => setEdit(p.id)}>
                    {tt('Bearbeiten')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {edit && (
        <Modal title={tt('Verfügbarkeit: {v}', { v: list.data?.find((p) => p.id === edit)?.name ?? '' })} onClose={() => (setEdit(''), list.reload())}>
          <div className="tx-set">
            <Availability userId={edit} onChanged={list.reload} />
          </div>
        </Modal>
      )}
    </>
  );
}

function Availability({ userId, onChanged }: { userId: string; onChanged: () => void }) {
  const tt = useT('x_comms');
  const av = useLoad(() => api.get<any>(`/api/team-people/${userId}`), [userId]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [hours, setHours] = useState<Record<string, string[][]> | null | undefined>(undefined);
  const data = av.data;
  useEffect(() => {
    if (data) setHours(data.hours);
  }, [data]);
  if (!data) return <Spinner />;
  const put = async (patch: Record<string, unknown>, ok?: string) => {
    const r = await act(() => api.put(`/api/team-people/${userId}`, patch), ok);
    if (r) (av.setData(r), onChanged());
  };
  const addAway = async (start: Date, end: Date, text = note) => {
    const r = await act(() => api.post(`/api/team-people/${userId}/away`, { start_at: start.toISOString(), end_at: end.toISOString(), note: text }), tt('Abwesenheit eingetragen'));
    if (r) (av.setData(r), setFrom(''), setTo(''), setNote(''), onChanged());
  };
  const dayAt = (offset: number, h: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    d.setHours(h, 0, 0, 0);
    return d;
  };
  const hoursOn = !!hours;
  return (
    <div data-tour="inbox-availability-panel">
      <Check checked={data.paused} onChange={(v) => put({ paused: v }, v ? tt('Pausiert – keine neuen Zuweisungen') : tt('Wieder erreichbar'))} label={tt('Pausiert: keine neuen Konversationen und Termine')} />
      <div className="tx-label">{tt('Abwesenheit')}</div>
      {data.away.length === 0 && <p className="muted small">{tt('Keine Abwesenheit eingetragen.')}</p>}
      {data.away.map((a: any) => (
        <div key={a.id} className="tx-away">
          <span className="grow">
            <strong>
              {dt(a.start_at)} – {dt(a.end_at)}
            </strong>
            {a.note && <span className="muted"> · {a.note}</span>}
            {a.source === 'hr' && <span className="muted small"> {tt('· aus dem Personal-Bereich')}</span>}
          </span>
          {a.source !== 'hr' && (
            <button
              type="button"
              className="tx-btn"
              onClick={async () => {
                if (await act(() => api.del(`/api/team-people/away/${a.id}`))) (av.reload(), onChanged());
              }}
            >
              {tt('Entfernen')}
            </button>
          )}
        </div>
      ))}
      <div className="tx-chips">
        <button type="button" className="tx-toggle" onClick={() => addAway(new Date(), dayAt(0, 23), tt('Heute abwesend'))}>
          {tt('Heute')}
        </button>
        <button type="button" className="tx-toggle" onClick={() => addAway(dayAt(1, 0), dayAt(1, 23), tt('Morgen abwesend'))}>
          {tt('Morgen')}
        </button>
        <button type="button" className="tx-toggle" onClick={() => addAway(new Date(), dayAt(7, 0), tt('Eine Woche abwesend'))}>
          {tt('7 Tage')}
        </button>
      </div>
      <div className="tx-away-form">
        <label>
          <span className="small muted">{tt('Von')}</span>
          <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          <span className="small muted">{tt('Bis')}</span>
          <input type="datetime-local" value={to} min={from || localInput(new Date())} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label>
          <span className="small muted">{tt('Notiz (optional)')}</span>
          <input value={note} maxLength={200} placeholder={tt('z. B. Urlaub')} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button type="button" className="tx-btn primary" disabled={!from || !to || new Date(to) <= new Date(from)} onClick={() => addAway(new Date(from), new Date(to))}>
          {tt('Eintragen')}
        </button>
      </div>
      <div className="tx-label">{tt('Arbeitszeiten')}</div>
      <Check
        checked={hoursOn}
        onChange={(v) => {
          setHours(v ? (data.hours ?? DEFAULT_HOURS) : null);
          if (!v && data.hours) void put({ hours: null }, 'Immer erreichbar');
        }}
        label={tt('Feste Arbeitszeiten – außerhalb davon bekomme ich nichts zugewiesen')}
      />
      {hoursOn && hours && (
        <>
          <div className="tx-hours">
            {DAYS.map(([k, l]) => {
              const w = hours[k]?.[0];
              return (
                <div key={k} className="tx-hours-row">
                  <Check checked={!!w} onChange={(v) => setHours({ ...hours, [k]: v ? [['09:00', '17:00']] : [] })} label={tt(l)} />
                  <input type="time" aria-label={tt('{l} von', { l: tt(l) })} disabled={!w} value={w?.[0] ?? '09:00'} onChange={(e) => setHours({ ...hours, [k]: [[e.target.value, w?.[1] ?? '17:00']] })} />
                  <span>–</span>
                  <input type="time" aria-label={tt('{l} bis', { l: l })} disabled={!w} value={w?.[1] ?? '17:00'} onChange={(e) => setHours({ ...hours, [k]: [[w?.[0] ?? '09:00', e.target.value]] })} />
                </div>
              );
            })}
          </div>
          <button type="button" className="tx-btn primary" onClick={() => put({ hours }, 'Arbeitszeiten gespeichert')}>
            {tt('Arbeitszeiten speichern')}
          </button>
        </>
      )}
    </div>
  );
}

// --- numbers ----------------------------------------------------------------------------------------------------------------

function Stats() {
  const tt = useT('x_comms');
  const [range, setRange] = useState('last_30_days');
  const data = useLoad(async () => {
    const run = (q: Record<string, unknown>) => api.post<any>('/api/reports/run', { range, ...q });
    const [people, all, volume, status] = await Promise.all([
      run({ source: 'inbox_responses', group_by: ['responder'], measures: ['count', 'calc:avg_response', 'calc:sla_rate'] }),
      run({ source: 'inbox_responses', measures: ['count', 'calc:avg_response', 'calc:sla_rate'] }),
      run({ source: 'inbox_conversations', group_by: ['assignee'], measures: ['count'] }),
      run({ source: 'inbox_conversations', group_by: ['status'], measures: ['count'] }),
    ]);
    return { people, all, volume, status };
  }, [range]);
  const d = data.data;
  return (
    <div data-tour="inbox-stats">
      <div className="tx-inline">
        <label htmlFor="tx-range" className="small muted">
          {tt('Zeitraum')}
        </label>
        <select id="tx-range" value={range} onChange={(e) => setRange(e.target.value)}>
          {[['last_7_days', 'Letzte 7 Tage'], ['last_30_days', 'Letzte 30 Tage'], ['last_90_days', 'Letzte 90 Tage'], ['this_month', 'Dieser Monat'], ['last_month', 'Letzter Monat'], ['all', 'Gesamter Zeitraum']].map(([k, l]) => (
            <option key={k} value={k}>
              {tt(l)}
            </option>
          ))}
        </select>
      </div>
      {data.error && <Empty>{data.error}</Empty>}
      {!d && !data.error && <Spinner />}
      {d && (
        <>
          <SortableGrid id="team-inbox.stats" className="tx-stats">
            <div className="tx-stat">
              <span className="muted">{tt('Beantwortet')}</span>
              <strong>{d.all.totals.v[0] ?? 0}</strong>
            </div>
            <div className="tx-stat">
              <span className="muted">{tt('Ø Antwortzeit')}</span>
              <strong>{fmtMin(d.all.totals.v[1])}</strong>
              <span className="muted small">{tt('in Geschäftszeiten, wenn Fristen laufen')}</span>
            </div>
            <div className="tx-stat">
              <span className="muted">{tt('Fristen eingehalten')}</span>
              <strong>{pct(d.all.totals.v[2])}</strong>
            </div>
            <div className="tx-stat">
              <span className="muted">{tt('Konversationen')}</span>
              <strong>{d.status.totals.v[0] ?? 0}</strong>
              <span className="muted small">{d.status.rows.map((r: any) => `${r.l[0]}: ${r.v[0]}`).join(' · ')}</span>
            </div>
          </SortableGrid>
          <h3 className="tx-h">{tt('Antworten je Person')}</h3>
          {d.people.rows.length === 0 ? (
            <Empty>{tt('Im Zeitraum wurde noch nichts beantwortet.')}</Empty>
          ) : (
            <div className="tx-table-wrap">
              <table className="t">
                <thead>
                  <tr>
                    <th>{tt('Person')}</th>
                    <th>{tt('Antworten')}</th>
                    <th>{tt('Ø Antwortzeit')}</th>
                    <th>{tt('Fristen eingehalten')}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.people.rows.map((r: any) => (
                    <tr key={r.l[0]}>
                      <td>{r.l[0]}</td>
                      <td>{r.v[0]}</td>
                      <td>{fmtMin(r.v[1])}</td>
                      <td>{pct(r.v[2])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <h3 className="tx-h">{tt('Konversationen je Bearbeiter')}</h3>
          <div className="tx-bars">
            {d.volume.rows.map((r: any) => (
              <div key={r.l[0]} className="tx-bar-row">
                <span>{r.l[0]}</span>
                <span className="tx-bar-track">
                  <span style={{ width: `${Math.max(3, (100 * r.v[0]) / Math.max(1, ...d.volume.rows.map((x: any) => x.v[0])))}%` }} />
                </span>
                <strong>{r.v[0]}</strong>
              </div>
            ))}
          </div>
          <p className="muted small">
            {tt('Mehr in')} <a href="/app/reports">{tt('Berichte')}</a>{tt(': Quellen „Team-Posteingang: Konversationen“ und „Team-Posteingang: Antworten“.')}
          </p>
        </>
      )}
    </div>
  );
}

