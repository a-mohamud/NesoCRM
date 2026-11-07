import { useState } from 'react';
import { api } from '../api';
import { act, toast } from '../ui';
import { Icon } from '../icons';
import type { EditorApi } from './Editor';
import { useT } from '../i18n';

/** „KI zeichnen lassen“: prompt → diagram/mind map/wireframe; with a selection: explain, tasks, tidy up. */

const KINDS: [string, string][] = [
  ['auto', 'Automatisch'],
  ['flowchart', 'Flussdiagramm'],
  ['mindmap', 'Mindmap'],
  ['orgchart', 'Organigramm'],
  ['diagram', 'Diagramm'],
  ['wireframe', 'Wireframe'],
];

const IDEAS = ['Vertriebsprozess vom Lead bis zum Abschluss', 'Mindmap: Marketing-Ideen für den Herbst', 'Wireframe einer Landingpage für ein Webinar', 'Onboarding neuer Kunden als Flussdiagramm', 'Organigramm einer kleinen Agentur'];

export function AiBar({ api: ed, open, setOpen }: { api: EditorApi; open: boolean; setOpen: (v: boolean) => void }) {
  const tt = useT('x_misc');
  const [prompt, setPrompt] = useState('');
  const [kind, setKind] = useState('auto');
  const [busy, setBusy] = useState('');
  if (ed.readOnly) return null;
  const sel = ed.selection;
  const run = async (mode: 'draw' | 'explain' | 'tasks' | 'tidy') => {
    if (mode === 'draw' && !prompt.trim()) return;
    setBusy(mode === 'draw' ? 'KI zeichnet …' : mode === 'explain' ? 'KI liest …' : mode === 'tasks' ? 'KI legt Aufgaben an …' : 'Räumt auf …');
    await ed.store.flush();
    const r = await act(() => api.post(`/api/canvas/${ed.board.id}/ai`, { mode, prompt: prompt.trim() || undefined, kind, ids: sel, clientId: ed.store.clientId, sketch: !!ed.defaults.sketch }));
    setBusy('');
    if (!r) return;
    if (mode === 'tidy') await ed.store.catchUp();
    else await ed.catchUpCreated();
    if (r.summary) toast(r.summary);
    if (mode === 'draw') {
      setPrompt('');
      setTimeout(() => ed.zoomTo(r.created), 50);
    }
  };
  return (
    <div className={`cv-ai cv-panel${open ? ' open' : ''}`} data-tour="canvas-ai">
      {!open ? (
        <button className="cv-ai-btn" onClick={() => setOpen(true)}>
          <Icon name="ai" /> {tt('KI zeichnen lassen')}
        </button>
      ) : (
        <>
          <div className="cv-ai-row">
            <Icon name="ai" />
            <input
              autoFocus
              value={prompt}
              placeholder={sel.length ? tt('Was soll mit der Auswahl passieren? Oder neu zeichnen …') : tt('Was soll ich zeichnen? z. B. „Kundenreise für unseren Onlinekurs“')}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') void run('draw');
                if (e.key === 'Escape') setOpen(false);
              }}
              disabled={!!busy}
              data-tour="canvas-ai-input"
            />
            <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label={tt('Art')} disabled={!!busy}>
              {KINDS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
            <button className="btn small" onClick={() => void run('draw')} disabled={!!busy || !prompt.trim()}>
              {busy || tt('Zeichnen')}
            </button>
            <button className="icon-btn" onClick={() => setOpen(false)} aria-label={tt('Schließen')}>
              ✕
            </button>
          </div>
          <div className="cv-ai-chips">
            {sel.length > 0 ? (
              <>
                <span className="muted small">{tt('{length} ausgewählt:', { length: sel.length })}</span>
                <button className="cv-chip" onClick={() => void run('explain')} disabled={!!busy}>
                  {tt('Auswahl erklären')}
                </button>
                <button className="cv-chip" onClick={() => void run('tasks')} disabled={!!busy}>
                  {tt('In Aufgaben verwandeln')}
                </button>
                <button className="cv-chip" onClick={() => void run('tidy')} disabled={!!busy}>
                  {tt('Layout aufräumen')}
                </button>
              </>
            ) : (
              <>
                {IDEAS.slice(0, 3).map((i) => (
                  <button key={i} className="cv-chip" onClick={() => setPrompt(i)} disabled={!!busy}>
                    {i}
                  </button>
                ))}
                <button className="cv-chip" onClick={() => void run('tidy')} disabled={!!busy} title={tt('Ordnet verbundene Formen automatisch an')}>
                  {tt('Layout aufräumen')}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
