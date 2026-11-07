import { useState } from 'react';
import { MODULE_SECTIONS, PROFILES, hiddenForProfile, type Profile } from '../../../server/services/appearance-model';
import { Icon } from '../icons';
import { Modal } from '../ui';
import { update, useLook } from './store';
import { useT } from '../i18n';

/**
 * Starter profiles ("Agentur", "Coach & Kurse", …): one click picks which areas of the menu stay visible.
 * A profile only fills the "hidden" list of Darstellung → Sichtbare Bereiche – permissions are not touched,
 * hidden pages stay reachable (Alle Bereiche anzeigen, direct address). Offered once to new accounts, in the
 * Akademie and on the Darstellung page.
 */

/** Which modules a profile keeps (highlighted) and which it hides (struck through). */
export function ProfilePreview({ profile }: { profile: Profile }) {
  const tt = useT('x_misc');
  const hidden = new Set(hiddenForProfile(profile.id));
  const kept = MODULE_SECTIONS.reduce((n, s) => n + s.modules.filter(([id]) => !hidden.has(id)).length, 0);
  return (
    <div data-tour="profile-preview">
      <p className="muted small" style={{ margin: '4px 0' }}>
        <b>{tt(profile.label)}</b>{tt(': {kept} Bereiche bleiben sichtbar, {size} werden ausgeblendet. Dashboard und Einstellungen bleiben immer.', { kept: kept, size: hidden.size })}
      </p>
      {MODULE_SECTIONS.map((s) => (
        <div key={s.id} className="ap-mod-sec">
          <h3>{tt(s.label)}</h3>
          <div className="ap-keep">
            {s.modules.map(([id, label]) => (
              <span key={id} className={hidden.has(id) ? 'off' : ''}>
                {tt(label)}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProfileGrid({ value, onPick, disabled }: { value: string; onPick: (p: Profile) => void; disabled?: boolean }) {
  const tt = useT('x_misc');
  return (
    <div className="ap-profiles" role="radiogroup" aria-label={tt('Starter-Profil')}>
      {PROFILES.map((p) => (
        <button key={p.id} className={`ap-profile${value === p.id ? ' on' : ''}`} onClick={() => onPick(p)} disabled={disabled} role="radio" aria-checked={value === p.id} data-tour={`profile-${p.id}`}>
          <b>{tt(p.label)}</b>
          <span className="muted small">{tt(p.text)}</span>
        </button>
      ))}
    </div>
  );
}

/** Picks a profile with a preview, then applies it. Closing (✕, Esc) applies nothing. */
export function ProfilePickerModal({ onClose, intro }: { onClose: () => void; intro?: string }) {
  const tt = useT('x_misc');
  const look = useLook();
  // Starts on "Alles" (nothing hidden): a click on "Übernehmen" without choosing never hides anything.
  const [pick, setPick] = useState<Profile>(PROFILES.find((p) => p.id === look.prefs.profile) ?? PROFILES[PROFILES.length - 1]);
  const locked = !!look.locks.modules;
  return (
    <Modal
      title={tt('Womit arbeitest du?')}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn secondary" onClick={onClose}>
            {tt('Später')}
          </button>
          <button
            className="btn"
            disabled={locked}
            onClick={async () => {
              await update({ hidden: hiddenForProfile(pick.id), profile: pick.id, asked: true });
              onClose();
            }}
            data-tour="profile-apply"
          >
            {tt('Übernehmen')}
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0 }}>
        {intro ?? tt('Wähle ein Starter-Profil – der Rest des Menüs wird ausgeblendet. Das ist nur eine Ansicht: nichts wird gelöscht, die Rechte bleiben gleich, und über „Alle Bereiche anzeigen“ ist alles wieder da.')}
      </p>
      {locked && <p className="ap-lock">{tt('Von deiner Agentur festgelegt')}</p>}
      <ProfileGrid value={pick.id} onPick={setPick} disabled={locked} />
      <ProfilePreview profile={pick} />
    </Modal>
  );
}

/** First-run offer for a new account: shown once; ✕ / Esc / "Später" remember that it was offered. */
export function ProfileOffer() {
  const tt = useT('x_misc');
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <ProfilePickerModal
      intro={tt('Willkommen! Wähle, womit du arbeitest – wir blenden alles andere im Menü aus, damit du nicht lange suchst. Du kannst das jederzeit unter Einstellungen → Darstellung ändern.')}
      onClose={() => {
        setOpen(false);
        void update({ asked: true });
      }}
    />
  );
}

/** Card for the Akademie: pick a profile (again). */
export function ProfilesCard() {
  const tt = useT('x_misc');
  const [open, setOpen] = useState(false);
  const look = useLook();
  const current = PROFILES.find((p) => p.id === look.prefs.profile);
  return (
    <div className="card" data-tour="academy-profiles" style={{ marginBottom: 14 }}>
      <h2>
        <Icon name="eyeOff" size={18} /> {tt('Menü zuschneiden')}
      </h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        {tt('Du brauchst nicht alles? Wähle ein Starter-Profil (Agentur, Coach & Kurse, Handwerk, E-Commerce, Vertrieb) und blende ungenutzte Bereiche aus.')} {current ? tt('Aktuell: {label}.', { label: tt(current.label) }) : ''}
      </p>
      <button className="btn small" onClick={() => setOpen(true)}>
        {tt('Profil wählen')}
      </button>
      {open && <ProfilePickerModal onClose={() => setOpen(false)} />}
    </div>
  );
}
