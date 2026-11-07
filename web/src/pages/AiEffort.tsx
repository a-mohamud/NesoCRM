import { useState } from 'react';
import { api } from '../api';
import { useSession } from '../session';
import { Badge, Select, Spinner, act, useLoad } from '../ui';
import { useT } from '../i18n';

/**
 * Einstellungen → KI-Anbieter → Denkstufe: how hard the models think. One default ("Denkstufe (Standard)",
 * built in: maximal / xhigh) and an optional level per capability; the Werkstatt and its reviews never go below
 * "hoch". A level a model cannot take is lowered to its highest one and says so in the build log.
 */

export function AiEffort({ agency = false }: { agency?: boolean }) {
  const tt = useT('x_ai');
  const session = useSession();
  const admin = session.user.role === 'admin';
  const [scope, setScope] = useState<'location' | 'agency'>(agency ? 'agency' : 'location');
  const data = useLoad(() => api.get('/api/ai-effort'), []);
  if (!data.data) return <Spinner />;
  const d = data.data;
  const own = scope === 'agency' ? d.agency : d.own;
  const save = async (body: Record<string, unknown>) => {
    if (await act(() => api.put('/api/ai-effort', { scope, ...body }), tt('Gespeichert'))) void data.reload();
  };
  const levels: [string, string][] = d.efforts.map((e: any) => [e.id, tt(e.label)]);
  const eff = (id: string) => levels.find(([k]) => k === id)?.[1] ?? id;
  return (
    <div className="card" data-tour="aic-effort">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>{tt('Denkstufe')}</h2>
        {admin && !agency && (
          <div style={{ minWidth: 200 }}>
            <Select value={scope} onChange={(v) => setScope(v as any)} options={[['location', tt('Dieser Sub-Account')], ['agency', tt('Agentur-Standard')]]} />
          </div>
        )}
      </div>
      <p className="muted small">{tt('Wie gründlich die Modelle nachdenken. {note} Kann ein Modell die Stufe nicht, nimmt es seine höchste unterstützte – das steht dann im Protokoll („xhigh → high, vom Modell nicht unterstützt“).', { note: d.note })}</p>
      <div className="row" style={{ alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <label htmlFor="effort-default" style={{ minWidth: 190 }}>
          <strong>{tt('Denkstufe (Standard)')}</strong>
        </label>
        <span id="effort-default">
          <Select value={own.default ?? ''} onChange={(v) => void save({ default: v })} options={[['', tt('Vorgabe: {v}', { v: eff(scope === 'location' && d.agency.default ? d.agency.default : d.builtin_default) })], ...levels]} />
        </span>
      </div>
      <table className="aic-routing">
        <thead>
          <tr>
            <th>{tt('Bereich')}</th>
            <th>{tt('Denkstufe')}</th>
            <th>{tt('Aktuell')}</th>
          </tr>
        </thead>
        <tbody>
          {d.caps.map((c: any) => {
            const value = (scope === 'agency' ? c.agency : c.own) ?? '';
            return (
              <tr key={c.id}>
                <td>
                  {tt(c.label)} {c.strict && <Badge>{tt('mind. hoch')}</Badge>}
                </td>
                <td>
                  <Select value={value} onChange={(v) => void save({ caps: { [c.id]: v } })} options={[['', tt('Wie Standard')], ...levels.filter(([k]) => !c.strict || k === 'high' || k === 'xhigh')]} />
                </td>
                <td className="small">
                  {eff(c.effective)} <span className="muted">· {c.source === 'location' ? tt('Sub-Account') : c.source === 'agency' ? tt('Agentur') : tt('Vorgabe')}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
