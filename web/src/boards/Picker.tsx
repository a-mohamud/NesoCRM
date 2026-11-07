import { useMemo, useState } from 'react';
import { Icon } from '../icons';
import { Modal } from '../ui';
import { openBuild } from '../werkstatt/shared';
import { widgetIcon } from './WidgetCard';
import type { Catalogue, WidgetType } from './types';
import { useT } from '../i18n';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** "Widget hinzufügen": every widget type, searchable, grouped by purpose. */
export function Picker({ catalogue, onPick, onClose, full }: { catalogue: Catalogue; onPick: (t: WidgetType) => void; onClose: () => void; full: boolean }) {
  const tt = useT('x_misc');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const found = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    return catalogue.widgets.filter((w) => {
      if (cat && w.category !== cat) return false;
      if (!words.length) return true;
      const hay = norm(`${w.label} ${w.description} ${w.category_label} ${w.keywords.join(' ')}`);
      return words.every((x) => hay.includes(x));
    });
  }, [catalogue, q, cat]);
  const groups = catalogue.categories.map((c) => ({ ...c, items: found.filter((w) => w.category === c.key) })).filter((g) => g.items.length);
  const card = (w: WidgetType) => (
    <button key={w.type} type="button" className="bd-pick" onClick={() => onPick(w)} disabled={full} data-type={w.type}>
      <span className="bd-pick-icon">
        <Icon name={widgetIcon(w)} size={20} />
      </span>
      <span className="bd-pick-text">
        <b>{w.label}</b>
        <span>{w.description}</span>
        <span className="bd-pick-tags">
          {w.access_label && <i title={tt('Wer das Widget sieht, braucht dieses Recht')}>{tt('Recht: {access_label}', { access_label: w.access_label })}</i>}
          {w.risk === 'high' && <i className="warn">{tt('zeigt Externes / startet Aktionen')}</i>}
          {w.source !== 'core' && <i>{tt('Modul: {source}', { source: w.source })}</i>}
        </span>
      </span>
    </button>
  );
  return (
    <Modal title={tt('Widget hinzufügen')} onClose={onClose} wide className="bd-picker-modal">
      <div className="bd-picker" data-tour="board-picker">
        <div className="bd-picker-bar">
          <label className="bd-search">
            <Icon name="search" size={15} />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && found[0] && !full) {
                  e.preventDefault();
                  onPick(found[0]);
                }
              }}
              placeholder={tt('Suchen: Umsatz, Aufgaben, Pipeline, Kalender …')}
              aria-label={tt('Widgets durchsuchen')}
            />
          </label>
          <div className="chips" role="group" aria-label={tt('Kategorie')}>
            <button type="button" className={`chip${cat === '' ? ' on' : ''}`} onClick={() => setCat('')}>
              {tt('Alle')}
            </button>
            {catalogue.categories.map((c) => (
              <button key={c.key} type="button" className={`chip${cat === c.key ? ' on' : ''}`} onClick={() => setCat(cat === c.key ? '' : c.key)}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
        {full && <p className="bd-callout">{tt('Das Board hat schon {widgets} Widgets – entferne eines, um ein neues hinzuzufügen.', { widgets: catalogue.limits.widgets })}</p>}
        {groups.map((g) => (
          <section key={g.key} className="bd-pick-group">
            <h4>{g.label}</h4>
            <div className="bd-pick-grid">{g.items.map(card)}</div>
          </section>
        ))}
        {!groups.length && (
          <div className="bd-pick-none">
            <p>
              {tt('Kein Widget passt zu „{q}“.', { q: q })}
            </p>
            <button type="button" className="btn secondary" onClick={() => openBuild({ title: `Board-Widget: ${q.slice(0, 60)}`, text: `Ich hätte gern ein Widget für Living Boards: ${q}` })}>
              <Icon name="hammer" size={15} /> {tt('In der Werkstatt bauen lassen')}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
