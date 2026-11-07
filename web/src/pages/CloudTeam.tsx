import { useState } from 'react';
import { api } from '../api';
import { Icon } from '../icons';
import { useSession } from '../session';
import { Badge, Check, Empty, Field, Input, Modal, Spinner, act, toast, useLoad } from '../ui';
import { MeterBar, type CloudMe } from './CloudKit';
import { intlLocale, useT } from '../i18n';

/** Cloud-Konto: the team (members of the account) and – for Agentur – client accounts, white-label and login domains. */

interface Member {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'member';
  all_locations: boolean;
  locations: string[];
  hr: boolean;
  invited: boolean;
  created_at: string;
}

function InviteModal({ me, locations, onClose, onDone }: { me: CloudMe; locations: { id: string; name: string; primary: boolean }[]; onClose: () => void; onDone: () => void }) {
  const tt = useT('x_agency');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [hr, setHr] = useState(false);
  const [only, setOnly] = useState<string[]>([]);
  const agency = me.tenant.entitlements.client_accounts;
  const save = async () => {
    const r = await act(() => api.post<{ mail: string; link: string }>('/api/cloud/team', { email, name, hr, ...(only.length ? { locations: only } : {}) }));
    if (r) {
      toast(r.mail === 'sent' ? tt('Einladung verschickt') : tt('Nutzer angelegt – Einladungslink kopieren'));
      onDone();
      onClose();
    }
  };
  return (
    <Modal
      title={tt('Nutzer einladen')}
      onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={onClose}>
            {tt('Abbrechen')}
          </button>
          <button className="btn" disabled={!email.includes('@')} onClick={save}>
            {tt('Einladung senden')}
          </button>
        </>
      }
    >
      <Field label={tt('E-Mail')}>
        <Input type="email" value={email} onChange={setEmail} autoFocus />
      </Field>
      <Field label={tt('Name (optional)')}>
        <Input value={name} onChange={setName} />
      </Field>
      <Check checked={hr} onChange={setHr} label={tt('Darf den Bereich Personal sehen (Gehälter, Abwesenheiten)')} />
      {agency && (
        <Field label={tt('Zugriff auf')} hint={tt('Leer = alle Sub-Accounts. Ein Login nur für einen Kunden bekommt die üblichen Kunden-Bereiche.')}>
          <div className="cloud-locs">
            {locations.map((l) => (
              <Check key={l.id} checked={only.includes(l.id)} onChange={(v) => setOnly(v ? [...only, l.id] : only.filter((x) => x !== l.id))} label={l.name + (l.primary ? tt(' (Haupt-Konto)') : '')} />
            ))}
          </div>
        </Field>
      )}
    </Modal>
  );
}

export function CloudTeam({ me, owner, reload }: { me: CloudMe; owner: boolean; reload: () => void }) {
  const tt = useT('x_agency');
  const team = useLoad(() => api.get<{ members: Member[]; limit: number | null; locations: { id: string; name: string; primary: boolean }[] }>('/api/cloud/team'), []);
  const [invite, setInvite] = useState(false);
  const x = team.data;
  if (!x) return <Spinner />;
  const full = x.limit !== null && x.members.length >= x.limit;
  return (
    <div className="card" data-tour="cloud-team">
      <div className="saas-subtabs">
        <div>
          <h3 style={{ marginTop: 0 }}>Team</h3>
          <p className="muted small" style={{ marginTop: 0 }}>
            {x.limit === null ? tt('Unbegrenzt Nutzer – keine Gebühr pro Platz.') : tt('Dein Tarif ist für {limit} Nutzer. Für mehr wechsle auf Cloud Team & Company – ohne Gebühr pro Nutzer.', { limit: x.limit })}
          </p>
        </div>
        {owner && (
          <button className="btn" disabled={full || me.tenant.read_only} onClick={() => setInvite(true)} data-tour="cloud-invite">
            <Icon name="plus" /> {tt('Nutzer einladen')}
          </button>
        )}
      </div>
      <div className="table-wrap">
<table className="t">
        <thead>
          <tr>
            <th>Name</th>
            <th>{tt('E-Mail')}</th>
            <th>{tt('Rolle')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {x.members.map((m) => (
            <tr key={m.id}>
              <td>{m.name}</td>
              <td>{m.email}</td>
              <td>
                {m.role === 'owner' ? <Badge tone="blue">{tt('Inhaber:in')}</Badge> : <Badge>{tt('Mitglied')}</Badge>} {m.invited && <Badge tone="yellow">{tt('eingeladen')}</Badge>} {m.hr && m.role !== 'owner' && <Badge tone="purple">{tt('Personal')}</Badge>}
                {!m.all_locations && <span className="muted small"> {tt('· {length} Sub-Account(s)', { length: m.locations.length })}</span>}
              </td>
              <td className="nowrap" style={{ textAlign: 'right' }}>
                {owner && m.role !== 'owner' && m.invited && (
                  <button
                    className="btn small secondary"
                    onClick={async () => {
                      const r = await act(() => api.post<{ mail: string }>(`/api/cloud/team/${m.id}/invite`, {}));
                      if (r) toast(r.mail === 'sent' ? tt('Einladung noch einmal verschickt') : tt('Link erzeugt'));
                    }}
                  >
                    {tt('Einladung neu')}
                  </button>
                )}{' '}
                {owner && m.role !== 'owner' && (
                  <button
                    className="btn small ghost"
                    onClick={async () => {
                      if (!window.confirm(tt('{v} entfernen? Der Login wird gelöscht.', { v: m.name || m.email }))) return;
                      if (await act(() => api.del(`/api/cloud/team/${m.id}`), tt('Entfernt'))) {
                        void team.reload();
                        reload();
                      }
                    }}
                  >
                    {tt('Entfernen')}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
</div>
      {invite && <InviteModal me={me} locations={x.locations} onClose={() => setInvite(false)} onDone={() => (void team.reload(), reload())} />}
    </div>
  );
}

// --- Agentur: clients and white-label --------------------------------------------------------------------

interface Client {
  id: string;
  name: string;
  primary: boolean;
  contacts: number;
  users: number;
  meters: Record<'emails' | 'sms' | 'ai' | 'storage_mb', { used: number; limit: number | null; overage: string }>;
  domain: string;
  domain_status?: { status: string };
}

const BRAND_FIELDS: [string, string, string][] = [
  ['name', 'Name der Anwendung', 'z. B. Pixel CRM'],
  ['logo_url', 'Logo-Adresse (https://…)', ''],
  ['color', 'Akzentfarbe (#rrggbb)', '#2563eb'],
  ['login_title', 'Überschrift auf der Anmeldeseite', ''],
  ['login_text', 'Text auf der Anmeldeseite', ''],
  ['support_email', 'Support-E-Mail', ''],
];

function NewClient({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const tt = useT('x_agency');
  const [name, setName] = useState('');
  return (
    <Modal
      title={tt('Neuer Kunden-Account')}
      onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={onClose}>
            {tt('Abbrechen')}
          </button>
          <button
            className="btn"
            disabled={!name.trim()}
            onClick={async () => {
              if (await act(() => api.post('/api/cloud/clients', { name }), tt('Kunden-Account angelegt'))) {
                onDone();
                onClose();
              }
            }}
          >
            {tt('Anlegen')}
          </button>
        </>
      }
    >
      <Field label={tt('Name des Kunden')} hint={tt('Jeder Kunde bekommt ein eigenes, getrenntes Konto mit Pipeline und Vorlagen – ohne Aufpreis.')}>
        <Input value={name} onChange={setName} autoFocus />
      </Field>
    </Modal>
  );
}

function DeleteClient({ c, onClose, onDone }: { c: Client; onClose: () => void; onDone: () => void }) {
  const tt = useT('x_agency');
  const [confirm, setConfirm] = useState('');
  return (
    <Modal
      title={tt('Kunden-Account löschen')}
      onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={onClose}>
            {tt('Abbrechen')}
          </button>
          <button
            className="btn danger"
            disabled={confirm !== c.name}
            onClick={async () => {
              if (await act(() => api.post(`/api/cloud/clients/${c.id}/delete`, { confirm }), tt('Gelöscht'))) {
                onDone();
                onClose();
              }
            }}
          >
            {tt('Endgültig löschen')}
          </button>
        </>
      }
    >
      <p>
        {tt('„{name}“ mit {contacts} Kontakten und allen Daten wird', { name: c.name, contacts: c.contacts })} <strong>{tt('sofort und endgültig')}</strong> {tt('gelöscht. Exportiere vorher, was du brauchst (Daten & Konto → Export, gilt für alle Accounts).')}
      </p>
      <Field label={tt('Zur Bestätigung „{name}“ eintippen', { name: c.name })}>
        <Input value={confirm} onChange={setConfirm} />
      </Field>
    </Modal>
  );
}

function Branding({ reload }: { reload: () => void }) {
  const tt = useT('x_agency');
  const b = useLoad(() => api.get<Record<string, string>>('/api/cloud/branding'), []);
  const [v, setV] = useState<Record<string, string> | null>(null);
  if (!b.data) return <Spinner />;
  const cur = v ?? b.data;
  return (
    <div className="card" data-tour="cloud-branding">
      <h3 style={{ marginTop: 0 }}>{tt('White-Label')}</h3>
      <p className="muted small" style={{ marginTop: 0 }}>{tt('Gilt für dein Konto und alle Kunden-Accounts: Name, Logo und Farbe erscheinen statt der Marke des Anbieters.')}</p>
      <div className="grid2">
        {BRAND_FIELDS.map(([k, label, ph]) => (
          <Field key={k} label={tt(label)}>
            <Input value={cur[k] ?? ''} placeholder={ph ? tt(ph) : ''} onChange={(x) => setV({ ...cur, [k]: x })} />
          </Field>
        ))}
      </div>
      <button
        className="btn"
        disabled={!v}
        onClick={async () => {
          if (await act(() => api.put('/api/cloud/branding', v), tt('Gespeichert'))) {
            setV(null);
            void b.reload();
            reload();
          }
        }}
      >
        {tt('Speichern')}
      </button>
    </div>
  );
}

function DomainModal({ c, onClose, onDone }: { c: Client; onClose: () => void; onDone: () => void }) {
  const tt = useT('x_agency');
  const [domain, setDomain] = useState(c.domain);
  return (
    <Modal
      title={tt('Login-Domain für {name}', { name: c.name })}
      onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={onClose}>
            {tt('Abbrechen')}
          </button>
          <button
            className="btn"
            onClick={async () => {
              if (await act(() => api.put('/api/cloud/domain', { location_id: c.id, domain }), tt('Gespeichert'))) {
                onDone();
                onClose();
              }
            }}
          >
            {tt('Speichern')}
          </button>
        </>
      }
    >
      <Field label={tt('Domain')} hint={tt('z. B. crm.kunde.de – lege bei deinem DNS-Anbieter einen CNAME-Eintrag auf die Adresse deines Anbieters an. Das Zertifikat kommt automatisch, sobald die Domain zeigt. Leer = keine eigene Domain.')}>
        <Input value={domain} onChange={setDomain} placeholder={tt('crm.kunde.de')} autoFocus />
      </Field>
    </Modal>
  );
}

export function CloudClients({ me, owner, reload }: { me: CloudMe; owner: boolean; reload: () => void }) {
  const tt = useT('x_agency');
  const session = useSession();
  const list = useLoad(() => api.get<{ items: Client[]; max: number | null }>('/api/cloud/clients'), []);
  const [add, setAdd] = useState(false);
  const [del, setDel] = useState<Client | null>(null);
  const [dom, setDom] = useState<Client | null>(null);
  const x = list.data;
  if (!x) return <Spinner />;
  const again = () => {
    void list.reload();
    reload();
    void session.reload();
  };
  const full = !!x.max && x.items.length - 1 >= x.max;
  return (
    <>
      <div className="card" data-tour="cloud-clients">
        <div className="saas-subtabs">
          <div>
            <h3 style={{ marginTop: 0 }}>{tt('Kunden-Accounts')}</h3>
            <p className="muted small" style={{ marginTop: 0 }}>
              {x.max ? tt('Bis {max} Kunden-Accounts inklusive (Fair Use).', { max: x.max }) : tt('Unbegrenzt Kunden-Accounts – ohne Aufpreis.')} {tt('Jeder Account ist komplett getrennt; die Fair-Use-Grenzen gelten je Account.')}
            </p>
          </div>
          {owner && (
            <button className="btn" disabled={full || me.tenant.read_only} onClick={() => setAdd(true)} data-tour="cloud-new-client">
              <Icon name="plus" /> {tt('Neuer Kunde')}
            </button>
          )}
        </div>
        <div className="table-wrap">
<table className="t">
          <thead>
            <tr>
              <th>{tt('Account')}</th>
              <th>{tt('Kontakte')}</th>
              <th>{tt('Nutzer')}</th>
              <th>{tt('E-Mails')}</th>
              <th>{tt('Domain')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {x.items.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.name} {c.primary && <Badge tone="blue">{tt('Haupt-Konto')}</Badge>}
                </td>
                <td>{c.contacts.toLocaleString(intlLocale())}</td>
                <td>{c.users}</td>
                <td style={{ minWidth: 150 }}>
                  <MeterBar label="" m={c.meters.emails} />
                </td>
                <td>{c.domain ? <span className="mono">{c.domain}</span> : <span className="muted">–</span>} {c.domain_status && <Badge tone={c.domain_status.status === 'active' ? 'green' : 'yellow'}>{c.domain_status.status === 'active' ? tt('HTTPS aktiv') : tt('wartet auf DNS')}</Badge>}</td>
                <td className="nowrap" style={{ textAlign: 'right' }}>
                  {c.id !== session.locationId && (
                    <button className="btn small secondary" onClick={() => session.switchLocation(c.id)}>
                      {tt('Öffnen')}
                    </button>
                  )}{' '}
                  {owner && me.tenant.entitlements.custom_domain && (
                    <button className="btn small ghost" onClick={() => setDom(c)}>
                      {tt('Domain')}
                    </button>
                  )}{' '}
                  {owner && !c.primary && (
                    <button className="btn small ghost" onClick={() => setDel(c)}>
                      {tt('Löschen')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
</div>
        {x.items.length < 2 && <Empty>{tt('Noch kein Kunden-Account – lege den ersten an.')}</Empty>}
      </div>
      {owner && <Branding reload={again} />}
      {add && <NewClient onClose={() => setAdd(false)} onDone={again} />}
      {del && <DeleteClient c={del} onClose={() => setDel(null)} onDone={again} />}
      {dom && <DomainModal c={dom} onClose={() => setDom(null)} onDone={again} />}
    </>
  );
}

