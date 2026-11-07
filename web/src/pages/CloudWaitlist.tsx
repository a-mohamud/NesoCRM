import { useState } from 'react';
import { api, dt } from '../api';
import { act, Badge, Empty, Input, Spinner, Stat, useLoad } from '../ui';
import { SortableGrid } from '../sortable/Sortable';
import { useT } from '../i18n';

/**
 * Agentur → Cloud → Warteliste: whether the waitlist mode is on (and why), where the sign-ups go (the HQ form with Double-Opt-in, or the
 * built-in list), the built-in list with search, CSV export and delete (data protection). Server side: modules/cloud-waitlist.ts,
 * docs/cloud.md#waitlist-mode. German only, like the rest of the operator console.
 */

interface Item {
  id: string;
  email: string;
  name: string;
  plan: string;
  lang: string;
  source: string;
  consent_text: string;
  consent_at: string;
  created_at: string;
  updated_at: string;
}
interface Data {
  enabled: boolean;
  reason: 'env' | 'no_billing' | null;
  cloud: boolean;
  via: 'forms' | 'builtin';
  forms: { location_id: string; location_name: string; form_id: string; doi: boolean } | null;
  privacy_url: string;
  total: number;
  by_plan: Record<string, number>;
  items: Item[];
}

const PLAN: Record<string, string> = { solo: 'Cloud Solo', team: 'Cloud Team & Company', agency: 'Cloud Agentur' };
const REASON: Record<string, string> = {
  env: 'PGHL_CLOUD_WAITLIST=1 ist gesetzt.',
  no_billing: 'Stripe ist nicht eingerichtet – ohne Abrechnung bleibt die Cloud automatisch auf der Warteliste.',
};

export function CloudWaitlist() {
  const tt = useT('x_agency');
  const [q, setQ] = useState('');
  const d = useLoad(() => api.get<Data>(`/api/cloud/waitlist${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`), [q]);
  const x = d.data;
  if (!x) return <Spinner />;
  const remove = async (it: Item) => {
    if (!window.confirm(tt('{email} von der Warteliste löschen? Das lässt sich nicht rückgängig machen.', { email: it.email }))) return;
    if (await act(() => api.del(`/api/cloud/waitlist/${it.id}`), tt('Gelöscht'))) d.reload();
  };
  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>
          {tt('Warteliste')} {x.enabled ? <Badge tone="green">{tt('aktiv')}</Badge> : <Badge tone="gray">{tt('aus')}</Badge>}
        </h3>
        {x.enabled ? (
          <p style={{ margin: 0 }}>
            {tt('Neue Anmeldungen, Zahlungen und Testphasen sind gesperrt; Preis- und Startseite zeigen die geplanten Tarife und das Wartelisten-Formular. Bestehende Kunden arbeiten normal weiter.')}{' '}
            <span className="muted">{x.reason && REASON[x.reason] ? tt(REASON[x.reason]) : ''}</span>
          </p>
        ) : (
          <p style={{ margin: 0 }}>{tt('Die Cloud ist offen: Kunden melden sich unter /start an. Das Formular nimmt keine Einträge an; die Liste unten bleibt erhalten.')}</p>
        )}
        <p className="muted small" style={{ marginBottom: 0 }}>
          {x.forms
            ? tt('Einträge gehen in das Formular {form} des Sub-Accounts „{location}“ (PGHL_LANDING_LOCATION){doi} – dort stehen sie als Kontakte mit Einwilligungsnachweis. Hier steht nur, was vorher in der eingebauten Liste gelandet ist.', { form: x.forms.form_id, location: x.forms.location_name || x.forms.location_id, doi: x.forms.doi ? tt(' mit Double-Opt-in') : '' })
            : tt('Einträge landen in der eingebauten Liste unten: E-Mail, optional Name und Tarif, Sprache, Einwilligungstext mit Zeitpunkt, IP nur als Hash. Die Liste verschickt nie selbst E-Mails.')}
          {x.privacy_url ? tt(' Datenschutz-Link am Formular: {privacy_url}', { privacy_url: x.privacy_url }) : tt(' Kein Datenschutz-Link gesetzt (PGHL_LANDING_PRIVACY_URL).')}
        </p>
      </div>
      <SortableGrid id="cloud-waitlist.stats" className="stats" style={{ margin: '12px 0' }}>
        <Stat label={tt('Einträge')} value={x.total} />
        {Object.entries(PLAN).map(([k, n]) => (
          <Stat key={k} label={tt(n)} value={x.by_plan[k] ?? 0} />
        ))}
        <Stat label={tt('Noch unsicher')} value={x.by_plan.none ?? 0} />
      </SortableGrid>
      <div className="card">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ flex: '1 1 240px' }}>
            <Input value={q} onChange={setQ} placeholder={tt('Suchen (E-Mail oder Name)')} aria-label={tt('Warteliste durchsuchen')} />
          </div>
          <a className="btn small secondary" href="/api/cloud/waitlist.csv" download>
            {tt('CSV exportieren')}
          </a>
        </div>
        {x.items.length ? (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>{tt('Eingetragen')}</th>
                  <th>{tt('E-Mail')}</th>
                  <th>{tt('Tarif')}</th>
                  <th>{tt('Sprache')}</th>
                  <th>{tt('Einwilligung')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {x.items.map((it) => (
                  <tr key={it.id}>
                    <td className="nowrap">{dt(it.created_at)}</td>
                    <td>
                      {it.email}
                      {it.name && <div className="muted small">{it.name}</div>}
                    </td>
                    <td>{PLAN[it.plan] ? tt(PLAN[it.plan]) : '–'}</td>
                    <td>{it.lang === 'en' ? tt('Englisch') : tt('Deutsch')}</td>
                    <td className="nowrap" title={it.consent_text}>
                      {dt(it.consent_at)}
                    </td>
                    <td>
                      <button className="btn small secondary" onClick={() => remove(it)}>
                        {tt('Löschen')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>{q ? tt('Nichts gefunden.') : tt('Noch niemand auf der Warteliste.')}</Empty>
        )}
        <p className="muted small" style={{ marginBottom: 0 }}>
          {tt('Auskunft und Löschung (DSGVO): Einträge einzeln löschen; der Export und jede Löschung stehen im Protokoll. Die eingebaute Liste sammelt ohne Double-Opt-in und sendet nie selbst – die Nachricht zum Start verschickst du einmal selbst, ohne weitere Werbung.')}
        </p>
      </div>
    </>
  );
}
