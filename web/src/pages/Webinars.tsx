import { useState } from 'react';
import { Icon } from '../icons';
import { api, dt } from '../api';
import { act, Badge, confirmAsk, Copy, Empty, Field, Input, Link, Modal, navigate, PageHead, pressable, Spinner, useLoad } from '../ui';
import { WebinarEditor } from './WebinarEditor';
import { fmtSession } from './WebinarKit';
import './webinar.css';
import { useT } from '../i18n';

/**
 * Webinare: automated webinars – the video plays at the appointment, for everybody who registered. List here, the editor in
 * WebinarEditor.tsx (tabs Grunddaten, Termine, Anmeldung, Raum & Angebot, Erinnerungen, Auswertung). Docs: docs/webinars.md.
 */

function NewWebinar({ onClose }: { onClose: () => void }) {
  const tt = useT('x_community');
  const [title, setTitle] = useState('');
  const [presenter, setPresenter] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    const w = await act(() => api.post('/api/webinars', { title, presenter_name: presenter }), tt('Webinar angelegt'));
    setBusy(false);
    if (w) {
      onClose();
      navigate(`webinars/${w.id}`);
    }
  };
  return (
    <Modal
      title={tt('Neues Webinar')}
      onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={onClose}>
            {tt('Abbrechen')}
          </button>
          <button className="btn" disabled={!title.trim() || busy} onClick={create}>
            {tt('Anlegen')}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim() && !busy) void create();
        }}
      >
        <Field label={tt('Titel *')} hint={tt('Video, Termine und Texte richtest du danach im Editor ein. Ein neues Webinar ist erst ein Entwurf – niemand sieht es.')}>
          <Input value={title} onChange={setTitle} autoFocus maxLength={160} placeholder={tt('Mehr Kunden mit automatisierten Webinaren')} data-tour="webinar-new-title" />
        </Field>
        <Field label={tt('Vortragende:r (optional)')}>
          <Input value={presenter} onChange={setPresenter} placeholder={tt('Erika Muster')} />
        </Field>
      </form>
    </Modal>
  );
}

export function Webinars({ id, tab }: { id?: string; tab?: string }) {
  if (id) return <WebinarEditor id={id} tab={tab} />;
  return <WebinarList />;
}

function WebinarList() {
  const tt = useT('x_community');
  const { data, loading, error, reload } = useLoad(() => api.get<any[]>('/api/webinars'), []);
  const [creating, setCreating] = useState(false);
  const duplicate = async (w: any) => {
    const r = await act(() => api.post(`/api/webinars/${w.id}/duplicate`), tt('Kopie angelegt (als Entwurf)'));
    if (r) navigate(`webinars/${r.id}`);
  };
  const remove = async (w: any) => {
    if (!confirmAsk(tt('„{title}“ mit allen Anmeldungen und Auswertungen löschen?', { title: w.title }))) return;
    if (await act(() => api.del(`/api/webinars/${w.id}`), tt('Gelöscht'))) reload();
  };
  return (
    <>
      <PageHead title={tt('Webinare')} sub={tt('Das Video läuft zum Termin – für alle Angemeldeten zur gleichen Zeit. Mit Anmeldeseite, Erinnerungen, Fragen, Umfragen und Angebot.')}>
        <button className="btn" data-tour="webinars-new" onClick={() => setCreating(true)}>
          <Icon name="webinar" /> {tt('Neues Webinar')}
        </button>
      </PageHead>
      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <Empty>{error}</Empty>
      ) : !data?.length ? (
        <Empty
          tour="webinars-empty"
          action={
            <button className="btn" onClick={() => setCreating(true)}>
              {tt('Erstes Webinar anlegen')}
            </button>
          }
        >
          {tt('Noch kein Webinar. Lade ein Video hoch, wähle Termine – und lass dich von der Seite anmelden.')}
        </Empty>
      ) : (
        <div className="table-wrap" data-tour="webinars-list">
          <table className="t">
            <thead>
              <tr>
                <th>{tt('Webinar')}</th>
                <th>Status</th>
                <th>{tt('Nächster Termin')}</th>
                <th className="num">{tt('Anmeldungen')}</th>
                <th className="num">{tt('Teilgenommen')}</th>
                <th>{tt('Geändert')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((w) => (
                <tr key={w.id} className="click" {...pressable(() => navigate(`webinars/${w.id}`))}>
                  <td>
                    <Link to={`webinars/${w.id}`}>
                      <b>{w.title}</b>
                    </Link>
                    <div className="muted small">{w.presenter_name || '–'}</div>
                  </td>
                  <td>{w.status === 'published' ? <Badge tone="green">{tt('Veröffentlicht')}</Badge> : <Badge>{tt('Entwurf')}</Badge>}</td>
                  <td>{w.next_session ? fmtSession(w.next_session, '') : w.status === 'published' ? tt('Sofort / Just in time') : '–'}</td>
                  <td className="num">
                    {w.registrations}
                    {w.upcoming_registrations ? <span className="muted small"> {tt('({upcoming_registrations} offen)', { upcoming_registrations: w.upcoming_registrations })}</span> : null}
                  </td>
                  <td className="num">{w.attended}</td>
                  <td className="muted small">{dt(w.updated_at)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="actions">
                      {w.status === 'published' && <Copy text={w.url} label={tt('Link')} />}
                      <button className="btn small secondary" onClick={() => duplicate(w)}>
                        {tt('Kopieren')}
                      </button>
                      <button className="icon-btn" aria-label={tt('{title} löschen', { title: w.title })} onClick={() => remove(w)}>
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <NewWebinar onClose={() => setCreating(false)} />}
    </>
  );
}
