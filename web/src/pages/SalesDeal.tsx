import { Suspense, lazy, useEffect, useState } from 'react';
import { api, dt } from '../api';
import { Check, Field, Input, Spinner, Textarea, act, confirmAsk, useLoad } from '../ui';
import { LinesEditor, StatusBadge, eur, fromDraft, sumNet, toDraft, type LineDraft } from './SalesKit';
import { useT } from '../i18n';

/**
 * What the deal drawer gets for sales: positions (products, quantity, discount, tax → the deal's amount), the quotes made from
 * the deal, and the notes of calls and meetings (written by hand or delivered by the call evaluation).
 */

const QuoteEditor = lazy(() => import('./SalesQuotes').then((m) => ({ default: m.QuoteEditor })));

function Positions({ deal, onLock }: { deal: any; onLock: (locked: boolean) => void }) {
  const tt = useT('x_finance');
  const lines = useLoad(() => api.get<any>(`/api/opportunities/${deal.id}/lines`), [deal.id]);
  const products = useLoad(() => api.get<any[]>('/api/products'), []);
  const [rows, setRows] = useState<LineDraft[] | null>(null);
  const data = lines.data;
  useEffect(() => {
    if (!data) return;
    setRows(data.lines.map(toDraft));
    onLock(!!data.locked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  if (!data || !rows) return <Spinner />;
  const cur = deal.currency || 'EUR';
  const save = async () => {
    const r = await act(() => api.put(`/api/opportunities/${deal.id}/lines`, { lines: rows.map((l) => fromDraft(l)) }), rows.length ? tt('Positionen gespeichert – der Dealwert folgt') : tt('Positionen entfernt'));
    if (r) lines.setData(r);
  };
  const t = data.totals;
  return (
    <div className="deal-sales" data-tour="deal-lines">
      <h4>{tt('Positionen')}</h4>
      {rows.length === 0 && <p className="muted small">{tt('Mit Positionen (Produkte, Menge, Rabatt, Steuer) ergibt sich der Dealwert von selbst – als Nettosumme.')}</p>}
      <LinesEditor lines={rows} onChange={setRows} products={products.data ?? []} currency={cur} />
      <div className="lines-total">
        {rows.length > 0 && (
          <>
            {tt('Netto laut Eingabe:')} <b>{eur(sumNet(rows), cur)}</b>
            {data.locked && (
              <div className="muted small">
                {tt('Gespeichert: netto {eur} · USt {eur2} · brutto {eur3} – der Dealwert (', { eur: eur(t.net_cents, cur), eur2: eur(t.tax_cents, cur), eur3: eur(t.total_cents, cur) })}{new Intl.NumberFormat('de-DE').format(data.amount)}{tt(') ist die Nettosumme in ganzen Einheiten.')}
              </div>
            )}
          </>
        )}
      </div>
      <button className="btn" onClick={save} data-tour="deal-lines-save">
        {tt('Positionen speichern')}
      </button>
    </div>
  );
}

function Quotes({ deal }: { deal: any }) {
  const tt = useT('x_finance');
  const list = useLoad(() => api.get<any[]>(`/api/quotes?deal_id=${deal.id}`), [deal.id]);
  const [open, setOpen] = useState<string | null>(null);
  const make = async () => {
    const r = await act(() => api.post('/api/quotes', { deal_id: deal.id }), tt('Angebot angelegt'));
    if (r) (list.reload(), setOpen(r.id));
  };
  return (
    <div className="deal-sales" data-tour="deal-quotes">
      <h4>{tt('Angebote')}</h4>
      {(list.data ?? []).map((x) => (
        <div className="deal-row" key={x.id}>
          <div className="grow">
            <b>{x.number || tt('Entwurf')}</b> {x.title}
            {x.revision > 1 && <span className="muted small"> {tt('· Version {revision}', { revision: x.revision })}</span>}
          </div>
          <StatusBadge status={x.status} label={x.expired && x.status !== 'expired' ? tt('Abgelaufen') : x.status_label} />
          <span>{eur(x.total_cents, x.currency)}</span>
          <button className="btn small secondary" onClick={() => setOpen(x.id)}>
            {tt('Öffnen')}
          </button>
        </div>
      ))}
      <button className="btn secondary" style={{ marginTop: 8 }} onClick={make} data-tour="deal-quote-new">
        {tt('+ Angebot erstellen')}
      </button>
      {open && (
        <Suspense fallback={null}>
          <QuoteEditor id={open} onClose={() => setOpen(null)} onChanged={list.reload} />
        </Suspense>
      )}
    </div>
  );
}

function Notes({ deal }: { deal: any }) {
  const tt = useT('x_finance');
  const list = useLoad(() => api.get<any[]>(`/api/opportunities/${deal.id}/meeting-notes`), [deal.id]);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [items, setItems] = useState('');
  const [tasks, setTasks] = useState(false);
  const save = async () => {
    const r = await act(() => api.post('/api/meeting-notes', { contact_id: deal.contact_id, deal_id: deal.id, title, summary, action_items: items.split('\n').map((x) => x.trim()).filter(Boolean), create_tasks: tasks }), tt('Gesprächsnotiz gespeichert'));
    if (r) (setAdding(false), setTitle(''), setSummary(''), setItems(''), setTasks(false), list.reload());
  };
  return (
    <div className="deal-sales" data-tour="deal-notes">
      <h4>{tt('Gesprächsnotizen')}</h4>
      {(list.data ?? []).map((n) => (
        <div className="deal-row" key={n.id} style={{ alignItems: 'flex-start' }}>
          <div className="grow">
            <b>{n.title}</b> <span className="muted small">{dt(n.occurred_at)}{n.source ? ` · ${n.source}` : ''}</span>
            <div style={{ whiteSpace: 'pre-wrap' }}>{n.summary}</div>
            {n.action_items.length > 0 && <ul className="small">{n.action_items.map((x: string) => <li key={x}>{x}</li>)}</ul>}
          </div>
          <button className="icon-btn" aria-label={tt('Notiz löschen')} onClick={async () => confirmAsk(tt('Gesprächsnotiz löschen?')) && (await act(() => api.del(`/api/meeting-notes/${n.id}`))) && list.reload()}>
            ✕
          </button>
        </div>
      ))}
      {!adding ? (
        <button className="btn secondary" style={{ marginTop: 8 }} onClick={() => setAdding(true)}>
          {tt('+ Gesprächsnotiz')}
        </button>
      ) : (
        <div style={{ marginTop: 8 }}>
          <Field label={tt('Titel')}>
            <Input value={title} onChange={setTitle} placeholder={tt('Erstgespräch')} maxLength={200} />
          </Field>
          <Field label={tt('Zusammenfassung')}>
            <Textarea value={summary} onChange={setSummary} rows={4} />
          </Field>
          <Field label={tt('Folgeschritte (einer pro Zeile)')}>
            <Textarea value={items} onChange={setItems} rows={3} />
          </Field>
          {items.trim() && <Check checked={tasks} onChange={setTasks} label={tt('Als Aufgaben für den Zuständigen anlegen')} />}
          <button className="btn" disabled={!summary.trim()} onClick={save}>
            {tt('Speichern')}
          </button>{' '}
          <button className="btn secondary" onClick={() => setAdding(false)}>
            {tt('Abbrechen')}
          </button>
        </div>
      )}
    </div>
  );
}

export function DealSales({ deal, onLock }: { deal: any; onLock: (locked: boolean) => void }) {
  return (
    <div className="sales-modal">
      <Positions deal={deal} onLock={onLock} />
      <Quotes deal={deal} />
      <Notes deal={deal} />
    </div>
  );
}
