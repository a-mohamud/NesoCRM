import { useEffect, useState } from 'react';
import { api } from '../api';
import { Icon } from '../icons';
import { useSession } from '../session';
import { BASE, Spinner, act, useLoad } from '../ui';
import { PRODUCT_ICON } from '../theme/brand-icon';
import { useT } from '../i18n';

/**
 * Consent screen of the MCP OAuth server (/app/oauth-consent?request=…): an app such as ChatGPT,
 * Claude.ai or Codex asks for access. Members choose one of their sub-accounts, admins may grant
 * the whole agency; the code then goes back to the app's registered address only.
 */
export function OAuthConsent() {
  const tt = useT('x_integrations');
  const session = useSession();
  const reqId = new URLSearchParams(location.search).get('request') ?? '';
  const r = useLoad(() => api.get<any>(`/api/mcp-oauth/requests/${encodeURIComponent(reqId)}`), [reqId]);
  const [target, setTarget] = useState('');
  const [access, setAccess] = useState<'write' | 'read'>('write');
  const [leaving, setLeaving] = useState('');
  const d = r.data;
  useEffect(() => {
    if (!d) return;
    setTarget(d.locations.some((l: any) => l.id === session.locationId) ? session.locationId : (d.locations[0]?.id ?? ''));
    if (d.access_requested === 'read') setAccess('read');
  }, [d]);
  const go = async (path: string, body: unknown) => {
    const res = await act(() => api.post<{ redirect: string }>(path, body));
    if (res) {
      setLeaving(res.redirect);
      location.href = res.redirect;
    }
  };
  const brand = d?.brand ?? session.branding.name;
  return (
    <div className="login oauth-consent">
      <div className="card" data-tour="oauth-consent">
        <div className="consent-brand">
          <img src={session.branding.logo_url || session.branding.mark_url || PRODUCT_ICON} alt="" />
          <span>{brand}</span>
        </div>
        {!d ? (
          r.error ? (
            <>
              <h1>{tt('Anfrage nicht gefunden')}</h1>
              <p className="muted">{r.error}</p>
              <a className="btn secondary" href={BASE}>
                {tt('Zur App')}
              </a>
            </>
          ) : (
            <Spinner />
          )
        ) : leaving ? (
          <>
            <h1>{tt('Weiterleitung …')}</h1>
            <p className="muted">{tt('Zurück zu {name} ({host}). Du kannst dieses Fenster gleich schließen.', { name: d.client.name, host: d.redirect.host })}</p>
          </>
        ) : (
          <>
            <h1>
              <Icon name="consent" size={22} /> {d.client.name} verbinden?
            </h1>
            <p className="muted">
              <strong>{d.client.name}</strong> {tt('möchte über den MCP-Server auf {brand} zugreifen – z. B. Kontakte, Deals, Aufgaben und den Posteingang lesen', { brand: brand })}
              {access === 'write' ? tt(' und ändern') : ''}{tt('. Jede Änderung steht im Protokoll.')}
            </p>
            <div className={`consent-target${d.redirect.known ? '' : ' warn'}`}>
              <span className="muted small">{tt('Antwort geht an')}</span>
              <strong>{d.redirect.host}</strong>
              <span className="small consent-note">{d.redirect.known ?? tt('Unbekannte Adresse – nur zulassen, wenn du diese Verbindung gerade selbst gestartet hast.')}</span>
            </div>
            {d.locations.length || d.can_agency ? (
              <>
                <div className="consent-label">{tt('Zugriff auf')}</div>
                <div className="consent-choices" role="radiogroup" aria-label={tt('Zugriff auf')}>
                  {d.can_agency && (
                    <label className={`consent-choice${target === 'agency' ? ' on' : ''}`}>
                      <input type="radio" name="target" checked={target === 'agency'} onChange={() => setTarget('agency')} />
                      <span>
                        <strong>{tt('Ganze Agentur')}</strong>
                        <small className="muted">{tt('alle Sub-Accounts, Projekte anlegen, Protokoll')}</small>
                      </span>
                    </label>
                  )}
                  {d.locations.map((l: any) => (
                    <label key={l.id} className={`consent-choice${target === l.id ? ' on' : ''}`}>
                      <input type="radio" name="target" checked={target === l.id} onChange={() => setTarget(l.id)} />
                      <span>
                        <strong>{l.name}</strong>
                        <small className="muted">{tt('nur dieser Sub-Account')}</small>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="consent-label">{tt('Rechte')}</div>
                <div className="consent-choices row2" role="radiogroup" aria-label={tt('Rechte')}>
                  <label className={`consent-choice${access === 'write' ? ' on' : ''}${d.access_requested === 'read' ? ' disabled' : ''}`}>
                    <input type="radio" name="access" disabled={d.access_requested === 'read'} checked={access === 'write'} onChange={() => setAccess('write')} />
                    <span>
                      <strong>{tt('Lesen & schreiben')}</strong>
                    </span>
                  </label>
                  <label className={`consent-choice${access === 'read' ? ' on' : ''}`}>
                    <input type="radio" name="access" checked={access === 'read'} onChange={() => setAccess('read')} />
                    <span>
                      <strong>{tt('Nur lesen')}</strong>
                    </span>
                  </label>
                </div>
              </>
            ) : (
              <p className="consent-none">{tt('Mit deinem Login kannst du keine KI-Apps verbinden – dafür braucht es das Recht „Einstellungen“ im Sub-Account. Bitte wende dich an deine Agentur.')}</p>
            )}
            <div className="consent-actions">
              <button className="btn secondary" onClick={() => go(`/api/mcp-oauth/requests/${encodeURIComponent(reqId)}/deny`, {})}>
                {tt('Ablehnen')}
              </button>
              <button className="btn" data-tour="oauth-allow" disabled={!target} onClick={() => go(`/api/mcp-oauth/requests/${encodeURIComponent(reqId)}/approve`, { target, access })}>
                {tt('Zulassen')}
              </button>
            </div>
            <p className="muted small consent-foot">
              {tt('Angemeldet als {name} ({email}). Trennen kannst du die App jederzeit unter Einstellungen → KI-Werkzeuge.', { name: d.user.name, email: d.user.email })}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
