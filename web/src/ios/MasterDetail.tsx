import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { RouteScope } from '../ui';
import { useT } from '../i18n';

/**
 * List + record side by side where the window has room (iPad, a foldable unfolded, a wide Split View), one pane at a time where it
 * has not (phones). The choice is CSS on the width of the box itself (container query in ios.css), never a user-agent check, and
 * both panes stay mounted whichever is shown: folding or unfolding keeps the list's filters and scroll position and everything
 * typed into the record (docs/ios-web-app.md). The list is only mounted once it is needed – a phone that opens a contact from a
 * notification does not load the whole list behind it.
 *
 *   <MasterDetail open={!!id} list={<Contacts />} detail={id ? <ContactDetail id={id} /> : null} />
 */
const WIDE = '(min-width: 860px)';

/** `className`: on the outer box – a page can widen its list when nothing is open (contacts: `md-full-list`, pages/smart-lists.css). */
export function MasterDetail({ list, detail, open, empty, className }: { list: ReactNode; detail: ReactNode; open: boolean; empty?: string; className?: string }) {
  const t = useT('shell');
  // Inside a panel of the Arbeitsfläche (pages side by side) the page stays what it was: one pane.
  const scoped = useContext(RouteScope) !== null;
  const [listReady, setListReady] = useState(() => !open || (typeof matchMedia === 'function' && matchMedia(WIDE).matches));
  useEffect(() => {
    if (!open) return setListReady(true);
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(WIDE);
    const on = () => mq.matches && setListReady(true);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [open]);
  // Neso fork: the sticky list scrolls on its own and must end at the bottom of the window – its fixed max-height did not count
  // banners above it (practice company, notices), so its last rows sat below the fold.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (!el || scoped) return;
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (getComputedStyle(el).position !== 'sticky') return void (el.style.maxHeight = '');
        const top = Math.max(8, el.getBoundingClientRect().top);
        el.style.maxHeight = `${Math.max(240, window.innerHeight - top - 12)}px`;
      });
    };
    fit();
    window.addEventListener('resize', fit);
    document.addEventListener('scroll', fit, true);
    return () => (cancelAnimationFrame(frame), window.removeEventListener('resize', fit), document.removeEventListener('scroll', fit, true));
  }, [scoped, open]);
  if (scoped) return <>{open ? detail : list}</>;
  return (
    <div className={`md-wrap${className ? ` ${className}` : ''}`}>
      <div className="md" data-open={open ? '1' : '0'}>
        <div className="md-list" ref={listRef}>{listReady && list}</div>
        <div className="md-detail">{open ? detail : <p className="muted md-empty">{empty ?? t('Wähle links einen Eintrag.')}</p>}</div>
      </div>
    </div>
  );
}
