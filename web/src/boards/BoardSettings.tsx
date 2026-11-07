import { useState } from 'react';
import { api } from '../api';
import { ACCENTS, BOARD_ICONS } from '../../../server/services/boards-consts';
import { Icon, type IconName } from '../icons';
import { Check, Field, Input, Modal, Select, act, confirmAsk, navigate, toast } from '../ui';
import { TemplateSave } from './TemplateSave';
import type { BoardFull } from './types';
import { useT } from '../i18n';

/** Name, look, who may see and change the board, start page, the assistant's behaviour – and duplicate, template, delete. */
export function BoardSettings({ board, admin, home, autoApply, onPatch, onReload, onHome, onAutoApply, onClose }: { board: BoardFull; admin: boolean; home: boolean; autoApply: string; onPatch: (ops: Record<string, unknown>[]) => Promise<unknown>; onReload: () => Promise<void>; onHome: (on: boolean) => void; onAutoApply: (v: string) => void; onClose: () => void }) {
  const tt = useT('x_misc');
  const owner = board.access === 'owner';
  const canEdit = board.access !== 'view';
  const [name, setName] = useState(board.name);
  const [tpl, setTpl] = useState(false);
  const saveName = async () => {
    const n = name.trim();
    if (n && n !== board.name) await onPatch([{ op: 'rename', name: n }]);
  };
  return (
    <>
      <Modal
        title={tt('Board-Einstellungen')}
        onClose={async () => {
          await saveName();
          onClose();
        }}
        footer={
          <button
            className="btn"
            onClick={async () => {
              await saveName();
              onClose();
            }}
          >
            {tt('Fertig')}
          </button>
        }
      >
        <Field label="Name">
          <Input value={name} onChange={setName} maxLength={80} disabled={!canEdit} onBlur={saveName} />
        </Field>
        <div className="field">
          <span>{tt('Symbol')}</span>
          <div className="bd-icons" role="radiogroup" aria-label={tt('Symbol')}>
            {BOARD_ICONS.map((i) => (
              <button key={i} type="button" role="radio" aria-checked={board.icon === i} className={board.icon === i ? 'on' : ''} disabled={!canEdit} onClick={() => onPatch([{ op: 'rename', icon: i }])} title={i}>
                <Icon name={i as IconName} size={18} />
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>{tt('Akzentfarbe')}</span>
          <div className="bd-swatches" role="radiogroup" aria-label={tt('Akzentfarbe')}>
            <button type="button" role="radio" aria-checked={!board.accent} className={`bd-swatch default${!board.accent ? ' on' : ''}`} disabled={!canEdit} onClick={() => onPatch([{ op: 'theme', accent: '' }])} title={tt('Standard')} />
            {Object.entries(ACCENTS).map(([n, hex]) => (
              <button key={n} type="button" role="radio" aria-checked={board.accent === hex} className={`bd-swatch${board.accent === hex ? ' on' : ''}`} style={{ background: hex }} disabled={!canEdit} onClick={() => onPatch([{ op: 'theme', accent: hex }])} title={n} aria-label={n} />
            ))}
          </div>
        </div>

        <h4 className="bd-h4">{tt('Wer sieht das Board?')}</h4>
        <div className="field">
          <div className="chips" role="radiogroup" aria-label={tt('Sichtbarkeit')}>
            {(
              [
                ['personal', 'Nur ich'],
                ['shared', 'Das Team'],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={board.scope === v}
                className={`chip${board.scope === v ? ' on' : ''}`}
                disabled={!owner}
                onClick={async () => {
                  if (board.scope === v) return;
                  if (v === 'personal' && !confirmAsk(tt('Das Board wird für alle anderen unsichtbar. Fortfahren?'))) return;
                  if (await act(() => api.patch(`/api/boards/${board.id}`, { scope: v }))) await onReload();
                }}
              >
                {l}
              </button>
            ))}
          </div>
          {board.scope === 'shared' && (
            <Field label={tt('Das Team darf')}>
              <Select
                value={board.team_access}
                onChange={async (v) => {
                  if (await act(() => api.patch(`/api/boards/${board.id}`, { team_access: v }))) await onReload();
                }}
                options={[['view', tt('nur ansehen')], ['edit', tt('ansehen und ändern')]]}
              />
            </Field>
          )}
          {!owner && <small className="muted">{tt('Nur')} {board.owner_name || tt('die Besitzerin bzw. der Besitzer')} {tt('oder die Agentur ändern das.')}</small>}
          <small className="muted">{tt('Jede Person sieht in den Widgets nur, was sie auch auf der eigenen Seite sehen dürfte – egal, wer das Board geteilt hat.')}</small>
        </div>

        <h4 className="bd-h4">{tt('Für mich')}</h4>
        <Check checked={home} onChange={onHome} label={tt('Als meine Startseite verwenden (nach dem Anmelden)')} tour="board-home" />
        <Check checked={autoApply === 'layout'} onChange={(v) => onAutoApply(v ? 'layout' : 'off')} label={tt('Kleine Layout-Änderungen per Wunsch sofort übernehmen (Verschieben, Größe, Farbe) – alles andere zeige ich dir vorher')} />

        <h4 className="bd-h4">{tt('Weiteres')}</h4>
        <div className="bd-actions-row">
          <button
            type="button"
            className="btn secondary"
            onClick={async () => {
              const r = await act(() => api.post<BoardFull>(`/api/boards/${board.id}/duplicate`, {}), tt('Kopie angelegt'));
              if (r) {
                onClose();
                navigate(`boards/${r.id}`);
              }
            }}
          >
            <Icon name="copy" size={15} /> {tt('Duplizieren')}
          </button>
          <button type="button" className="btn secondary" onClick={() => setTpl(true)} disabled={!canEdit}>
            <Icon name="template" size={15} /> {tt('Als Vorlage speichern')}
          </button>
          <button
            type="button"
            className="btn ghost danger-text"
            disabled={!owner}
            onClick={async () => {
              if (!confirmAsk(tt('„{name}“ endgültig löschen? Der Verlauf geht mit verloren.', { name: board.name }))) return;
              if (await act(() => api.del(`/api/boards/${board.id}`), tt('Board gelöscht'))) {
                onClose();
                navigate('boards');
              }
            }}
          >
            <Icon name="trash" size={15} /> {tt('Löschen')}
          </button>
        </div>
      </Modal>
      {tpl && <TemplateSave board={board} admin={admin} onClose={() => setTpl(false)} onDone={(t) => toast(tt('„{name}“ ist jetzt unter „Vorlagen“ zu finden', { name: t.name }))} />}
    </>
  );
}
