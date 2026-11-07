import { useEffect, useState } from 'react';
import { api } from '../api';
import { Icon } from '../icons';
import { useSession } from '../session';
import { Empty, Modal, PageHead, Spinner, act, useLoad } from '../ui';
import { ACTOR_BADGE, FILTER_TYPES, daysLeft, entityIcon, requestUndo, timeLabel, dayLabel, type UndoEntry } from '../undo/shared';
import '../undo/undo.css';
import { useT } from '../i18n';

/**
 * Papierkorb of the sub-account: every record deleted in the last days (30 by default), with what comes back along
 * (notes, tasks, deals of a contact …). Restoring is the same as "Rückgängig"; admins can empty it for good.
 */

type Ask = { kind: 'one'; e: UndoEntry } | { kind: 'all' } | null;

function Confirm({ ask, onClose, onDone }: { ask: NonNullable<Ask>; onClose: () => void; onDone: () => void }) {
  const tt = useT('x_agency');
  const [busy, setBusy] = useState(false);
  const one = ask.kind === 'one';
  return (
    <Modal
      title={tt('Endgültig löschen?')}
      onClose={onClose}
      className="undo-modal"
      footer={
        <>
          <button className="btn secondary undo-big" onClick={onClose}>
            {tt('Abbrechen')}
          </button>
          <button
            className="btn danger undo-big"
            disabled={busy}
            data-tour="trash-purge-confirm"
            onClick={async () => {
              setBusy(true);
              const r = await act(() => api.del(one ? `/api/undo/${ask.e.id}` : '/api/undo/trash'), one ? tt('Endgültig gelöscht') : tt('Papierkorb geleert'));
              setBusy(false);
              if (r) (onDone(), onClose());
            }}
          >
            {tt('Endgültig löschen')}
          </button>
        </>
      }
    >
      <p>{one ? `„${ask.e.label.replace(/ gelöscht$/, '')}“ ` : tt('Alles im Papierkorb ')}{tt('wird jetzt wirklich gelöscht und lässt sich')} <strong>{tt('nicht mehr wiederherstellen')}</strong>.</p>
    </Modal>
  );
}

export function Trash() {
  const tt = useT('x_agency');
  const tm = useT('x_misc'); // record kinds come from undo/shared.ts (x_misc)
  const session = useSession();
  const admin = session.user.role === 'admin';
  const [q, setQ] = useState('');
  const [entity, setEntity] = useState('');
  const [ask, setAsk] = useState<Ask>(null);
  const [days, setDays] = useState<number | null>(null);
  const [edit, setEdit] = useState('');
  const list = useLoad(() => api.get<{ items: UndoEntry[]; retention_days: number; can_purge: boolean }>(`/api/undo/trash?${new URLSearchParams({ ...(q.trim() ? { q: q.trim() } : {}), ...(entity ? { entity } : {}) })}`), [q, entity]);
  useEffect(() => {
    const on = () => void list.reload();
    window.addEventListener('pghl:undone', on);
    return () => window.removeEventListener('pghl:undone', on);
  }, [list.reload]);
  useEffect(() => {
    if (admin) api.get<{ retention_days: number }>('/api/undo/settings').then((s) => (setDays(s.retention_days), setEdit(String(s.retention_days)))).catch(() => undefined);
  }, [admin, session.locationId]);
  const items = list.data?.items ?? [];
  const keep = list.data?.retention_days ?? days ?? 30;

  return (
    <>
      <PageHead title={tt('Papierkorb')} sub={tt('Gelöschtes bleibt {keep} Tage hier und lässt sich mit allem, was dazugehört, wiederherstellen.', { keep: keep })}>
        <button className="btn secondary undo-big" onClick={() => window.dispatchEvent(new Event('pghl:verlauf'))} data-tour="trash-history">
          <Icon name="history" size={16} /> {tt('Verlauf')}
        </button>
        {admin && items.length > 0 && (
          <button className="btn secondary undo-big undo-danger" onClick={() => setAsk({ kind: 'all' })} data-tour="trash-empty">
            <Icon name="trash" size={16} /> {tt('Papierkorb leeren')}
          </button>
        )}
      </PageHead>
      <div className="trash-bar" data-tour="trash-filters">
        <input type="search" className="undo-search" placeholder={tt('Im Papierkorb suchen …')} aria-label={tt('Im Papierkorb suchen')} value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={entity} onChange={(e) => setEntity(e.target.value)} aria-label={tt('Nach Art filtern')} style={{ minHeight: 'var(--undo-hit)', fontSize: 15 }}>
          <option value="">{tt('Alle Arten')}</option>
          {FILTER_TYPES.map(([k, n]) => (
            <option key={k} value={k}>
              {tm(n)}
            </option>
          ))}
        </select>
      </div>
      {list.loading && !list.data ? (
        <Spinner />
      ) : items.length ? (
        <ul className="trash-list" data-tour="trash-list">
          {items.map((e) => {
            const badge = ACTOR_BADGE[e.actor_kind];
            return (
              <li key={e.id} className="undo-row trash-row" data-tour="trash-item">
                <span className="undo-ico">
                  <Icon name={entityIcon(e.entity)} size={18} />
                </span>
                <div className="undo-row-body">
                  <div className="undo-row-title">{e.label.replace(/ gelöscht$/, '')}</div>
                  <div className="undo-row-meta muted small">
                    {tt('{dayLabel}, {timeLabel} gelöscht von', { dayLabel: dayLabel(e.at), timeLabel: timeLabel(e.at) })} {e.mine ? tt('dir') : e.actor}
                    {badge && <span className="undo-badge">{tt(badge)}</span>}
                    <span className="trash-expiry"> {tt('· noch {daysLeft} Tage', { daysLeft: daysLeft(e.expires_at) })}</span>
                  </div>
                  {e.kids_text && <p className="small" style={{ margin: '6px 0 0' }}>{tt('Kommt mit zurück: {kids_text}', { kids_text: e.kids_text })}</p>}
                  {e.notice && <p className="undo-notice">{e.notice}</p>}
                </div>
                <div className="trash-act">
                  {e.can_undo ? (
                    <button
                      className="btn undo-big"
                      data-tour="trash-restore"
                      aria-label={tt('Wiederherstellen: {replace}', { replace: e.label.replace(/ gelöscht$/, '') })}
                      onClick={async () => {
                        await requestUndo(e, { single: true });
                        void list.reload();
                      }}
                    >
                      <Icon name="undo" size={16} /> {tt('Wiederherstellen')}
                    </button>
                  ) : (
                    <span className="muted small undo-why">{e.restorable ? tt('nur {actor} oder ein Admin', { actor: e.actor }) : e.reason}</span>
                  )}
                  {admin && (
                    <button className="btn secondary undo-big undo-danger" onClick={() => setAsk({ kind: 'one', e })} aria-label={tt('Endgültig löschen: {replace}', { replace: e.label.replace(/ gelöscht$/, '') })}>
                      {tt('Endgültig löschen')}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty>{q || entity ? tt('Dazu gibt es nichts im Papierkorb.') : tt('Der Papierkorb ist leer – gelöschte Kontakte, Aufgaben, Deals und mehr erscheinen hier.')}</Empty>
      )}
      {admin && days !== null && (
        <form
          className="trash-retention"
          data-tour="trash-retention"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await act(() => api.put<{ retention_days: number }>('/api/undo/settings', { retention_days: Number(edit) }), tt('Aufbewahrung gespeichert'));
            if (r) (setDays(r.retention_days), void list.reload());
          }}
        >
          <label htmlFor="undo-days">{tt('Aufbewahrung im Papierkorb und im Verlauf')}</label>
          <input id="undo-days" type="number" min={1} max={365} value={edit} onChange={(e) => setEdit(e.target.value)} />
          <span>{tt('Tage')}</span>
          <button className="btn secondary undo-big" disabled={Number(edit) === days}>
            {tt('Speichern')}
          </button>
        </form>
      )}
      {ask && <Confirm ask={ask} onClose={() => setAsk(null)} onDone={() => void list.reload()} />}
    </>
  );
}
