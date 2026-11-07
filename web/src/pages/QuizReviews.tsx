import { useState } from 'react';
import { Icon } from '../icons';
import { api, dt } from '../api';
import { Badge, Check, Empty, Field, Input, Modal, Select, Spinner, Textarea, act, confirmAsk, useLoad } from '../ui';
import { Callout, Item, Panel, StatusBadge, lessonOptions, openAuthed } from './CreatorKit';
import { useT } from '../i18n';

/** Aufgaben (assignments with a text and/or file hand-in) and the review queue for short answers and hand-ins. */

const RESULT: [string, string, 'green' | 'yellow' | 'red'][] = [
  ['passed', 'Bestanden', 'green'],
  ['revision', 'Bitte überarbeiten', 'yellow'],
  ['failed', 'Nicht bestanden', 'red'],
];
const KIND: [string, string][] = [
  ['both', 'Text und/oder Datei'],
  ['text', 'Nur Text'],
  ['file', 'Nur Datei'],
];

function AssignmentDialog({ assignment, onClose, onSaved }: { assignment?: any; onClose: () => void; onSaved: () => void }) {
  const tt = useT('x_community');
  const courses = useLoad(() => api.get<any[]>('/api/courses'), []);
  const [courseId, setCourseId] = useState(assignment?.course_id ?? '');
  const course = useLoad(() => (courseId ? api.get(`/api/courses/${courseId}`) : Promise.resolve(null)), [courseId]);
  const [lessonId, setLessonId] = useState(assignment?.lesson_id ?? '');
  const [title, setTitle] = useState(assignment?.title ?? '');
  const [instructions, setInstructions] = useState(assignment?.instructions ?? '');
  const [kind, setKind] = useState(assignment?.kind ?? 'both');
  const [passRequired, setPassRequired] = useState(assignment ? !!assignment.pass_required : true);
  const [gate, setGate] = useState(assignment ? !!assignment.gate : true);
  const problem = !assignment && !lessonId ? tt('Bitte Kurs und Lektion wählen.') : '';
  const save = async () => {
    const body = { title, instructions, kind, pass_required: passRequired, gate, ...(assignment ? {} : { course_id: courseId, lesson_id: lessonId }) };
    if (await act(() => (assignment ? api.put(`/api/assignments/${assignment.id}`, body) : api.post('/api/assignments', body)), tt('Aufgabe gespeichert'))) {
      onSaved();
      onClose();
    }
  };
  return (
    <Modal
      title={assignment ? tt('Aufgabe: {title}', { title: assignment.title }) : tt('Neue Aufgabe')}
      onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={onClose}>
            {tt('Abbrechen')}
          </button>
          <button className="btn" disabled={!!problem} title={problem} onClick={save}>
            {tt('Speichern')}
          </button>
        </>
      }
    >
      {!assignment && (
        <div className="cr-form-row">
          <Field label={tt('Kurs *')}>
            <Select value={courseId} onChange={(v) => (setCourseId(v), setLessonId(''))} options={(courses.data ?? []).map((c) => [c.id, c.title] as [string, string])} placeholder={tt('Kurs wählen …')} />
          </Field>
          <Field label={tt('Lektion *')} hint={tt('Die Aufgabe ersetzt den Inhalt dieser Lektion.')}>
            <Select value={lessonId} onChange={setLessonId} options={lessonOptions(course.data?.modules)} placeholder={courseId ? tt('Lektion wählen …') : tt('Erst Kurs wählen')} />
          </Field>
        </div>
      )}
      <Field label={tt('Titel')}>
        <Input value={title} onChange={setTitle} maxLength={160} placeholder={tt('Praxisaufgabe: Dein Konzept')} />
      </Field>
      <Field label={tt('Anleitung')} hint={tt('Markdown ist erlaubt: **fett**, Listen, Links.')}>
        <Textarea value={instructions} onChange={setInstructions} rows={7} maxLength={10000} />
      </Field>
      <Field label={tt('Abgabe')}>
        <Select value={kind} onChange={setKind} options={KIND.map(([k, l]) => [k, tt(l)] as [string, string])} />
      </Field>
      <Check checked={passRequired} onChange={setPassRequired} label={tt('Die Lektion gilt erst als abgeschlossen, wenn die Abgabe bestanden ist')} />
      <Check checked={gate} onChange={setGate} label={tt('Die nächste Lektion bleibt gesperrt, bis die Aufgabe bestanden ist')} />
    </Modal>
  );
}

/** The result buttons and feedback field for one hand-in. */
function ReviewBox({ s, onDone }: { s: any; onDone: () => void }) {
  const tt = useT('x_community');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const decide = async (status: string) => {
    setBusy(true);
    const r = await act(() => api.post(`/api/assignments/submissions/${s.id}/review`, { status, feedback }), tt('Rückmeldung gesendet'));
    setBusy(false);
    if (r) onDone();
  };
  return (
    <div style={{ marginTop: 10 }} data-tour="review-box">
      <Field label={tt('Rückmeldung an die Person (optional)')}>
        <Textarea value={feedback} onChange={setFeedback} rows={3} maxLength={5000} />
      </Field>
      <div className="actions">
        {RESULT.map(([k, label, tone]) => (
          <button key={k} className={`btn${tone === 'red' ? ' danger' : tone === 'green' ? '' : ' secondary'}`} disabled={busy} onClick={() => decide(k)}>
            {tt(label)}
          </button>
        ))}
      </div>
    </div>
  );
}

function SubmissionsDialog({ assignment, onClose, onChanged }: { assignment: any; onClose: () => void; onChanged: () => void }) {
  const tt = useT('x_community');
  const { data, reload } = useLoad(() => api.get<any[]>(`/api/assignments/${assignment.id}/submissions`), [assignment.id]);
  return (
    <Modal title={tt('Abgaben: {title}', { title: assignment.title })} wide onClose={onClose}>
      {!data ? (
        <Spinner />
      ) : data.length ? (
        <div className="cr-list">
          {data.map((s) => (
            <Item key={s.id} tone={s.status === 'submitted' ? 'warn' : s.status === 'passed' ? 'ok' : undefined} side={<StatusBadge status={s.status === 'passed' ? 'approved' : s.status === 'failed' || s.status === 'revision' ? 'rejected' : 'submitted'} />}>
              <strong>{s.contact.name}</strong> {tt('· Abgabe {attempt_no} · {dt}', { attempt_no: s.attempt_no, dt: dt(s.submitted_at) })}
              {s.text && <p className="cr-pre" style={{ marginTop: 8 }}>{s.text}</p>}
              {s.has_file && (
                <button className="btn small secondary" onClick={() => openAuthed(`/api/assignments/submissions/${s.id}/file`, s.file_name || 'abgabe')}>
                  <Icon name="download" /> {s.file_name || tt('Datei')} herunterladen
                </button>
              )}
              {s.feedback && <div className="cr-sub">{tt('Rückmeldung: {feedback}', { feedback: s.feedback })}</div>}
              {s.status === 'submitted' && (
                <ReviewBox
                  s={s}
                  onDone={() => {
                    reload();
                    onChanged();
                  }}
                />
              )}
            </Item>
          ))}
        </div>
      ) : (
        <Empty>{tt('Noch keine Abgaben.')}</Empty>
      )}
    </Modal>
  );
}

export function AssignmentsTab() {
  const tt = useT('x_community');
  const list = useLoad(() => api.get<any[]>('/api/assignments'), []);
  const [editing, setEditing] = useState<any>(null);
  const [subs, setSubs] = useState<any>(null);
  const remove = async (a: any) => {
    if (!confirmAsk(tt('Die Aufgabe „{title}“ mit allen Abgaben löschen?', { title: a.title }))) return;
    if (await act(() => api.del(`/api/assignments/${a.id}`), tt('Aufgabe gelöscht'))) list.reload();
  };
  return (
    <Panel
      title={tt('Aufgaben')}
      sub={tt('Teilnehmende geben Text oder eine Datei ab; du prüfst und gibst Rückmeldung.')}
      wide
      tour="assignment-list"
      actions={
        <button className="btn" onClick={() => setEditing({})} data-tour="assignment-new">
          {tt('+ Neue Aufgabe')}
        </button>
      }
    >
      {list.loading && !list.data ? (
        <Spinner />
      ) : list.data?.length ? (
        <div className="cr-list">
          {list.data.map((a) => (
            <Item
              key={a.id}
              tone={a.stats.waiting ? 'warn' : undefined}
              onClick={() => setEditing(a)}
              side={
                <>
                  {a.stats.waiting > 0 && <Badge tone="yellow">{tt('{waiting} zu prüfen', { waiting: a.stats.waiting })}</Badge>}
                  <button
                    className="btn small secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSubs(a);
                    }}
                  >
                    {tt('Abgaben ({submissions})', { submissions: a.stats.submissions })}
                  </button>
                  <button
                    className="btn small ghost danger-text"
                    onClick={(e) => {
                      e.stopPropagation();
                      void remove(a);
                    }}
                  >
                    {tt('Löschen')}
                  </button>
                </>
              }
            >
              <strong>{a.title}</strong>
              <div className="cr-sub">
                {a.course_title} › {a.lesson_title} · {tt(KIND.find((k) => k[0] === a.kind)?.[1] ?? '')}
                {a.gate ? tt(' · sperrt die nächste Lektion') : ''}
              </div>
              <div className="cr-sub">
                {tt('{passed} bestanden · {waiting} warten auf Prüfung', { passed: a.stats.passed, waiting: a.stats.waiting })}
              </div>
            </Item>
          ))}
        </div>
      ) : (
        <Empty action={<button className="btn" onClick={() => setEditing({})}>{tt('Erste Aufgabe anlegen')}</button>}>{tt('Noch keine Aufgabe. Lege eine an einer Lektion deines Kurses an.')}</Empty>
      )}
      {editing && <AssignmentDialog assignment={editing.id ? editing : undefined} onClose={() => setEditing(null)} onSaved={list.reload} />}
      {subs && <SubmissionsDialog assignment={subs} onClose={() => setSubs(null)} onChanged={list.reload} />}
    </Panel>
  );
}

// --- the review queue -----------------------------------------------------------------------------------------------------------

function QuizReview({ a, onDone }: { a: any; onDone: () => void }) {
  const tt = useT('x_community');
  const [marks, setMarks] = useState<Record<string, { correct?: boolean; comment: string }>>({});
  const [comment, setComment] = useState('');
  const ready = a.questions.every((q: any) => typeof marks[q.id]?.correct === 'boolean');
  const send = async () => {
    const answers = Object.fromEntries(a.questions.map((q: any) => [q.id, { correct: !!marks[q.id].correct, comment: marks[q.id].comment }]));
    if (await act(() => api.post(`/api/quizzes/attempts/${a.id}/review`, { answers, comment }), tt('Bewertung gespeichert'))) onDone();
  };
  return (
    <Item tone="warn" tour="review-quiz">
      <strong>{a.contact.name}</strong> · {a.quiz_title} <span className="muted">{tt('({course_title}, Versuch {attempt_no}, {dt})', { course_title: a.course_title, attempt_no: a.attempt_no, dt: dt(a.submitted_at) })}</span>
      {a.questions.map((q: any) => (
        <div key={q.id} style={{ marginTop: 12 }}>
          <div className="cr-sub" style={{ fontWeight: 600, color: 'var(--text)' }}>
            {q.text}
          </div>
          <p className="cr-pre" style={{ marginTop: 6 }}>{q.answer || tt('(keine Antwort)')}</p>
          {q.accepted?.length > 0 && <div className="cr-sub">{tt('Erwartet:')} {q.accepted.join(' / ')}</div>}
          {q.explanation && <div className="cr-sub">{tt('Hinweis: {explanation}', { explanation: q.explanation })}</div>}
          <div className="actions" style={{ marginTop: 6 }}>
            <button className={`btn small${marks[q.id]?.correct === true ? '' : ' secondary'}`} aria-pressed={marks[q.id]?.correct === true} onClick={() => setMarks({ ...marks, [q.id]: { ...marks[q.id], comment: marks[q.id]?.comment ?? '', correct: true } })}>
              {tt('✓ Richtig')}
            </button>
            <button className={`btn small${marks[q.id]?.correct === false ? ' danger' : ' secondary'}`} aria-pressed={marks[q.id]?.correct === false} onClick={() => setMarks({ ...marks, [q.id]: { ...marks[q.id], comment: marks[q.id]?.comment ?? '', correct: false } })}>
              {tt('✕ Falsch')}
            </button>
          </div>
        </div>
      ))}
      <Field label={tt('Rückmeldung (optional)')}>
        <Input value={comment} onChange={setComment} maxLength={1000} />
      </Field>
      <button className="btn" disabled={!ready} onClick={send}>
        {tt('Bewertung abschließen')}
      </button>
    </Item>
  );
}

export function ReviewsTab({ data, loading, reload }: { data: any; loading: boolean; reload: () => void }) {
  const tt = useT('x_community');
  if (loading && !data) return <Spinner />;
  const quiz: any[] = data?.quiz_attempts ?? [];
  const subs: any[] = data?.assignment_submissions ?? [];
  return (
    <div className="cr-panels two" data-tour="reviews">
      <Panel title={tt('Kurzantworten im Quiz')} sub={tt('Antworten, die du von Hand bewertest. Das Ergebnis des Quiz steht erst danach fest.')}>
        {quiz.length ? (
          <div className="cr-list">
            {quiz.map((a) => (
              <QuizReview key={a.id} a={a} onDone={reload} />
            ))}
          </div>
        ) : (
          <Empty>{tt('Keine Kurzantwort wartet auf dich.')}</Empty>
        )}
      </Panel>
      <Panel title={tt('Abgaben zu Aufgaben')} sub={tt('Prüfe die Abgabe und gib Rückmeldung.')}>
        {subs.length ? (
          <div className="cr-list">
            {subs.map((s) => (
              <Item key={s.id} tone="warn" tour="review-assignment">
                <strong>{s.contact.name}</strong> · {s.assignment_title} <span className="muted">{tt('({course_title}, Abgabe {attempt_no}, {dt})', { course_title: s.course_title, attempt_no: s.attempt_no, dt: dt(s.submitted_at) })}</span>
                {s.text && <p className="cr-pre" style={{ marginTop: 8 }}>{s.text}</p>}
                {s.file_name && (
                  <button className="btn small secondary" onClick={() => openAuthed(`/api/assignments/submissions/${s.id}/file`, s.file_name)}>
                    <Icon name="download" /> {s.file_name}
                  </button>
                )}
                <ReviewBox s={s} onDone={reload} />
              </Item>
            ))}
          </div>
        ) : (
          <Empty>{tt('Keine Abgabe wartet auf dich.')}</Empty>
        )}
      </Panel>
      {!quiz.length && !subs.length && <Callout tone="info">{tt('Alles geprüft – du bekommst eine Mitteilung, sobald etwas Neues eingeht.')}</Callout>}
    </div>
  );
}
