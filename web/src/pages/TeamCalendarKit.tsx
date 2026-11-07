import { useState } from 'react';
import './teamtools.css';
import { Icon } from '../icons';
import { api, money } from '../api';
import { Badge, Field, Modal, Spinner, Textarea, act, toast, useLoad } from '../ui';
import { intlLocale, useT } from '../i18n';

/**
 * Team-Kalender in the appointment list and the calendar cards: who hosts, the video link, what was paid, the answers of the
 * booking page, and cancelling (with refund) or moving an appointment. The editor for types, teams, questions, payment and
 * video lives in TeamCalendarEditor (loaded when needed).
 */

export const KIND_TEXT: Record<string, string> = { single: 'Einzeln', round_robin: 'Round Robin', collective: 'Kollektiv', group: 'Gruppe / Klasse' };

const PAY_STATUS: Record<string, [string, 'green' | 'blue' | 'yellow' | 'red' | 'gray']> = {
  paid: ['Bezahlt', 'green'],
  waived: ['Zahlung erlassen', 'gray'],
  refunded: ['Erstattet', 'blue'],
  refund_pending: ['Erstattung offen', 'yellow'],
};

export function KindBadge({ t }: { t?: any }) {
  const tt = useT('x_comms');
  if (!t || t.kind === 'single') return null;
  return <Badge tone="purple">{KIND_TEXT[t.kind] ? tt(KIND_TEXT[t.kind]) : t.kind}</Badge>;
}

/** What the team cares about besides the time: hosts, video, payment, answers. */
export function ApptDetails({ a }: { a: any }) {
  const tt = useT('x_comms');
  const hosts: { id: string; name: string }[] = a.hosts ?? [];
  const pay = a.payment;
  const answers: { id: string; label: string; value: string }[] = a.answers ?? [];
  const video = a.meeting_url as string;
  const isUrl = /^https?:\/\//i.test(video || '');
  if (!hosts.length && !pay && !answers.length && !video && !a.meeting_state) return null;
  return (
    <div className="tc-appt">
      {hosts.length > 0 && (
        <span className="tc-chip" title={tt('Gastgeber')}>
          <Icon name="contact" size={12} /> {hosts.map((h) => h.name).join(', ')}
        </span>
      )}
      {video && (
        <span className="tc-chip">
          <Icon name="video" size={12} />
          {isUrl ? (
            <a href={video} target="_blank" rel="noreferrer">
              {tt('Video-Link')}
            </a>
          ) : (
            video
          )}
        </span>
      )}
      {a.meeting_state === 'pending' && (
        <span className="tc-chip warn">
          <Icon name="wait" size={12} /> {tt('Video-Link wird noch erstellt')}
        </span>
      )}
      {a.meeting_state === 'failed' && (
        <span className="tc-chip late" title={tt('Der Kontakt hat den festen Ort aus dem Kalender bekommen')}>
          {tt('Video-Link fehlgeschlagen')}
        </span>
      )}
      {pay && PAY_STATUS[pay.status] && (
        <span className={`tc-chip pay-${PAY_STATUS[pay.status][1]}`}>
          <Icon name="card" size={12} /> {tt(PAY_STATUS[pay.status][0])}
          {pay.amount_cents ? ` · ${money(pay.mode === 'deposit' ? (pay.due_cents ?? pay.amount_cents) : pay.amount_cents, pay.currency)}${pay.mode === 'deposit' ? tt(' Anzahlung') : ''}` : ''}
        </span>
      )}
      {answers.length > 0 && (
        <details className="tc-answers">
          <summary>{tt('Antworten ({length})', { length: answers.length })}</summary>
          <dl>
            {answers.map((x) => (
              <div key={x.id}>
                <dt>{x.label}</dt>
                <dd>{x.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}

const when = (iso: string) => new Date(iso).toLocaleString(intlLocale(), { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' });

/** Cancel an appointment: reason, and – when it was paid – whether the money goes back. */
export function CancelModal({ a, onClose, onDone }: { a: any; onClose: () => void; onDone: () => void }) {
  const tt = useT('x_comms');
  const paid = a.payment?.status === 'paid';
  const [reason, setReason] = useState('');
  const [refund, setRefund] = useState(true);
  const [busy, setBusy] = useState(false);
  const amount = a.payment ? money(a.payment.due_cents ?? a.payment.amount_cents, a.payment.currency) : '';
  const go = async () => {
    setBusy(true);
    const r = await act(() => api.post<{ refund: string }>(`/api/team-calendars/appointments/${a.id}/cancel`, { reason, ...(paid ? { refund } : {}) }));
    setBusy(false);
    if (!r) return;
    toast(r.refund === 'refunded' ? tt('Abgesagt – Zahlung erstattet') : r.refund === 'manual' ? tt('Abgesagt – die Zahlung musst du noch im Stripe-Dashboard erstatten') : tt('Termin abgesagt'));
    onDone();
  };
  return (
    <Modal
      title={tt('Termin absagen')}
      onClose={onClose}
      footer={
        <>
          <button className="tx-btn" onClick={onClose}>
            {tt('Zurück')}
          </button>
          <button className="tx-btn danger" disabled={busy} onClick={go}>
            {tt('Termin absagen')}
          </button>
        </>
      }
    >
      <p>
        <strong>{a.title}</strong>
        <br />
        <span className="muted">{when(a.start_at)}</span>
      </p>
      <p className="muted small">{tt('Der Kontakt bekommt eine E-Mail, die Zeit wird wieder frei')}{a.hosts?.length ? tt(' und die Gastgeber werden informiert') : ''}.</p>
      <Field label={tt('Grund (steht in der E-Mail, optional)')}>
        <Textarea value={reason} onChange={setReason} rows={3} />
      </Field>
      {paid && (
        <label className="tc-refund">
          <input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} />
          <span>
            {tt('Zahlung von')} <strong>{amount}</strong> {tt('über Stripe erstatten')}
            <small className="muted"> {tt('– die Rechnung wird dann storniert.')}</small>
          </span>
        </label>
      )}
    </Modal>
  );
}

/** Move an appointment to another free time of its calendar (the host stays when free, otherwise another one takes over). */
export function MoveModal({ a, onClose, onDone }: { a: any; onClose: () => void; onDone: () => void }) {
  const tt = useT('x_comms');
  const tomorrow = new Date(Date.now() + 864e5);
  const [day, setDay] = useState(new Date(a.start_at) > new Date() ? a.start_at.slice(0, 10) : tomorrow.toISOString().slice(0, 10));
  const slots = useLoad(() => api.get<any>(`/api/team-calendars/${a.calendar_id}/slots?from=${day}&days=1`), [day]);
  const tz = slots.data?.timezone;
  const list: { start: string; hosts: { name: string }[] }[] = slots.data?.days?.[0]?.slots ?? [];
  const move = async (start: string) => {
    const r = await act(() => api.post(`/api/team-calendars/appointments/${a.id}/reschedule`, { start }), tt('Termin verschoben'));
    if (r) onDone();
  };
  return (
    <Modal title={tt('Termin verschieben')} onClose={onClose}>
      <p>
        <strong>{a.title}</strong>
        <br />
        <span className="muted">{tt('Jetzt: {when}', { when: when(a.start_at) })}</span>
      </p>
      <Field label="Tag" hint={tz ? tt('Zeiten in {tz}', { tz: tz }) : undefined}>
        <input type="date" value={day} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDay(e.target.value)} />
      </Field>
      {slots.loading && !slots.data ? (
        <Spinner />
      ) : list.length ? (
        <div className="tc-slots" role="group" aria-label={tt('Freie Zeiten')}>
          {list.map((s) => (
            <button key={s.start} type="button" className="tc-slot" onClick={() => move(s.start)}>
              <strong>{new Date(s.start).toLocaleTimeString(intlLocale(), { hour: '2-digit', minute: '2-digit', timeZone: tz })}</strong>
              {s.hosts?.length > 0 && <small>{s.hosts.map((h) => h.name).join(', ')}</small>}
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">{tt('An diesem Tag ist nichts frei – anderen Tag wählen.')}</p>
      )}
    </Modal>
  );
}
