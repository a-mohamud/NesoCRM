import { useState } from 'react';
import { useSession } from '../session';
import { act, confirmAsk } from '../ui';
import { useT } from '../i18n';
import { resetSandbox, useAcademy } from './progress';

/**
 * Neso fork: "Reset" for the practice company wherever it shows up (the banner inside it, the Academy, sub-account lists,
 * project cards, its project page). Only for those who may manage it; `locationId` = the row it sits in (other rows: nothing).
 * Inside the practice company the page stays where it is and switches to the fresh one.
 */
export function SandboxResetButton({ locationId, className = 'btn small secondary' }: { locationId?: string; className?: string }) {
  const tt = useT('x_tours_b');
  const session = useSession();
  const academy = useAcademy();
  const [busy, setBusy] = useState(false);
  const sb = academy?.sandbox;
  if (!sb || !academy?.can_sandbox || (locationId !== undefined && locationId !== sb.id)) return null;
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      data-tour="sandbox-reset"
      title={tt('Alle Übungsdaten löschen und frisch anlegen')}
      onClick={async (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!confirmAsk(tt('„{name}“ zurücksetzen? Alle Übungsdaten werden gelöscht und frische Demo-Daten angelegt.', { name: sb.name }))) return;
        setBusy(true);
        const inside = session.locationId === sb.id;
        const here = location.pathname.replace(/^\/app\/?/, '') || 'dashboard';
        const r = await act(() => resetSandbox(), tt('Übungs-Firma zurückgesetzt'));
        if (r) {
          await session.reload();
          if (inside) session.switchLocation(r.id, here);
        }
        setBusy(false);
      }}
    >
      {busy ? tt('Wird zurückgesetzt …') : tt('Zurücksetzen')}
    </button>
  );
}
