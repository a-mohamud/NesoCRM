import { Suspense, useEffect, useRef, useState } from 'react';
import { Icon } from '../icons';
import { useSession } from '../session';
import { navigate, useRoute } from '../ui';
import { journeyStatus, toursForPath, tourById, useTourText, type Access } from './catalog';
import { accessOf, startTour } from './engine';
import { FIRST_TOUR } from './learn';
import { useAcademy } from './progress';
import type { AcademyState, Tour } from './types';
import { useT } from '../i18n';

/** „?“ in the top bar: the tours for the page you are on, „Weitermachen“ and the way to the academy. */
export function HelpButton() {
  const tt = useT('x_tours_b');
  const session = useSession();
  const route = useRoute();
  const academy = useAcademy();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const access = accessOf(session);
  const path = route.join('/') || (session.user.role === 'admin' ? 'agency' : 'dashboard');
  const progress = academy?.tours ?? {};

  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', off);
    window.addEventListener('keydown', esc);
    return () => (document.removeEventListener('mousedown', off), window.removeEventListener('keydown', esc));
  }, [open]);

  const begin = (t: Tour, step = 0) => {
    setOpen(false);
    startTour(t.id, step);
  };
  const resumeStep = (t: Tour) => {
    const p = progress[t.id];
    return p && !p.done && p.step > 0 && p.step < p.total - 1 ? p.step : 0;
  };

  return (
    <div className="help-wrap" ref={ref}>
      <button className="btn secondary small help-btn" data-tour="help" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={tt('Hilfe und Touren')} title={tt('Hilfe: geführte Tour für diese Seite')}>
        <Icon name="help" size={16} />
      </button>
      {open && (
        <Suspense fallback={null}>
          <HelpMenu path={path} access={access} academy={academy} begin={begin} resumeStep={resumeStep} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}

/** The open „?“ menu. It loads the tour catalogs only when opened, so tour titles come in the active language. */
function HelpMenu({ path, access, academy, begin, resumeStep, onClose }: { path: string; access: Access; academy: AcademyState | null | undefined; begin: (t: Tour, step?: number) => void; resumeStep: (t: Tour) => number; onClose: () => void }) {
  const tt = useT('x_tours_b');
  useTourText();
  const progress = academy?.tours ?? {};
  const tours = toursForPath(path, access).slice(0, 5);
  const active = academy?.active ? tourById(academy.active.tour) : undefined;
  const journey = journeyStatus(progress, access);
  // „In 10 Minuten startklar“ until the first tour is done (unless the page offers it anyway).
  const first = !progress[FIRST_TOUR]?.done && !tours.some((t) => t.id === FIRST_TOUR) ? tourById(FIRST_TOUR) : undefined;
  return (
    <div className="help-pop" role="dialog" aria-label={tt('Hilfe')}>
      <div className="help-head">
        <strong>{tt('Hilfe zu dieser Seite')}</strong>
        <button className="icon-btn" onClick={() => onClose()} aria-label={tt('Schließen')}>
          ✕
        </button>
      </div>
      {active && (
        <button className="help-row resume" onClick={() => begin(active, academy!.active!.step)}>
          <Icon name="play" size={15} />
          <span className="grow">
            {tt('Weitermachen: {title}', { title: active.title })}
            <small>{tt('Schritt {v}', { v: academy!.active!.step + 1 })}</small>
          </span>
        </button>
      )}
      {first && (
        <button className="help-row" onClick={() => begin(first, resumeStep(first))} data-tour="help-first-tour">
          <Icon name="academy" size={15} />
          <span className="grow">
            {tt('Lernen: In 10 Minuten startklar')}
            <small>{tt('Geführte Tour „{title}“ · ca. {minutes} Min.', { title: first.title, minutes: first.minutes })}</small>
          </span>
          <Icon name="play" size={14} className="ico muted" />
        </button>
      )}
      {tours.length ? (
        tours.map((t) => (
          <button key={t.id} className="help-row" onClick={() => begin(t, resumeStep(t))}>
            <Icon name={t.icon} size={15} />
            <span className="grow">
              {t.title}
              <small>
                {tt('{length} Schritte · ca. {minutes} Min.', { length: t.steps.length, minutes: t.minutes })}{progress[t.id]?.done ? tt(' · ✓ erledigt') : resumeStep(t) ? tt(' · angefangen') : ''}
              </small>
            </span>
            <Icon name="play" size={14} className="ico muted" />
          </button>
        ))
      ) : (
        <p className="muted small" style={{ margin: '6px 10px' }}>
          {tt('Für diese Seite gibt es keine eigene Tour – in der Akademie findest du alle.')}
        </p>
      )}
      {journey.next && (
        <button className="help-row" onClick={() => begin(journey.next!, resumeStep(journey.next!))}>
          <Icon name="trophy" size={15} />
          <span className="grow">
            {tt('Gesamt-Guide „Firma übernehmen“')}
            <small>
              {tt('{done}/{total} Kapitel · weiter mit {title}', { done: journey.done, total: journey.total, title: journey.next.title })}
            </small>
          </span>
        </button>
      )}
      <a
        className="help-all"
        href="/app/academy"
        onClick={(e) => {
          e.preventDefault();
          onClose();
          navigate('academy');
        }}
      >
        {tt('Alle Touren in der Akademie →')}
      </a>
    </div>
  );
}

/** A clear hint while you are in the practice sub-account. */
export function SandboxBanner() {
  const tt = useT('x_tours_b');
  const session = useSession();
  const academy = useAcademy();
  if (!academy?.sandbox || academy.sandbox.id !== session.locationId) return null;
  return (
    <div className="sandbox-banner" data-tour="sandbox-banner">
      <Icon name="academy" size={16} />
      <span className="grow">
        <strong>{tt('Übungs-Firma:')}</strong> {tt('Hier ist alles erfunden – probier ruhig alles aus.')}<span className="sb-more"> {tt('E-Mails und SMS werden nur gespeichert, nie verschickt.')}</span>
      </span>
      <a
        href="/app/academy"
        onClick={(e) => {
          e.preventDefault();
          navigate('academy');
        }}
      >
        {tt('Zur Akademie')}
      </a>
    </div>
  );
}
