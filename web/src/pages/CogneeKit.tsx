import { useState, type ReactNode } from 'react';
import { api } from '../api';
import { Icon } from '../icons';
import { Badge, Modal, act, toast } from '../ui';
import './cognee.css';
import { useT } from '../i18n';

/** Pieces shared by the agency card and the sub-account tab of the Wissensgedächtnis (docs/cognee.md). */

export type Json = Record<string, any>;

export function Note({ level = 'info', children }: { level?: 'critical' | 'warning' | 'ok' | 'info'; children: ReactNode }) {
  return (
    <div className={`cg-note ${level}`} role={level === 'critical' ? 'alert' : undefined}>
      <Icon name={level === 'ok' ? 'shieldOk' : level === 'info' ? 'lock' : 'shield'} size={16} />
      <p>{children}</p>
    </div>
  );
}

/** Where the Cognee server's access control stands, as a badge. */
export function PostureBadge({ state }: { state?: string | null }) {
  const tt = useT('x_ai');
  if (state === 'closed') return <Badge tone="green">{tt('Zugriffskontrolle an')}</Badge>;
  if (state === 'open') return <Badge tone="red">{tt('Server ohne Anmeldung!')}</Badge>;
  return <Badge tone="yellow">{tt('Zugriffskontrolle nicht geprüft')}</Badge>;
}

/**
 * "Daten in Cognee löschen": offered after a type or the whole sub-account was switched off (and on request). The deletion
 * is queued and sent to Cognee in the background; the dialog says what it removes.
 */
export function PurgeDialog({ types, labels, url, onClose }: { types: string[]; labels: Record<string, string>; url: string; onClose: (done?: boolean) => void }) {
  const tt = useT('x_ai');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={tt('Daten in Cognee löschen?')}
      onClose={() => onClose()}
      footer={
        <>
          <button className="btn secondary" onClick={() => onClose()}>
            {tt('Später')}
          </button>
          <button
            className="btn danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await act(() => api.post<Json>(url, { types, confirm: true }));
              setBusy(false);
              if (r) {
                toast(`Löschung angestoßen (${r.items} ${r.items === 1 ? tt('Eintrag') : tt('Einträge')})`);
                onClose(true);
              }
            }}
          >
            {tt('Jetzt in Cognee löschen')}
          </button>
        </>
      }
    >
      <p>
        {tt('Die Freigabe ist beendet – es wird nichts mehr übertragen. Die bereits übertragenen Daten liegen aber noch auf dem Cognee-Server:')}
      </p>
      <ul>
        {types.map((t) => (
          <li key={t}>{labels[t] ?? t}</li>
        ))}
      </ul>
      <p className="muted small">{tt('„Jetzt löschen“ entfernt diese Daten dort endgültig (das jeweilige Dataset mit Wissensgraph und Vektoren). In HyperLevel bleibt alles unverändert. Bei „Später“ bleiben sie in Cognee, bis du sie über „Status“ löschst.')}</p>
    </Modal>
  );
}
