import { useEffect, useState } from 'react';
import { api, ago } from '../api';
import { Icon, type IconName } from '../icons';
import { useSession } from '../session';
import { Check, Empty, Link, PageHead, Spinner, Tabs, navigate, useLoad } from '../ui';
import { Mini } from './Mini';
import { EmbedHosts } from './EmbedHosts';
import { Gallery, NewBoard, Starters } from './Templates';
import { useCatalogue } from './store';
import type { BoardItem } from './types';
import { SortableGrid } from '../sortable/Sortable';
import { useT } from '../i18n';

function Card({ b, catalogue, first }: { b: BoardItem; catalogue: ReturnType<typeof useCatalogue>; first?: boolean }) {
  const tt = useT('x_misc');
  return (
    <Link to={`boards/${b.id}`} className="bd-card-link" tour={first ? 'board-card' : undefined}>
      <span className="bd-card-mini" style={b.accent ? ({ '--bd-accent': b.accent } as React.CSSProperties) : undefined}>
        {b.preview?.length ? <Mini cells={b.preview} accent={b.accent} catalogue={catalogue} /> : <span className="bd-card-blank">{tt('Leer')}</span>}
      </span>
      <span className="bd-card-info">
        <b>
          <Icon name={(b.icon || 'boards') as IconName} size={15} /> {b.name}
        </b>
        <span className="bd-card-badges">
          {b.scope === 'shared' ? <span className="bd-badge tone-blue">Team</span> : <span className="bd-badge">{tt('Persönlich')}</span>}
          {b.home && (
            <span className="bd-badge tone-green">
              <Icon name="house" size={11} /> {tt('Startseite')}
            </span>
          )}
          {b.access === 'view' && <span className="bd-badge">{tt('Nur Ansicht')}</span>}
          {b.viewers.length > 0 && <span className="bd-badge tone-purple">{b.viewers.length} live</span>}
        </span>
        <span className="muted small">
          {tt('{widgets} Widgets ·', { widgets: b.widgets })} {b.mine ? tt('von dir') : tt('von {v}', { v: b.owner_name || tt('unbekannt') })} · {ago(b.updated_at)}
        </span>
      </span>
    </Link>
  );
}

/** "Boards": your own and the team's, plus the template gallery. */
export function BoardList({ tab }: { tab: 'boards' | 'vorlagen' }) {
  const tt = useT('x_misc');
  const session = useSession();
  const admin = session.user.role === 'admin';
  const [all, setAll] = useState(false);
  const catalogue = useCatalogue();
  const [creating, setCreating] = useState(false);
  const [hosts, setHosts] = useState(false);
  const { data, error, loading, reload } = useLoad(() => api.get<{ boards: BoardItem[] }>(`/api/boards${all ? '?all=1' : ''}`), [all, session.locationId]);
  useEffect(() => {
    window.dispatchEvent(new Event('pghl:boards'));
  }, [data]);
  const mine = data?.boards.filter((b) => b.mine) ?? [];
  const team = data?.boards.filter((b) => !b.mine && b.scope === 'shared') ?? [];
  const others = data?.boards.filter((b) => !b.mine && b.scope !== 'shared') ?? [];
  const none = data && !data.boards.length;
  return (
    <div className="bd-list-page" data-tour="boards-page">
      <PageHead
        title="Boards"
        sub={tt('Software, die sich an dich anpasst. Nicht andersrum. Setze dir aus Bausteinen deine Arbeitsfläche zusammen – per Ziehen oder per Wunsch.')}
      >
        <button type="button" className="btn" onClick={() => setCreating(true)} data-tour="board-new">
          <Icon name="plus" size={15} /> {tt('Neues Board')}
        </button>
      </PageHead>
      <Tabs
        tabs={[
          ['boards', 'Meine Boards'],
          ['vorlagen', 'Vorlagen'],
        ]}
        value={tab}
        onChange={(v) => navigate(v === 'boards' ? 'boards' : `boards/${v}`)}
      />
      {tab === 'vorlagen' ? (
        <Gallery catalogue={catalogue} />
      ) : (
        <>
          {error && <p className="bd-error">{error}</p>}
          {loading && !data && <Spinner />}
          {none && (
            <div className="bd-hero">
              <h2>{tt('Dein erstes Board')}</h2>
              <p className="muted">{tt('Starte mit einem fertigen Board – du kannst danach alles verschieben, ergänzen oder per Wunsch umbauen.')}</p>
              <Starters catalogue={catalogue} />
              <p>
                <button type="button" className="btn secondary" onClick={() => setCreating(true)}>
                  {tt('Leeres Board anlegen')}
                </button>
              </p>
            </div>
          )}
          {mine.length > 0 && (
            <section className="bd-section">
              <h3>{tt('Meine Boards')}</h3>
              <SortableGrid id="boards.mine" className="bd-cards">
                {mine.map((b, i) => (
                  <Card key={b.id} b={b} catalogue={catalogue} first={i === 0} />
                ))}
              </SortableGrid>
            </section>
          )}
          {team.length > 0 && (
            <section className="bd-section">
              <h3>{tt('Geteilt im Team')}</h3>
              <SortableGrid id="boards.team" className="bd-cards">
                {team.map((b) => (
                  <Card key={b.id} b={b} catalogue={catalogue} />
                ))}
              </SortableGrid>
            </section>
          )}
          {others.length > 0 && (
            <section className="bd-section">
              <h3>{tt('Persönliche Boards anderer')}</h3>
              <SortableGrid id="boards.others" className="bd-cards">
                {others.map((b) => (
                  <Card key={b.id} b={b} catalogue={catalogue} />
                ))}
              </SortableGrid>
            </section>
          )}
          {data && data.boards.length > 0 && !mine.length && !team.length && !others.length && <Empty>{tt('Keine Boards.')}</Empty>}
          {admin && (
            <div className="bd-admin-row">
              <Check checked={all} onChange={setAll} label={tt('Als Admin auch die persönlichen Boards anderer zeigen')} />
              <button type="button" className="btn ghost small" onClick={() => setHosts(true)}>
                <Icon name="monitor" size={14} /> {tt('Freigegebene Einbettungs-Adressen')}
              </button>
            </div>
          )}
        </>
      )}
      {hosts && <EmbedHosts onClose={() => setHosts(false)} />}
      {creating && <NewBoard catalogue={catalogue} onClose={() => (setCreating(false), reload())} />}
    </div>
  );
}
