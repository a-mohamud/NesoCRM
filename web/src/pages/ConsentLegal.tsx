import { useEffect, useState } from 'react';
import { api, currentLocation } from '../api';
import { Badge, Check, Copy, Empty, Field, Input, Modal, Select, Spinner, act, toast, useLoad } from '../ui';
import { LegalNotice } from './ConsentKit';
import { useT } from '../i18n';

/**
 * Settings → Einwilligung & Recht → Rechtstexte: company data, detected services, and the generators (drafts, never legal advice).
 * Neso fork: the profile's jurisdiction picks the set – Kenya (English documents, the default) or Germany.
 */

const DOCS: { kind: string; label: string; hint: string; hosted: boolean; funnel: boolean }[] = [
  { kind: 'impressum', label: 'Impressum', hint: 'Anbieterkennzeichnung nach § 5 DDG.', hosted: true, funnel: true },
  { kind: 'datenschutz', label: 'Datenschutzerklärung', hint: 'Passt sich an die genutzten Module an (Formulare, Webinare, E-Mail-Tracking, Zahlungen, Einbettungen …).', hosted: true, funnel: true },
  { kind: 'widerruf', label: 'Widerrufsbelehrung', hint: 'Mit Muster-Widerrufsformular, für digitale Inhalte, Dienstleistungen oder Waren.', hosted: true, funnel: false },
  { kind: 'avv', label: 'Auftragsverarbeitungsvertrag (AVV)', hint: 'Entwurf nach Art. 28 DSGVO für Kunden, deren Daten du verarbeitest.', hosted: false, funnel: false },
  { kind: 'vvt', label: 'Verzeichnis von Verarbeitungstätigkeiten (VVT)', hint: 'Entwurf nach Art. 30 DSGVO – interne Dokumentation.', hosted: false, funnel: false },
  // Kenya – the documents themselves are in English.
  { kind: 'company', label: 'Firmenangaben', hint: 'Angaben zum Unternehmen nach Companies Act 2015 und KRA: eingetragener Name, Rechtsform, Registrierungsnummer, KRA-PIN, Anschrift.', hosted: true, funnel: true },
  { kind: 'privacy', label: 'Datenschutzerklärung', hint: 'Nach dem Data Protection Act 2019 – nennt nur die Module, die du nutzt (Formulare, Zahlungen, M-Pesa, KI, Tracking …), mit Übermittlungen ins Ausland.', hosted: true, funnel: true },
  { kind: 'terms', label: 'Allgemeine Geschäftsbedingungen', hint: 'Für den Verkauf von Waren und Dienstleistungen nach dem Consumer Protection Act 2012: Bestellung, M-Pesa, Lieferung, Rücktritt und Erstattung, Gewährleistung, Streitbeilegung.', hosted: true, funnel: true },
  { kind: 'dpa', label: 'Datenverarbeitungsvertrag', hint: 'Entwurf nach Section 42 Data Protection Act 2019 für Kunden, deren Daten du verarbeitest.', hosted: false, funnel: false },
];
const KE_KINDS = ['company', 'privacy', 'terms', 'dpa'];
/** Example values for the Kenyan fields (not translated). */
const PH = { pin: 'P051234567X', county: 'Nairobi City County', box: 'P.O. Box 12345-00100, Nairobi', phone: '+254 7XX XXX XXX', mpesa: 'Paybill 123456' }; // i18n-ignore
const COUNTRY = { ke: 'Kenya', de: 'Deutschland' }; // i18n-ignore – stored country values, the server decides the jurisdiction from them
/** Kenyan legal forms (keys of the server's KE_FORMS). */
const KE_FORMS: [string, string][] = [
  ['sole', 'Einzelunternehmen (Sole proprietorship)'],
  ['partnership', 'Personengesellschaft (Partnership)'],
  ['ltd', 'Private Limited Company (Ltd)'],
  ['plc', 'Public Limited Company (PLC)'],
  ['llp', 'Limited Liability Partnership (LLP)'],
  ['ngo', 'NGO / gemeinnützige Organisation'],
  ['other', 'Sonstige'],
];

function KenyaNotice() {
  const tt = useT('x_integrations');
  return (
    <p className="card legal-note" data-tour="consent-notice">
      <strong>{tt('Keine Rechtsberatung – bitte prüfen. Die Texte für Kenia sind Entwürfe nach kenianischem Recht (Data Protection Act 2019, Consumer Protection Act 2012, Companies Act 2015) und auf Englisch. Lass sie von einem Advocate of the High Court of Kenya prüfen, bevor du sie veröffentlichst oder unterschreibst.')}</strong>
    </p>
  );
}

const BASE = '/api/legal/export';

function DocDialog({ doc, onClose }: { doc: (typeof DOCS)[number]; onClose: () => void }) {
  const tt = useT('x_integrations');
  const [opts, setOpts] = useState<Record<string, string>>({ type: 'digital' });
  const [out, setOut] = useState<any>();
  const [busy, setBusy] = useState(false);
  const [funnel, setFunnel] = useState('');
  const funnels = useLoad(() => (doc.funnel ? api.get<any[]>('/api/funnels').catch(() => []) : Promise.resolve([])), []);
  const loc = encodeURIComponent(currentLocation());
  const set = (k: string, v: string) => setOpts({ ...opts, [k]: v });
  const make = async () => {
    setBusy(true);
    const r = await act(() => api.post('/api/legal/generate', { kind: doc.kind, ...opts }));
    setBusy(false);
    if (r) setOut(r);
  };
  useEffect(() => void make(), []);
  const query = new URLSearchParams({ kind: doc.kind, ...opts }).toString();
  const hostedUrl = `${location.origin}/legal/${currentLocation()}/${doc.kind}`; // the same slugs the server hosts in either jurisdiction
  const srcDoc = out ? `<!doctype html><meta charset="utf-8"><base target="_blank"><style>body{font:15px/1.55 system-ui,sans-serif;margin:16px;color:#111827}h1{font-size:22px}h2{font-size:17px;margin-top:22px}</style>${out.html}` : '';
  return (
    <Modal title={tt(doc.label)} onClose={onClose} wide>
      <div data-tour="legal-doc">
        {KE_KINDS.includes(doc.kind) ? <KenyaNotice /> : <LegalNotice />}
        {doc.kind === 'widerruf' && (
          <Field label={tt('Was verkaufst du?')}>
            <Select value={opts.type} onChange={(v) => set('type', v)} options={[['digital', tt('Digitale Inhalte (Downloads, Kurse, Software)')], ['service', tt('Dienstleistungen')], ['physical', tt('Waren (Versand)')]]} />
          </Field>
        )}
        {(doc.kind === 'avv' || doc.kind === 'dpa') && (
          <div className="grid2" data-tour="legal-avv">
            <Field label={tt('Auftraggeber (dein Kunde) – Name')}><Input value={opts.controller_name ?? ''} onChange={(v) => set('controller_name', v)} /></Field>
            <Field label={tt('Auftraggeber – Anschrift')}><Input value={opts.controller_address ?? ''} onChange={(v) => set('controller_address', v)} /></Field>
            <Field label={tt('Auftraggeber – vertreten durch')}><Input value={opts.controller_representative ?? ''} onChange={(v) => set('controller_representative', v)} /></Field>
            <Field label={tt('Leistung (Kurzbeschreibung)')}><Input value={opts.service ?? ''} onChange={(v) => set('service', v)} placeholder={tt('z. B. Bereitstellung und Betrieb der CRM-Software')} /></Field>
          </div>
        )}
        {(doc.kind === 'widerruf' || doc.kind === 'avv' || doc.kind === 'dpa') && (
          <p>
            <button className="btn secondary" disabled={busy} onClick={make}>{tt('Entwurf aktualisieren')}</button>
          </p>
        )}
        {!out ? (
          <Spinner />
        ) : (
          <>
            {out.missing?.length > 0 && (
              <p className="card" style={{ marginBottom: 8 }} data-tour="legal-missing">
                <strong>{tt('Noch zu ergänzen:')}</strong> {out.missing.join(', ')}{KE_KINDS.includes(doc.kind) ? tt('. Im Text stehen diese Stellen als „[please complete: …]“.') : tt('. Im Text stehen diese Stellen als „[bitte ergänzen: …]“.')}
              </p>
            )}
            {out.external && !out.external.used && out.external.reason !== 'Keine externe Quelle eingerichtet' && <p className="muted small">{out.external.reason}</p>}
            <iframe title={tt(doc.label)} sandbox="" srcDoc={srcDoc} style={{ width: '100%', height: 420, border: '1px solid var(--line)', borderRadius: 8, background: '#fff' }} />
            <p className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }} data-tour="legal-downloads">
              {(['pdf', 'html', 'md', 'txt'] as const).map((f) => (
                <a key={f} className="btn secondary small" href={`${BASE}?${query}&format=${f}&locationId=${loc}`}>
                  {f === 'md' ? tt('Markdown') : f.toUpperCase()}
                </a>
              ))}
              <Copy text={out.markdown} label={tt('Text kopieren')} />
            </p>
            {doc.hosted && (
              <p className="muted small">
                {tt('Gehostete Kopie (für Formulare, Kaufseiten und Checkout):')} <a href={hostedUrl} target="_blank" rel="noopener noreferrer">{hostedUrl}</a> {tt('– sie wird erst veröffentlicht, sobald Firmenname und eine Kontaktmöglichkeit eingetragen sind.')}
              </p>
            )}
            {doc.funnel && (
              <div className="card" data-tour="legal-apply">
                <strong>{tt('In eine Website übernehmen')}</strong>
                <p className="muted small">{tt('Legt die Seite „{label}“ an bzw. ersetzt sie, wenn dort noch der Platzhalter „Hier einfügen“ steht, und verlinkt sie im Footer.', { label: tt(doc.label) })}</p>
                <div className="row" style={{ gap: 8 }}>
                  <Select value={funnel} onChange={setFunnel} placeholder={tt('Funnel / Website wählen …')} options={(funnels.data ?? []).map((f: any) => [f.id, f.name] as [string, string])} />
                  <button
                    className="btn"
                    disabled={!funnel}
                    onClick={async () => {
                      const r = await act(() => api.post(`/api/legal/funnels/${funnel}/apply`, { kinds: [doc.kind] }));
                      if (r) toast(r.pages.length ? tt('Übernommen: {n}', { n: r.pages.map((p: any) => (p.created ? tt('angelegt') : tt('aktualisiert'))).join(', ') }) : tt('Nichts geändert – die Seite hat bereits eigenen Text'));
                    }}
                  >
                    {tt('Übernehmen')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

export function LegalWizard() {
  const tt = useT('x_integrations');
  const { data, reload } = useLoad(() => api.get('/api/legal/profile'), []);
  const services = useLoad(() => api.get('/api/legal/services'), []);
  const [p, setP] = useState<any>();
  const [open, setOpen] = useState<(typeof DOCS)[number] | null>(null);
  useEffect(() => {
    if (data) setP(data.profile);
  }, [data]);
  if (!p) return <Spinner />;
  const set = (patch: any) => setP({ ...p, ...patch });
  const registered = ['ek', 'ug', 'gmbh', 'ag', 'verein'].includes(p.form);
  const save = async () => {
    const r = await act(() => api.put('/api/legal/profile', p), tt('Gespeichert'));
    if (r) (setP(r.profile), void reload(), void services.reload());
  };
  const setOverride = async (id: string, v: string) => {
    const next = { ...p.overrides };
    if (v === '') delete next[id];
    else next[id] = v === 'on';
    const r = await act(() => api.put('/api/legal/profile', { overrides: next }));
    if (r) (setP(r.profile), void services.reload());
  };
  const ready = !!p.company.trim() && (!!p.email.trim() || !!p.street.trim());
  const ke = p.jurisdiction === 'ke';
  /** The saved jurisdiction decides which documents can be generated (the server builds them from the saved data). */
  const docKinds: string[] = (data.docs ?? []).map((d: { kind: string }) => d.kind);
  const docs = docKinds.map((k) => DOCS.find((d) => d.kind === k)).filter((d): d is (typeof DOCS)[number] => !!d);
  const unsavedSwitch = data.profile.jurisdiction !== p.jurisdiction;
  const setJurisdiction = (v: string) => set({ jurisdiction: v, country: v === 'ke' ? COUNTRY.ke : COUNTRY.de });
  return (
    <>
      {ke ? <KenyaNotice /> : <LegalNotice />}
      <div className="card" data-tour="legal-profile">
        <h2>{tt('Firmendaten')}</h2>
        <div className="grid2" data-tour="legal-jurisdiction">
          <Field label={tt('Rechtsordnung der Texte')} hint={tt('Kenia: Texte auf Englisch nach kenianischem Recht. Deutschland: Impressum, DSGVO-Texte und Widerrufsbelehrung auf Deutsch.')}>
            <Select value={p.jurisdiction} onChange={setJurisdiction} options={[['ke', tt('Kenia')], ['de', tt('Deutschland')]]} />
          </Field>
        </div>
        <p className="muted">
          {ke
            ? tt('Daraus entstehen Firmenangaben, Datenschutzerklärung, AGB und Datenverarbeitungsvertrag nach kenianischem Recht (auf Englisch). Felder, die du leer lässt, erscheinen im Text als „[please complete: …]“ – es wird nichts erfunden.')
            : tt('Daraus entstehen Impressum, Datenschutzerklärung, Widerrufsbelehrung und AVV. Felder, die du leer lässt, erscheinen im Text als „[bitte ergänzen: …]“ – es wird nichts erfunden.')}
          {data?.prefilled && tt(' Die Felder wurden aus den Firmendaten des Sub-Accounts vorbelegt.')}
        </p>
        {ke ? (
          <KenyaFields p={p} set={set} />
        ) : (
        <>
        <div className="grid2">
          <Field label={tt('Rechtsform')}><Select value={p.form} onChange={(v) => set({ form: v })} options={(data.forms as { key: string; label: string }[]).map((f) => [f.key, f.label] as [string, string])} /></Field>
          <Field label={tt('Firma / Name')}><Input value={p.company} onChange={(v) => set({ company: v })} /></Field>
          <Field label={registered ? tt('Vertretungsberechtigt (Geschäftsführung / Vorstand)') : tt('Inhaber/in')}><Input value={p.owner} onChange={(v) => set({ owner: v })} /></Field>
          <Field label={tt('Straße und Hausnummer')}><Input value={p.street} onChange={(v) => set({ street: v })} /></Field>
          <Field label={tt('PLZ')}><Input value={p.zip} onChange={(v) => set({ zip: v })} /></Field>
          <Field label={tt('Ort')}><Input value={p.city} onChange={(v) => set({ city: v })} /></Field>
          <Field label={tt('Land')}><Input value={p.country} onChange={(v) => set({ country: v })} /></Field>
          <Field label={tt('E-Mail')}><Input value={p.email} onChange={(v) => set({ email: v })} /></Field>
          <Field label={tt('Telefon')}><Input value={p.phone} onChange={(v) => set({ phone: v })} /></Field>
          <Field label={tt('Website')}><Input value={p.website} onChange={(v) => set({ website: v })} placeholder="https://…" /></Field>
          {registered && <Field label={tt('Registergericht')}><Input value={p.register_court} onChange={(v) => set({ register_court: v })} placeholder={tt('z. B. Amtsgericht München')} /></Field>}
          {registered && <Field label={tt('Registernummer')}><Input value={p.register_no} onChange={(v) => set({ register_no: v })} placeholder={tt('HRB 123456')} /></Field>}
          <Field label={tt('Umsatzsteuer-ID')} hint={tt('Nur eintragen, wenn vorhanden (Kleinunternehmer: leer lassen).')}><Input value={p.vat_id} onChange={(v) => set({ vat_id: v })} placeholder={tt('DE123456789')} /></Field>
          <Field label={tt('Inhaltlich verantwortlich (§ 18 MStV)')} hint={tt('Nur bei redaktionellen Inhalten (Blog, Newsletter mit Inhalten).')}><Input value={p.responsible} onChange={(v) => set({ responsible: v })} /></Field>
          {p.form === 'freiberuf' && <Field label={tt('Berufsbezeichnung und Kammer')}><Input value={p.profession} onChange={(v) => set({ profession: v })} /></Field>}
          {p.form === 'freiberuf' && <Field label={tt('Aufsichtsbehörde')}><Input value={p.authority} onChange={(v) => set({ authority: v })} /></Field>}
        </div>
        <h3>{tt('Datenschutz')}</h3>
        <div className="grid2">
          <Field label={tt('Datenschutzbeauftragte/r (Name)')} hint={tt('Nur wenn benannt.')}><Input value={p.dpo_name} onChange={(v) => set({ dpo_name: v })} /></Field>
          <Field label={tt('Kontakt Datenschutz (E-Mail)')}><Input value={p.dpo_email} onChange={(v) => set({ dpo_email: v })} /></Field>
          <Field label={tt('Hosting / Serverstandort')}><Input value={p.hosting} onChange={(v) => set({ hosting: v })} placeholder={tt('z. B. Hosting-Anbieter, Rechenzentrum in Deutschland')} /></Field>
          <Field label={tt('Zuständige Aufsichtsbehörde')}><Input value={p.supervisory} onChange={(v) => set({ supervisory: v })} placeholder={tt('z. B. Landesbeauftragte/r für Datenschutz …')} /></Field>
        </div>
        <h3>{tt('Verbraucherstreitbeilegung')}</h3>
        <div className="grid2">
          <Field label={tt('Teilnahme')}>
            <Select value={p.dispute} onChange={(v) => set({ dispute: v })} options={[['unwilling', tt('Nicht bereit und nicht verpflichtet')], ['willing', tt('Bereit, an einem Verfahren teilzunehmen')], ['none', tt('Keine Verbraucher-Geschäfte (nicht angeben)')]]} />
          </Field>
          {p.dispute === 'willing' && <Field label={tt('Schlichtungsstelle (Name, Anschrift, Website)')}><Input value={p.dispute_body} onChange={(v) => set({ dispute_body: v })} /></Field>}
        </div>
        </>
        )}
        <p>
          <button className="btn" onClick={save} data-tour="legal-save">{tt('Speichern')}</button>
        </p>
      </div>

      <div className="card" data-tour="legal-services">
        <h2>{tt('Genutzte Dienste')}</h2>
        <p className="muted">
          {tt('Die Datenschutzerklärung nennt nur, was du wirklich nutzt. Erkannt wird aus deinen Einstellungen und Daten; Dienste außerhalb von HyperLevel (z. B. ein Tool in deinem Website-Code, das nicht erkannt wurde) kannst du hier von Hand einschalten – oder Erkanntes abschalten.')}
        </p>
        {!services.data ? (
          <Spinner />
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>{tt('Dienst')}</th><th>{tt('Erkannt')}</th><th>{tt('Im Text')}</th><th>{tt('Überschreiben')}</th></tr></thead>
              <tbody>
                {services.data.services.map((s: any) => (
                  <tr key={s.id}>
                    <td>{s.label}</td>
                    <td>{s.detected ? <Badge tone="green">{tt('ja')}</Badge> : <Badge>{tt('nein')}</Badge>}</td>
                    <td>{s.active ? <Badge tone="blue">{tt('ja')}</Badge> : <Badge>{tt('nein')}</Badge>}</td>
                    <td>
                      <Select value={s.override === null ? '' : s.override ? 'on' : 'off'} onChange={(v) => setOverride(s.id, v)} options={[['', tt('Automatisch')], ['on', tt('Immer nennen')], ['off', tt('Nie nennen')]]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {services.data?.facts?.trackers?.length > 0 && <p className="muted small">{tt('Im Website-Code erkannte Tracker:')} {services.data.facts.trackers.join(', ')}</p>}
        {services.data?.facts?.embeds?.length > 0 && <p className="muted small">{tt('Erkannte Einbettungen:')} {services.data.facts.embeds.join(', ')}</p>}
      </div>

      <div className="card" data-tour="legal-docs">
        <h2>{tt('Dokumente')}</h2>
        {!ready && <Empty>{tt('Trage oben mindestens Firmenname und E-Mail oder Anschrift ein und speichere – dann sind die gehosteten Seiten und die Übernahme in Websites freigeschaltet. Entwürfe kannst du jederzeit ansehen.')}</Empty>}
        {unsavedSwitch && <p className="muted small">{tt('Speichere die Firmendaten, um die Dokumente der gewählten Rechtsordnung zu sehen.')}</p>}
        <div className="grid2">
          {docs.map((d) => (
            <div className="card" key={d.kind} style={{ margin: 0 }}>
              <strong>{tt(d.label)}</strong>
              <p className="muted small">{tt(d.hint)}</p>
              <button className="btn secondary" onClick={() => setOpen(d)} data-tour={`legal-open-${d.kind}`}>{tt('Entwurf ansehen')}</button>
            </div>
          ))}
        </div>
      </div>

      {!ke && (
      <div className="card" data-tour="legal-external">
        <h2>{tt('Externe Textquelle (optional)')}</h2>
        <p className="muted small">{tt('Platzhalter für Dienste wie eRecht24. Solange keine Schnittstelle eingerichtet ist, wird nichts abgerufen und die Vorlagen von HyperLevel werden verwendet.')}</p>
        <Check checked={p.external.enabled} onChange={(v) => set({ external: { ...p.external, enabled: v } })} label={tt('Externe Quelle für Impressum und Datenschutz verwenden, sobald verfügbar')} />
        {p.external.enabled && (
          <div className="grid2">
            <Field label={tt('Anbieter')}><Select value={p.external.provider} onChange={(v) => set({ external: { ...p.external, provider: v } })} options={[['erecht24', 'eRecht24']]} /></Field>
            <Field label={tt('Projekt-ID')}><Input value={p.external.project} onChange={(v) => set({ external: { ...p.external, project: v } })} /></Field>
            <Field label={tt('API-Schlüssel')} hint={tt('Wird verschlüsselt gespeichert und nie wieder angezeigt.')}><Input type="password" value={p.external.apiKey} onChange={(v) => set({ external: { ...p.external, apiKey: v } })} /></Field>
          </div>
        )}
        <p><button className="btn secondary" onClick={save}>{tt('Speichern')}</button></p>
      </div>
      )}
      {open && <DocDialog doc={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/** The company data a Kenyan document needs (Companies Act 2015, Registration of Business Names Act, KRA, ODPC). */
function KenyaFields({ p, set }: { p: any; set: (patch: any) => void }) {
  const tt = useT('x_integrations');
  const owners = p.ke_form === 'sole' || p.ke_form === 'partnership';
  const company = p.ke_form === 'ltd' || p.ke_form === 'plc' || p.ke_form === 'llp';
  return (
    <>
      <div className="grid2" data-tour="legal-kenya">
        <Field label={tt('Rechtsform')}><Select value={p.ke_form} onChange={(v) => set({ ke_form: v })} options={KE_FORMS.map(([k, l]) => [k, tt(l)] as [string, string])} /></Field>
        <Field label={tt('Eingetragener Name')} hint={tt('Genau wie auf der Registrierungsurkunde – bei einer Ltd mit „Limited“ oder „Ltd“ am Ende.')}><Input value={p.company} onChange={(v) => set({ company: v })} /></Field>
        <Field label={tt('Handelsname (falls abweichend)')}><Input value={p.trading_name} onChange={(v) => set({ trading_name: v })} /></Field>
        <Field label={owners ? tt('Inhaber/in bzw. Partner (vollständige Namen)') : tt('Vertreten durch (optional)')} hint={owners ? tt('Pflichtangabe für Business Names (Registration of Business Names Act).') : undefined}><Input value={p.owner} onChange={(v) => set({ owner: v })} /></Field>
        <Field label={company ? tt('Firmennummer (BRS)') : tt('Registrierungsnummer (BRS, falls vorhanden)')} hint={tt('Vom Business Registration Service, z. B. PVT-… oder die Nummer der Business-Name-Registrierung.')}><Input value={p.brs_no} onChange={(v) => set({ brs_no: v })} /></Field>
        <Field label={tt('KRA-PIN')}><Input value={p.kra_pin} onChange={(v) => set({ kra_pin: v })} placeholder={PH.pin} /></Field>
        <Field label={tt('Umsatzsteuer (VAT)')}><Check checked={p.vat_registered} onChange={(v) => set({ vat_registered: v })} label={tt('Für VAT registriert (16 %)')} /></Field>
      </div>
      <h3>{tt('Anschrift und Kontakt')}</h3>
      <div className="grid2">
        <Field label={tt('Gebäude und Etage')}><Input value={p.building} onChange={(v) => set({ building: v })} /></Field>
        <Field label={tt('Straße')}><Input value={p.street} onChange={(v) => set({ street: v })} /></Field>
        <Field label={tt('Ort / Stadt')}><Input value={p.city} onChange={(v) => set({ city: v })} /></Field>
        <Field label={tt('County')}><Input value={p.county} onChange={(v) => set({ county: v })} placeholder={PH.county} /></Field>
        <Field label={tt('Postfach (P.O. Box)')}><Input value={p.po_box} onChange={(v) => set({ po_box: v })} placeholder={PH.box} /></Field>
        <Field label={tt('Telefon')}><Input value={p.phone} onChange={(v) => set({ phone: v })} placeholder={PH.phone} /></Field>
        <Field label={tt('E-Mail')}><Input value={p.email} onChange={(v) => set({ email: v })} /></Field>
        <Field label={tt('Website')}><Input value={p.website} onChange={(v) => set({ website: v })} placeholder="https://…" /></Field>
        <Field label={tt('Single Business Permit (optional)')}><Input value={p.business_permit} onChange={(v) => set({ business_permit: v })} /></Field>
      </div>
      <h3>{tt('Datenschutz')}</h3>
      <div className="grid2">
        <Field label={tt('ODPC-Registrierungsnummer (optional)')} hint={tt('Nummer der Registrierungsurkunde beim Office of the Data Protection Commissioner – erscheint nur in den Texten, wenn eingetragen.')}><Input value={p.odpc_no} onChange={(v) => set({ odpc_no: v })} /></Field>
        <Field label={tt('Datenschutzbeauftragte/r (Name)')} hint={tt('Nur wenn benannt.')}><Input value={p.dpo_name} onChange={(v) => set({ dpo_name: v })} /></Field>
        <Field label={tt('Kontakt Datenschutz (E-Mail)')}><Input value={p.dpo_email} onChange={(v) => set({ dpo_email: v })} /></Field>
        <Field label={tt('Hosting / Serverstandort')} hint={tt('Anbieter und Land der Server – die Datenschutzerklärung nennt es bei den Übermittlungen ins Ausland.')}><Input value={p.hosting} onChange={(v) => set({ hosting: v })} /></Field>
      </div>
      <h3>{tt('Verkauf')}</h3>
      <div className="grid2">
        <Field label={tt('M-Pesa Paybill- oder Till-Nummer (optional)')} hint={tt('Erscheint in den AGB; mit einer Nummer nennt die Datenschutzerklärung auch M-Pesa.')}><Input value={p.mpesa_number} onChange={(v) => set({ mpesa_number: v })} placeholder={PH.mpesa} /></Field>
        <Field label={tt('Streitbeilegung')}><Check checked={p.arbitration} onChange={(v) => set({ arbitration: v })} label={tt('Schiedsverfahren nach dem Arbitration Act 1995 für Geschäftskunden vereinbaren')} /></Field>
      </div>
    </>
  );
}
