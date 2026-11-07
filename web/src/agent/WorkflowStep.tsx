import { api } from '../api';
import { Field, MergeHint, Select, Textarea, useLoad } from '../ui';
import { useT } from '../i18n';

/** Workflow step „KI-Agent ausführen“ (agent_run): agent, task with placeholders, where the answer goes. */
export function AgentStep({ step, set, customFields }: { step: any; set: (p: any) => void; customFields: any[] }) {
  const tt = useT('x_ai');
  const agents = useLoad(() => api.get<any[]>('/api/agents?usable=automation'), []);
  const target = step.target ?? 'log';
  return (
    <>
      <Field label={tt('Agent')} hint={tt('Läuft mit den Rechten der Person, die ihn angelegt hat – nur in diesem Sub-Account.')}>
        <Select value={step.agent_id} onChange={(v) => set({ agent_id: v })} placeholder={tt('wählen…')} options={(agents.data ?? []).map((a) => [a.id, `${a.emoji} ${a.name}`] as [string, string])} />
      </Field>
      <Field label={tt('Auftrag')} hint={tt('Kontakt und Auslöser bekommt der Agent automatisch dazu.')}>
        <Textarea value={step.prompt} onChange={(v) => set({ prompt: v })} rows={5} placeholder={tt('z. B. Recherchiere die Firma von {{contact.first_name}} und lege eine Aufgabe für den Vertrieb an.')} />
      </Field>
      <MergeHint />
      <Field label={tt('Antwort des Agenten')}>
        <Select
          value={target}
          onChange={(v) => set({ target: v })}
          options={[
            ['log', 'Nur im Protokoll des Workflows'],
            ['note', 'Als Notiz am Kontakt'],
            ['field', 'In ein eigenes Feld schreiben'],
          ]}
        />
      </Field>
      {target === 'field' && (
        <Field label={tt('Feld')}>
          <Select value={step.field} onChange={(v) => set({ field: v })} placeholder={tt('wählen…')} options={customFields.map((f: any) => [`custom.${f.key}`, f.label] as [string, string])} />
        </Field>
      )}
      <p className="muted small">{tt('Aktionen, die eine Bestätigung brauchen (z. B. Nachrichten senden im Modus „Vor Änderungen fragen“), führt der Agent hier nicht aus – sie landen unter KI-Agenten → Freigaben. Kosten zählen aufs Monatslimit.')}</p>
    </>
  );
}
