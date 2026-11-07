import { useState } from 'react';
import { api, d } from '../api';
import { Badge, act, confirmAsk, useLoad } from '../ui';
import { ContactDupes } from './SalesDupes';
import { EnrollContact } from './SalesSequences';
import './sales.css';
import { useT } from '../i18n';

/**
 * What the contact page gets from sales (docs/sales.md): the duplicate hint on top and the person's sequences next to the other
 * actions. Loaded as its own chunk; without the area „Opportunities“ the sequence box simply stays away.
 */

export function ContactDupeBanner({ contactId }: { contactId: string }) {
  return <ContactDupes contactId={contactId} />;
}

const TONE: Record<string, 'green' | 'blue' | 'gray' | 'yellow'> = { active: 'blue', paused: 'yellow', finished: 'green', stopped: 'gray' };
const LABEL: Record<string, string> = { active: 'läuft', paused: 'pausiert', finished: 'durchlaufen', stopped: 'beendet' };

export function ContactSequences({ contactId }: { contactId: string }) {
  const tt = useT('x_agency');
  const list = useLoad(() => api.get<any[]>(`/api/sequence-enrollments?contact_id=${contactId}`).catch(() => null), [contactId]);
  const [enroll, setEnroll] = useState(false);
  if (!list.data) return null;
  const rows = list.data;
  return (
    <div className="contact-seq" data-tour="contact-sequences">
      <div className="muted small" style={{ marginBottom: 4 }}>
        {tt('Sequenzen')}
      </div>
      {rows.slice(0, 5).map((e) => (
        <div className="deal-row" key={e.id}>
          <div className="grow">
            <b>{e.sequence_name}</b>
            <div className="muted small">
              {e.status === 'active' ? tt('Schritt {n}', { n: e.step_index + 1 }) + (e.next_at ? tt(' · weiter am {d}', { d: d(e.next_at) }) : '') : e.stop_label ? tt(e.stop_label) : tt('seit {d}', { d: d(e.enrolled_at) })} · {tt('{n} gesendet', { n: e.sent })}
            </div>
          </div>
          <Badge tone={TONE[e.status] ?? 'gray'}>{LABEL[e.status] ? tt(LABEL[e.status]) : e.status}</Badge>
          {(e.status === 'active' || e.status === 'paused') && (
            <button className="icon-btn" aria-label={tt('Sequenz für diese Person beenden')} title={tt('Beenden')} onClick={async () => confirmAsk(tt('Sequenz für diese Person beenden?')) && (await act(() => api.post(`/api/sequence-enrollments/${e.id}/stop`, {}), tt('Beendet'))) && list.reload()}>
              ✕
            </button>
          )}
        </div>
      ))}
      <button className="btn small secondary" onClick={() => setEnroll(true)}>
        {tt('In Sequenz aufnehmen')}
      </button>
      {enroll && <EnrollContact contactId={contactId} onClose={() => setEnroll(false)} onDone={() => (setEnroll(false), list.reload())} />}
    </div>
  );
}
