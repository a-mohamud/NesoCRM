import { useState } from 'react';
import { api, d } from '../api';
import { Badge, Check, Field, Modal, Select, Spinner, Textarea, act } from '../ui';
import { Sub, fileHref } from './CommunityParts';
import { readCsvFile } from '../csv-file';
import { useT } from '../i18n';

/**
 * Community → Mitglieder → Importieren / Exportieren: move members in from a CSV list (also Skool's export) with a dry run first,
 * move posts in as Markdown files, and take members and posts out again. Server side: modules/community-import.ts.
 */

const FIELD_LABEL: Record<string, string> = { email: 'E-Mail', name: 'Name', first_name: 'Vorname', last_name: 'Nachname', joined: 'Mitglied seit', tier: 'Stufe', points: 'Punkte', tags: 'Tags', phone: 'Telefon' };
const STATE: Record<string, [string, 'green' | 'blue' | 'red' | 'gray']> = { new: ['Neu', 'green'], contact_exists: ['Kontakt bekannt', 'blue'], member_exists: ['Schon dabei', 'gray'], invalid: ['Ungültig', 'red'], duplicate: ['Doppelt', 'gray'] };

export function ImportModal({ group, onClose, onDone }: { group: any; onClose: () => void; onDone: () => void }) {
  const tt = useT('x_community');
  const [tab, setTab] = useState('members');
  return (
    <Modal title={tt('Importieren und Exportieren')} onClose={onClose} wide>
      <div className="cma" data-tour="community-import">
        <Sub
          value={tab}
          onChange={setTab}
          tabs={[
            ['members', tt('Mitglieder importieren')],
            ['posts', tt('Beiträge importieren')],
            ['export', tt('Exportieren')],
            ['skool', tt('Umzug von Skool')],
          ]}
        />
        {tab === 'members' && <Members group={group} onDone={onDone} />}
        {tab === 'posts' && <Posts group={group} onDone={onDone} />}
        {tab === 'export' && <Export group={group} />}
        {tab === 'skool' && <SkoolGuide onStart={() => setTab('members')} />}
      </div>
    </Modal>
  );
}

function Members({ group, onDone }: { group: any; onDone: () => void }) {
  const tt = useT('x_community');
  const [csv, setCsv] = useState('');
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [tierMap, setTierMap] = useState<Record<string, string>>({});
  const [dateOrder, setDateOrder] = useState('auto');
  const [opt, setOpt] = useState({ send_mail: false, trigger_workflows: false, import_points: true, grant_tier_access: true, confirm_rights: false });
  const [plan, setPlan] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const body = () => ({ csv, mapping: Object.fromEntries(Object.entries(mapping).filter(([, v]) => v)), tier_map: Object.fromEntries(Object.entries(tierMap).filter(([, v]) => v)), date_order: dateOrder });
  const check = async () => {
    setBusy(true);
    const p = await act(() => api.post<any>(`/api/community/groups/${group.id}/import/members/preview`, body()));
    setBusy(false);
    if (p) setPlan(p);
  };
  const go = async () => {
    setBusy(true);
    const r = await act(() => api.post<any>(`/api/community/groups/${group.id}/import/members`, { ...body(), ...opt }));
    setBusy(false);
    if (r) {
      setResult(r);
      onDone();
    }
  };
  if (result)
    return (
      <div className="cma-note info" role="status">
        <strong>{tt('Fertig.')}</strong> {tt('{created} neu angelegt, {updated} bekannte Kontakte aufgenommen, {skipped} übersprungen', { created: result.created, updated: result.updated, skipped: result.skipped })}
        {result.points ? tt(', {points} Startpunkte vergeben', { points: result.points }) : ''}
        {result.mails ? tt(', {mails} E-Mails gesendet', { mails: result.mails }) : ''}{tt('. Die Personen können sich ab sofort mit ihrer E-Mail-Adresse anmelden.')}
      </div>
    );
  const onFile = async (el: HTMLInputElement) => {
    const f = el.files?.[0];
    if (f) (setCsv(await readCsvFile(f)), setPlan(null));
  };
  const headers: string[] = plan?.header ?? [];
  return (
    <>
      <div className="cma-drop">
        <p style={{ marginTop: 0 }}>
          <strong>{tt('CSV-Datei mit deinen Mitgliedern')}</strong>
          <br />
          <span className="muted small">{tt('Spalten wie Name oder Vorname/Nachname, E-Mail, Mitglied seit, Stufe – die Namen erkennen wir selbst (auch englische, auch Skool-Export).')}</span>
        </p>
        <input type="file" accept=".csv,text/csv,text/plain" onChange={(e) => onFile(e.target)} aria-label={tt('CSV-Datei wählen')} />
      </div>
      <Field label={tt('… oder hier einfügen')}>
        <Textarea rows={4} value={csv} onChange={(v) => (setCsv(v), setPlan(null))} placeholder={tt('Name,Email,Joined\nAnna Muster,anna@example.de,2023-03-14')} />
      </Field>
      <div className="cma-actions" style={{ marginTop: 0 }}>
        <button className="btn" disabled={!csv.trim() || busy} onClick={check}>
          {busy ? tt('Prüfe …') : tt('Prüfen (nichts wird gespeichert)')}
        </button>
        {plan && (
          <div style={{ width: 230 }}>
            <Select value={dateOrder} onChange={(v) => (setDateOrder(v), setPlan(null))} options={[['auto', tt('Datum: automatisch erkennen')], ['dmy', tt('Datum: Tag/Monat/Jahr')], ['mdy', tt('Datum: Monat/Tag/Jahr')]]} />
          </div>
        )}
      </div>
      {plan && (
        <>
          {plan.warnings.map((w: string) => (
            <div key={w} className="cma-note">
              {w}
            </div>
          ))}
          <div className="cma-chips">
            <Badge tone="green">{plan.counts.new} neu</Badge>
            <Badge tone="blue">{tt('{contact_exists} Kontakte bekannt', { contact_exists: plan.counts.contact_exists })}</Badge>
            <Badge>{tt('{member_exists} schon dabei', { member_exists: plan.counts.member_exists })}</Badge>
            <Badge tone={plan.counts.invalid ? 'red' : 'gray'}>{tt('{invalid} ungültig', { invalid: plan.counts.invalid })}</Badge>
            <Badge>{plan.counts.duplicate} doppelt</Badge>
          </div>
          <h4 style={{ margin: '4px 0 0' }}>{tt('Zuordnung der Spalten')}</h4>
          <div className="cma-two">
            {['email', 'name', 'first_name', 'last_name', 'joined', 'tier', 'points'].map((f) => (
              <Field key={f} label={tt(FIELD_LABEL[f] ?? f)}>
                <Select
                  value={mapping[f] ?? plan.columns[f] ?? ''}
                  onChange={(v) => {
                    setMapping({ ...mapping, [f]: v });
                    setPlan(null);
                  }}
                  placeholder={tt('nicht vorhanden')}
                  options={headers.map((h) => [h, h])}
                />
              </Field>
            ))}
          </div>
          {plan.unmatched_tiers.length > 0 && plan.tiers.length > 0 && (
            <>
              <h4 style={{ margin: '4px 0 0' }}>{tt('Stufen zuordnen')}</h4>
              <p className="muted small" style={{ margin: 0 }}>
                {tt('Diese Namen aus der Datei gibt es bei dir nicht als Stufe. Wähle, in welche Stufe sie kommen – sonst landen sie in der ersten kostenlosen Stufe.')}
              </p>
              <div className="cma-two">
                {plan.unmatched_tiers.map((n: string) => (
                  <Field key={n} label={`„${n}“ →`}>
                    <Select value={tierMap[n] ?? ''} onChange={(v) => (setTierMap({ ...tierMap, [n]: v }), setPlan(null))} placeholder={tt('Standard-Stufe')} options={plan.tiers.map((t: any) => [t.id, t.name])} />
                  </Field>
                ))}
              </div>
            </>
          )}
          <div className="table-wrap" style={{ maxHeight: 280, overflow: 'auto' }}>
            <table className="t cma-table">
              <thead>
                <tr>
                  <th>{tt('Zeile')}</th>
                  <th>{tt('Name')}</th>
                  <th>{tt('E-Mail')}</th>
                  <th>{tt('Seit')}</th>
                  <th>{tt('Stufe')}</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {plan.items.slice(0, 60).map((i: any) => (
                  <tr key={i.line}>
                    <td>{i.line}</td>
                    <td>{i.name || '–'}</td>
                    <td>{i.email}</td>
                    <td>{i.joined_at ? d(i.joined_at) : '–'}</td>
                    <td>{plan.tiers.find((t: any) => t.id === i.tier_id)?.name ?? '–'}</td>
                    <td>
                      <Badge tone={STATE[i.state][1]}>{tt(STATE[i.state][0])}</Badge>
                      {i.reason && <div className="muted small">{i.reason}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {plan.truncated || plan.items.length > 60 ? <p className="muted small">{tt('Gezeigt werden die ersten 60 von {total} Zeilen – Probleme stehen zuerst.', { total: plan.counts.total })}</p> : null}
          <h4 style={{ margin: '4px 0 0' }}>{tt('Optionen')}</h4>
          <Check checked={opt.import_points} onChange={(v) => setOpt({ ...opt, import_points: v })} label={tt('Punkte aus der Datei als Startguthaben übernehmen')} />
          <Check checked={opt.grant_tier_access} onChange={(v) => setOpt({ ...opt, grant_tier_access: v })} label={tt('Kurse der Stufe freischalten')} />
          <Check checked={opt.send_mail} onChange={(v) => setOpt({ ...opt, send_mail: v })} label={tt('Jedem eine E-Mail mit dem Link zur Community senden')} />
          <Check checked={opt.trigger_workflows} onChange={(v) => setOpt({ ...opt, trigger_workflows: v })} label={tt('Workflows für neue Kontakte starten (sonst bleibt der Import still)')} />
          <Check checked={opt.confirm_rights} onChange={(v) => setOpt({ ...opt, confirm_rights: v })} label={tt('Ich darf diese Personen kontaktieren und speichern (z. B. weil sie meiner Community selbst beigetreten sind).')} />
          <div className="cma-actions">
            <button className="btn" disabled={!opt.confirm_rights || busy || (plan.counts.new + plan.counts.contact_exists === 0)} onClick={go}>
              {busy ? tt('Importiere …') : tt('{v} Personen importieren', { v: plan.counts.new + plan.counts.contact_exists })}
            </button>
          </div>
        </>
      )}
      {busy && !plan && <Spinner />}
    </>
  );
}

function Posts({ group, onDone }: { group: any; onDone: () => void }) {
  const tt = useT('x_community');
  const [files, setFiles] = useState<{ name: string; content: string }[]>([]);
  const [channel, setChannel] = useState('');
  const [keep, setKeep] = useState(true);
  const [plan, setPlan] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const body = () => ({ files, channel_id: channel || undefined, keep_dates: keep });
  const onFiles = async (el: HTMLInputElement) => {
    const list = Array.from(el.files ?? []).slice(0, 500);
    setFiles(await Promise.all(list.map(async (f) => ({ name: f.name, content: await f.text() }))));
    setPlan(null);
  };
  if (result) return <div className="cma-note info">{tt('Fertig: {created} Beiträge übernommen, {skipped} übersprungen (doppelt oder mit Problem).', { created: result.created, skipped: result.skipped })}</div>;
  return (
    <>
      <p className="muted" style={{ margin: 0 }}>
        {tt('Jede Markdown-Datei (.md) wird ein Beitrag. Titel und Datum stehen oben zwischen zwei')} <code>---</code>{tt('-Zeilen:')} <code>title</code>, <code>date</code> (2024-05-01), <code>author</code> {tt('(E-Mail eines Mitglieds),')} <code>channel</code>, <code>pinned</code>{tt('. Ohne Titel gilt die erste Überschrift. Beiträge erscheinen mit dem alten Datum, ohne Benachrichtigung und ohne Punkte.')}
      </p>
      <div className="cma-drop">
        <input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" multiple onChange={(e) => onFiles(e.target)} aria-label={tt('Markdown-Dateien wählen')} />
        <p className="muted small" style={{ marginBottom: 0 }}>
          {files.length ? tt('{length} Dateien gewählt', { length: files.length }) : tt('Bis zu 500 Dateien, je höchstens 120 KB')}
        </p>
      </div>
      <div className="cma-two">
        <Field label={tt('Standard-Kanal')}>
          <Select value={channel} onChange={(v) => (setChannel(v), setPlan(null))} placeholder={tt('Erster freier Kanal')} options={(group.channels ?? []).map((c: any) => [c.id, c.name])} />
        </Field>
        <Check checked={keep} onChange={(v) => (setKeep(v), setPlan(null))} label={tt('Datum aus der Datei übernehmen')} />
      </div>
      <div className="cma-actions" style={{ marginTop: 0 }}>
        <button className="btn" disabled={!files.length} onClick={async () => setPlan(await act(() => api.post<any>(`/api/community/groups/${group.id}/import/posts/preview`, body())))}>
          {tt('Prüfen (nichts wird gespeichert)')}
        </button>
      </div>
      {plan && (
        <>
          <div className="table-wrap" style={{ maxHeight: 280, overflow: 'auto' }}>
            <table className="t cma-table">
              <thead>
                <tr>
                  <th>{tt('Datei')}</th>
                  <th>{tt('Titel')}</th>
                  <th>{tt('Kanal')}</th>
                  <th>{tt('Datum')}</th>
                  <th>{tt('Hinweis')}</th>
                </tr>
              </thead>
              <tbody>
                {plan.items.map((i: any) => (
                  <tr key={i.file}>
                    <td>{i.file}</td>
                    <td>{i.title || '–'}</td>
                    <td>{i.channel_name}</td>
                    <td>{d(i.created_at)}</td>
                    <td>{i.problem ? <Badge tone="red">{i.problem}</Badge> : i.warnings.map((w: string) => <div key={w} className="muted small">{w}</div>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="cma-actions">
            <button
              className="btn"
              disabled={!plan.ok}
              onClick={async () => {
                const r = await act(() => api.post<any>(`/api/community/groups/${group.id}/import/posts`, body()));
                if (r) (setResult(r), onDone());
              }}
            >
              {tt('{ok} Beiträge übernehmen', { ok: plan.ok })}
            </button>
          </div>
        </>
      )}
    </>
  );
}

function Export({ group }: { group: any }) {
  const tt = useT('x_community');
  return (
    <div className="cma-grid">
      <section className="cma-sec">
        <h3>{tt('Mitglieder')}</h3>
        <p className="lead">{tt('CSV mit Vorname, Nachname, E-Mail, Beitrittsdatum, Stufe, Level, Punkten und Status – zum Sichern oder für einen Umzug.')}</p>
        <a className="btn" href={fileHref(`/api/community/groups/${group.id}/export/members.csv`)}>
          {tt('Mitglieder als CSV laden')}
        </a>
      </section>
      <section className="cma-sec">
        <h3>{tt('Beiträge')}</h3>
        <p className="lead">{tt('JSON mit allen Beiträgen samt Kommentaren, Autor, Kanal und Datum.')}</p>
        <a className="btn" href={fileHref(`/api/community/groups/${group.id}/export/posts.json`)}>
          {tt('Beiträge als JSON laden')}
        </a>
      </section>
    </div>
  );
}

function SkoolGuide({ onStart }: { onStart: () => void }) {
  const tt = useT('x_community');
  return (
    <div className="prose">
      <p style={{ marginTop: 0 }}>
        {tt('Skool hat keine öffentliche Schnittstelle (API). Der einzige Weg ist die Export-Funktion von Skool für die Mitgliederliste – so geht der Umzug:')}
      </p>
      <ol>
        <li>
          {tt('In Skool als Gruppen-Admin:')} <strong>{tt('Einstellungen → Mitglieder')}</strong> {tt('(Admin-Bereich) und dort die Mitgliederliste als')} <strong>{tt('CSV exportieren')}</strong>{tt('. Skool schickt dir die Datei per E-Mail oder lädt sie herunter.')}
        </li>
        <li>
          {tt('Hier unter')} <strong>{tt('Mitglieder importieren')}</strong> {tt('die Datei wählen. Namen, E-Mail-Adressen und das Beitrittsdatum werden erkannt; mit')} <strong>{tt('Prüfen')}</strong> {tt('siehst du vorher genau, was passiert.')}
        </li>
        <li>{tt('Ordne die Skool-Stufen deinen Stufen zu und entscheide, ob die Mitglieder eine E-Mail mit dem Link bekommen.')}</li>
        <li>
          {tt('Beiträge, die du behalten willst, kopierst du als Markdown-Dateien (eine pro Beitrag, mit')} <code>title</code> {tt('und')} <code>date</code> {tt('oben) und importierst sie unter')} <strong>{tt('Beiträge importieren')}</strong>.
        </li>
        <li>{tt('Zahlende Mitglieder legen ihr Abo bei dir neu an – dafür schickst du ihnen den Einladungs-Link der Beitrittsseite. Zahlungsdaten lassen sich nicht aus Skool mitnehmen.')}</li>
      </ol>
      <p className="muted small">{tt('Die genaue Beschriftung in Skool ändert sich gelegentlich – die Schritte stehen mit Screenshots-Tipps auch in docs/community.md.')}</p>
      <button className="btn" onClick={onStart}>
        {tt('Zum Import')}
      </button>
    </div>
  );
}
