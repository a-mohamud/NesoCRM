import { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons';
import { api, dt } from '../api';
import { Badge, Check, Empty, Field, Input, Link, Modal, Select, Spinner, Stat, Textarea, act, confirmAsk, toast, useLoad } from '../ui';
import { Callout, Item, Panel } from './CreatorKit';
import { Tl, dur, useCanSettings } from './CallsKit';
import { phoneDial, usePhone } from './Phone';
import { TagChips } from '../tag-chip';
import { Slot } from '../slots';
import { SortableGrid } from '../sortable/Sortable';
import { useT } from '../i18n';

/**
 * Power-Dialer: call lists from a smart list or tags, one contact after the other. The server decides whether somebody may be called
 * ("Nicht stören", consent, calling hours, holidays, number of attempts), so the rules hold for the browser phone and for click-to-call alike.
 * Outcome codes, notes, callbacks (as a task for the person), voicemail drop and a pause between contacts. Docs: docs/telephony.md.
 */

const DAYS: [string, string][] = [
  ['mon', 'Mo'],
  ['tue', 'Di'],
  ['wed', 'Mi'],
  ['thu', 'Do'],
  ['fri', 'Fr'],
  ['sat', 'Sa'],
  ['sun', 'So'],
];
const KIND_LABEL: Record<string, string> = { retry: 'später nochmal versuchen', callback: 'Rückruf vereinbart', final: 'abgeschlossen' };

// --- settings -----------------------------------------------------------------------------------------------------------------

function SettingsDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const tt = useT('x_comms');
  const data = useLoad(() => api.get('/api/dialer/settings'), []);
  const [s, setS] = useState<any>(null);
  useEffect(() => {
    if (data.data && !s) setS(JSON.parse(JSON.stringify(data.data.settings)));
  }, [data.data]);
  if (!data.data || !s) return <Modal title={tt('Anrufzeiten und Regeln')} onClose={onClose}><Spinner /></Modal>;
  const set = (p: any) => setS({ ...s, ...p });
  const setDisp = (i: number, p: any) => set({ dispositions: s.dispositions.map((d: any, j: number) => (j === i ? { ...d, ...p } : d)) });
  const save = async () => {
    if (await act(() => api.put('/api/dialer/settings', s), tt('Gespeichert'))) {
      onSaved();
      onClose();
    }
  };
  return (
    <Modal
      title={tt('Anrufzeiten und Regeln')}
      wide
      onClose={onClose}
      footer={
        <button className="btn" onClick={save}>
          {tt('Speichern')}
        </button>
      }
    >
      <p className="muted small">{tt('Der Power-Dialer ruft nur an, wenn alle diese Regeln erfüllt sind. Die Prüfung läuft auf dem Server – auch ein direkter Klick auf „Anrufen“ umgeht sie nicht. Zeitzone: {timezone}.', { timezone: data.data.timezone })}</p>
      <h4 style={{ margin: '8px 0' }}>{tt('Anrufzeiten')}</h4>
      <div className="cr-line" style={{ marginBottom: 8 }}>
        {DAYS.map(([k, l]) => (
          <Check key={k} checked={s.days.includes(k)} onChange={(on) => set({ days: on ? [...s.days, k] : s.days.filter((x: string) => x !== k) })} label={l} />
        ))}
      </div>
      <div className="cr-form-row">
        <Field label="von">
          <Input type="time" value={s.from} onChange={(v) => set({ from: v })} />
        </Field>
        <Field label="bis">
          <Input type="time" value={s.to} onChange={(v) => set({ to: v })} />
        </Field>
      </div>
      <Check checked={s.skip_holidays} onChange={(v) => set({ skip_holidays: v })} label={tt('An gesetzlichen Feiertagen nicht anrufen')} />
      {s.skip_holidays && (
        <Field label={tt('Bundesland')}>
          <Select value={s.holiday_state} onChange={(v) => set({ holiday_state: v })} placeholder={tt('nur bundesweite Feiertage')} options={data.data.states.map((x: any) => [x.code, x.name])} />
        </Field>
      )}
      <h4 style={{ margin: '14px 0 8px' }}>{tt('Einwilligung')}</h4>
      <Field label={tt('Wer darf angerufen werden?')} hint={data.data.consent_module ? tt('Das Einwilligungs-Modul ist aktiv.') : tt('Das Einwilligungs-Modul ist nicht aktiv: nur „Nicht stören“ zählt.')}>
        <Select value={s.consent_policy} onChange={(v) => set({ consent_policy: v })} options={[['ledger', 'Nach der Einwilligungs-Regel des Projekts (Ledger)'], ['strict', 'Streng: nur mit bestätigter Telefon-Einwilligung']]} />
      </Field>
      <h4 style={{ margin: '14px 0 8px' }}>{tt('Versuche')}</h4>
      <div className="cr-form-row">
        <Field label={tt('Höchstens … Versuche je Kontakt')}>
          <Input type="number" min={1} max={20} value={s.max_attempts} onChange={(v) => set({ max_attempts: Number(v) })} />
        </Field>
        <Field label={tt('Pause bis zum nächsten Versuch (Minuten)')}>
          <Input type="number" min={5} max={10080} value={s.retry_minutes} onChange={(v) => set({ retry_minutes: Number(v) })} />
        </Field>
        <Field label={tt('Pause nach einem Gespräch (Sekunden)')} hint={tt('Zeit für Notizen, bevor der nächste Kontakt kommt.')}>
          <Input type="number" min={0} max={300} value={s.wrap_seconds} onChange={(v) => set({ wrap_seconds: Number(v) })} />
        </Field>
      </div>
      <h4 style={{ margin: '14px 0 8px' }}>{tt('Ergebnisse (Gesprächsausgang)')}</h4>
      <div className="cr-lines">
        {s.dispositions.map((d: any, i: number) => (
          <div className="cr-line" key={d.key}>
            <div className="grow">
              <Input value={d.label} onChange={(v) => setDisp(i, { label: v })} aria-label={tt('Bezeichnung {key}', { key: d.key })} />
            </div>
            <Select value={d.kind} onChange={(v) => setDisp(i, { kind: v })} options={Object.entries(KIND_LABEL)} />
            <Check checked={d.positive} onChange={(v) => setDisp(i, { positive: v })} label={tt('Erfolg')} />
            <Check checked={d.dnd} onChange={(v) => setDisp(i, { dnd: v })} label={tt('Nicht mehr anrufen')} />
          </div>
        ))}
      </div>
      <p className="muted small">{tt('„Nicht mehr anrufen“ widerruft die Telefon-Einwilligung des Kontakts und stoppt alle offenen Einträge. Mindestens ein Ergebnis muss das bedeuten.')}</p>
    </Modal>
  );
}

// --- create a list ---------------------------------------------------------------------------------------------------------------

function ListDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (l: any) => void }) {
  const tt = useT('x_comms');
  const smart = useLoad(() => api.get<any[]>('/api/smart-lists').catch(() => []), []);
  const tags = useLoad(() => api.get<any[]>('/api/tags').catch(() => []), []);
  const drops = useLoad(() => api.get('/api/telephony/audio?kind=drop').catch(() => ({ audio: [] })), []);
  const [f, setF] = useState({ name: '', source: 'smart_list', smart_list_id: '', tag: '', drop_id: '', notes: '' });
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });
  const create = async () => {
    const body: any = { name: f.name, source: f.source, notes: f.notes, ...(f.drop_id ? { drop_id: f.drop_id } : {}) };
    if (f.source === 'smart_list') body.smart_list_id = f.smart_list_id;
    else body.tags = [f.tag];
    const r = await act(() => api.post('/api/dialer/lists', body));
    if (r) {
      toast(`${r.sync.total} Kontakte in der Liste${r.sync.no_phone ? tt(' ({no_phone} ohne Telefonnummer ausgelassen)', { no_phone: r.sync.no_phone }) : ''}`);
      onCreated(r);
      onClose();
    }
  };
  const ok = f.name.trim() && (f.source === 'smart_list' ? f.smart_list_id : f.tag);
  return (
    <Modal
      title={tt('Neue Anrufliste')}
      onClose={onClose}
      footer={
        <button className="btn" disabled={!ok} onClick={create}>
          {tt('Liste anlegen')}
        </button>
      }
    >
      <Field label="Name">
        <Input value={f.name} onChange={(v) => set({ name: v })} maxLength={100} placeholder={tt('z. B. Webinar-Teilnehmer nachfassen')} />
      </Field>
      <Field label={tt('Woher kommen die Kontakte?')}>
        <Select value={f.source} onChange={(v) => set({ source: v })} options={[['smart_list', 'Aus einer Smart List'], ['tags', 'Aus einem Tag']]} />
      </Field>
      {f.source === 'smart_list' ? (
        <Field label={tt('Smart List')} hint={tt('Nur Kontakte mit Telefonnummer kommen in die Liste. Kontakte, die nicht angerufen werden dürfen, werden beim Durchgehen markiert.')}>
          <Select value={f.smart_list_id} onChange={(v) => set({ smart_list_id: v })} placeholder={tt('— bitte wählen —')} options={(smart.data ?? []).map((x) => [x.id, x.name])} />
        </Field>
      ) : (
        <Field label="Tag">
          <Select value={f.tag} onChange={(v) => set({ tag: v })} placeholder={tt('— bitte wählen —')} options={(tags.data ?? []).map((x) => x.name)} />
        </Field>
      )}
      <Field label={tt('Nachricht für die Mailbox (optional)')} hint={tt('Eine Aufnahme, die der Dialer bei einem Anrufbeantworter abspielt. Unter Telefonmenü → Audio als „Voicemail-Drop“ anlegen.')}>
        <Select value={f.drop_id} onChange={(v) => set({ drop_id: v })} placeholder="keine" options={(drops.data?.audio ?? []).map((a: any) => [a.id, a.name])} />
      </Field>
      <Field label={tt('Notiz zur Liste (optional)')}>
        <Textarea value={f.notes} onChange={(v) => set({ notes: v })} rows={2} maxLength={2000} />
      </Field>
    </Modal>
  );
}

// --- working a list ---------------------------------------------------------------------------------------------------------------

function Session({ list, onBack }: { list: any; onBack: () => void }) {
  const tt = useT('x_comms');
  const settings = useLoad(() => api.get('/api/dialer/settings'), []);
  const colleagues = useLoad(() => api.get<any[]>('/api/phone/colleagues').catch(() => []), []);
  const phone = usePhone();
  const [state, setState] = useState<any>(null);
  const [callId, setCallId] = useState('');
  const [note, setNote] = useState('');
  const [cb, setCb] = useState({ at: '', user: '' });
  const [auto, setAuto] = useState(true);
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const item = state?.item;
  const dispositions: any[] = settings.data?.settings.dispositions ?? [];
  const dialed = !!callId || (!!item && phone.call?.contactId === item.contact.id);

  // The call the browser phone has right now belongs to this entry: remember its id (needed for the voicemail drop).
  useEffect(() => {
    const pc = phone.call;
    if (item && pc && pc.contactId === item.contact.id && pc.callId) setCallId(pc.callId);
  }, [phone.call?.callId, phone.call?.contactId, item?.id]);
  useEffect(() => () => clearInterval(timer.current), []);

  const next = async () => {
    clearInterval(timer.current);
    setWait(0);
    setBusy(true);
    const r = await act(() => api.post(`/api/dialer/lists/${list.id}/next`, {}));
    setBusy(false);
    if (!r) return;
    setState(r);
    setCallId('');
    setNote('');
    setCb({ at: '', user: '' });
  };
  useEffect(() => {
    void next();
  }, [list.id]);

  const call = async () => {
    if (!item) return;
    setBusy(true);
    const c = item.contact;
    // The server checks again whether this contact may be called now; a "no" comes back as the reason.
    const check = await act(() => api.post(`/api/dialer/items/${item.id}/dial`));
    if (!check) return setBusy(false);
    if (phone.status === 'ready') {
      await phoneDial(c.phone, { contactId: c.id, name: c.name, dialerItem: item.id });
    } else {
      const r = await act(() => api.post('/api/calls', { contact_id: c.id, dialer_item_id: item.id }));
      if (r) {
        setCallId(r.id);
        toast(tt('Dein Telefon klingelt gleich – nimm ab, dann wird verbunden.'));
      }
    }
    setBusy(false);
  };

  const dispose = async (d: any) => {
    if (d.kind === 'callback' && !cb.at) return toast(tt('Bitte Datum und Uhrzeit des Rückrufs wählen.'));
    if (d.dnd && !confirmAsk(tt('{name} wird nicht mehr angerufen (Einwilligung wird widerrufen). Fortfahren?', { name: item.contact.name }))) return;
    setBusy(true);
    const r = await act(() => api.post(`/api/dialer/items/${item.id}/disposition`, { code: d.key, note, call_id: callId || undefined, ...(d.kind === 'callback' ? { callback_at: new Date(cb.at).toISOString(), callback_user: cb.user || undefined } : {}) }), tt('Gespeichert: {label}', { label: d.label }));
    setBusy(false);
    if (!r) return;
    setState({ ...state, item: null, counts: r.counts, finished: true });
    if (auto) {
      const secs = settings.data?.settings.wrap_seconds ?? 10;
      if (secs <= 0) return void next();
      setWait(secs);
      let left = secs;
      timer.current = setInterval(() => {
        left -= 1;
        setWait(left);
        if (left <= 0) {
          clearInterval(timer.current);
          void next();
        }
      }, 1000);
    }
  };

  const drop = async () => {
    if (!callId) return;
    setBusy(true);
    const r = await act(() => api.post(`/api/dialer/calls/${callId}/drop`, {}), tt('Nachricht wird abgespielt – der Anruf endet danach.'));
    setBusy(false);
    if (r) {
      setState({ ...state, item: null, finished: true });
      if (auto) setTimeout(() => void next(), (settings.data?.settings.wrap_seconds ?? 10) * 1000);
    }
  };

  const w = settings.data?.window;
  const counts = state?.counts ?? list.counts;
  return (
    <>
      <div className="tl-bar">
        <button className="btn secondary" onClick={onBack}>
          {tt('← Alle Listen')}
        </button>
        <h2 style={{ margin: 0 }} className="grow">
          {list.name}
        </h2>
        {w && <span className={`tl-window ${w.open ? 'open' : 'closed'}`}>{w.open ? tt('Anrufzeit läuft') : w.reason}</span>}
        <Check checked={auto} onChange={setAuto} label={tt('Automatisch weiter')} tour="dialer-auto" />
      </div>
      <SortableGrid id="calls-dialer.stats" className="stats" style={{ marginBottom: 14 }}>
        <Stat label={tt('Offen')} value={counts.pending} />
        <Stat label={tt('Rückrufe')} value={counts.callback} />
        <Stat label={tt('Erledigt')} value={counts.done} sub={tt('von {total}', { total: counts.total })} />
        <Stat label={tt('Gesperrt')} value={counts.blocked} sub={tt('Nicht stören oder keine Einwilligung')} />
      </SortableGrid>
      {!state ? (
        <Spinner />
      ) : item ? (
        <div className="cr-panels two">
          <Panel title={tt('Aktueller Kontakt')} tour="dialer-contact">
            <div className="tl-stage">
              <div className="tl-contact">
                <h3>{item.contact.name}</h3>
                <div className="muted">{[item.contact.company, item.contact.city].filter(Boolean).join(' · ')}</div>
                <p style={{ margin: '8px 0 0' }}>
                  <strong className="tl-num">{item.contact.phone}</strong> {item.contact.email && <span className="muted small">{item.contact.email}</span>}
                </p>
                {item.contact.tags?.length > 0 && (
                  <div className="tl-tags" style={{ marginTop: 8 }}>
                    <TagChips tags={item.contact.tags} />
                  </div>
                )}
                <div className="muted small">
                  {tt('Versuch {v} von {max_attempts}', { v: item.attempts + 1, max_attempts: item.max_attempts })}
                  {item.next_at && tt(' · Rückruf fällig {dt}', { dt: dt(item.next_at) })}
                </div>
              </div>
              <div className="actions">
                <button className="btn" disabled={busy} onClick={call} data-tour="dialer-call">
                  <Icon name="phone" size={16} /> {tt('Anrufen')}
                </button>
                <button
                  className="btn secondary"
                  disabled={busy}
                  onClick={async () => {
                    await act(() => api.post(`/api/dialer/items/${item.id}/skip`));
                    void next();
                  }}
                >
                  {tt('Überspringen')}
                </button>
                <Link to={`contacts/${item.contact.id}`} className="btn secondary">
                  {tt('Kontakt öffnen')}
                </Link>
                {dialed && list.drop_id && (
                  <button className="btn secondary" disabled={busy || !callId} onClick={drop} title={tt('Spielt deine aufgenommene Nachricht ab und legt dann auf')} data-tour="dialer-drop">
                    <Icon name="voicemail" size={16} /> {tt('Mailbox: Nachricht abspielen')}
                  </button>
                )}
              </div>
              {item.notes.length > 0 && (
                <div>
                  <h4 style={{ margin: '4px 0 6px' }}>{tt('Letzte Notizen')}</h4>
                  {item.notes.map((n: any, i: number) => (
                    <p key={i} className="small" style={{ margin: '0 0 6px', overflowWrap: 'anywhere' }}>
                      <span className="muted">{dt(n.created_at)}</span> {n.body}
                    </p>
                  ))}
                </div>
              )}
              {item.calls.length > 0 && (
                <p className="muted small" style={{ margin: 0 }}>
                  {tt('Frühere Anrufe:')} {item.calls.map((c: any) => `${dt(c.started_at)} ${c.direction === 'in' ? '←' : '→'} ${c.status}${c.duration ? ` (${dur(c.duration)})` : ''}`).join(' · ')}
                </p>
              )}
            </div>
          </Panel>
          <Panel title={tt('Ergebnis')} sub={tt('Wie ist das Gespräch ausgegangen? Das Ergebnis beendet den Versuch und holt den nächsten Kontakt.')} tour="dialer-dispo">
            <Field label={tt('Notiz (landet beim Kontakt)')}>
              <Textarea value={note} onChange={setNote} rows={3} maxLength={4000} />
            </Field>
            <div className="cr-form-row">
              <Field label={tt('Rückruf am (nur bei „Rückruf vereinbart“)')}>
                <Input type="datetime-local" value={cb.at} onChange={(v) => setCb({ ...cb, at: v })} />
              </Field>
              <Field label={tt('Rückruf übernimmt')}>
                <Select value={cb.user} onChange={(v) => setCb({ ...cb, user: v })} placeholder="ich" options={(colleagues.data ?? []).map((u) => [u.id, u.name])} />
              </Field>
            </div>
            <div className="tl-dispo">
              {dispositions.map((d) => (
                <button key={d.key} className={`btn ${d.positive ? '' : 'secondary'}${d.dnd ? ' danger' : ''}`} disabled={busy} onClick={() => dispose(d)}>
                  {d.label}
                </button>
              ))}
            </div>
          </Panel>
        </div>
      ) : null}
      {item && <Slot name="call.panel" contactId={item.contact.id} listId={list.id} />}
      {!state || item ? null : (
        <Panel title={state.finished ? tt('Gespeichert') : state.done ? tt('Fertig') : state.paused || state.waiting ? tt('Gerade nicht möglich') : tt('Kein Kontakt')}>
          {state.finished && (wait > 0 ? <p>{tt('Nächster Kontakt in {wait} Sekunden …', { wait: wait })}</p> : <p>{tt('Das Ergebnis ist gespeichert.')}</p>)}
          {state.reason && !state.finished && <p>{state.reason}</p>}
          {state.next_window && <p className="muted">{tt('Weiter geht es ab {dt}.', { dt: dt(state.next_window) })}</p>}
          <div className="actions">
            <button className="btn" disabled={busy} onClick={() => void next()}>
              {state.finished ? tt('Jetzt weiter') : tt('Erneut versuchen')}
            </button>
            {wait > 0 && (
              <button className="btn secondary" onClick={() => (clearInterval(timer.current), setWait(0))}>
                {tt('Pause machen')}
              </button>
            )}
          </div>
        </Panel>
      )}
    </>
  );
}

// --- overview ---------------------------------------------------------------------------------------------------------------------

export function CallsDialer() {
  const tt = useT('x_comms');
  const can = useCanSettings();
  const lists = useLoad(() => api.get<any[]>('/api/dialer/lists'), []);
  const callbacks = useLoad(() => api.get<any[]>('/api/dialer/callbacks?mine=1'), []);
  const stats = useLoad(() => api.get('/api/dialer/stats?days=7'), []);
  const [open, setOpen] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [rules, setRules] = useState(false);
  if (!lists.data) return lists.error ? <Empty>{lists.error}</Empty> : <Spinner />;
  if (open)
    return (
      <Tl name="dialer">
        <Session
          list={open}
          onBack={() => {
            setOpen(null);
            void lists.reload();
            void callbacks.reload();
            void stats.reload();
          }}
        />
      </Tl>
    );
  const st = stats.data;
  return (
    <Tl name="dialer">
      {st && (
        <SortableGrid id="calls-dialer.stats-2" className="stats" style={{ marginBottom: 14 }}>
          <Stat label={tt('Anrufe ({days} Tage)', { days: st.days })} value={st.calls} sub={tt('{answered} erreicht', { answered: st.answered })} />
          <Stat label={tt('Erfolge')} value={st.positive} sub={st.dispositions.map((d: any) => `${d.label} ${d.n}`).slice(0, 3).join(' · ') || undefined} />
          <Stat label={tt('Gesprächszeit')} value={dur(st.talk_seconds)} />
        </SortableGrid>
      )}
      <div className="cr-panels">
        <Panel
          title={tt('Anruflisten')}
          sub={tt('Ein Kontakt nach dem anderen: Anrufen, Ergebnis eintragen, nächster. Wer nicht angerufen werden darf, wird automatisch übersprungen.')}
          wide
          tour="dialer-lists"
          actions={
            <>
              {can && (
                <button className="btn secondary" onClick={() => setRules(true)}>
                  <Icon name="settings" size={14} /> {tt('Zeiten und Regeln')}
                </button>
              )}
              <button className="btn" onClick={() => setCreating(true)} data-tour="dialer-new">
                <Icon name="plus" size={14} /> {tt('Neue Liste')}
              </button>
            </>
          }
        >
          {lists.data.length ? (
            <div className="cr-list">
              {lists.data.map((l) => (
                <Item
                  key={l.id}
                  onClick={() => setOpen(l)}
                  side={
                    <>
                      {l.status === 'paused' && <Badge tone="yellow">pausiert</Badge>}
                      {l.counts.callback > 0 && <Badge tone="blue">{tt('{callback} Rückruf', { callback: l.counts.callback })}{l.counts.callback > 1 ? 'e' : ''}</Badge>}
                      {l.counts.blocked > 0 && <Badge>{l.counts.blocked} gesperrt</Badge>}
                      <button
                        className="icon-btn"
                        aria-label={l.status === 'paused' ? tt('Liste fortsetzen') : tt('Liste pausieren')}
                        title={l.status === 'paused' ? tt('Fortsetzen') : tt('Pausieren')}
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (await act(() => api.patch(`/api/dialer/lists/${l.id}`, { status: l.status === 'paused' ? 'active' : 'paused' }))) void lists.reload();
                        }}
                      >
                        <Icon name={l.status === 'paused' ? 'play' : 'pause'} size={16} />
                      </button>
                      <button
                        className="icon-btn"
                        aria-label={tt('Kontakte neu einlesen')}
                        title={tt('Neue Kontakte aus der Quelle einlesen und Gesperrte prüfen')}
                        onClick={async (e) => {
                          e.stopPropagation();
                          const r = await act(() => api.post(`/api/dialer/lists/${l.id}/sync`));
                          if (r) {
                            toast(tt('{added} neu, {released} wieder freigegeben', { added: r.added, released: r.released }));
                            void lists.reload();
                          }
                        }}
                      >
                        <Icon name="refresh" size={16} />
                      </button>
                      <button
                        className="icon-btn"
                        aria-label={tt('{name} löschen', { name: l.name })}
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (confirmAsk(tt('Liste „{name}“ löschen? Offene Rückruf-Aufgaben gehen mit.', { name: l.name })) && (await act(() => api.del(`/api/dialer/lists/${l.id}`), tt('Gelöscht')))) void lists.reload();
                        }}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </>
                  }
                >
                  <strong>{l.name}</strong>
                  <div className="cr-sub">
                    {l.source === 'smart_list' ? tt('Smart List „{smart_list_name}“', { smart_list_name: l.smart_list_name }) : tt('Tag {n}', { n: l.tags.join(', ') })} {tt('· {pending} offen · {done}/{total} erledigt', { pending: l.counts.pending, done: l.counts.done, total: l.counts.total })}
                  </div>
                </Item>
              ))}
            </div>
          ) : (
            <Empty>{tt('Noch keine Anrufliste. Lege eine aus einer Smart List oder einem Tag an.')}</Empty>
          )}
        </Panel>
        <Panel title={tt('Meine Rückrufe')} sub={tt('Vereinbarte Rückrufe, die dir gehören oder niemandem zugeteilt sind.')} tour="dialer-callbacks">
          {callbacks.data?.length ? (
            <div className="cr-list">
              {callbacks.data.map((c) => (
                <Item
                  key={c.id}
                  tone={c.due ? 'warn' : undefined}
                  onClick={() => {
                    const l = lists.data!.find((x) => x.id === c.list_id);
                    if (l) setOpen(l);
                  }}
                  side={<Badge tone={c.due ? 'yellow' : 'gray'}>{c.due ? tt('fällig') : dt(c.due_at)}</Badge>}
                >
                  <strong>{c.name}</strong>
                  <div className="cr-sub">
                    {c.phone} · {c.list_name}
                    {c.note && ` · ${c.note}`}
                  </div>
                </Item>
              ))}
            </div>
          ) : (
            <p className="muted">{tt('Keine offenen Rückrufe.')}</p>
          )}
        </Panel>
        <Callout>
          {tt('Der Power-Dialer hält sich an „Nicht stören“, die Einwilligung des Kontakts, deine Anrufzeiten und die Feiertage. Werbeanrufe bei Verbrauchern sind in Deutschland nur mit vorheriger ausdrücklicher Einwilligung erlaubt, bei Unternehmen mindestens mit mutmaßlicher Einwilligung (§ 7 UWG). Prüfe deine Listen entsprechend – das ist keine Rechtsberatung.')}
        </Callout>
      </div>
      {creating && <ListDialog onClose={() => setCreating(false)} onCreated={(l) => (void lists.reload(), setOpen(l))} />}
      {rules && <SettingsDialog onClose={() => setRules(false)} onSaved={() => void lists.reload()} />}
    </Tl>
  );
}
