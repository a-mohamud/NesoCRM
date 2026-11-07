import { Link } from '../ui';
import { useT } from '../i18n';

/** A small card on the Settings tabs that points to the Umzug assistant and the delivery check (both are lazy pages of their own). */
export function UmzugPointer({ kind }: { kind: 'umzug' | 'deliverability' }) {
  const tt = useT('x_integrations');
  return kind === 'umzug' ? (
    <div className="card notice-card" data-tour="umzug-pointer">
      <strong>{tt('Wechsel von Mailchimp, Klaviyo, Zendesk, Salesforce, monday.com, Notion, Typeform, Calendly, sevDesk oder einem anderen Tool?')}</strong>
      <p className="muted">{tt('Der Umzugsassistent holt Kontakte, Deals, Tickets, Projekte, Wiki-Seiten, Formulare, Termine und mehr per Schlüssel oder Export-Datei – mit Vorschau, Probelauf und Rückgängig.')}</p>
      <Link to="settings/umzug" className="btn secondary">
        {tt('Zum Umzugsassistenten')}
      </Link>
    </div>
  ) : (
    <div className="card notice-card" data-tour="deliverability-pointer">
      <strong>{tt('Kommen deine Mails an?')}</strong>
      <p className="muted">{tt('Prüfe SPF, DKIM und DMARC deiner Absender-Domain und kopiere die fehlenden DNS-Einträge.')}</p>
      <Link to="settings/deliverability" className="btn secondary">
        {tt('E-Mail-Zustellung prüfen')}
      </Link>
    </div>
  );
}
