import { useState } from 'react';
import { api } from '../api';
import { Icon } from '../icons';
import { Check, Field, Input, Modal, Select, Spinner, Textarea, act, useLoad } from '../ui';
import type { BoardFull, TemplateItem, TemplateReview } from './types';
import { useT } from '../i18n';

const CATEGORIES: [string, string][] = [['vertrieb', 'Vertrieb'], ['service', 'Service'], ['projekte', 'Projekte'], ['marketing', 'Marketing'], ['agentur', 'Agentur'], ['sonstiges', 'Sonstiges']];

export function ReviewList({ review }: { review: TemplateReview }) {
  return (
    <ul className="bd-review">
      {review.checks.map((c, i) => (
        <li key={i} className={c.level}>
          <Icon name={c.level === 'ok' ? 'ok' : c.level === 'warn' ? 'flag' : 'fail'} size={15} />
          <span>{c.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** Saves the board as a template – only its configuration, never data – for this sub-account or the Marktplatz (admins). */
export function TemplateSave({ board, admin, onClose, onDone }: { board: BoardFull; admin: boolean; onClose: () => void; onDone: (t: TemplateItem) => void }) {
  const tt = useT('x_misc');
  const { data, error, loading } = useLoad(() => api.get<{ review: TemplateReview; stripped: string[]; widgets: number }>(`/api/board-templates/check?board_id=${board.id}`), [board.id]);
  const [name, setName] = useState(board.name);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('sonstiges');
  const [scope, setScope] = useState<'location' | 'marketplace'>('location');
  const [approve, setApprove] = useState(false);
  const [read, setRead] = useState(false);
  const market = scope === 'marketplace';
  const review = data?.review;
  const blocked = review?.verdict === 'fail' || (market && (!approve || (review?.verdict === 'warn' && !read)));
  return (
    <Modal
      title={tt('Als Vorlage speichern')}
      onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={onClose}>
            {tt('Abbrechen')}
          </button>
          <button
            className="btn"
            disabled={!review || blocked || !name.trim()}
            onClick={async () => {
              const r = await act(() => api.post<TemplateItem>('/api/board-templates', { board_id: board.id, name, description, category, scope, ...(market ? { approve: true, accept_warnings: read } : {}) }), market ? tt('Im Marktplatz veröffentlicht') : tt('Vorlage gespeichert'));
              if (r) {
                onDone(r);
                onClose();
              }
            }}
          >
            {market ? tt('Veröffentlichen') : tt('Speichern')}
          </button>
        </>
      }
    >
      <p className="muted small">{tt('Eine Vorlage enthält nur die Anordnung und die Einstellungen der Widgets – keine Kontakte, Zahlen oder Zugangsdaten. Wer sie benutzt, sieht die Daten des eigenen Sub-Accounts.')}</p>
      <Field label="Name">
        <Input value={name} onChange={setName} maxLength={80} />
      </Field>
      <Field label={tt('Beschreibung')}>
        <Textarea value={description} onChange={setDescription} maxLength={600} rows={3} placeholder={tt('Wofür ist das Board gut?')} />
      </Field>
      <Field label={tt('Kategorie')}>
        <Select value={category} onChange={setCategory} options={CATEGORIES.map(([v, l]) => [v, tt(l)] as [string, string])} />
      </Field>
      <div className="field">
        <span>{tt('Wer darf sie benutzen?')}</span>
        <div className="chips" role="radiogroup" aria-label={tt('Wer darf sie benutzen?')}>
          <button type="button" role="radio" aria-checked={!market} className={`chip${!market ? ' on' : ''}`} onClick={() => setScope('location')}>
            {tt('Nur dieser Sub-Account')}
          </button>
          <button type="button" role="radio" aria-checked={market} className={`chip${market ? ' on' : ''}`} onClick={() => setScope('marketplace')} disabled={!admin} title={admin ? '' : tt('Das dürfen nur Admins')}>
            {tt('Im Marktplatz veröffentlichen')}
          </button>
        </div>
      </div>
      <h4 className="bd-h4">{tt('Prüfung')}</h4>
      {loading && <Spinner />}
      {error && <p className="bd-error">{error}</p>}
      {review && <ReviewList review={review} />}
      {data && data.stripped.length > 0 && (
        <p className="muted small">
          {tt('Nicht mitgenommen (gehören zu diesem Sub-Account, wer die Vorlage nutzt wählt sie neu):')} {data.stripped.join(', ')}.
        </p>
      )}
      {market && review && (
        <div className="bd-consent">
          {review.verdict === 'warn' && <Check checked={read} onChange={setRead} label={tt('Ich habe die Hinweise gelesen.')} />}
          <Check checked={approve} onChange={setApprove} label={tt('Ich möchte diese Vorlage im Marktplatz veröffentlichen. Alle Sub-Accounts dieser Installation können sie dann installieren.')} />
        </div>
      )}
    </Modal>
  );
}
