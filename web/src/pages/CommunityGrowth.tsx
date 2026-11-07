import { useState } from 'react';
import { api, dt } from '../api';
import { Badge, Check, Empty, Field, Input, Link, Select, Spinner, Textarea, act, confirmAsk, useLoad } from '../ui';
import { MarkdownEditor } from './ContentKit';
import { CopyField, NumberField, Sec, Sub, fromLocalInput, run } from './CommunityParts';
import { useT } from '../i18n';

/**
 * Community → Wachstum: the welcome of new members (message, post, onboarding checklist, "Start here"), broadcasts to a segment
 * by e-mail, push and bell, and the partner program for members. Server side: modules/community-growth.ts.
 */

export function GrowthTab({ group, onChange }: { group: any; onChange: () => void }) {
  const tt = useT('x_community');
  const [sub, setSub] = useState('welcome');
  return (
    <div className="cma" data-tour="community-growth">
      <Sub
        value={sub}
        onChange={setSub}
        tabs={[
          ['welcome', tt('Willkommen')],
          ['broadcast', tt('Rundschreiben')],
          ['partner', tt('Partner-Programm')],
        ]}
      />
      {sub === 'welcome' && <Welcome group={group} />}
      {sub === 'broadcast' && <Broadcast group={group} />}
      {sub === 'partner' && <Partner group={group} onChange={onChange} />}
    </div>
  );
}

const KINDS: [string, string][] = [
  ['profile', 'Profil ausfüllen (Foto oder Text)'],
  ['intro', 'Sich vorstellen (Beitrag)'],
  ['post', 'Einen Beitrag schreiben'],
  ['comment', 'Einen Beitrag kommentieren'],
  ['like', 'Ein „Gefällt mir“ geben'],
  ['challenge', 'An einer Challenge teilnehmen'],
  ['start_here', '„Hier starten“-Beitrag lesen'],
  ['custom', 'Eigener Punkt (Mitglied hakt ab)'],
];

function Welcome({ group }: { group: any }) {
  const tt = useT('x_community');
  const ext = useLoad(() => api.get<any>(`/api/community/groups/${group.id}/ext`), [group.id]);
  const posts = useLoad(() => api.get<any[]>(`/api/community/groups/${group.id}/posts?limit=100`), [group.id]);
  const [f, setF] = useState<any>(null);
  if (ext.data && !f) setF({ welcome: structuredClone(ext.data.welcome), start_here: { ...ext.data.start_here } });
  if (!f) return <Spinner />;
  const w = f.welcome;
  const setW = (path: 'dm' | 'post' | 'checklist', patch: any) => setF({ ...f, welcome: { ...w, [path]: { ...w[path], ...patch } } });
  const save = () => run(() => api.put(`/api/community/groups/${group.id}/ext`, f), 'Gespeichert');
  const items: any[] = w.checklist.items;
  const setItems = (next: any[]) => setW('checklist', { items: next });
  return (
    <div className="cma-grid">
      <Sec title={tt('Willkommens-Nachricht')} lead={tt('Jedes neue Mitglied bekommt sofort eine private Nachricht im Postfach der Community (mit Hinweis und – wenn erlaubt – Push). Antworten landen bei dir unter „Nachrichten“.')}>
        <Check checked={w.dm.enabled} onChange={(v) => setW('dm', { enabled: v })} label={tt('Neue Mitglieder per Nachricht begrüßen')} />
        <Field label={tt('Absender')} hint={tt('Zum Beispiel dein Vorname. Leer = „Team“.')}>
          <Input value={w.dm.sender} maxLength={60} onChange={(v) => setW('dm', { sender: v })} placeholder="Team" />
        </Field>
        <Field label={tt('Text')} hint={tt('Platzhalter: {{name}}, {{first_name}}, {{group}}')}>
          <Textarea rows={5} value={w.dm.text} onChange={(v) => setW('dm', { text: v })} />
        </Field>
        <div className="cma-actions">
          <button className="btn" onClick={save}>
            {tt('Speichern')}
          </button>
        </div>
      </Sec>
      <Sec title={tt('Willkommens-Beitrag')} lead={tt('Ein Beitrag im Namen des Teams, der das neue Mitglied erwähnt – so bekommt es die ersten Antworten der Gruppe.')}>
        <Check checked={w.post.enabled} onChange={(v) => setW('post', { enabled: v })} label={tt('Für jedes neue Mitglied einen Beitrag schreiben')} />
        <Field label={tt('Kanal')}>
          <Select value={w.post.channel_id} onChange={(v) => setW('post', { channel_id: v })} placeholder={tt('Erster freier Kanal')} options={(group.channels ?? []).filter((c: any) => !c.admin_only).map((c: any) => [c.id, c.name])} />
        </Field>
        <Field label={tt('Titel')}>
          <Input value={w.post.title} onChange={(v) => setW('post', { title: v })} />
        </Field>
        <Field label={tt('Text')} hint={tt('Platzhalter: {{name}}, {{mention}} (erwähnt das Mitglied), {{group}}')}>
          <Textarea rows={4} value={w.post.body} onChange={(v) => setW('post', { body: v })} />
        </Field>
        <div className="cma-actions">
          <button className="btn" onClick={save}>
            {tt('Speichern')}
          </button>
        </div>
      </Sec>
      <Sec title={tt('„Hier starten“')} lead={tt('Ein Beitrag, den jedes Mitglied oben im Feed sieht, bis es ihn gelesen hat. Heft ihn am besten auch an.')}>
        <Field label={tt('Beitrag')}>
          <Select value={f.start_here.post_id} onChange={(v) => setF({ ...f, start_here: { ...f.start_here, post_id: v } })} placeholder={tt('Keiner')} options={(posts.data ?? []).map((p: any) => [p.id, `${p.pinned ? '📌 ' : ''}${p.title || p.body.slice(0, 40)}`])} />
        </Field>
        <Field label={tt('Überschrift der Karte')}>
          <Input value={f.start_here.label} maxLength={40} onChange={(v) => setF({ ...f, start_here: { ...f.start_here, label: v } })} />
        </Field>
        <div className="cma-actions">
          <button className="btn" onClick={save}>
            {tt('Speichern')}
          </button>
        </div>
      </Sec>
      <Sec title={tt('Checkliste für den Start')} lead={tt('„So startest du“ im Feed: Die Punkte haken sich von selbst ab, sobald das Mitglied sie erledigt hat.')}>
        <Check checked={w.checklist.enabled} onChange={(v) => setW('checklist', { enabled: v })} label={tt('Checkliste neuen Mitgliedern zeigen')} />
        <NumberField label={tt('Zeigen für … Tage nach dem Beitritt')} min={1} max={365} value={w.checklist.days} onChange={(v) => setW('checklist', { days: v ?? 30 })} />
        <ul className="cma-list">
          {items.map((it, i) => (
            <li key={it.id ?? i}>
              <div className="grow">
                <Input value={it.label} maxLength={120} onChange={(v) => setItems(items.map((x, n) => (n === i ? { ...x, label: v } : x)))} aria-label={tt('Punkt {v}', { v: i + 1 })} />
                <div style={{ marginTop: 6 }}>
                  <Select value={it.kind} onChange={(v) => setItems(items.map((x, n) => (n === i ? { ...x, kind: v } : x)))} options={KINDS.map(([k, l]) => [k, tt(l)] as [string, string])} />
                </div>
              </div>
              <button className="btn small ghost" aria-label={tt('Punkt {v} entfernen', { v: i + 1 })} onClick={() => setItems(items.filter((_, n) => n !== i))}>
                ✕
              </button>
            </li>
          ))}
        </ul>
        {items.length < 8 && (
          <button className="btn secondary" onClick={() => setItems([...items, { id: `punkt${items.length + 1}${Math.random().toString(36).slice(2, 5)}`, label: '', kind: 'custom' }])}>
            {tt('+ Punkt hinzufügen')}
          </button>
        )}
        <div className="cma-actions">
          <button className="btn" onClick={save}>
            {tt('Speichern')}
          </button>
        </div>
      </Sec>
    </div>
  );
}

function Broadcast({ group }: { group: any }) {
  const tt = useT('x_community');
  const tiers = useLoad(() => api.get<any>(`/api/community/groups/${group.id}/join`), [group.id]);
  const hist = useLoad(() => api.get<any>(`/api/community/groups/${group.id}/broadcasts`), [group.id]);
  const blank = { subject: '', body: '', channels: ['email', 'bell'] as string[], tier_ids: [] as string[], min_level: '', active_days: '', inactive_days: '', scheduled_at: '' };
  const [f, setF] = useState<any>(blank);
  const [count, setCount] = useState<any>(null);
  const segment = () => ({
    ...(f.tier_ids.length ? { tier_ids: f.tier_ids } : {}),
    ...(f.min_level ? { min_level: Number(f.min_level) } : {}),
    ...(f.active_days ? { active_days: Number(f.active_days) } : {}),
    ...(f.inactive_days ? { inactive_days: Number(f.inactive_days) } : {}),
  });
  const has = (c: string) => f.channels.includes(c);
  const toggle = (c: string) => setF({ ...f, channels: has(c) ? f.channels.filter((x: string) => x !== c) : [...f.channels, c] });
  const preview = async () => setCount(await act(() => api.post(`/api/community/groups/${group.id}/broadcasts/preview`, { segment: segment() })));
  const send = async () => {
    const n = (await api.post<any>(`/api/community/groups/${group.id}/broadcasts/preview`, { segment: segment() }).catch(() => null)) ?? null;
    const question = f.scheduled_at ? tt('Rundschreiben einplanen?') : tt('Rundschreiben jetzt senden?');
    const reach = n ? ` ${tt('Es erreicht {members} Mitglieder', { members: n.members })}${has('email') ? tt(' ({email} per E-Mail)', { email: n.email }) : ''}.` : '';
    if (!(await confirmAsk(`${question}${reach}`))) return;
    await run(() => api.post(`/api/community/groups/${group.id}/broadcasts`, { subject: f.subject, body: f.body, channels: f.channels, segment: segment(), scheduled_at: f.scheduled_at ? fromLocalInput(f.scheduled_at) : undefined }), f.scheduled_at ? 'Eingeplant' : 'Gesendet', () => (setF(blank), setCount(null), void hist.reload()));
  };
  return (
    <div className="cma-grid">
      <Sec title={tt('Neues Rundschreiben')} lead={tt('Eine Nachricht an alle oder an einen Teil der Mitglieder: per E-Mail (über deine Kampagnen), als Push aufs Handy und als Eintrag in der Glocke.')}>
        <Field label={tt('Betreff')}>
          <Input value={f.subject} maxLength={140} onChange={(v) => setF({ ...f, subject: v })} placeholder={tt('z. B. Neuer Kurs ist da')} />
        </Field>
        <Field label={tt('Text (Markdown)')}>
          <MarkdownEditor value={f.body} onChange={(v) => setF({ ...f, body: v })} rows={9} />
        </Field>
        <Field label={tt('Wohin')}>
          <div className="cma-chips">
            {[['email', tt('E-Mail')], ['push', tt('Push aufs Handy')], ['bell', tt('Glocke in der Community')]].map(([k, l]) => (
              <label key={k} className={`cma-chip${has(k) ? ' on' : ''}`}>
                <input type="checkbox" checked={has(k)} onChange={() => toggle(k)} /> {l}
              </label>
            ))}
          </div>
        </Field>
        <h4 style={{ margin: '8px 0 0' }}>{tt('An wen')}</h4>
        <p className="muted small" style={{ margin: '0 0 6px' }}>
          {tt('Ohne Auswahl bekommen alle Mitglieder die Nachricht (Gesperrte nie).')}
        </p>
        {(tiers.data?.tiers ?? []).length > 1 && (
          <Field label={tt('Nur diese Stufen')}>
            <div className="cma-chips">
              {tiers.data.tiers.map((t: any) => (
                <label key={t.id} className={`cma-chip${f.tier_ids.includes(t.id) ? ' on' : ''}`}>
                  <input type="checkbox" checked={f.tier_ids.includes(t.id)} onChange={(e) => setF({ ...f, tier_ids: e.target.checked ? [...f.tier_ids, t.id] : f.tier_ids.filter((x: string) => x !== t.id) })} /> {t.name}
                </label>
              ))}
            </div>
          </Field>
        )}
        <div className="cma-two">
          <NumberField label={tt('Mindestens Level')} min={1} value={f.min_level === '' ? null : Number(f.min_level)} onChange={(v) => setF({ ...f, min_level: v ?? '' })} />
          <NumberField label={tt('Aktiv in den letzten … Tagen')} min={1} value={f.active_days === '' ? null : Number(f.active_days)} onChange={(v) => setF({ ...f, active_days: v ?? '' })} />
          <NumberField label={tt('Nicht aktiv seit … Tagen')} min={1} value={f.inactive_days === '' ? null : Number(f.inactive_days)} onChange={(v) => setF({ ...f, inactive_days: v ?? '' })} hint={tt('Zum Zurückholen')} />
        </div>
        <Field label={tt('Später senden (freiwillig)')}>
          <Input type="datetime-local" value={f.scheduled_at} onChange={(v) => setF({ ...f, scheduled_at: v })} />
        </Field>
        {count && (
          <div className="cma-note info" role="status">
            {tt('Erreicht')} <strong>{count.members}</strong> {tt('Mitglieder – {email} per E-Mail, {push} mit Push auf dem Gerät.', { email: count.email, push: count.push })}
          </div>
        )}
        <div className="cma-actions">
          <button className="btn secondary" onClick={preview}>
            {tt('Empfänger zählen')}
          </button>
          <button className="btn" onClick={send} disabled={!f.subject.trim() || !f.body.trim() || !f.channels.length}>
            {f.scheduled_at ? tt('Einplanen') : tt('Senden')}
          </button>
        </div>
      </Sec>
      <Sec title={tt('Bisher gesendet')}>
        {!hist.data ? (
          <Spinner />
        ) : hist.data.broadcasts.length ? (
          <ul className="cma-list">
            {hist.data.broadcasts.map((b: any) => (
              <li key={b.id}>
                <div className="grow">
                  <div>
                    <strong>{b.subject}</strong> <Badge tone={b.status === 'sent' ? 'green' : b.status === 'scheduled' ? 'yellow' : 'gray'}>{b.status === 'sent' ? tt('Gesendet') : b.status === 'scheduled' ? tt('Geplant') : tt('Zurückgenommen')}</Badge>
                  </div>
                  <div className="muted small">
                    {b.status === 'scheduled' ? tt('für {dt}', { dt: dt(b.scheduled_at) }) : dt(b.sent_at ?? b.created_at)} {tt('· {recipients} Empfänger ·', { recipients: b.recipients })} {b.channels.map((c: string) => tt(hist.data.channels[c] ?? c)).join(', ')}
                    {b.push_devices ? tt(' · {push_devices} Geräte', { push_devices: b.push_devices }) : ''}
                  </div>
                </div>
                {b.status === 'scheduled' && (
                  <button className="btn small secondary" onClick={() => run(() => api.del(`/api/community/broadcasts/${b.id}`), 'Zurückgenommen', () => void hist.reload())}>
                    {tt('Zurücknehmen')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{tt('Noch nichts gesendet.')}</p>
        )}
      </Sec>
    </div>
  );
}

function Partner({ group, onChange }: { group: any; onChange: () => void }) {
  const tt = useT('x_community');
  const r = useLoad(() => api.get<any>(`/api/community/groups/${group.id}/affiliate`), [group.id]);
  const [pid, setPid] = useState<string | null>(null);
  const [point, setPoint] = useState(true);
  if (!r.data) return <Spinner />;
  const cur = pid ?? r.data.program?.id ?? '';
  return (
    <div className="cma-grid">
      <Sec title={tt('Mitglieder werben Mitglieder')} lead={tt('Verbinde die Community mit einem Partner-Programm: Mitglieder bekommen im Mitgliederbereich einen eigenen Link, du zahlst Provision, sobald jemand darüber beitritt und kauft (Abrechnung und Auszahlung wie bei allen Partnern).')}>
        {r.data.programs.length ? (
          <>
            <Field label={tt('Partner-Programm')}>
              <Select value={cur} onChange={setPid} placeholder={tt('Keins (Partner-Seite aus)')} options={r.data.programs.filter((p: any) => p.active).map((p: any) => [p.id, `${p.name} – ${p.commission_type === 'fixed' ? `${(p.commission_value / 100).toFixed(2).replace('.', ',')} €` : `${p.commission_value} %`}`])} />
            </Field>
            <Check checked={point} onChange={setPoint} label={<>{tt('Die Links des Programms zeigen auf die öffentliche Seite')} <span className="muted">({r.data.landing_url})</span></>} />
            <div className="cma-actions">
              <button className="btn" onClick={() => run(() => api.put(`/api/community/groups/${group.id}/affiliate`, { program_id: cur, point_links: point }), 'Gespeichert', () => (void r.reload(), onChange()))}>
                {tt('Speichern')}
              </button>
              <Link to="affiliates" className="btn secondary">
                {tt('Partner-Programme verwalten')}
              </Link>
            </div>
          </>
        ) : (
          <Empty action={<Link to="affiliates" className="btn">{tt('Programm anlegen')}</Link>}>{tt('Es gibt noch kein Partner-Programm. Lege eines an (Provision, Cookie-Dauer, Auszahlung) und komm dann hierher zurück.')}</Empty>
        )}
      </Sec>
      {r.data.program && (
        <Sec title={tt('So funktioniert es für Mitglieder')}>
          <p style={{ marginTop: 0 }}>
            {tt('Im Mitgliederbereich erscheint der Reiter')} <strong>{tt('🤝 Partner')}</strong>{tt('. Ein Klick auf „Partner werden“ erzeugt den persönlichen Link, dazu sehen Mitglieder Klicks, Anmeldungen, Verkäufe und ihre Provision.')}
          </p>
          <ul className="muted small">
            <li>{tt('{affiliates} Partner im Programm', { affiliates: r.data.program.affiliates })}</li>
            <li>{tt('Provisionen, Freigabe und Auszahlung: Verkaufen → Partner')}</li>
          </ul>
          <CopyField value={r.data.program.signup_url} label={tt('Anmelde-Seite des Programms (ohne Community)')} />
        </Sec>
      )}
    </div>
  );
}

