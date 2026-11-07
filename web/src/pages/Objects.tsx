import { useEffect, useMemo, useState } from 'react';
import { Icon, OBJECT_ICONS } from '../icons';
import { api, d, dt } from '../api';
import { Badge, Check, Empty, Field, Input, Link, Modal, PageHead, Select, Spinner, Tabs, Textarea, act, confirmAsk, navigate, pressable, toast, useLoad } from '../ui';
import {
  AssociationsPanel,
  ColumnsModal,
  CsvImportModal,
  FilterRows,
  Notes,
  Pager,
  PropInput,
  PropValue,
  PropertyCard,
  RecordTable,
  TYPE_LABELS,
  Timeline,
  ViewsBar,
  cleanFilters,
  objIcon,
  refreshAssocTypes,
  useUsers,
  type FieldDef,
  type Filter,
  type ViewConfig,
} from './ObjectKit';
import { COMPANY_STANDARD, trFields } from './Companies';
import { MoreFields, useSimple } from '../areas/fields';
import { recordColumns, splitFields } from '../areas/easy-core';
import '../areas/easy-core.css';
import { SortableGrid } from '../sortable/Sortable';
import { useT } from '../i18n';

/** Eigene Objekte: overview + builder, record lists, record pages, sidebar entries, workflow parts. */

const refreshNav = () => window.dispatchEvent(new Event('pghl:objects'));

let objectsCache: { loc: string; p: Promise<any[]> } | null = null;
/** Object types with their properties (shared by the sidebar, lists and workflow steps). */
export function useObjectTypes(): { types: any[]; reload: () => void } {
  const [types, setTypes] = useState<any[]>([]);
  const load = (force = false) => {
    const loc = localStorage.getItem('pghl.location') ?? '';
    if (force || !objectsCache || objectsCache.loc !== loc) objectsCache = { loc, p: api.get<any[]>('/api/objects').catch(() => []) };
    void objectsCache.p.then(setTypes);
  };
  useEffect(() => {
    load();
    const on = () => load(true);
    window.addEventListener('pghl:objects', on);
    return () => window.removeEventListener('pghl:objects', on);
  }, []);
  return { types, reload: () => (refreshNav(), load(true)) };
}

/** Sidebar: the custom objects below "Objekte". */
export function ObjectNav({ cur }: { cur: string[] }) {
  const { types } = useObjectTypes();
  if (!types.length) return null;
  return (
    <div className="nav-sub">
      {types.map((t) => (
        <Link key={t.key} to={`objects/${t.key}`} className={cur[0] === 'objects' && cur[1] === t.key ? 'on' : ''}>
          <Icon name={objIcon(t.icon)} size={15} /> {t.plural}
        </Link>
      ))}
    </div>
  );
}

const typeFields = (t: any): FieldDef[] => (t?.properties ?? []).map((p: any) => ({ ...p }));
const SYSTEM: FieldDef[] = [
  { key: 'owner_id', label: 'Zuständig', type: 'user' },
  { key: 'created_at', label: 'Angelegt', type: 'datetime' },
  { key: 'updated_at', label: 'Geändert', type: 'datetime' },
];

// --- builder ----------------------------------------------------------------------------------

interface NewProp {
  label: string;
  type: string;
  options: string;
  required: boolean;
  unique: boolean;
}
const blankProp = (): NewProp => ({ label: '', type: 'text', options: '', required: false, unique: false });

function PropRowEditor({ p, onChange, onRemove }: { p: NewProp; onChange: (p: NewProp) => void; onRemove?: () => void }) {
  const tt = useT('x_integrations');
  return (
    <div className="prop-row-edit">
      <Input value={p.label} onChange={(v) => onChange({ ...p, label: v })} placeholder={tt('Bezeichnung, z. B. Kennzeichen')} />
      <Select value={p.type} onChange={(v) => onChange({ ...p, type: v })} options={Object.entries(TYPE_LABELS).map(([k, l]) => [k, tt(l)] as [string, string])} />
      {(p.type === 'select' || p.type === 'multiselect') && <Input value={p.options} onChange={(v) => onChange({ ...p, options: v })} placeholder={tt('Optionen, mit Komma')} />}
      <Check checked={p.required} onChange={(v) => onChange({ ...p, required: v })} label={tt('Pflicht')} />
      {!['checkbox', 'multiselect', 'textarea', 'file'].includes(p.type) && <Check checked={p.unique} onChange={(v) => onChange({ ...p, unique: v })} label={tt('Eindeutig')} />}
      {onRemove && (
        <button type="button" className="icon-btn" onClick={onRemove} aria-label={tt('Eigenschaft entfernen')}>
          ✕
        </button>
      )}
    </div>
  );
}

const toApi = (p: NewProp) => ({ label: p.label, type: p.type, options: p.options.split(',').map((o) => o.trim()).filter(Boolean), required: p.required, unique: p.unique });

export function ObjectBuilder({ type, onClose, onSaved }: { type?: any; onClose: () => void; onSaved: (t: any) => void }) {
  const tt = useT('x_integrations');
  const [f, setF] = useState<any>(type ? { singular: type.singular, plural: type.plural, icon: type.icon, description: type.description, primary_property: type.primary_property } : { singular: '', plural: '', icon: 'layers', description: '', primary_label: 'Name', primary_unique: false });
  const [props, setProps] = useState<NewProp[]>(type ? [] : [blankProp()]);
  const [extra, setExtra] = useState<NewProp>(blankProp());
  const [cur, setCur] = useState<any>(type);
  const save = async () => {
    if (!type) {
      const r = await act(() => api.post('/api/object-types', { ...f, properties: props.filter((p) => p.label.trim()).map(toApi) }));
      if (!r) return;
      if (r.errors?.length) toast(tt('Angelegt – nicht übernommen: {n}', { n: r.errors.join('; ') }));
      else toast(tt('{plural} angelegt', { plural: r.plural }));
      refreshAssocTypes();
      onSaved(r);
      return;
    }
    const r = await act(() => api.patch(`/api/object-types/${type.id}`, f), tt('Gespeichert'));
    if (r) (refreshAssocTypes(), onSaved(r));
  };
  const addExtra = async () => {
    const r = await act(() => api.post('/api/properties', { object: type.key, ...toApi(extra) }), tt('Eigenschaft angelegt'));
    if (r) {
      setExtra(blankProp());
      setCur({ ...cur, properties: [...cur.properties, r] });
      refreshNav();
    }
  };
  const eligible = (cur?.properties ?? []).filter((p: any) => ['text', 'email', 'phone', 'url', 'number', 'date'].includes(p.type));
  return (
    <Modal
      title={type ? tt('{plural} bearbeiten', { plural: type.plural }) : tt('Neues Objekt')}
      onClose={onClose}
      wide
      footer={
        <>
          {type && (
            <button
              className="btn danger"
              onClick={async () => {
                if (!confirmAsk(tt('Objekt „{plural}“ mit allen {records} Datensätzen löschen?', { plural: type.plural, records: type.records }))) return;
                if (await act(() => api.del(`/api/object-types/${type.id}?force=1`), tt('Gelöscht'))) (refreshAssocTypes(), onSaved(null));
              }}
            >
              {tt('Löschen')}
            </button>
          )}
          <button className="btn" disabled={!f.singular?.trim()} onClick={save}>
            {type ? tt('Speichern') : tt('Objekt anlegen')}
          </button>
        </>
      }
    >
      <div className="builder-grid" data-tour="obj-builder">
        <div>
          <div className="grid2">
            <Field label={tt('Name (Einzahl) *')} tour="obj-singular">
              <Input value={f.singular} onChange={(v) => setF({ ...f, singular: v })} placeholder={tt('Fahrzeug')} autoFocus />
            </Field>
            <Field label={tt('Name (Mehrzahl)')}>
              <Input value={f.plural} onChange={(v) => setF({ ...f, plural: v })} placeholder={tt('Fahrzeuge')} />
            </Field>
          </div>
          <Field label={tt('Beschreibung')}>
            <Textarea value={f.description} onChange={(v) => setF({ ...f, description: v })} rows={2} placeholder={tt('Wofür ist das Objekt da?')} />
          </Field>
          {!type ? (
            <div className="grid2">
              <Field label={tt('Anzeige-Eigenschaft')} hint={tt('Name eines Datensatzes in Listen und Verknüpfungen')}>
                <Input value={f.primary_label} onChange={(v) => setF({ ...f, primary_label: v })} placeholder="Name" />
              </Field>
              <Field label=" ">
                <Check checked={f.primary_unique} onChange={(v) => setF({ ...f, primary_unique: v })} label={tt('Eindeutig (z. B. Kennzeichen)')} />
              </Field>
            </div>
          ) : (
            <Field label={tt('Anzeige-Eigenschaft')} hint={tt('Text, E-Mail, Telefon, URL, Zahl oder Datum')}>
              <Select value={f.primary_property} onChange={(v) => setF({ ...f, primary_property: v })} options={eligible.map((p: any) => [p.key, p.label] as [string, string])} />
            </Field>
          )}
        </div>
        <div>
          <Field label={tt('Symbol')} tour="obj-icon">
            <div className="icon-grid">
              {OBJECT_ICONS.map((n) => (
                <button type="button" key={n} className={f.icon === n ? 'on' : ''} onClick={() => setF({ ...f, icon: n })} aria-label={tt('Symbol {n}', { n: n })} aria-pressed={f.icon === n}>
                  <Icon name={n} size={18} />
                </button>
              ))}
            </div>
          </Field>
        </div>
      </div>
      <hr />
      <h3 style={{ marginBottom: 8 }} data-tour="obj-props">{tt('Eigenschaften')}</h3>
      {type ? (
        <>
          <div className="table-scroll">
          <table className="t compact-t">
            <tbody>
              {(cur?.properties ?? []).map((p: any) => (
                <tr key={p.key}>
                  <td>
                    <strong>{p.label}</strong> {p.key === cur.primary_property && <Badge tone="blue">{tt('Anzeige')}</Badge>}
                  </td>
                  <td className="mono muted">{p.key}</td>
                  <td>{tt(TYPE_LABELS[p.type] ?? p.type)}</td>
                  <td>
                    {p.required && <Badge tone="yellow">{tt('Pflicht')}</Badge>} {p.unique && <Badge tone="purple">{tt('eindeutig')}</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className="prop-add">
            <PropRowEditor p={extra} onChange={setExtra} />
            <button className="btn small secondary" disabled={!extra.label.trim()} onClick={addExtra}>
              {tt('+ Eigenschaft')}
            </button>
          </div>
          <p className="muted small">
            {tt('Gruppen, Beschreibungen und Änderungen:')} <Link to={`properties/${type.key}`}>{tt('Eigenschaften verwalten →')}</Link>
          </p>
        </>
      ) : (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>
            {tt('Die Anzeige-Eigenschaft (')}{f.primary_label || 'Name'}{tt(') gibt es immer. Weitere jetzt oder später unter Eigenschaften.')}
          </p>
          {props.map((p, i) => (
            <PropRowEditor key={i} p={p} onChange={(x) => setProps(props.map((y, j) => (j === i ? x : y)))} onRemove={() => setProps(props.filter((_, j) => j !== i))} />
          ))}
          <button className="btn small secondary" onClick={() => setProps([...props, blankProp()])}>
            {tt('+ Weitere Eigenschaft')}
          </button>
        </>
      )}
    </Modal>
  );
}

// --- overview -----------------------------------------------------------------------------------

export function ObjectsHome() {
  const tt = useT('x_integrations');
  const { types, reload } = useObjectTypes();
  const [modal, setModal] = useState<any>(null);
  return (
    <>
      <PageHead title={tt('Objekte')} sub={tt('Eigene Datensatz-Typen neben Kontakten, Firmen und Deals – z. B. Fahrzeuge, Verträge, Immobilien')}>
        <Link to="properties" className="btn secondary">
          <Icon name="properties" /> {tt('Eigenschaften')}
        </Link>
        <button className="btn" onClick={() => setModal({})}>
          {tt('+ Objekt')}
        </button>
      </PageHead>
      <SortableGrid id="obj-cards" className="obj-cards" data-tour="obj-cards" pinned={['add']}>
        <div className="card obj-card builtin" role="button" {...pressable(() => navigate('contacts'))}>
          <Icon name="contacts" size={22} />
          <h3>{tt('Kontakte')}</h3>
          <span className="muted small">{tt('Standard-Objekt')}</span>
        </div>
        <div className="card obj-card builtin" role="button" {...pressable(() => navigate('companies'))}>
          <Icon name="company" size={22} />
          <h3>{tt('Firmen')}</h3>
          <span className="muted small">{tt('Standard-Objekt')}</span>
        </div>
        <div className="card obj-card builtin" role="button" {...pressable(() => navigate('opportunities'))}>
          <Icon name="deal" size={22} />
          <h3>{tt('Deals')}</h3>
          <span className="muted small">{tt('Standard-Objekt')}</span>
        </div>
        {types.map((t) => (
          <div key={t.key} className="card obj-card" data-tour="obj-custom" {...pressable(() => navigate(`objects/${t.key}`))}>
            <div className="row" style={{ justifyContent: 'space-between', width: '100%' }}>
              <Icon name={objIcon(t.icon)} size={22} />
              <button className="icon-btn" onClick={(e) => (e.stopPropagation(), setModal(t))} aria-label={tt('{plural} bearbeiten', { plural: t.plural })}>
                <Icon name="edit" size={15} />
              </button>
            </div>
            <h3>{t.plural}</h3>
            <span className="muted small">
              {tt('{records} Datensätze · {length} Eigenschaften', { records: t.records, length: t.properties.length })}
            </span>
            {t.description && <span className="small">{t.description}</span>}
          </div>
        ))}
        <button key="add" className="card obj-card add" data-tour="obj-add" onClick={() => setModal({})}>
          <Icon name="objects" size={22} />
          <h3>{tt('Neues Objekt')}</h3>
          <span className="muted small">{tt('Name, Symbol und Eigenschaften festlegen')}</span>
        </button>
      </SortableGrid>
      {modal && (
        <ObjectBuilder
          type={modal.id ? modal : undefined}
          onClose={() => setModal(null)}
          onSaved={(t) => {
            setModal(null);
            reload();
            if (t && !modal.id) navigate(`objects/${t.key}`);
          }}
        />
      )}
    </>
  );
}

// --- records ------------------------------------------------------------------------------------

function NewRecord({ type, onClose, onSaved }: { type: any; onClose: () => void; onSaved: (r: any) => void }) {
  const tt = useT('x_integrations');
  const users = useUsers();
  const fields = typeFields(type);
  const [v, setV] = useState<Record<string, any>>({});
  // Einfach-Modus: required, primary and the first few at first glance, the rest behind "Weitere Felder".
  const { main, more } = splitFields(fields, { primary: type.primary_property });
  const input = (f: FieldDef) =>
    f.type === 'checkbox' ? (
      <div key={f.key} className="field">
        <PropInput def={f} value={v[f.key]} onChange={(x) => setV({ ...v, [f.key]: x })} users={users} />
      </div>
    ) : (
      <Field key={f.key} label={`${f.label}${f.required ? ' *' : ''}`} hint={f.description || undefined}>
        <PropInput def={f} value={v[f.key]} onChange={(x) => setV({ ...v, [f.key]: x })} users={users} />
      </Field>
    );
  return (
    <Modal
      title={tt('{singular} anlegen', { singular: type.singular })}
      onClose={onClose}
      footer={
        <button
          className="btn"
          onClick={async () => {
            const r = await act(() => api.post(`/api/objects/${type.key}/records`, { properties: v }));
            if (r) (toast(r.created ? tt('{singular} angelegt', { singular: type.singular }) : tt('Gab es schon – aktualisiert')), onSaved(r));
          }}
        >
          {tt('Speichern')}
        </button>
      }
    >
      <div className="grid2">
        {main.map(input)}
        {more.length > 0 && (
          <MoreFields id={`record-new-${type.key}`} values={more.map((f) => v[f.key])} count={more.length}>
            {more.map(input)}
          </MoreFields>
        )}
      </div>
    </Modal>
  );
}

export function RecordsList({ objectKey }: { objectKey: string }) {
  const tt = useT('x_integrations');
  const types = useLoad(() => api.get<any[]>('/api/objects'), [objectKey]);
  const type = types.data?.find((t) => t.key === objectKey);
  const users = useUsers();
  const fields = useMemo(() => [...typeFields(type), ...trFields(tt, SYSTEM)], [type, tt]);
  // Einfach-Modus: the primary property plus three; Profi: plus five and "Geändert" (web/src/areas/easy-core.ts).
  const simple = useSimple();
  const defaults = useMemo(() => (type ? recordColumns(type.primary_property, typeFields(type).filter((f) => f.type !== 'textarea').map((f) => f.key), simple) : []), [type, simple]);
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Filter[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [sort, setSort] = useState('');
  const [view, setView] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);
  const [modal, setModal] = useState<'' | 'new' | 'import' | 'columns' | 'builder'>('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => (setQ(''), setFilters([]), setColumns([]), setSort(''), setView(''), setPage(0)), [objectKey]);
  const active = cleanFilters(filters);
  const qs = `q=${encodeURIComponent(debounced)}&sort=${encodeURIComponent(sort)}${active.length ? `&filters=${encodeURIComponent(JSON.stringify(active))}` : ''}`;
  const list = useLoad(() => (type ? api.get<any>(`/api/objects/${objectKey}/records?${qs}&limit=50&offset=${page * 50}`) : Promise.resolve(null)), [qs, page, type?.id]);
  const cols = columns.length ? columns : defaults;
  if (types.data && !type) return <Empty>{tt('Objekt nicht gefunden.')}</Empty>;
  if (!type) return <Spinner />;
  const current: ViewConfig = { columns: cols, filters: active, sort, q };
  const cell = (r: any, f: FieldDef) => {
    if (f.key === 'owner_id') return r.owner_name ?? <span className="muted">–</span>;
    if (f.key === 'created_at' || f.key === 'updated_at') return <span className="muted">{d(r[f.key])}</span>;
    if (f.key === type.primary_property) return <strong>{r.display || <span className="muted">{tt('ohne Namen')}</span>}</strong>;
    return <PropValue def={f} value={r.properties?.[f.key]} users={users} />;
  };
  return (
    <>
      <PageHead
        title={type.plural}
        sub={
          <>
            <Icon name={objIcon(type.icon)} size={14} /> {list.data ? tt('{total} Datensätze', { total: list.data.total }) : '…'}
            {type.description ? ` · ${type.description}` : ''}
          </>
        }
      >
        <Link to="objects" className="btn secondary">
          {tt('← Objekte')}
        </Link>
        <button className="btn secondary" onClick={() => setModal('builder')}>
          <Icon name="edit" /> {tt('Objekt')}
        </button>
        <button className="btn secondary" onClick={() => setModal('import')}>
          {tt('Import')}
        </button>
        <a className="btn secondary" href={`/api/objects/${objectKey}/export.csv?${qs}&locationId=${encodeURIComponent(localStorage.getItem('pghl.location') ?? '')}`}>
          {tt('Export')}
        </a>
        <button className="btn" data-tour="records-new" onClick={() => setModal('new')}>
          + {type.singular}
        </button>
      </PageHead>
      <ViewsBar
        object={type.key}
        current={current}
        active={view}
        onApply={(id, c) => {
          setView(id);
          setPage(0);
          setQ(c?.q ?? '');
          setFilters(c?.filters ?? []);
          setColumns(c?.columns ?? []);
          setSort(c?.sort ?? '');
          setShowFilters(!!c?.filters?.length);
        }}
      />
      <div className="row list-tools" data-tour="records-tools">
        <div className="grow">
          <Input value={q} onChange={(v) => (setQ(v), setPage(0))} placeholder={tt('{plural} durchsuchen…', { plural: type.plural })} />
        </div>
        <button className="btn secondary" onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}>
          <Icon name="filter" /> {tt('Filter')}{active.length ? ` (${active.length})` : ''}
        </button>
        <button className="btn secondary" onClick={() => setModal('columns')}>
          <Icon name="columns" /> {tt('Spalten')}
        </button>
      </div>
      {showFilters && (
        <div className="card filter-card">
          <FilterRows fields={fields.filter((f) => f.type !== 'textarea' && f.type !== 'file')} value={filters} onChange={(f) => (setFilters(f), setPage(0))} users={users} />
        </div>
      )}
      {!list.data ? (
        <Spinner />
      ) : list.data.records.length ? (
        <RecordTable fields={fields} columns={cols} rows={list.data.records} cell={cell} sort={sort} onSort={(s) => (setSort(s), setPage(0))} onRow={(r) => navigate(`objects/${type.key}/${r.id}`)} />
      ) : (
        <Empty action={<button className="btn" onClick={() => setModal('new')}>{type.singular} anlegen</button>}>{debounced || active.length ? tt('Nichts passt zu Suche und Filter.') : tt('Noch keine {plural}.', { plural: type.plural })}</Empty>
      )}
      {list.data && <Pager total={list.data.total} page={page} size={50} onPage={setPage} />}
      {modal === 'new' && <NewRecord type={type} onClose={() => setModal('')} onSaved={(r) => navigate(`objects/${type.key}/${r.id}`)} />}
      {modal === 'import' && (
        <CsvImportModal
          title={tt('{plural} importieren (CSV)', { plural: type.plural })}
          url={`/api/objects/${type.key}/import`}
          hint={<>{tt('Kopfzeile mit den Namen der Eigenschaften (')}{typeFields(type).map((f) => f.label).join(', ')}{tt('). Gleiche Werte in eindeutigen Eigenschaften aktualisieren statt doppelt anzulegen.')}</>}
          placeholder={typeFields(type).map((f) => f.label).join(',')}
          onClose={() => setModal('')}
          onDone={list.reload}
        />
      )}
      {modal === 'columns' && <ColumnsModal fields={fields} value={cols} onChange={setColumns} onClose={() => setModal('')} />}
      {modal === 'builder' && <ObjectBuilder type={type} onClose={() => setModal('')} onSaved={(t) => (setModal(''), refreshNav(), t ? types.reload() : navigate('objects'))} />}
    </>
  );
}

export function RecordPage({ objectKey, id }: { objectKey: string; id: string }) {
  const tt = useT('x_integrations');
  const r = useLoad(() => api.get<any>(`/api/objects/${objectKey}/records/${id}`), [objectKey, id]);
  const users = useUsers();
  const [edit, setEdit] = useState<Record<string, any> | null>(null);
  const [tab, setTab] = useState('activity');
  if (!r.data) return r.error ? <Empty>{r.error}</Empty> : <Spinner />;
  const rec = r.data;
  const type = rec.type;
  const fields: FieldDef[] = [...typeFields(type), { key: 'owner_id', label: tt('Zuständig'), type: 'user' }];
  const values = { ...rec.properties, owner_id: rec.owner_id };
  const save = async (v: Record<string, any>) => {
    const { owner_id, ...properties } = v;
    const out = await act(() => api.patch(`/api/objects/${objectKey}/records/${id}`, { properties, owner_id: owner_id || null }), tt('Gespeichert'));
    if (out) r.reload();
    return out;
  };
  return (
    <>
      <PageHead
        title={rec.display || tt('{singular} ohne Namen', { singular: type.singular })}
        sub={
          <>
            <Icon name={objIcon(type.icon)} size={14} /> {tt('{singular} · angelegt {dt} · geändert {dt2}', { singular: type.singular, dt: dt(rec.created_at), dt2: dt(rec.updated_at) })}
          </>
        }
      >
        <Link to={`objects/${objectKey}`} className="btn secondary">
          ← {type.plural}
        </Link>
        <button className="btn danger" onClick={async () => confirmAsk(tt('{singular} löschen? Verknüpfungen und Notizen werden mit gelöscht.', { singular: type.singular })) && (await act(() => api.del(`/api/objects/${objectKey}/records/${id}`), tt('Gelöscht'))) && navigate(`objects/${objectKey}`)}>
          {tt('Löschen')}
        </button>
      </PageHead>
      <div className="row rec-layout">
        <div className="rec-left">
          <PropertyCard id={`record-${objectKey}`} title={tt('Eigenschaften')} fields={fields} groups={type.groups ?? []} values={values} edit={edit} setEdit={setEdit} users={users} onSave={save} />
        </div>
        <div className="rec-main">
          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: '6px 14px 0' }}>
              <Tabs
                tabs={[
                  ['activity', tt('Aktivität')],
                  ['notes', tt('Notizen ({n})', { n: rec.notes.length })],
                ]}
                value={tab}
                onChange={setTab}
              />
            </div>
            <div style={{ padding: '0 14px 14px' }}>
              {tab === 'activity' && <Timeline items={rec.activities.map((a: any) => ({ id: a.id, at: a.created_at, summary: a.summary, by: a.user_name }))} />}
              {tab === 'notes' && <Notes notes={rec.notes} onAdd={(body) => act(() => api.post(`/api/objects/${objectKey}/records/${id}/notes`, { body })).then((x) => (r.reload(), x))} onDelete={(nid) => act(() => api.del(`/api/record-notes/${nid}`)).then(r.reload)} />}
            </div>
          </div>
        </div>
        <div className="rec-side">
          <AssociationsPanel type={objectKey} id={id} onChange={r.reload} />
        </div>
      </div>
    </>
  );
}

/** Route objects[/key[/id]]. */
export function ObjectsPage({ route }: { route: string[] }) {
  const [key, id] = route;
  if (key && id) return <RecordPage objectKey={key} id={id} />;
  if (key) return <RecordsList objectKey={key} />;
  return <ObjectsHome />;
}

// --- workflows ------------------------------------------------------------------------------------

function useObjectChoices() {
  const tt = useT('x_integrations');
  const { types } = useObjectTypes();
  const company = useLoad(() => api.get<any>('/api/properties?object=company'), []);
  const companyFields: FieldDef[] = [...trFields(tt, COMPANY_STANDARD), ...(company.data?.properties ?? [])];
  const objects: [string, string][] = [['company', tt('Firma')], ...types.map((t) => [t.key, t.singular] as [string, string])];
  const fieldsOf = (object: string): FieldDef[] => (object === 'company' ? companyFields : typeFields(types.find((t) => t.key === object)));
  return { types, objects, fieldsOf };
}

function LabelSelect({ object, value, onChange, label }: { object: string; value: string; onChange: (v: string) => void; label?: string }) {
  const tt = useT('x_integrations');
  const labels = useLoad(() => (object ? api.get<any[]>(`/api/association-labels?a_type=contact&b_type=${encodeURIComponent(object)}`) : Promise.resolve([])), [object]);
  if (!(labels.data ?? []).length) return null;
  return (
    <Field label={label ?? tt('Label der Verknüpfung (optional)')}>
      <Select value={value} onChange={onChange} placeholder="–" options={(labels.data ?? []).map((l) => [l.name, l.name] as [string, string])} />
    </Field>
  );
}

/** Trigger filters for company.* and record.* triggers. */
export function ObjectTriggerFilter({ type, config, set }: { type: string; config: any; set: (p: any) => void }) {
  const tt = useT('x_integrations');
  const { types, fieldsOf } = useObjectChoices();
  const isRecord = type.startsWith('record.');
  const object = isRecord ? config.object ?? '' : 'company';
  const fields = object ? fieldsOf(object) : [];
  return (
    <>
      {isRecord && (
        <Field label={tt('Objekt')}>
          <Select value={config.object} onChange={(v) => set({ object: v, property: '' })} placeholder={tt('jedes eigene Objekt')} options={types.map((t) => [t.key, t.plural] as [string, string])} />
        </Field>
      )}
      {(type.endsWith('.property_changed') || type.endsWith('.updated')) && object && (
        <Field label={tt('Eigenschaft')}>
          <Select value={config.property} onChange={(v) => set({ property: v })} placeholder={tt('jede')} options={fields.map((f) => [f.key, f.label] as [string, string])} />
        </Field>
      )}
      {type.endsWith('.property_changed') && config.property && (
        <Field label={tt('Neuer Wert (leer = jeder)')}>
          <Input value={config.value} onChange={(v) => set({ value: v })} placeholder={config.property === 'lifecycle_stage' ? tt('z. B. customer') : ''} />
        </Field>
      )}
      <LabelSelect object={object} value={config.label} onChange={(v) => set({ label: v })} label={tt('Nur Kontakte mit diesem Label')} />
      {!isRecord && <Check checked={config.enroll === 'primary'} onChange={(v) => set({ enroll: v ? 'primary' : '' })} label={tt('Nur Kontakte, deren primäre Firma es ist')} />}
      <p className="muted small">{tt('Der Workflow startet für die mit dem Datensatz verknüpften Kontakte. Platzhalter:')} {isRecord ? '{{event.record.display}}, {{event.record.properties.<schlüssel>}}' : '{{event.company.name}}, {{event.company.domain}}, {{event.company.custom.<schlüssel>}}'}.</p>
    </>
  );
}

function ValueMap({ fields, value, onChange }: { fields: FieldDef[]; value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const tt = useT('x_integrations');
  const entries = Object.entries(value ?? {});
  const free = fields.filter((f) => !(f.key in (value ?? {})));
  return (
    <div className="filter-rows">
      {entries.map(([k, v]) => (
        <div key={k} className="filter-row">
          <Select
            value={k}
            onChange={(nk) => onChange(Object.fromEntries(entries.map(([a, b]) => (a === k ? [nk, b] : [a, b]))))}
            options={[fields.find((f) => f.key === k) ?? { key: k, label: k }, ...free].map((f) => [f.key, f.label] as [string, string])}
          />
          <Input value={v} onChange={(nv) => onChange({ ...value, [k]: nv })} placeholder={tt('Wert oder {{contact.…}}')} />
          <button type="button" className="icon-btn" onClick={() => onChange(Object.fromEntries(entries.filter(([a]) => a !== k)))} aria-label={tt('Entfernen')}>
            ✕
          </button>
        </div>
      ))}
      {free.length > 0 && (
        <button type="button" className="btn small secondary" onClick={() => onChange({ ...value, [free[0].key]: '' })}>
          {tt('+ Eigenschaft')}
        </button>
      )}
    </div>
  );
}

/** Settings of the steps create_record, update_record and associate_records. */
export function ObjectStep({ step, set }: { step: any; set: (p: any) => void }) {
  const tt = useT('x_integrations');
  const { objects, fieldsOf } = useObjectChoices();
  const object = step.object ?? '';
  const fields = object ? fieldsOf(object).filter((f) => f.type !== 'file') : [];
  return (
    <>
      <Field label={tt('Objekt')}>
        <Select value={object} onChange={(v) => set({ object: v, properties: {}, property: '' })} placeholder={tt('wählen…')} options={objects} />
      </Field>
      {object && step.type === 'update_record' && (
        <Field label={tt('Welcher Datensatz')}>
          <Select
            value={step.target ?? 'trigger'}
            onChange={(v) => set({ target: v })}
            options={[['trigger', tt('Der Datensatz aus dem Auslöser')], ['associated', tt('Alle mit dem Kontakt verknüpften')], ...(object === 'company' ? ([['primary', tt('Die primäre Firma des Kontakts')]] as [string, string][]) : [])]}
          />
        </Field>
      )}
      {object && step.type === 'update_record' && step.target === 'associated' && <LabelSelect object={object} value={step.label} onChange={(v) => set({ label: v })} label={tt('Nur mit Label (optional)')} />}
      {object && step.type !== 'associate_records' && (
        <Field label={step.type === 'create_record' ? tt('Werte') : tt('Neue Werte')} hint={object === 'company' ? tt('Gleiche Domain = vorhandene Firma wird aktualisiert') : tt('Eindeutige Eigenschaften verhindern Dubletten')}>
          <ValueMap fields={fields} value={step.properties ?? {}} onChange={(v) => set({ properties: v })} />
        </Field>
      )}
      {object && step.type === 'associate_records' && (
        <>
          <Field label={tt('Datensatz finden')}>
            <Select value={step.target ?? 'match'} onChange={(v) => set({ target: v })} options={[['match', tt('Über eine Eigenschaft')], ['trigger', tt('Der Datensatz aus dem Auslöser')]]} />
          </Field>
          {(step.target ?? 'match') === 'match' && (
            <div className="grid2">
              <Field label={tt('Eigenschaft')}>
                <Select value={step.property ?? (object === 'company' ? 'domain' : '')} onChange={(v) => set({ property: v })} options={fields.map((f) => [f.key, f.label] as [string, string])} />
              </Field>
              <Field label={tt('ist gleich')} hint={object === 'company' && (step.property ?? 'domain') === 'domain' ? tt('E-Mail-Adressen werden zur Domain') : undefined}>
                <Input value={step.value} onChange={(v) => set({ value: v })} placeholder="{{contact.email}}" />
              </Field>
            </div>
          )}
          {(step.target ?? 'match') === 'match' && <Check checked={!!step.create_if_missing} onChange={(v) => set({ create_if_missing: v })} label={tt('Anlegen, wenn keiner passt')} />}
        </>
      )}
      {object && step.type !== 'update_record' && (
        <>
          {step.type === 'create_record' && <Check checked={step.associate !== false} onChange={(v) => set({ associate: v })} label={tt('Mit dem Kontakt verknüpfen')} />}
          <LabelSelect object={object} value={step.label} onChange={(v) => set({ label: v })} />
          {object === 'company' && <Check checked={!!step.primary} onChange={(v) => set({ primary: v })} label={tt('Als primäre Firma des Kontakts')} />}
        </>
      )}
    </>
  );
}
