import { useEffect, useState } from 'react';
import './canvas.css';
import { api, ago } from '../api';
import { Badge, Empty, Field, Input, Modal, PageHead, Select, Spinner, act, confirmAsk, navigate, toast, useLoad } from '../ui';
import { Icon } from '../icons';
import { TEMPLATES } from '../../../server/services/canvas-templates';
import { BoardStore } from './store';
import { Editor, type BoardMeta } from './Editor';
import { Preview, useTemplatePreviews } from './dialogs-insert';
import { withLocation } from './media';
import { useT } from '../i18n';

/**
 * The Canvas page: the board overview (`/app/canvas`) and the editor of one board (`/app/canvas/<id>`).
 * Lazy-loaded from main.tsx, so the editor and the shared renderer stay out of the main bundle.
 */

interface BoardRow extends BoardMeta {
  element_count: number;
  updated_at: string;
  updated_by: string;
  watching: number;
}

const ACCESS_LABEL = { owner: 'Besitzer:in', edit: 'Bearbeiten', view: 'Ansehen' } as const;

function NewBoard({ onClose }: { onClose: () => void }) {
  const tt = useT('x_misc');
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('');
  const [team, setTeam] = useState<'edit' | 'view' | 'none'>('edit');
  const [busy, setBusy] = useState(false);
  const previews = useTemplatePreviews();
  const create = async () => {
    setBusy(true);
    const t = TEMPLATES.find((x) => x.key === template);
    const r = await act(() => api.post('/api/canvas', { name: name.trim() || t?.name || 'Neues Board', template: template || undefined, team_access: team }));
    setBusy(false);
    if (r) {
      onClose();
      navigate(`canvas/${r.id}`);
    }
  };
  return (
    <Modal
      title={tt('Neues Board')}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn secondary" onClick={onClose}>
            {tt('Abbrechen')}
          </button>
          <button className="btn" onClick={create} disabled={busy} data-tour="canvas-new-create">
            {tt('Board anlegen')}
          </button>
        </>
      }
    >
      <div className="grid2">
        <Field label="Name">
          <Input value={name} onChange={setName} placeholder={tt('z. B. Kampagne Herbst')} autoFocus maxLength={200} data-tour="canvas-new-name" />
        </Field>
        <Field label={tt('Wer im Projekt darf es sehen?')}>
          <Select
            value={team}
            onChange={(v) => setTeam(v as typeof team)}
            options={[
              ['edit', tt('Alle dürfen bearbeiten')],
              ['view', tt('Alle dürfen ansehen')],
              ['none', tt('Nur ich (privat)')],
            ]}
          />
        </Field>
      </div>
      <div className="cv-tpl-grid small">
        <button className={`cv-tpl${template === '' ? ' on' : ''}`} onClick={() => setTemplate('')}>
          <div className="cv-preview empty">{tt('Leer')}</div>
          <b>{tt('Leeres Board')}</b>
          <span className="muted small">{tt('Unendliche Fläche zum Zeichnen.')}</span>
        </button>
        {TEMPLATES.map((t) => (
          <button key={t.key} className={`cv-tpl${template === t.key ? ' on' : ''}`} onClick={() => setTemplate(t.key)}>
            <Preview els={previews[t.key]} max={260} prefix={`n${t.key}`} />
            <b>{t.name}</b>
            <span className="muted small">{t.description}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function BoardList() {
  const tt = useT('x_misc');
  const list = useLoad(() => api.get<{ boards: BoardRow[]; mentions: number }>('/api/canvas'), []);
  const [creating, setCreating] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const boards = (list.data?.boards ?? []).filter((b) => !q.trim() || b.name.toLowerCase().includes(q.trim().toLowerCase()));

  const drawNew = async () => {
    const text = prompt.trim();
    if (!text) return;
    setBusy(true);
    const b = await act(() => api.post('/api/canvas', { name: text.slice(0, 60) }));
    if (!b) return setBusy(false);
    // the board exists now; the drawing is made on it before it opens
    const r = await act(() => api.post(`/api/canvas/${b.id}/ai`, { mode: 'draw', prompt: text }));
    setBusy(false);
    if (r?.summary) toast(r.summary);
    navigate(`canvas/${b.id}`);
  };

  return (
    <>
      <PageHead title="Canvas" sub={tt('Unendliche Boards zum Zeichnen, Planen und Gestalten – mit Live-Daten aus dem CRM.')}>
        <input className="cv-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt('Boards suchen')} aria-label={tt('Boards suchen')} />
        <button className="btn" onClick={() => setCreating(true)} data-tour="canvas-new">
          <Icon name="canvas" /> {tt('Neues Board')}
        </button>
      </PageHead>
      <div className="cv-ai-new card" data-tour="canvas-ai-new">
        <Icon name="ai" size={18} />
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !busy && void drawNew()}
          placeholder={tt('Neues Board mit KI: „Kundenreise für unseren Onlinekurs“, „Wireframe einer Landingpage“ …')}
          disabled={busy}
          aria-label={tt('Board von der KI zeichnen lassen')}
        />
        <button className="btn" onClick={drawNew} disabled={busy || !prompt.trim()}>
          {busy ? tt('KI zeichnet …') : tt('Zeichnen lassen')}
        </button>
      </div>
      {!!list.data?.mentions && (
        <p className="cv-mention-note" data-tour="canvas-mentions">
          <Icon name="chat" /> {tt.plural(list.data.mentions, { one: 'Du wurdest in {n} offenen Kommentar erwähnt.', other: 'Du wurdest in {n} offenen Kommentaren erwähnt.' })}
        </p>
      )}
      {list.loading && !list.data ? (
        <Spinner />
      ) : list.error ? (
        <p className="cv-error">{list.error}</p>
      ) : !boards.length ? (
        <Empty
          tour="canvas-empty-list"
          action={
            <button className="btn" onClick={() => setCreating(true)}>
              {tt('Erstes Board anlegen')}
            </button>
          }
        >
          {q ? tt('Kein Board gefunden.') : tt('Noch keine Boards. Starte leer, mit einer Vorlage oder lass die KI etwas zeichnen.')}
        </Empty>
      ) : (
        <div className="cv-board-grid" data-tour="canvas-boards">
          {boards.map((b) => (
            <article key={b.id} className="cv-board-card card" onClick={() => navigate(`canvas/${b.id}`)}>
              <a
                className="cv-thumb"
                href={`/app/canvas/${b.id}`}
                onClick={(e) => {
                  if (!e.metaKey && !e.ctrlKey) e.preventDefault();
                }}
                aria-label={tt('{name} öffnen', { name: b.name })}
              >
                {b.element_count ? <img src={withLocation(`/api/canvas/${b.id}/svg?thumb=1`)} alt="" loading="lazy" /> : <span className="muted">{tt('Leer')}</span>}
              </a>
              <div className="cv-board-meta">
                <b title={b.name}>{b.name}</b>
                <span className="muted small">
                  {tt('{element_count} Elemente · {ago}', { element_count: b.element_count, ago: ago(b.updated_at) })}
                  {b.updated_by ? ` · ${b.updated_by}` : ''}
                </span>
                <span className="cv-board-tags">
                  <Badge tone={b.access === 'owner' ? 'blue' : b.access === 'edit' ? 'green' : 'gray'}>{tt(ACCESS_LABEL[b.access])}</Badge>
                  {b.team_access === 'none' && <Badge tone="purple">{tt('Privat')}</Badge>}
                  {b.watching > 0 && <Badge tone="green">{b.watching} live</Badge>}
                </span>
              </div>
              <div className="cv-board-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="icon-btn"
                  title={tt('Duplizieren')}
                  aria-label={tt('{name} duplizieren', { name: b.name })}
                  onClick={async () => {
                    const r = await act(() => api.post(`/api/canvas/${b.id}/duplicate`, {}), tt('Board dupliziert'));
                    if (r) await list.reload();
                  }}
                >
                  <Icon name="copy" />
                </button>
                {b.access === 'owner' && (
                  <button
                    className="icon-btn"
                    title={tt('Löschen')}
                    aria-label={tt('{name} löschen', { name: b.name })}
                    onClick={async () => {
                      if (!confirmAsk(tt('Board „{name}“ endgültig löschen? Alle Elemente, Kommentare und Versionen gehen verloren.', { name: b.name }))) return;
                      const r = await act(() => api.del(`/api/canvas/${b.id}`), tt('Board gelöscht'));
                      if (r) await list.reload();
                    }}
                  >
                    <Icon name="trash" />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {creating && <NewBoard onClose={() => setCreating(false)} />}
    </>
  );
}

function BoardView({ id }: { id: string }) {
  const tt = useT('x_misc');
  const [state, setState] = useState<{ store: BoardStore; board: BoardMeta } | { error: string } | null>(null);
  useEffect(() => {
    let dead = false;
    let store: BoardStore | null = null;
    const hide = () => document.visibilityState === 'hidden' && void store?.flush();
    const leave = (e: BeforeUnloadEvent) => {
      if (store?.hasUnsent()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    api
      .get(`/api/canvas/${id}`)
      .then((r) => {
        if (dead) return;
        store = new BoardStore(id);
        store.load(r.elements, r.seq);
        store.connect();
        document.addEventListener('visibilitychange', hide);
        window.addEventListener('beforeunload', leave);
        setState({ store, board: { ...r.board, access: r.access } });
      })
      .catch((e: Error) => !dead && setState({ error: e.message }));
    return () => {
      dead = true;
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('beforeunload', leave);
      store?.close();
    };
  }, [id]);
  if (!state) return <Spinner />;
  if ('error' in state)
    return (
      <Empty
        action={
          <button className="btn" onClick={() => navigate('canvas')}>
            {tt('Alle Boards')}
          </button>
        }
      >
        {state.error}
      </Empty>
    );
  return <Editor store={state.store} board={state.board} onBack={() => navigate('canvas')} />;
}

export default function CanvasPage({ id }: { id?: string }) {
  return id ? <BoardView key={id} id={id} /> : <BoardList />;
}
