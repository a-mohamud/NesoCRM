import { useState } from 'react';
import { api, d as day, dt } from '../api';
import { Icon } from '../icons';
import { useSession } from '../session';
import { Badge, Empty, Field, Input, Link, MergeHint, Select, Spinner, Textarea, act, confirmAsk, toast, useLoad } from '../ui';
import { startOAuth, useOAuthReturn } from './OAuthConnect';
import { SuggestBar, isAiDraft, type ReplyCfg } from './ReviewReplies';
import { useT } from '../i18n';

/** Google Business Profile: connection (Einstellungen → Bewertungen), replies, posts and the workflow step. */

const CTA: [string, string][] = [
  ['LEARN_MORE', 'Mehr erfahren'],
  ['BOOK', 'Buchen'],
  ['ORDER', 'Bestellen'],
  ['SHOP', 'Kaufen'],
  ['SIGN_UP', 'Registrieren'],
  ['CALL', 'Anrufen'],
];

export function GoogleBusinessSettings() {
  const tt = useT('x_comms');
  const session = useSession();
  const s = useLoad(() => api.get<any>('/api/google-reviews/business'), []);
  const [locs, setLocs] = useState<any[] | null>(null);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  useOAuthReturn(() => void s.reload());
  if (!s.data) return <Spinner />;
  const v = s.data;
  const loadLocations = async () => {
    setBusy(true);
    const r = await act(() => api.get<any[]>('/api/google-reviews/business/locations'));
    setBusy(false);
    if (!r) return;
    setLocs(r);
    setPick(v.location ? `${v.account}|${v.location}` : r.length === 1 ? `${r[0].account}|${r[0].name}` : '');
  };
  const choose = async () => {
    const [account, location] = pick.split('|');
    setBusy(true);
    const r = await act(() => api.put('/api/google-reviews/business', { account, location }));
    setBusy(false);
    if (!r) return;
    s.setData(r);
    setLocs(null);
    if (r.sync?.error) toast(tt('Gespeichert, aber der Abruf klappte nicht: {error}', { error: r.sync.error }));
    else toast(tt('Verbunden: {v} Bewertungen abgerufen', { v: r.sync?.total ?? 0 }));
  };
  return (
    <div className="card" style={{ maxWidth: 720 }} data-tour="google-business">
      <h2>
        <Icon name="place" size={18} /> {tt('Google-Unternehmensprofil')} {v.ready ? <Badge tone="green">verbunden</Badge> : v.connected ? <Badge tone="yellow">{tt('Standort wählen')}</Badge> : null}
      </h2>
      <p className="muted small">
        {tt('Mit dem Google-Konto, das dein Unternehmensprofil verwaltet: alle Bewertungen samt Antworten abrufen, direkt hier antworten (auch ändern und löschen) und Beiträge veröffentlichen – auch per Workflow. Ohne Verbindung nutzt die App den API-Schlüssel unten (Places API).')}
      </p>
      {!v.configured && !v.connected && (
        <p className="muted small">
          {tt('Die Agentur hat noch keine Google-App hinterlegt')}{session.user.role === 'admin' ? (
            <>
              {' '}
              (<Link to="agency/integrations">{tt('Agentur → Integrationen')}</Link>)
            </>
          ) : null}
          .
        </p>
      )}
      {v.configured && !v.connected && (
        <button className="btn" onClick={() => startOAuth('google', 'business', session.locationId)}>
          {tt('Mit Google verbinden')}
        </button>
      )}
      {v.connected && (
        <>
          <p>
            {tt('Konto:')} <strong>{v.connection.account_email || tt('Google-Konto')}</strong>
            {v.location_title && (
              <>
                {' '}
                {tt('· Standort:')} <strong>{v.location_title}</strong> <span className="muted small">{v.location_address}</span>
              </>
            )}
          </p>
          {v.needs_reconnect && <p style={{ color: 'var(--red)' }}>{v.connection.last_error}</p>}
          {locs ? (
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div className="grow">
                <Field label={tt('Standort')}>
                  <Select value={pick} onChange={setPick} placeholder={tt('– wählen –')} options={locs.map((l) => [`${l.account}|${l.name}`, `${l.title}${l.address ? ` – ${l.address}` : ''}${locs.some((x) => x.account !== l.account) ? ` (${l.account_title})` : ''}`])} />
                </Field>
              </div>
              <button className="btn" disabled={!pick || busy} onClick={choose} style={{ marginBottom: 12 }}>
                {tt('Übernehmen')}
              </button>
              <button className="btn ghost" onClick={() => setLocs(null)} style={{ marginBottom: 12 }}>
                {tt('Abbrechen')}
              </button>
            </div>
          ) : null}
          {locs && !locs.length && <p className="muted small">{tt('In diesem Google-Konto ist kein Unternehmensprofil – mit dem Konto verbinden, das das Profil verwaltet.')}</p>}
          <div className="actions">
            {v.needs_reconnect ? (
              <button className="btn" onClick={() => startOAuth('google', 'business', session.locationId)}>
                {tt('Neu verbinden')}
              </button>
            ) : (
              !locs && (
                <button className="btn secondary" disabled={busy} onClick={loadLocations}>
                  {v.location ? tt('Standort ändern') : tt('Standort wählen')}
                </button>
              )
            )}
            <button
              className="btn danger"
              onClick={async () => confirmAsk(tt('Unternehmensprofil trennen? Gespeicherte Bewertungen bleiben, Antworten und Beiträge gehen dann nur noch bei Google.')) && (await act(() => api.del(`/api/oauth/connections/${v.connection.id}`), tt('Getrennt'))) && s.reload()}
            >
              {tt('Trennen')}
            </button>
          </div>
        </>
      )}
      <p className="muted small" style={{ marginBottom: 0 }}>
        {tt('Google muss den Zugriff auf die Business Profile APIs für das Cloud-Projekt der Agentur freischalten (Antrag bei Google, meist einige Tage).')}
      </p>
    </div>
  );
}

/** Reply box under a Google review (Business Profile connected). A KI suggestion lands here as an editable draft – only "Öffentlich antworten" posts. */
export function GoogleReply({ review, onSaved, cfg }: { review: any; onSaved: (r: any) => void; cfg?: ReplyCfg | null }) {
  const tt = useT('x_comms');
  const draft: string = review.reply_draft ?? '';
  const [edit, setEdit] = useState(!review.reply_text && !!draft);
  const [text, setText] = useState<string>(review.reply_text || draft);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const r = await act(() => api.post(`/api/google-reviews/${review.id}/reply`, { comment: text }), tt('Antwort veröffentlicht'));
    setBusy(false);
    if (r) {
      setEdit(false);
      onSaved(r);
    }
  };
  const saveDraft = async () => {
    setBusy(true);
    const r = await act(() => api.put(`/api/google-reviews/${review.id}/reply-draft`, { text }), tt('Entwurf gespeichert'));
    setBusy(false);
    if (r) onSaved(r);
  };
  const cancel = async () => {
    setEdit(false);
    setText(review.reply_text || draft);
  };
  const dropDraft = async () => {
    const r = await act(() => api.del(`/api/google-reviews/${review.id}/reply-draft`));
    if (r) {
      setEdit(false);
      setText(review.reply_text ?? '');
      onSaved(r);
    }
  };
  const remove = async () => {
    if (!confirmAsk(tt('Antwort bei Google löschen?'))) return;
    const r = await act(() => api.del(`/api/google-reviews/${review.id}/reply`), tt('Antwort gelöscht'));
    if (r) {
      setText('');
      onSaved(r);
    }
  };
  if (edit)
    return (
      <div className="g-reply g-draft">
        {!review.reply_text && draft && (
          <div className="muted small" style={{ marginBottom: 4 }}>
            {isAiDraft(review, text) ? <Badge tone="purple">{tt('KI-Entwurf – bitte prüfen')}</Badge> : <Badge>{tt('Entwurf')}</Badge>} {tt('Noch nicht veröffentlicht.')}
          </div>
        )}
        <Textarea value={text} onChange={setText} rows={4} placeholder={tt('Hallo {v}, danke für …', { v: review.author.split(' ')[0] })} autoFocus aria-label={tt('Antwort auf die Bewertung')} />
        <div className="actions" style={{ marginTop: 6 }}>
          <button className="btn small" disabled={busy || !text.trim()} onClick={save}>
            {tt('Öffentlich antworten')}
          </button>
          {!review.reply_text && (
            <button className="btn small secondary" disabled={busy || !text.trim() || text.trim() === draft.trim()} onClick={saveDraft}>
              {tt('Entwurf speichern')}
            </button>
          )}
          <SuggestBar review={review} cfg={cfg} hasText={!!text.trim() && text !== review.reply_text} onText={(t, r) => (setText(t), onSaved(r))} label={text.trim() ? tt('Neuer KI-Vorschlag') : tt('KI-Antwort vorschlagen')} />
          {!review.reply_text && draft && (
            <button className="btn small ghost" onClick={dropDraft}>
              {tt('Entwurf verwerfen')}
            </button>
          )}
          <button className="btn small ghost" onClick={cancel}>
            {tt('Abbrechen')}
          </button>
          <span className="muted small">{tt('{length}/4096 · sichtbar für alle auf Google', { length: text.length })}</span>
        </div>
      </div>
    );
  if (!review.reply_text)
    return (
      <div className="actions" style={{ marginTop: 6 }}>
        <button className="btn small secondary" onClick={() => setEdit(true)}>
          {tt('Antworten')}
        </button>
        <SuggestBar review={review} cfg={cfg} hasText={false} onText={(t, r) => (setText(t), setEdit(true), onSaved(r))} />
      </div>
    );
  return (
    <div className="g-reply">
      <div className="muted small">
        {tt('Deine Antwort')}{review.reply_at ? ` · ${day(review.reply_at)}` : ''}{' '}
        <button className="btn small ghost" onClick={() => setEdit(true)}>
          {tt('Bearbeiten')}
        </button>
        <button className="btn small ghost" onClick={remove}>
          {tt('Löschen')}
        </button>
      </div>
      <p style={{ margin: '2px 0 0', whiteSpace: 'pre-wrap' }}>{review.reply_text}</p>
    </div>
  );
}

/** Posts in the Google Business Profile (on the Bewertungen page). */
export function GooglePostsPanel() {
  const tt = useT('x_comms');
  const posts = useLoad(() => api.get<any[]>('/api/google-reviews/posts'), []);
  const empty = { summary: '', image_url: '', cta_type: '', cta_url: '' };
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const publish = async () => {
    setBusy(true);
    const r = await act(() => api.post('/api/google-reviews/posts', f), tt('Beitrag veröffentlicht'));
    setBusy(false);
    if (r) {
      setF(empty);
      posts.reload();
    }
  };
  return (
    <div className="card">
      <h2>
        <Icon name="send" /> {tt('Google-Beitrag')}
      </h2>
      <Field label={tt('Text')} hint={tt('{length}/1500 Zeichen', { length: f.summary.length })}>
        <Textarea value={f.summary} onChange={(v) => setF({ ...f, summary: v })} rows={4} placeholder={tt('Neu bei uns: …')} />
      </Field>
      <div className="grid3">
        <Field label={tt('Bild-URL (optional)')} hint={tt('öffentlich erreichbar, https://')}>
          <Input value={f.image_url} onChange={(v) => setF({ ...f, image_url: v })} placeholder="https://…/bild.jpg" />
        </Field>
        <Field label={tt('Button')}>
          <Select value={f.cta_type} onChange={(v) => setF({ ...f, cta_type: v })} placeholder={tt('kein Button')} options={CTA} />
        </Field>
        {f.cta_type && f.cta_type !== 'CALL' && (
          <Field label={tt('Button-Link')}>
            <Input value={f.cta_url} onChange={(v) => setF({ ...f, cta_url: v })} placeholder="https://…" />
          </Field>
        )}
      </div>
      <button className="btn" disabled={busy || !f.summary.trim()} onClick={publish}>
        {tt('Jetzt veröffentlichen')}
      </button>
      {posts.data?.length ? (
        <table className="t" style={{ marginTop: 12 }}>
          <tbody>
            {posts.data.map((p) => (
              <tr key={p.id}>
                <td style={{ width: 120 }} className="muted small">
                  {dt(p.created_at)}
                </td>
                <td>
                  {p.summary.length > 140 ? `${p.summary.slice(0, 140)}…` : p.summary}
                  <div className="muted small">
                    {p.source}
                    {p.cta_type ? tt(' · Button: {v}', { v: CTA.find(([k]) => k === p.cta_type)?.[1] ?? p.cta_type }) : ''}
                    {p.image_url ? tt(' · mit Bild') : ''}
                  </div>
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <Badge tone={p.state === 'LIVE' ? 'green' : p.state === 'REJECTED' ? 'red' : 'gray'}>{p.state === 'LIVE' ? 'online' : p.state === 'REJECTED' ? 'abgelehnt' : p.state || 'gesendet'}</Badge>{' '}
                  {p.search_url && (
                    <a className="btn small ghost" href={p.search_url} target="_blank" rel="noopener noreferrer" aria-label={tt('Auf Google ansehen')}>
                      <Icon name="external" size={14} />
                    </a>
                  )}
                  <button className="btn small ghost" onClick={async () => confirmAsk(tt('Beitrag bei Google löschen?')) && (await act(() => api.del(`/api/google-reviews/posts/${p.id}`), tt('Gelöscht'))) && posts.reload()}>
                    {tt('Löschen')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : posts.data ? (
        <Empty>{tt('Noch keine Beiträge von hier. Tipp: Workflow-Aktion „Google-Beitrag erstellen“.')}</Empty>
      ) : null}
    </div>
  );
}

/** Workflow step "Google-Beitrag erstellen". */
export function GooglePostStep({ step, set }: { step: any; set: (patch: any) => void }) {
  const tt = useT('x_comms');
  return (
    <>
      <Field label={tt('Beitragstext')} hint={tt('{length}/1500 Zeichen', { length: (step.body ?? '').length })}>
        <Textarea value={step.body} onChange={(v) => set({ body: v })} rows={6} />
      </Field>
      <Field label={tt('Bild-URL (optional)')} hint={tt('öffentlich erreichbar, https://')}>
        <Input value={step.image_url} onChange={(v) => set({ image_url: v })} placeholder="https://…/bild.jpg" />
      </Field>
      <div className="grid2">
        <Field label={tt('Button')}>
          <Select value={step.cta_type ?? ''} onChange={(v) => set({ cta_type: v })} placeholder={tt('kein Button')} options={CTA} />
        </Field>
        {step.cta_type && step.cta_type !== 'CALL' && (
          <Field label={tt('Button-Link (Platzhalter erlaubt)')}>
            <Input value={step.cta_url} onChange={(v) => set({ cta_url: v })} placeholder="https://…" />
          </Field>
        )}
      </div>
      <p className="muted small">
        {tt('Veröffentlicht sofort im Google-Unternehmensprofil dieses Sub-Accounts (verbinden unter')} <Link to="settings/reviews">{tt('Einstellungen → Bewertungen')}</Link>).
      </p>
      <MergeHint />
    </>
  );
}
