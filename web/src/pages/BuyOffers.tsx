import { useEffect, useState } from 'react';
import { api, d, money } from '../api';
import { Icon } from '../icons';
import { Badge, Check, Field, Input, Select, Textarea, act, useLoad } from '../ui';
import { useT } from '../i18n';

/** „Kauf-Link“ dialog: order bump, one-click upsell and discount codes of a product. */

const fields = ['bump_product_id', 'bump_title', 'bump_text', 'upsell_product_id', 'upsell_title', 'upsell_text', 'stripe_promo'] as const;

export function useBuyOffers(product: any, open: boolean) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    setData(null);
    if (open)
      api
        .get(`/api/buy-offers/${product.id}`)
        .then(setData)
        .catch(() => setData(null));
  }, [open, product.id]);
  const save = async () => {
    if (!data) return true;
    const r = await act(() => api.put(`/api/buy-offers/${product.id}`, Object.fromEntries(fields.map((k) => [k, data[k]]))));
    if (r) setData(r);
    return !!r;
  };
  return { ui: open && data ? <BuyOffersFields product={product} data={data} setData={setData} /> : null, save };
}

function BuyOffersFields({ product, data, setData }: { product: any; data: any; setData: (d: any) => void }) {
  const tt = useT('x_agency');
  const products = useLoad(() => api.get<any[]>('/api/products'), []);
  const [code, setCode] = useState({ code: '', kind: 'percent', value: '', max_uses: '', expires_at: '' });
  const set = (patch: any) => setData({ ...data, ...patch });
  const extras = (products.data ?? []).filter((p) => p.id !== product.id && !p.recurring && p.active !== 0 && p.currency === product.currency);
  const opts = extras.map((p) => [p.id, `${p.name} (${money(p.price_cents, p.currency)}${p.tax_rate ? tt(' + USt.') : ''})`] as [string, string]);
  const bump = extras.find((p) => p.id === data.bump_product_id);
  const upsell = extras.find((p) => p.id === data.upsell_product_id);
  const u = data.upsells ?? {};
  const addCode = async () => {
    const value = code.kind === 'amount' ? Math.round(Number(String(code.value).replace(',', '.')) * 100) : Number(code.value);
    const r = await act(() => api.post(`/api/buy-offers/${product.id}/coupons`, { ...code, value, max_uses: code.max_uses || null, expires_at: code.expires_at || null }), tt('Code angelegt'));
    if (r) {
      setData({ ...data, coupons: r.coupons });
      setCode({ code: '', kind: code.kind, value: '', max_uses: '', expires_at: '' });
    }
  };
  const couponAct = async (fn: () => Promise<any>) => {
    const r = await act(fn);
    if (r) setData({ ...data, coupons: r.coupons });
  };

  return (
    <div className="offers" data-tour="buy-offers">
      <div className="offer-sec">
        <h4>
          <Icon name="products" size={16} /> {tt('Order-Bump')} <span className="muted small">{tt('– Zusatzprodukt als Häkchen auf der Kaufseite')}</span>
        </h4>
        <Select value={data.bump_product_id} onChange={(v) => set({ bump_product_id: v })} placeholder={tt('kein Order-Bump')} options={opts} />
        {bump && (
          <div className="grid2">
            <Field label={tt('Text am Häkchen')}>
              <Input value={data.bump_title} onChange={(v) => set({ bump_title: v })} placeholder={tt('Ja, „{name}“ für … dazunehmen (automatisch mit Preis)', { name: bump.name })} />
            </Field>
            <Field label={tt('Beschreibung (optional)')}>
              <Input value={data.bump_text} onChange={(v) => set({ bump_text: v })} placeholder={bump.description || tt('Warum sich das lohnt …')} />
            </Field>
          </div>
        )}
      </div>

      <div className="offer-sec">
        <h4>
          <Icon name="sparkles" size={16} /> {tt('One-Click-Upsell')} <span className="muted small">{tt('– Angebot direkt nach dem Kauf')}</span>
        </h4>
        {product.recurring ? (
          <p className="muted small">{tt('Upsells gehen nur nach Einmalkäufen, nicht nach Abos.')}</p>
        ) : (
          <>
            <Select value={data.upsell_product_id} onChange={(v) => set({ upsell_product_id: v })} placeholder={tt('kein Upsell')} options={opts} />
            {upsell && (
              <>
                <div className="grid2">
                  <Field label={tt('Überschrift')}>
                    <Input value={data.upsell_title} onChange={(v) => set({ upsell_title: v })} placeholder={upsell.name} />
                  </Field>
                  <Field label={tt('Text (optional)')}>
                    <Textarea value={data.upsell_text} onChange={(v) => set({ upsell_text: v })} rows={2} placeholder={upsell.description || tt('Was der Käufer zusätzlich bekommt …')} />
                  </Field>
                </div>
                <p className="muted small" style={{ marginTop: 0 }}>
                  {tt('Stripe speichert beim Kauf die Zahlungsart; „Ja, hinzufügen“ bucht mit einem Klick ab und schickt eine eigene Rechnung. Will die Bank eine Bestätigung (3-D Secure), geht es über eine normale Stripe-Bezahlseite weiter.')}
                </p>
              </>
            )}
            {u.offered > 0 && (
              <p className="small" style={{ margin: '4px 0 0' }}>
                {tt('Bisher {offered}× angeboten ·', { offered: u.offered })} <Badge tone="green">{tt('{n} angenommen', { n: u.accepted })}</Badge> · {tt('{n} abgelehnt', { n: u.declined })}{u.fallback ? tt(' · {fallback} über Bezahlseite', { fallback: u.fallback }) : ''}
              </p>
            )}
          </>
        )}
      </div>

      <div className="offer-sec">
        <h4>
          <Icon name="tag" size={16} /> {tt('Rabattcodes')}
        </h4>
        <Check checked={!!data.stripe_promo} onChange={(v) => set({ stripe_promo: v })} label={tt('Gutscheincodes aus Stripe (Promotion Codes) auf der Bezahlseite erlauben')} />
        {product.recurring ? (
          <p className="muted small">{tt('Eigene Codes gibt es für Einmal-Produkte; für Abos die Stripe-Gutscheine nutzen.')}</p>
        ) : (
          <>
            {data.coupons.length > 0 && (
              <table className="t coupons">
                <thead>
                  <tr>
                    <th>{tt('Code')}</th>
                    <th>{tt('Rabatt')}</th>
                    <th>{tt('Genutzt')}</th>
                    <th>{tt('Gültig bis')}</th>
                    <th>{tt('Aktiv')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.coupons.map((c: any) => (
                    <tr key={c.id} className={c.active ? '' : 'archived'}>
                      <td>
                        <code>{c.code}</code>
                      </td>
                      <td>{c.kind === 'amount' ? `−${money(c.value, product.currency)}` : `−${c.value} %`}</td>
                      <td>
                        {c.uses}
                        {c.max_uses ? ` / ${c.max_uses}` : ''}
                      </td>
                      <td>{c.expires_at ? d(c.expires_at) : '–'}</td>
                      <td>
                        <input type="checkbox" checked={c.active} onChange={(e) => couponAct(() => api.patch(`/api/buy-coupons/${c.id}`, { active: e.target.checked }))} aria-label={tt('{code} aktiv', { code: c.code })} />
                      </td>
                      <td>
                        <button className="icon-btn" aria-label={tt('{code} löschen', { code: c.code })} title={tt('Löschen')} onClick={() => couponAct(() => api.del(`/api/buy-coupons/${c.id}`))}>
                          <Icon name="trash" size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="coupon-add">
              <Input value={code.code} onChange={(v) => setCode({ ...code, code: v.toUpperCase() })} placeholder={tt('CODE, z. B. SOMMER20')} aria-label={tt('Neuer Code')} />
              <Select
                value={code.kind}
                onChange={(v) => setCode({ ...code, kind: v })}
                options={[
                  ['percent', '%'],
                  ['amount', product.currency === 'EUR' ? '€' : product.currency],
                ]}
              />
              <Input value={code.value} onChange={(v) => setCode({ ...code, value: v })} placeholder={code.kind === 'amount' ? tt('Betrag') : tt('Prozent')} inputMode="decimal" aria-label={tt('Rabatt')} />
              <Input value={code.max_uses} onChange={(v) => setCode({ ...code, max_uses: v.replace(/\D/g, '') })} placeholder={tt('max. Einlösungen')} inputMode="numeric" aria-label={tt('Höchstens einlösbar')} />
              <Input type="date" value={code.expires_at} onChange={(v) => setCode({ ...code, expires_at: v })} aria-label={tt('Gültig bis')} />
              <button className="btn small secondary" disabled={!code.code || !code.value} onClick={addCode}>
                {tt('+ Code')}
              </button>
            </div>
            <p className="muted small" style={{ margin: '4px 0 0' }}>
              {tt('Käufer geben den Code auf der Kaufseite ein; der Rabatt steht als eigene Zeile auf der Rechnung. Beträge sind Brutto-Beträge.')}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
