import { useEffect, useState } from 'react';
import { Icon } from '../icons';
import { api, d } from '../api';
import { Badge, Check, Copy, Empty, Field, Input, Modal, Select, Spinner, Textarea, act, confirmAsk, useLoad } from '../ui';
import { Callout, Item, Panel, StatusBadge, openAuthed, openPdfBase64 } from './CreatorKit';
import { useT, tr } from '../i18n';

/** Zertifikate: templates per course (issued at course completion, after a quiz, or by hand), the PDF with a verification page, and the list of issued ones. */

const ISSUE_ON: [string, string][] = [
  ['completion', 'Wenn der Kurs abgeschlossen ist'],
  ['quiz', 'Wenn ein bestimmtes Quiz bestanden ist'],
  ['manual', 'Nur von Hand'],
];
const readDataUrl = (f: File) =>
  {
  const tt = tr('x_community');
  return new Promise<string>((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => no(new Error(tt('Datei konnte nicht gelesen werden')));
    r.readAsDataURL(f);
  });
};

/** An image upload field (logo, signature): the file goes to the media library, the template stores its id. */
function ImageField({ label, value, onChange, hint }: { label: string; value: string; onChange: (id: string) => void; hint?: string }) {
  const tt = useT('x_community');
  const [busy, setBusy] = useState(false);
  const pick = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    const r = await act(async () => api.post('/api/uploads', { name: f.name, data: await readDataUrl(f) }));
    setBusy(false);
    if (r?.id) onChange(r.id);
  };
  return (
    <Field label={label} hint={hint}>
      <div className="cr-line">
        <input type="file" accept="image/png,image/jpeg" onChange={(e) => pick(e.target.files?.[0])} disabled={busy} aria-label={label} />
        {value && (
          <>
            <Badge tone="green">{tt('gewählt ✓')}</Badge>
            <button type="button" className="btn small ghost" onClick={() => onChange('')}>
              {tt('Entfernen')}
            </button>
          </>
        )}
      </div>
    </Field>
  );
}

function TemplateDialog({ template, onClose, onSaved }: { template?: any; onClose: () => void; onSaved: () => void }) {
  const tt = useT('x_community');
  const courses = useLoad(() => api.get<any[]>('/api/courses'), []);
  const quizzes = useLoad(() => api.get<any[]>('/api/quizzes'), []);
  const [t, setT] = useState({
    name: template?.name ?? tt('Teilnahmezertifikat'),
    course_id: template?.course_id ?? '',
    issue_on: template?.issue_on ?? 'completion',
    quiz_id: template?.quiz_id ?? '',
    enabled: template ? !!template.enabled : true,
  });
  const [c, setC] = useState<any>(
    template?.config ?? { title: tt('Zertifikat'), subtitle: tt('Hiermit wird bestätigt, dass'), body: tt('den Kurs „{{course}}“ am {{date}} erfolgreich abgeschlossen hat.'), color: '#1e3a8a', accent: '#b45309', bg: '#ffffff', logo_upload_id: '', signature_upload_id: '', signer_name: '', signer_title: '', issuer: '', footer: '', orientation: 'landscape', show_score: false, number_prefix: 'ZERT', send_email: true },
  );
  const set = (p: any) => setT({ ...t, ...p });
  const cfg = (p: any) => setC({ ...c, ...p });
  const courseQuizzes = (quizzes.data ?? []).filter((q) => !t.course_id || q.course_id === t.course_id);
  const problem = t.issue_on === 'quiz' && !t.quiz_id ? tt('Bitte das Quiz wählen.') : '';
  const body = () => ({ ...t, course_id: t.course_id || null, quiz_id: t.issue_on === 'quiz' ? t.quiz_id : null, config: c });
  const save = async () => {
    if (await act(() => (template ? api.patch(`/api/certificates/templates/${template.id}`, body()) : api.post('/api/certificates/templates', body())), tt('Vorlage gespeichert'))) {
      onSaved();
      onClose();
    }
  };
  const preview = async () => {
    const r = await act(() => api.post('/api/certificates/templates/preview', { config: c, course: courses.data?.find((x) => x.id === t.course_id)?.title }));
    if (r) openPdfBase64(r.pdf_base64);
  };
  return (
    <Modal
      title={template ? tt('Zertifikat: {name}', { name: template.name }) : tt('Neue Zertifikat-Vorlage')}
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={preview} data-tour="cert-preview">
            <Icon name="doc" /> {tt('Vorschau (PDF)')}
          </button>
          <button className="btn" disabled={!!problem} title={problem} onClick={save} data-tour="cert-save">
            {tt('Speichern')}
          </button>
        </>
      }
    >
      <div className="cr-form-row">
        <Field label={tt('Name der Vorlage')}>
          <Input value={t.name} onChange={(v) => set({ name: v })} maxLength={120} />
        </Field>
        <Field label={tt('Für Kurs')} hint={tt('Leer = für jeden Kurs ohne eigene Vorlage.')}>
          <Select value={t.course_id} onChange={(v) => set({ course_id: v, quiz_id: '' })} options={(courses.data ?? []).map((x) => [x.id, x.title] as [string, string])} placeholder={tt('Alle Kurse')} />
        </Field>
      </div>
      <div className="cr-form-row" data-tour="cert-issue-on">
        <Field label={tt('Ausstellen')}>
          <Select value={t.issue_on} onChange={(v) => set({ issue_on: v })} options={ISSUE_ON.map(([k, l]) => [k, tt(l)] as [string, string])} />
        </Field>
        {t.issue_on === 'quiz' && (
          <Field label={tt('Quiz')}>
            <Select value={t.quiz_id} onChange={(v) => set({ quiz_id: v })} options={courseQuizzes.map((q) => [q.id, `${q.title} (${q.course_title})`] as [string, string])} placeholder={tt('Quiz wählen …')} />
          </Field>
        )}
      </div>
      <Check checked={t.enabled} onChange={(v) => set({ enabled: v })} label={tt('Vorlage ist aktiv')} />
      <h4 style={{ margin: '14px 0 8px' }}>{tt('Gestaltung')}</h4>
      <div className="cr-form-row">
        <Field label={tt('Überschrift')}>
          <Input value={c.title} onChange={(v) => cfg({ title: v })} maxLength={80} />
        </Field>
        <Field label={tt('Zeile über dem Namen')}>
          <Input value={c.subtitle} onChange={(v) => cfg({ subtitle: v })} maxLength={120} />
        </Field>
      </div>
      <Field label={tt('Text unter dem Namen')} hint={tt('Platzhalter: {{course}} Kurs, {{name}} Name, {{date}} Datum, {{score}} Ergebnis')}>
        <Textarea value={c.body} onChange={(v) => cfg({ body: v })} rows={3} maxLength={600} />
      </Field>
      <div className="cr-form-row">
        <Field label={tt('Aussteller (Firma)')}>
          <Input value={c.issuer} onChange={(v) => cfg({ issuer: v })} maxLength={120} />
        </Field>
        <Field label={tt('Unterschrift: Name')}>
          <Input value={c.signer_name} onChange={(v) => cfg({ signer_name: v })} maxLength={120} />
        </Field>
        <Field label={tt('Unterschrift: Funktion')}>
          <Input value={c.signer_title} onChange={(v) => cfg({ signer_title: v })} maxLength={120} />
        </Field>
      </div>
      <div className="cr-form-row">
        <Field label={tt('Farbe')}>
          <Input type="color" value={c.color} onChange={(v) => cfg({ color: v })} />
        </Field>
        <Field label={tt('Akzentfarbe')}>
          <Input type="color" value={c.accent} onChange={(v) => cfg({ accent: v })} />
        </Field>
        <Field label={tt('Format')}>
          <Select value={c.orientation} onChange={(v) => cfg({ orientation: v })} options={[['landscape', tt('Querformat')], ['portrait', tt('Hochformat')]]} />
        </Field>
        <Field label={tt('Nummernkreis')}>
          <Input value={c.number_prefix} onChange={(v) => cfg({ number_prefix: v.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase() })} />
        </Field>
      </div>
      <div className="cr-form-row">
        <ImageField label={tt('Logo (PNG oder JPG)')} value={c.logo_upload_id} onChange={(v) => cfg({ logo_upload_id: v })} />
        <ImageField label={tt('Unterschrift als Bild (PNG oder JPG)')} value={c.signature_upload_id} onChange={(v) => cfg({ signature_upload_id: v })} />
      </div>
      <Field label={tt('Fußzeile (optional)')}>
        <Input value={c.footer} onChange={(v) => cfg({ footer: v })} maxLength={200} />
      </Field>
      <Check checked={c.show_score} onChange={(v) => cfg({ show_score: v })} label={tt('Quiz-Ergebnis auf dem Zertifikat nennen')} />
      <Check checked={c.send_email} onChange={(v) => cfg({ send_email: v })} label={tt('Beim Ausstellen per E-Mail mit PDF-Link und Prüfseite senden')} />
    </Modal>
  );
}

function IssueDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const tt = useT('x_community');
  const courses = useLoad(() => api.get<any[]>('/api/courses'), []);
  const templates = useLoad(() => api.get<any[]>('/api/certificates/templates'), []);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<any[]>([]);
  const [pick, setPick] = useState<any>(null);
  const [courseId, setCourseId] = useState('');
  const [templateId, setTemplateId] = useState('');
  useEffect(() => {
    if (q.trim().length < 2) return setFound([]);
    const tm = setTimeout(() => api.get(`/api/contacts?q=${encodeURIComponent(q.trim())}&limit=6`).then((r) => setFound(r.contacts ?? r ?? [])).catch(() => {}), 250);
    return () => clearTimeout(tm);
  }, [q]);
  const issue = async () => {
    const r = await act(() => api.post('/api/certificates/issue', { contact_id: pick.id, course_id: courseId, template_id: templateId || undefined }));
    if (r) {
      onDone();
      onClose();
    }
  };
  return (
    <Modal
      title={tt('Zertifikat ausstellen')}
      onClose={onClose}
      footer={
        <button className="btn" disabled={!pick || !courseId} onClick={issue}>
          {tt('Ausstellen')}
        </button>
      }
    >
      {!pick ? (
        <>
          <Field label={tt('Person suchen *')}>
            <Input value={q} onChange={setQ} placeholder={tt('Name oder E-Mail')} autoFocus />
          </Field>
          <div className="cr-list">
            {found.map((c: any) => (
              <Item key={c.id} onClick={() => setPick(c)}>
                <strong>{[c.first_name, c.last_name].filter(Boolean).join(' ') || c.email}</strong>
                <div className="cr-sub">{c.email}</div>
              </Item>
            ))}
          </div>
        </>
      ) : (
        <Item side={<button className="btn small secondary" onClick={() => setPick(null)}>{tt('Ändern')}</button>}>
          <strong>{[pick.first_name, pick.last_name].filter(Boolean).join(' ') || pick.email}</strong>
          <div className="cr-sub">{pick.email}</div>
        </Item>
      )}
      <Field label={tt('Kurs *')}>
        <Select value={courseId} onChange={setCourseId} options={(courses.data ?? []).map((c) => [c.id, c.title] as [string, string])} placeholder={tt('Kurs wählen …')} />
      </Field>
      <Field label={tt('Vorlage')} hint={tt('Leer = die Vorlage des Kurses.')}>
        <Select value={templateId} onChange={setTemplateId} options={(templates.data ?? []).map((x) => [x.id, x.name] as [string, string])} placeholder={tt('Standard')} />
      </Field>
    </Modal>
  );
}

export function CertificatesTab() {
  const tt = useT('x_community');
  const templates = useLoad(() => api.get<any[]>('/api/certificates/templates'), []);
  const issued = useLoad(() => api.get<any[]>('/api/certificates?limit=200'), []);
  const [editing, setEditing] = useState<any>(null);
  const [issuing, setIssuing] = useState(false);
  const removeTemplate = async (t: any) => {
    if (!confirmAsk(tt('Die Vorlage „{name}“ löschen? Bereits ausgestellte Zertifikate bleiben gültig.', { name: t.name }))) return;
    if (await act(() => api.del(`/api/certificates/templates/${t.id}`), tt('Vorlage gelöscht'))) templates.reload();
  };
  const revoke = async (c: any) => {
    const reason = window.prompt(tt('Zertifikat {number} widerrufen? Die Prüfseite zeigt es dann als ungültig. Grund (optional):', { number: c.number }), '');
    if (reason === null) return;
    if (await act(() => api.post(`/api/certificates/${c.id}/revoke`, { reason }), tt('Zertifikat widerrufen'))) issued.reload();
  };
  const resend = async (c: any) => {
    if (await act(() => api.post(`/api/certificates/${c.id}/resend`), tt('E-Mail gesendet'))) return;
  };
  return (
    <div className="cr-panels two">
      <Panel
        title={tt('Vorlagen')}
        sub={tt('Gestaltung und Zeitpunkt. Ohne Vorlage stellt ein Kurs kein Zertifikat aus.')}
        tour="cert-templates"
        actions={
          <button className="btn" data-tour="cert-new" onClick={() => setEditing({})}>
            {tt('+ Vorlage')}
          </button>
        }
      >
        {templates.loading && !templates.data ? (
          <Spinner />
        ) : templates.data?.length ? (
          <div className="cr-list">
            {templates.data.map((t) => (
              <Item
                key={t.id}
                onClick={() => setEditing(t)}
                side={
                  <>
                    {!t.enabled && <Badge tone="gray">{tt('aus')}</Badge>}
                    <button
                      className="btn small ghost danger-text"
                      onClick={(e) => {
                        e.stopPropagation();
                        void removeTemplate(t);
                      }}
                    >
                      {tt('Löschen')}
                    </button>
                  </>
                }
              >
                <strong>{t.name}</strong>
                <div className="cr-sub">
                  {t.course_title || tt('alle Kurse')} · {tt(ISSUE_ON.find((o) => o[0] === t.issue_on)?.[1] ?? '')} · {tt('{issued} ausgestellt', { issued: t.issued })}
                </div>
              </Item>
            ))}
          </div>
        ) : (
          <Empty action={<button className="btn" onClick={() => setEditing({})}>{tt('Erste Vorlage anlegen')}</button>}>{tt('Noch keine Vorlage – es werden keine Zertifikate ausgestellt.')}</Empty>
        )}
      </Panel>
      <Panel
        title={tt('Ausgestellte Zertifikate')}
        sub={tt('Jedes hat eine Nummer, ein PDF und eine öffentliche Prüfseite.')}
        tour="cert-issued"
        actions={
          <button className="btn secondary" onClick={() => setIssuing(true)}>
            {tt('Von Hand ausstellen')}
          </button>
        }
      >
        {issued.loading && !issued.data ? (
          <Spinner />
        ) : issued.data?.length ? (
          <div className="cr-list">
            {issued.data.map((c) => (
              <Item
                key={c.id}
                tone={c.revoked ? 'bad' : undefined}
                side={
                  <>
                    {c.revoked ? <StatusBadge status="revoked" /> : null}
                    <button className="btn small secondary" onClick={() => openAuthed(`/api/certificates/${c.id}/pdf`)}>
                      PDF
                    </button>
                    <a className="btn small secondary" href={c.url} target="_blank" rel="noreferrer">
                      {tt('Prüfseite')}
                    </a>
                    <Copy text={c.url} label={tt('Link')} />
                    {!c.revoked && (
                      <>
                        <button className="btn small secondary" onClick={() => resend(c)}>
                          {tt('Erneut senden')}
                        </button>
                        <button className="btn small ghost danger-text" onClick={() => revoke(c)}>
                          {tt('Widerrufen')}
                        </button>
                      </>
                    )}
                  </>
                }
              >
                <strong>{c.recipient_name || c.email}</strong> · {c.course_title}
                <div className="cr-sub">
                  {c.number} · {d(c.issued_at)}
                  {c.score_percent !== null && c.score_percent !== undefined ? ` · ${c.score_percent} %` : ''}
                  {c.revoked_reason ? tt(' · widerrufen: {revoked_reason}', { revoked_reason: c.revoked_reason }) : ''}
                </div>
              </Item>
            ))}
          </div>
        ) : (
          <Empty>{tt('Noch kein Zertifikat ausgestellt.')}</Empty>
        )}
      </Panel>
      {!templates.data?.length && !templates.loading && (
        <Callout tone="info">{tt('Tipp: Lege eine Vorlage für einen Kurs an, wähle „Wenn der Kurs abgeschlossen ist“ und sieh dir die Vorschau an. Danach stellt der Kurs Zertifikate von selbst aus.')}</Callout>
      )}
      {editing && <TemplateDialog template={editing.id ? editing : undefined} onClose={() => setEditing(null)} onSaved={templates.reload} />}
      {issuing && <IssueDialog onClose={() => setIssuing(false)} onDone={() => (issued.reload(), templates.reload())} />}
    </div>
  );
}
