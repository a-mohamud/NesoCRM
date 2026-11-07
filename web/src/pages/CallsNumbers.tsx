import { useState } from 'react';
import { Icon } from '../icons';
import { api } from '../api';
import { Badge, Check, CodeBox, Empty, Field, Input, Modal, Select, Spinner, Stat, Tabs, TagInput, act, confirmAsk, useLoad } from '../ui';
import { Callout, Item, Panel, openAuthed } from './CreatorKit';
import { Tl, dur, phoneText, useCanSettings } from './CallsKit';
import { SortableGrid } from '../sortable/Sortable';
import { useT } from '../i18n';

/**
 * "Nummern": every number of the project with its label and where it leads (menu, group, person, forwarding, voicemail, KI); buying a
 * number from Twilio (search by country, type and area code; the German address and regulatory bundle are explained and chosen here;
 * nothing is bought without a confirmation); tracking numbers per campaign; pools of numbers for the website (dynamic number insertion)
 * with the snippet and the report "Anrufe nach Quelle". Docs: docs/telephony.md.
 */

const KIND: Record<string, string> = { main: 'Hauptnummer', tracking: 'Tracking-Nummer', pool: 'Pool-Nummer' };
const TYPES: [string, string][] = [
  ['local', 'Ortsnummer'],
  ['mobile', 'Mobilnummer'],
  ['toll_free', 'Gebührenfrei'],
];

// --- one number ----------------------------------------------------------------------------------------------------------------

function NumberDialog({ n, reg, onClose, onSaved }: { n: any; reg: any; onClose: () => void; onSaved: () => void }) {
  const tt = useT('x_comms');
  const meta = useLoad(() => api.get('/api/telephony/ivr/meta'), []);
  const [s, setS] = useState({ label: n.label as string, kind: n.kind as string, pool_id: (n.pool_id ?? '') as string, source: n.source as string, medium: n.medium as string, campaign: n.campaign as string, route_kind: n.route_kind as string, route_id: n.route_id as string });
  const set = (p: Partial<typeof s>) => setS({ ...s, ...p });
  const save = async () => {
    const body: any = { label: s.label, kind: s.kind, route_kind: s.route_kind, route_id: s.route_kind === 'default' || s.route_kind === 'ai' ? '' : s.route_id };
    if (s.kind === 'pool') body.pool_id = s.pool_id;
    if (s.kind === 'tracking') Object.assign(body, { source: s.source, medium: s.medium, campaign: s.campaign });
    if (await act(() => api.patch(`/api/telephony/registry/${n.id}`, body), tt('Gespeichert'))) {
      onSaved();
      onClose();
    }
  };
  const users: { id: string; name: string }[] = meta.data?.users ?? [];
  return (
    <Modal
      title={tt('Nummer {phoneText}', { phoneText: phoneText(n.number) })}
      onClose={onClose}
      footer={
        <button className="btn" onClick={save}>
          {tt('Speichern')}
        </button>
      }
    >
      <Field label={tt('Bezeichnung')} hint={tt('Zum Beispiel „Hauptnummer“ oder „Google-Anzeigen Herbst“.')}>
        <Input value={s.label} onChange={(v) => set({ label: v })} maxLength={80} />
      </Field>
      <Field label={tt('Art')} hint={tt('Eine Tracking-Nummer gehört fest zu einer Kampagne (Flyer, Anzeige). Pool-Nummern wechselt die Website je Besucher.')}>
        <Select value={s.kind} onChange={(v) => set({ kind: v })} options={Object.entries(KIND).map(([k, l]) => [k, tt(l)] as [string, string])} />
      </Field>
      {s.kind === 'tracking' && (
        <div className="cr-form-row">
          <Field label={tt('Quelle')}>
            <Input value={s.source} onChange={(v) => set({ source: v })} placeholder={tt('z. B. google')} />
          </Field>
          <Field label={tt('Medium')}>
            <Input value={s.medium} onChange={(v) => set({ medium: v })} placeholder={tt('z. B. cpc, flyer')} />
          </Field>
          <Field label={tt('Kampagne')}>
            <Input value={s.campaign} onChange={(v) => set({ campaign: v })} placeholder={tt('z. B. herbst-aktion')} />
          </Field>
        </div>
      )}
      {s.kind === 'pool' && (
        <Field label={tt('Pool')}>
          <Select value={s.pool_id} onChange={(v) => set({ pool_id: v })} placeholder={tt('— bitte wählen —')} options={reg.pools.map((p: any) => [p.id, p.name])} />
        </Field>
      )}
      <Field label={tt('Wohin führt ein Anruf auf diese Nummer?')}>
        <Select value={s.route_kind} onChange={(v) => set({ route_kind: v, route_id: '' })} options={reg.route_kinds.map((k: any) => [k.key, k.label])} />
      </Field>
      {s.route_kind === 'ivr' && <Select value={s.route_id} onChange={(v) => set({ route_id: v })} placeholder={tt('— Telefonmenü wählen —')} options={reg.flows.map((f: any) => [f.id, f.name])} />}
      {s.route_kind === 'group' && <Select value={s.route_id} onChange={(v) => set({ route_id: v })} placeholder={tt('— Gruppe wählen —')} options={reg.groups.map((f: any) => [f.id, f.name])} />}
      {s.route_kind === 'user' && <Select value={s.route_id} onChange={(v) => set({ route_id: v })} placeholder={tt('— Person wählen —')} options={users.map((u) => [u.id, u.name])} />}
      {s.route_kind === 'forward' && <Input value={s.route_id} onChange={(v) => set({ route_id: v })} placeholder="+49…" />}
      {s.route_kind === 'voicemail' && <Input value={s.route_id} onChange={(v) => set({ route_id: v })} placeholder={tt('Name des Postfachs, z. B. Vertrieb')} maxLength={80} />}
      {s.route_kind === 'default' && <p className="muted small">{tt('Der normale Ablauf: Weiterleitung an dein Handy und die Browser-Telefone zu den Geschäftszeiten, sonst KI-Telefonagent oder Voicemail.')}</p>}
      {s.route_kind === 'user' && <p className="muted small">{tt('Klingelt im Browser-Telefon dieser Person. Ist es nicht geöffnet, greift der normale Ablauf.')}</p>}
    </Modal>
  );
}

// --- buying --------------------------------------------------------------------------------------------------------------------

function BuyDialog({ reg, onClose, onBought }: { reg: any; onClose: () => void; onBought: () => void }) {
  const tt = useT('x_comms');
  const [q, setQ] = useState({ country: 'DE', type: 'local', area_code: '', contains: '' });
  const [res, setRes] = useState<any>(null);
  const [price, setPrice] = useState<any>(null);
  const [pick, setPick] = useState<any>(null);
  const [regu, setRegu] = useState<any>(null);
  const [f, setF] = useState({ label: '', kind: 'main', pool_id: '', source: '', medium: '', campaign: '', address_sid: '', bundle_sid: '', confirm: false });
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });
  const search = async () => {
    setBusy(true);
    setPick(null);
    setRegu(null);
    const params = new URLSearchParams({ country: q.country.toUpperCase(), type: q.type, ...(q.area_code ? { area_code: q.area_code } : {}), ...(q.contains ? { contains: q.contains } : {}) });
    const r = await act(() => api.get(`/api/telephony/numbers/search?${params}`));
    if (r) {
      setRes(r);
      api.get(`/api/telephony/numbers/pricing?country=${q.country.toUpperCase()}`).then(setPrice).catch(() => setPrice(null));
    }
    setBusy(false);
  };
  const choose = async (n: any) => {
    setPick(n);
    const r = await act(() => api.get(`/api/telephony/regulatory?country=${n.country || q.country.toUpperCase()}&type=${q.type}`));
    if (r) {
      setRegu(r);
      // The only fitting address / approved bundle is preselected.
      const bundles = r.bundles.filter((b: any) => b.approved);
      setF((x) => ({ ...x, address_sid: r.addresses.length === 1 ? r.addresses[0].sid : x.address_sid, bundle_sid: bundles.length === 1 ? bundles[0].sid : x.bundle_sid }));
    }
  };
  const buy = async () => {
    setBusy(true);
    const r = await act(() => api.post('/api/telephony/numbers/buy', { phone_number: pick.phone_number, country: pick.country, type: q.type, price: price?.pricing?.prices?.[q.type] ? tt('{monthly} {currency}/Monat', { monthly: price.pricing.prices[q.type], currency: price.pricing.currency }) : '', ...f, confirm: true }), tt('Nummer gekauft'));
    setBusy(false);
    if (r) {
      onBought();
      onClose();
    }
  };
  const monthly = price?.pricing?.prices?.[q.type];
  const needs = res?.rule;
  return (
    <Modal title={tt('Nummer kaufen')} wide onClose={onClose}>
      <p className="muted small">{tt('Die Nummer wird über dein Twilio-Konto gekauft und kostet dort eine monatliche Gebühr. Es wird nichts gekauft, bevor du unten ausdrücklich bestätigst.')}</p>
      <div className="cr-form-row">
        <Field label={tt('Land')} hint={tt('Zwei Buchstaben, z. B. DE, AT, CH')}>
          <Input value={q.country} onChange={(v) => setQ({ ...q, country: v.toUpperCase().slice(0, 2) })} maxLength={2} />
        </Field>
        <Field label={tt('Art')}>
          <Select value={q.type} onChange={(v) => setQ({ ...q, type: v })} options={TYPES.map(([k, l]) => [k, tt(l)] as [string, string])} />
        </Field>
        <Field label={tt('Vorwahl')} hint={tt('z. B. 30 für Berlin')}>
          <Input value={q.area_code} onChange={(v) => setQ({ ...q, area_code: v.replace(/\D/g, '') })} inputMode="numeric" />
        </Field>
        <Field label={tt('Enthält Ziffern')} hint={tt('Wunschziffern, z. B. 777')}>
          <Input value={q.contains} onChange={(v) => setQ({ ...q, contains: v })} />
        </Field>
      </div>
      <button className="btn" onClick={search} disabled={busy || q.country.length !== 2} data-tour="number-search">
        <Icon name="search" size={14} /> {tt('Nummern suchen')}
      </button>
      {res && (
        <div style={{ marginTop: 14 }}>
          {needs && <Callout tone="warn">{needs.text}</Callout>}
          {res.numbers.length ? (
            <div className="tl-results" role="listbox" aria-label={tt('Verfügbare Nummern')}>
              {res.numbers.map((n: any) => (
                <button key={n.phone_number} type="button" role="option" aria-selected={pick?.phone_number === n.phone_number} className={`tl-result${pick?.phone_number === n.phone_number ? ' on' : ''}`} onClick={() => choose(n)}>
                  <span>
                    <span className="tl-num">{phoneText(n.phone_number)}</span> <span className="muted small">{[n.locality, n.region].filter(Boolean).join(', ')}</span>
                  </span>
                  <span className="cr-line">
                    {n.capabilities.voice && <Badge tone="green">{tt('Sprache')}</Badge>}
                    {n.capabilities.sms && <Badge>SMS</Badge>}
                    {n.beta && <Badge tone="yellow">{tt('Beta')}</Badge>}
                    {monthly && <span className="small">{tt('{monthly} {currency}/Monat', { monthly: monthly, currency: price.pricing.currency })}</span>}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <Empty>{tt('Keine Nummern mit diesen Angaben. Lass die Vorwahl oder die Wunschziffern weg.')}</Empty>
          )}
        </div>
      )}
      {pick && (
        <div style={{ marginTop: 8 }}>
          <h4 style={{ margin: '4px 0 8px' }}>
            {tt('{phone} einrichten', { phone: phoneText(pick.phone_number) })}
          </h4>
          {!regu ? (
            <Spinner />
          ) : (
            <>
              {(regu.rule?.address || regu.addresses.length > 0) && (
                <Field label={tt('Adresse')} hint={regu.rule?.address && !regu.addresses.length ? tt('In diesem Twilio-Konto gibt es noch keine Adresse für dieses Land.') : tt('Die Adresse, die Twilio für diese Nummer nachweist.')}>
                  <Select value={f.address_sid} onChange={(v) => set({ address_sid: v })} placeholder={tt('— keine —')} options={regu.addresses.map((a: any) => [a.sid, `${a.name || a.street}, ${a.postal_code} ${a.city}${a.verified ? '' : ` ${tt('(nicht bestätigt)')}`}`])} />
                </Field>
              )}
              {(regu.rule?.bundle || regu.bundles.length > 0) && (
                <Field label={tt('Regulatory Bundle')} hint={regu.bundles.some((b: any) => b.approved) ? tt('Nur genehmigte Bundles können Nummern kaufen.') : tt('Es gibt noch kein genehmigtes Bundle – die Prüfung durch Twilio dauert meist einige Werktage.')}>
                  <Select value={f.bundle_sid} onChange={(v) => set({ bundle_sid: v })} placeholder={tt('— keins —')} options={regu.bundles.map((b: any) => [b.sid, `${b.name || b.sid} – ${b.approved ? 'genehmigt' : b.status}`])} />
                </Field>
              )}
              {regu.rule && !regu.ready && (
                <Callout tone="warn">
                  <p>{tt('Dafür fehlt noch etwas in Twilio:')}</p>
                  <ul>
                    {regu.rule.address && !regu.addresses.length && <li>{tt('eine Adresse im Land {country}', { country: regu.country })}</li>}
                    {regu.rule.bundle && !regu.bundles.some((b: any) => b.approved) && <li>{tt('ein genehmigtes Regulatory Bundle')}</li>}
                  </ul>
                  <p>
                    {tt('Lege beides in der Twilio-Konsole an:')}{' '}
                    <a href={regu.console.addresses} target="_blank" rel="noreferrer noopener">
                      {tt('Adressen')}
                    </a>
                    {' · '}
                    <a href={regu.console.bundles} target="_blank" rel="noreferrer noopener">
                      {tt('Regulatory Bundles')}
                    </a>
                    {tt('. Danach diesen Dialog neu öffnen.')}
                  </p>
                </Callout>
              )}
              {regu.problems.length > 0 && <p className="cr-err">{regu.problems.join(' ')}</p>}
            </>
          )}
          <div className="cr-form-row">
            <Field label={tt('Bezeichnung')}>
              <Input value={f.label} onChange={(v) => set({ label: v })} maxLength={80} placeholder={tt('z. B. Hauptnummer')} />
            </Field>
            <Field label={tt('Verwendung')}>
              <Select value={f.kind} onChange={(v) => set({ kind: v })} options={Object.entries(KIND).map(([k, l]) => [k, tt(l)] as [string, string])} />
            </Field>
            {f.kind === 'pool' && (
              <Field label={tt('Pool')}>
                <Select value={f.pool_id} onChange={(v) => set({ pool_id: v })} placeholder={tt('— bitte wählen —')} options={reg.pools.map((p: any) => [p.id, p.name])} />
              </Field>
            )}
          </div>
          {f.kind === 'tracking' && (
            <div className="cr-form-row">
              <Field label={tt('Quelle')}>
                <Input value={f.source} onChange={(v) => set({ source: v })} placeholder="google" />
              </Field>
              <Field label={tt('Medium')}>
                <Input value={f.medium} onChange={(v) => set({ medium: v })} placeholder="cpc" />
              </Field>
              <Field label={tt('Kampagne')}>
                <Input value={f.campaign} onChange={(v) => set({ campaign: v })} placeholder={tt('herbst-aktion')} />
              </Field>
            </div>
          )}
          <Check checked={f.confirm} onChange={(v) => set({ confirm: v })} label={`${tt('Ich kaufe {phone} bei Twilio', { phone: phoneText(pick.phone_number) })}${monthly ? tt(' für {monthly} {currency} im Monat', { monthly: monthly, currency: price.pricing.currency }) : tt(' (monatliche Gebühr laut Twilio-Preisliste)')}.`} />
          <p>
            <button className="btn" disabled={busy || !f.confirm || (f.kind === 'pool' && !f.pool_id)} onClick={buy} data-tour="number-buy">
              {tt('Nummer kaufen')}
            </button>
          </p>
        </div>
      )}
    </Modal>
  );
}

// --- pools (dynamic number insertion) -------------------------------------------------------------------------------------------

function PoolDialog({ initial, reg, onClose, onSaved }: { initial: any | null; reg: any; onClose: () => void; onSaved: () => void }) {
  const tt = useT('x_comms');
  const [p, setP] = useState<any>(() => (initial ? { ...initial } : { name: '', default_number: '', fallback_number: '', session_minutes: 30, attribution_minutes: 120, sources: [], on_funnels: true, exhausted: 'fallback', selector: '', enabled: true, numbers: [] }));
  const [ids, setIds] = useState<string[]>(() => (initial?.numbers ?? []).map((n: any) => n.id));
  const set = (x: any) => setP({ ...p, ...x });
  const free: any[] = reg.numbers;
  const save = async () => {
    const body = { name: p.name, enabled: p.enabled, default_number: p.default_number, fallback_number: p.fallback_number, session_minutes: p.session_minutes, attribution_minutes: p.attribution_minutes, sources: p.sources, on_funnels: p.on_funnels, exhausted: p.exhausted, selector: p.selector };
    const r = await act(() => (initial ? api.put(`/api/telephony/dni/pools/${initial.id}`, body) : api.post('/api/telephony/dni/pools', body)));
    if (!r) return;
    if (await act(() => api.put(`/api/telephony/dni/pools/${r.id}/numbers`, { number_ids: ids }), tt('Gespeichert'))) {
      onSaved();
      onClose();
    }
  };
  return (
    <Modal
      title={initial ? tt('Pool: {name}', { name: initial.name }) : tt('Neuer Nummern-Pool')}
      wide
      onClose={onClose}
      footer={
        <button className="btn" disabled={!p.name.trim()} onClick={save}>
          {tt('Speichern')}
        </button>
      }
    >
      <p className="muted small">
        {tt('Ein Pool tauscht auf deiner Website die Telefonnummer je nach Herkunft des Besuchers. Ruft jemand an, wird der Anruf der Kampagne zugeordnet. Mit mehr Nummern im Pool können mehr Besucher gleichzeitig eine eigene Nummer sehen.')}
      </p>
      <div className="cr-form-row">
        <Field label="Name">
          <Input value={p.name} onChange={(v) => set({ name: v })} maxLength={80} placeholder={tt('z. B. Website')} />
        </Field>
        <Field label={tt('Nummer, wie sie auf der Website steht')} hint={tt('Genau so geschrieben wie im Text der Seite – sie wird ersetzt.')}>
          <Input value={p.default_number} onChange={(v) => set({ default_number: v })} placeholder="030 123456" />
        </Field>
        <Field label={tt('Ersatznummer')} hint={tt('Wenn kein Pool-Platz frei ist (Anrufe darauf zählen als „ohne Quelle“).')}>
          <Input value={p.fallback_number} onChange={(v) => set({ fallback_number: v })} placeholder="optional" />
        </Field>
      </div>
      <Field label={tt('Nur für diese Quellen tauschen')} hint={tt('Leer = für alle Besucher mit Kampagnen- oder Suchmaschinen-Herkunft. Beispiele: google/cpc, facebook, newsletter.')}>
        <TagInput value={p.sources} onChange={(v) => set({ sources: v })} placeholder={tt('Quelle + Enter')} />
      </Field>
      <div className="cr-form-row">
        <Field label={tt('Besuch zählt (Minuten)')} hint={tt('So lange gehört eine Nummer einem Besucher.')}>
          <Input type="number" min={5} max={240} value={p.session_minutes} onChange={(v) => set({ session_minutes: Number(v) })} />
        </Field>
        <Field label={tt('Anruf danach noch zuordnen (Minuten)')} hint={tt('Wer die Seite verlässt und dann anruft.')}>
          <Input type="number" min={0} max={1440} value={p.attribution_minutes} onChange={(v) => set({ attribution_minutes: Number(v) })} />
        </Field>
        <Field label={tt('Wenn alle Nummern vergeben sind')}>
          <Select value={p.exhausted} onChange={(v) => set({ exhausted: v })} options={[['fallback', tt('Ersatznummer zeigen')], ['oldest', tt('Älteste Nummer mitbenutzen')]]} />
        </Field>
      </div>
      <Field label={tt('Nur im Bereich (CSS-Selektor, optional)')} hint={tt('Zum Beispiel header oder .kontakt – leer: die ganze Seite.')}>
        <Input value={p.selector} onChange={(v) => set({ selector: v })} placeholder="optional" />
      </Field>
      <Check checked={p.on_funnels} onChange={(v) => set({ on_funnels: v })} label={tt('Auf Funnel- und Landingpages dieses Projekts automatisch einbauen')} />
      <Check checked={p.enabled} onChange={(v) => set({ enabled: v })} label={tt('Pool ist eingeschaltet')} />
      <h4 style={{ margin: '14px 0 8px' }}>{tt('Nummern im Pool')}</h4>
      {free.length ? (
        <div className="cr-lines">
          {free.map((n: any) => (
            <Check key={n.id} checked={ids.includes(n.id)} onChange={(on) => setIds(on ? [...ids, n.id] : ids.filter((x) => x !== n.id))} label={<span><span className="tl-num">{phoneText(n.number)}</span> <span className="muted small">{n.label}</span></span>} />
          ))}
        </div>
      ) : (
        <p className="muted">{tt('Noch keine Nummer. Kaufe zuerst Nummern (Art „Pool-Nummer“).')}</p>
      )}
    </Modal>
  );
}

function Pools({ reg, reload }: { reg: any; reload: () => void }) {
  const tt = useT('x_comms');
  const list = useLoad(() => api.get<any[]>('/api/telephony/dni/pools'), []);
  const [edit, setEdit] = useState<any | 'new' | null>(null);
  const done = () => (void list.reload(), reload());
  if (!list.data) return <Spinner />;
  return (
    <>
      <Panel
        title={tt('Pools für die Website')}
        sub={tt('Die Website zeigt jedem Besucher je nach Herkunft eine eigene Nummer. Anrufe werden so Kampagne, Anzeige oder Suchbegriff zugeordnet.')}
        wide
        tour="dni-pools"
        actions={
          <button className="btn" onClick={() => setEdit('new')}>
            <Icon name="plus" size={14} /> {tt('Neuer Pool')}
          </button>
        }
      >
        {list.data.length ? (
          <div className="cr-list">
            {list.data.map((p) => (
              <Item
                key={p.id}
                onClick={() => setEdit(p)}
                side={
                  <>
                    {!p.enabled && <Badge>{tt('aus')}</Badge>}
                    <Badge tone="blue">{tt.plural(p.numbers.length, { one: '{n} Nummer', other: '{n} Nummern' })}</Badge>
                    <button
                      className="icon-btn"
                      aria-label={tt('{name} löschen', { name: p.name })}
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (confirmAsk(tt('Pool „{name}“ löschen? Die Nummern bleiben als Tracking-Nummern erhalten.', { name: p.name })) && (await act(() => api.del(`/api/telephony/dni/pools/${p.id}`), tt('Gelöscht')))) done();
                      }}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </>
                }
              >
                <strong>{p.name}</strong>
                <div className="cr-sub">
                  {tt('Ersetzt „')}{p.default_number || '–'}{tt('“ · {sessions_active} Besuche aktiv · {calls_30d} Anrufe (30 Tage)', { sessions_active: p.sessions_active, calls_30d: p.calls_30d })}
                </div>
                <div className="cr-sub">
                  <CodeBox text={p.snippet} />
                </div>
              </Item>
            ))}
          </div>
        ) : (
          <Empty>{tt('Noch kein Pool. Lege einen an, kaufe Pool-Nummern und baue das Snippet in deine Website ein.')}</Empty>
        )}
        <p className="muted small" style={{ marginTop: 10 }}>
          {tt('Das Snippet kommt in den')} <code>{'<head>'}</code> {tt('deiner Website. Auf Funnels und Landingpages dieses Projekts wird es automatisch eingebaut, wenn du das oben nicht abschaltest. Besucher ohne Kampagnenherkunft sehen weiter die normale Nummer.')}
        </p>
      </Panel>
      {edit && <PoolDialog initial={edit === 'new' ? null : edit} reg={reg} onClose={() => setEdit(null)} onSaved={done} />}
    </>
  );
}

// --- report --------------------------------------------------------------------------------------------------------------------

function Report() {
  const tt = useT('x_comms');
  const [group, setGroup] = useState('source');
  const rep = useLoad(() => api.get(`/api/telephony/tracking/report?group=${group}`), [group]);
  const d = rep.data;
  return (
    <Panel
      title={tt('Anrufe nach Quelle')}
      sub={d ? tt('{from} bis {to}', { from: d.from, to: d.to }) : tt('Letzte 30 Tage')}
      wide
      tour="tracking-report"
      actions={
        <button className="btn secondary" onClick={() => openAuthed(`/api/telephony/tracking/report.csv?group=${group}`, 'anrufe-nach-quelle.csv')}>
          <Icon name="download" size={14} /> CSV
        </button>
      }
    >
      <Tabs
        tabs={[
          ['source', tt('Quelle')],
          ['campaign', tt('Kampagne')],
          ['number', tt('Nummer')],
        ]}
        value={group}
        onChange={setGroup}
      />
      {!d ? (
        <Spinner />
      ) : d.rows.length ? (
        <>
          <SortableGrid id="calls-numbers.stats" className="stats" style={{ margin: '12px 0' }}>
            <Stat label={tt('Anrufe')} value={d.totals.calls} sub={tt('{answered} angenommen · {missed} verpasst', { answered: d.totals.answered, missed: d.totals.missed })} />
            <Stat label={tt('Besuche mit eigener Nummer')} value={d.totals.visits} />
          </SortableGrid>
          <div className="table-wrap">
            <table className="tl-report">
              <thead>
                <tr>
                  <th>{group === 'number' ? tt('Nummer') : group === 'campaign' ? tt('Quelle / Medium / Kampagne') : tt('Quelle')}</th>
                  <th className="n">{tt('Anrufe')}</th>
                  <th className="n">{tt('Angenommen')}</th>
                  <th className="n">{tt('Verpasst')}</th>
                  <th className="n">{tt('Ø Dauer')}</th>
                  <th className="n">{tt('Anrufer')}</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r: any) => (
                  <tr key={r.key}>
                    <td>{r.label}</td>
                    <td className="n">{r.calls}</td>
                    <td className="n">{r.answered}</td>
                    <td className="n">{r.missed}</td>
                    <td className="n">{dur(r.avg_duration)}</td>
                    <td className="n">{r.callers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <Empty>{tt('Noch keine Anrufe mit bekannter Herkunft. Sie erscheinen, sobald jemand eine Tracking- oder Pool-Nummer anruft.')}</Empty>
      )}
    </Panel>
  );
}

// --- page ----------------------------------------------------------------------------------------------------------------------

export function CallsNumbers() {
  const tt = useT('x_comms');
  const can = useCanSettings();
  const reg = useLoad(() => api.get('/api/telephony/registry'), []);
  const [edit, setEdit] = useState<any>(null);
  const [buy, setBuy] = useState(false);
  if (!can) return <Empty>{tt('Nummern verwalten die Agentur oder Mitglieder mit Zugriff auf die Einstellungen.')}</Empty>;
  if (!reg.data) return reg.error ? <Empty>{reg.error}</Empty> : <Spinner />;
  const r = reg.data;
  const release = async (n: any) => {
    if (!confirmAsk(tt('{phoneText} an Twilio zurückgeben? Die Nummer lässt sich danach nicht zurückholen.', { phoneText: phoneText(n.number) }))) return;
    if (await act(() => api.post(`/api/telephony/numbers/${n.id}/release`, { confirm: true }), tt('Nummer freigegeben'))) void reg.reload();
  };
  return (
    <Tl name="numbers">
      {!r.ready && (
        <Callout tone="warn">
          {tt('Die Telefonie ist noch nicht eingerichtet. Trage zuerst Account SID und Auth Token ein (Einstellungen → Telefonie), dann kannst du Nummern kaufen und zuordnen.')}
        </Callout>
      )}
      <div className="cr-panels">
        <Panel
          title={tt('Rufnummern')}
          sub={tt('Jede Nummer führt in ein Telefonmenü, zu einer Gruppe, einer Person oder ans Handy – oder in den normalen Ablauf.')}
          wide
          tour="number-list"
          actions={
            <button className="btn" onClick={() => setBuy(true)} disabled={!r.ready}>
              <Icon name="plus" size={14} /> {tt('Nummer kaufen')}
            </button>
          }
        >
          {r.numbers.length ? (
            <div className="cr-list">
              {r.numbers.map((n: any) => (
                <Item
                  key={n.id}
                  onClick={() => setEdit(n)}
                  side={
                    <>
                      <Badge tone={n.kind === 'main' ? 'blue' : 'purple'}>{KIND[n.kind] ? tt(KIND[n.kind]) : n.kind}</Badge>
                      {n.calls_30d > 0 && <Badge>{tt('{calls_30d} Anrufe / 30 Tage', { calls_30d: n.calls_30d })}</Badge>}
                      {n.managed && (
                        <button className="icon-btn" aria-label={tt('{number} freigeben', { number: n.number })} title={tt('An Twilio zurückgeben')} onClick={(e) => (e.stopPropagation(), void release(n))}>
                          <Icon name="trash" size={16} />
                        </button>
                      )}
                    </>
                  }
                >
                  <span className="tl-num">{phoneText(n.number)}</span> {n.label && <span className="muted">{n.label}</span>}
                  <div className="cr-sub">
                    {n.route_kind === 'default' ? tt('Normaler Ablauf') : `${r.route_kinds.find((k: any) => k.key === n.route_kind)?.label ?? n.route_kind}${n.route_label ? `: ${n.route_label}` : ''}`}
                    {n.kind === 'tracking' && (n.source || n.campaign) && tt(' · Kampagne {n}', { n: [n.source, n.medium, n.campaign].filter(Boolean).join(' / ') })}
                    {n.price && ` · ${n.price}`}
                  </div>
                </Item>
              ))}
            </div>
          ) : (
            <Empty>{tt('Noch keine Nummer. Trage deine Twilio-Nummern in den Telefonie-Einstellungen ein oder kaufe hier eine.')}</Empty>
          )}
          {r.released.length > 0 && (
            <p className="muted small" style={{ marginTop: 10 }}>
              {tt('Zurückgegeben:')} {r.released.map((n: any) => phoneText(n.number)).join(', ')}
            </p>
          )}
        </Panel>
        <Pools reg={r} reload={() => void reg.reload()} />
        <Report />
      </div>
      {edit && <NumberDialog n={edit} reg={r} onClose={() => setEdit(null)} onSaved={() => void reg.reload()} />}
      {buy && <BuyDialog reg={r} onClose={() => setBuy(false)} onBought={() => void reg.reload()} />}
    </Tl>
  );
}
