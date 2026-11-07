import { useState } from 'react';
import { defaultInput } from '../../../server/services/calc-engine';
import { EST_YEARS, SOLI_FREIGRENZE } from '../../../server/services/calc-tax';
import { Chk, N, NumList, Sec, Sel, T, useCalc } from './CalcKit';
import { useT } from '../i18n';

/**
 * The input panel of the Gewinnrechner: seven groups that edit the engine's JSON input field by field. Every number
 * field shows the unit and – as a tooltip – the description of calc-spec.ts; lists (Tarife, Add-ons, Zahlungsarten …)
 * can grow and shrink within the limits of the spec.
 */

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
const pct = (v: number) => `${Math.round(v * 10) / 10}`.replace('.', ',');

function Remove({ onClick, label, disabled }: { onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" className="icon-btn" onClick={onClick} disabled={disabled} aria-label={label} title={label}>
      ✕
    </button>
  );
}

// --- Preismodell -------------------------------------------------------------------------------------------------------

function Plans() {
  const tt = useT('x_finance');
  const { input, update } = useCalc();
  const plans = input.pricing.plans;
  const total = sum(plans.map((p) => p.mix));
  // Plans fold away (a model with six tariffs is long); the first one starts open.
  const [open, setOpen] = useState<number[]>([0]);
  const move = (i: number, d: number) => {
    update((x) => {
      const j = i + d;
      if (j < 0 || j >= x.pricing.plans.length) return;
      [x.pricing.plans[i], x.pricing.plans[j]] = [x.pricing.plans[j], x.pricing.plans[i]];
      if (x.matrix.plan_index === i) x.matrix.plan_index = j;
      else if (x.matrix.plan_index === j) x.matrix.plan_index = i;
    });
    setOpen([i + d]);
  };
  const price = (v: number) => `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(v)} €`;
  return (
    <>
      {plans.map((pl, i) => (
        <details
          className="calc-plan"
          key={i}
          open={open.includes(i)}
          data-tour={i === 0 ? 'calc-plan-first' : undefined}
          onToggle={(e) => {
            const on = (e.currentTarget as HTMLDetailsElement).open;
            setOpen((o) => (on ? (o.includes(i) ? o : [...o, i]) : o.includes(i) ? o.filter((x) => x !== i) : o));
          }}
        >
          <summary>
            <span className="calc-plan-no">{i + 1}</span>
            <strong>{pl.name || tt('Tarif {v}', { v: i + 1 })}</strong>
            <span className="muted small">
              {price(pl.base_price)}
              {pl.unit_price > 0 ? tt(' + {price}/Einheit', { price: price(pl.unit_price) }) : ''} {tt('· {pct} % der Kunden', { pct: pct(pl.mix) })}
            </span>
          </summary>
          <div className="calc-plan-body">
            <div className="calc-plan-head">
              <T p={`pricing.plans.${i}.name`} label={tt('Name des Tarifs')} />
              <span className="calc-plan-tools">
                <button type="button" className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label={tt('Nach oben')} title={tt('Nach oben')}>
                  ↑
                </button>
                <button type="button" className="icon-btn" onClick={() => move(i, 1)} disabled={i === plans.length - 1} aria-label={tt('Nach unten')} title={tt('Nach unten')}>
                  ↓
                </button>
                <Remove
                  label={tt('Tarif {v} entfernen', { v: pl.name || i + 1 })}
                  disabled={plans.length < 2}
                  onClick={() => {
                    update((x) => {
                      x.pricing.plans.splice(i, 1);
                      x.matrix.plan_index = Math.min(x.matrix.plan_index, x.pricing.plans.length - 1);
                    });
                    setOpen([0]);
                  }}
                />
              </span>
            </div>
            <div className="calc-grid-f">
              <N p={`pricing.plans.${i}.mix`} label={tt('Kunden-Anteil')} />
              <N p={`pricing.plans.${i}.base_price`} label={tt('Grundpreis')} />
              <N p={`pricing.plans.${i}.included_units`} label={tt('Inklusive Einheiten')} unit={tt('Stück')} />
              <N p={`pricing.plans.${i}.unit_price`} label={tt('Je weitere Einheit')} />
              <N p={`pricing.plans.${i}.cap`} label={tt('Deckel (0 = keiner)')} />
              <N p={`pricing.plans.${i}.setup_fee`} label={tt('Einrichtung einmalig')} />
              <N p={`pricing.plans.${i}.users`} label={tt('Nutzer je Kunde')} unit="Nutzer" />
              <N p={`pricing.plans.${i}.avg_units`} label={tt('Ø Einheiten (0 = Vorgabe)')} unit={tt('Stück')} />
              <N p={`pricing.plans.${i}.extra_cost`} label={tt('Zusatzkosten')} />
              <T p={`pricing.plans.${i}.note`} label={tt('Hinweis')} wide />
            </div>
          </div>
        </details>
      ))}
      <div className="calc-list-foot">
        <button
          type="button"
          className="btn secondary small"
          disabled={plans.length >= 12}
          data-tour="calc-plan-add"
          onClick={() => {
            update((x) => {
              const base = defaultInput().pricing.plans[0];
              x.pricing.plans.push({ ...base, name: `Tarif ${x.pricing.plans.length + 1}`, mix: 10 });
            });
            setOpen((o) => [...o, plans.length]);
          }}
        >
          {tt('+ Tarif hinzufügen')}
        </button>
        <span className={`small ${Math.abs(total - 100) > 0.5 ? 'calc-warn' : 'muted'}`}>{tt('Summe der Anteile: {pct} %', { pct: pct(total) })}{Math.abs(total - 100) > 0.5 ? tt(' – wird auf 100 % hochgerechnet') : ''}</span>
      </div>
    </>
  );
}

function Addons() {
  const tt = useT('x_finance');
  const { input, update } = useCalc();
  const list = input.pricing.addons;
  return (
    <>
      {list.map((a, i) => (
        <div className="calc-row" key={i}>
          <T p={`pricing.addons.${i}.name`} label={tt('Add-on')} />
          <N p={`pricing.addons.${i}.price`} label={tt('Preis')} />
          <N p={`pricing.addons.${i}.take_rate`} label={tt('Buchen es')} />
          <Chk p={`pricing.addons.${i}.per_unit`} label={tt('je Einheit')} />
          <Remove label={tt('Add-on {name} entfernen', { name: a.name })} onClick={() => update((x) => void x.pricing.addons.splice(i, 1))} />
        </div>
      ))}
      <button type="button" className="btn secondary small" disabled={list.length >= 12} onClick={() => update((x) => void x.pricing.addons.push({ name: `Add-on ${x.pricing.addons.length + 1}`, price: 19, take_rate: 10, per_unit: false }))}>
        {tt('+ Add-on')}
      </button>
    </>
  );
}

function PricingSection() {
  const tt = useT('x_finance');
  return (
    <Sec title={tt('Preismodell')} tour="calc-pricing" open hint={tt('Tarife, Staffeln, Rabatt')}>
      <Sel
        p="pricing.price_basis"
        label={tt('Preise sind')}
        options={[
          ['net', tt('Netto (ohne USt)')],
          ['gross', tt('Brutto (inkl. USt)')],
        ]}
      />
      <p className="muted small calc-note">{tt('Pro Tarif: Grundpreis plus Stufenpreis je Einheit über den inklusiven hinaus, begrenzt durch den Deckel. Einheiten sind Standorte, Plätze oder Kunden-Accounts.')}</p>
      <Plans />
      <h4>{tt('Jahreszahlung')}</h4>
      <div className="calc-grid-f">
        <N p="pricing.annual.share" label={tt('Zahlen jährlich')} />
        <N p="pricing.annual.discount" label={tt('Rabatt')} />
      </div>
      <h4>{tt('Add-ons')}</h4>
      <Addons />
    </Sec>
  );
}

// --- Kunden -------------------------------------------------------------------------------------------------------------

function UnitMix() {
  const tt = useT('x_finance');
  const { input, update } = useCalc();
  const list = input.customers.unit_mix;
  const total = sum(list.map((u) => u.share));
  return (
    <>
      {list.map((_, i) => (
        <div className="calc-row" key={i}>
          <N p={`customers.unit_mix.${i}.units`} label={tt('Einheiten')} unit={tt('Stück')} />
          <N p={`customers.unit_mix.${i}.share`} label={tt('Anteil der Kunden')} />
          <Remove label={tt('Zeile entfernen')} onClick={() => update((x) => void x.customers.unit_mix.splice(i, 1))} />
        </div>
      ))}
      <div className="calc-list-foot">
        <button type="button" className="btn secondary small" disabled={list.length >= 12} onClick={() => update((x) => void x.customers.unit_mix.push({ units: 1, share: 0 }))}>
          {tt('+ Verteilung')}
        </button>
        {list.length > 0 && <span className={`small ${Math.abs(total - 100) > 0.5 ? 'calc-warn' : 'muted'}`}>{tt('Summe: {pct} %', { pct: pct(total) })}</span>}
      </div>
    </>
  );
}

function CustomersSection() {
  const tt = useT('x_finance');
  return (
    <Sec title={tt('Kunden')} tour="calc-customers" open hint={tt('Anzahl, Kündigungen, Wachstum')}>
      <div className="calc-grid-f">
        <N p="customers.count" label={tt('Zahlende Kunden')} unit="Kunden" />
        <N p="customers.avg_units" label={tt('Ø Einheiten je Kunde')} unit={tt('Stück')} />
        <N p="customers.churn" label={tt('Kündigungen')} />
        <N p="customers.max_lifetime_months" label={tt('Höchste Laufzeit')} />
        <N p="customers.b2b_share" label={tt('Geschäftskunden')} />
        <N p="customers.eu_share" label={tt('Kunden im EU-Ausland')} />
      </div>
      <h4>{tt('Verteilung der Einheiten')}</h4>
      <p className="muted small calc-note">{tt('Genauer als ein Durchschnitt: Deckel und inklusive Einheiten wirken nicht linear. Leer lassen = alle Kunden haben den Durchschnitt.')}</p>
      <UnitMix />
      <h4>{tt('Wachstum (für die Prognose)')}</h4>
      <div className="calc-grid-f">
        <N p="customers.growth.start" label={tt('Kunden zu Beginn')} unit="Kunden" />
        <N p="customers.growth.monthly_new" label={tt('Neukunden pro Monat')} unit="Kunden" />
        <N p="customers.growth.monthly_new_growth" label={tt('Wachstum der Neukunden')} />
        <N p="customers.growth.months" label={tt('Länge der Prognose')} />
      </div>
    </Sec>
  );
}

// --- Umsatzsteuer, Kosten -------------------------------------------------------------------------------------------------

function VatSection() {
  const tt = useT('x_finance');
  const { input } = useCalc();
  return (
    <Sec title={tt('Umsatzsteuer')} tour="calc-vat" hint={tt('19 / 7 / 0 %, Kleinunternehmer')}>
      <Chk p="vat.kleinunternehmer" label={tt('Kleinunternehmer (§ 19 UStG): keine USt, keine Vorsteuer')} />
      <div className="calc-grid-f">
        <Sel
          p="vat.rate"
          label={tt('Steuersatz Inland')}
          options={[
            ['19', '19 %'],
            ['7', '7 %'],
            ['0', '0 %'],
          ]}
        />
        <N p="vat.eu_b2c_rate" label={tt('USt EU-Privatkunden')} />
        {input.vat.kleinunternehmer && <N p="vat.input_rate" label={tt('Vorsteuer der Einkäufe')} />}
      </div>
      <p className="muted small calc-note">{tt('EU-Firmenkunden zahlen ohne deutsche USt (Reverse Charge), EU-Privatkunden die USt ihres Landes. Zahlungsgebühren fallen auf den Brutto-Betrag an.')}</p>
    </Sec>
  );
}

function Methods() {
  const tt = useT('x_finance');
  const { input, update } = useCalc();
  const list = input.costs.variable.payment.methods;
  const total = sum(list.map((m) => m.share));
  return (
    <>
      {list.map((m, i) => (
        <div className="calc-plan slim" role="group" aria-label={tt('Zahlungsart {label}', { label: m.label })} key={i}>
          <div className="calc-plan-head">
            <T p={`costs.variable.payment.methods.${i}.label`} label={tt('Zahlungsart')} />
            <Remove label={tt('{label} entfernen', { label: m.label })} onClick={() => update((x) => void x.costs.variable.payment.methods.splice(i, 1))} />
          </div>
          <div className="calc-grid-f">
            <N p={`costs.variable.payment.methods.${i}.share`} label={tt('Anteil')} />
            <N p={`costs.variable.payment.methods.${i}.pct`} label={tt('Gebühr in %')} />
            <N p={`costs.variable.payment.methods.${i}.fixed`} label={tt('Fest je Abbuchung')} />
            <N p={`costs.variable.payment.methods.${i}.cap`} label={tt('Höchstgebühr (0 = keine)')} />
          </div>
        </div>
      ))}
      <div className="calc-list-foot">
        <button type="button" className="btn secondary small" disabled={list.length >= 8} onClick={() => update((x) => void x.costs.variable.payment.methods.push({ label: tt('PayPal'), share: 0, pct: 2.99, fixed: 0.39, cap: 0 }))}>
          {tt('+ Zahlungsart')}
        </button>
        {list.length > 0 && <span className={`small ${Math.abs(total - 100) > 0.5 ? 'calc-warn' : 'muted'}`}>{tt('Summe: {pct} %', { pct: pct(total) })}</span>}
      </div>
    </>
  );
}

function CostLine({ p, title }: { p: string; title: string }) {
  const tt = useT('x_finance');
  return (
    <>
      <h5>{tt('{title} (€ pro Monat)', { title: title })}</h5>
      <div className="calc-grid-f three">
        <N p={`${p}.per_customer`} label={tt('je Kunde')} unit="" compact />
        <N p={`${p}.per_user`} label={tt('je Nutzer')} unit="" compact />
        <N p={`${p}.per_unit`} label={tt('je Einheit')} unit="" compact />
      </div>
    </>
  );
}

function CostsSection() {
  const tt = useT('x_finance');
  return (
    <Sec title={tt('Variable Kosten')} tour="calc-costs" hint={tt('Gebühren, Hosting, KI, Support')}>
      <h4>{tt('Zahlungsanbieter')}</h4>
      <Methods />
      <h4>{tt('Kosten, die mit jedem Kunden steigen')}</h4>
      <CostLine p="costs.variable.hosting" title={tt('Hosting')} />
      <CostLine p="costs.variable.ai" title={tt('KI-Token')} />
      <CostLine p="costs.variable.messaging" title={tt('E-Mail/SMS')} />
      <h5>{tt('Support')}</h5>
      <div className="calc-grid-f">
        <N p="costs.variable.support.minutes_per_customer" label={tt('Minuten je Kunde')} />
        <N p="costs.variable.support.hourly_rate" label={tt('Stundensatz')} />
      </div>
      <h5>{tt('Sonstiges')}</h5>
      <div className="calc-grid-f">
        <N p="costs.variable.other.per_customer" label={tt('je Kunde')} />
        <N p="costs.variable.other.pct_of_revenue" label={tt('vom Netto-Umsatz')} />
      </div>
      <h5>{tt('Partner-Provision')}</h5>
      <div className="calc-grid-f">
        <N p="costs.variable.referral.commission_pct" label={tt('Provision')} />
        <N p="costs.variable.referral.share" label={tt('Kunden über Partner')} />
      </div>
      <h5>{tt('App-Store')}</h5>
      <div className="calc-grid-f">
        <N p="costs.variable.app_store.fee_pct" label={tt('Store-Gebühr')} />
        <N p="costs.variable.app_store.share" label={tt('Kunden über den Store')} />
      </div>
    </Sec>
  );
}

function FixedSection() {
  const tt = useT('x_finance');
  return (
    <Sec title={tt('Fixkosten & Kundengewinnung')} tour="calc-fixed" hint={tt('pro Monat, CAC')}>
      <div className="calc-grid-f">
        <N p="costs.fixed.servers_tools" label={tt('Server & Tools')} />
        <N p="costs.fixed.salaries" label={tt('Gehälter')} />
        <N p="costs.fixed.insurance" label={tt('Versicherungen')} />
        <N p="costs.fixed.marketing" label={tt('Marketing')} />
        <N p="costs.fixed.other" label={tt('Sonstiges')} />
        <N p="costs.fixed.one_time" label={tt('Einmalige Investition')} />
        <N p="costs.cac" label={tt('Kosten je Neukunde (CAC)')} />
      </div>
    </Sec>
  );
}

// --- Steuern ----------------------------------------------------------------------------------------------------------------

const EST_FIELDS: [string, string][] = [
  ['grundfreibetrag', 'Grundfreibetrag'],
  ['zone2_end', 'Ende Zone 2'],
  ['zone3_end', 'Ende Zone 3'],
  ['zone4_end', 'Beginn Reichensteuer'],
  ['y_a', 'Zone 2: Faktor y²'],
  ['y_b', 'Zone 2: Faktor y'],
  ['z_a', 'Zone 3: Faktor z²'],
  ['z_b', 'Zone 3: Faktor z'],
  ['z_c', 'Zone 3: Betrag'],
  ['rate4', 'Spitzensteuersatz (Faktor)'],
  ['sub4', 'Spitzensteuersatz: Abzug'],
  ['rate5', 'Reichensteuersatz (Faktor)'],
  ['sub5', 'Reichensteuersatz: Abzug'],
];

function TaxSection() {
  const tt = useT('x_finance');
  const { input, set, update } = useCalc();
  const form = input.tax.legal_form;
  const year = input.tax.est.year;
  const builtIn = EST_YEARS[year] && JSON.stringify(EST_YEARS[year]) === JSON.stringify(input.tax.est);
  return (
    <Sec title={tt('Steuern')} tour="calc-tax" hint={tt('ESt, GewSt, KSt – Schätzung')}>
      <p className="calc-disclaimer-s">{tt('Schätzung, keine Steuerberatung. Vereinfacht gerechnet: ohne Verlustvortrag, Kinderfreibeträge und Sonderfälle.')}</p>
      <Sel
        p="tax.legal_form"
        label={tt('Rechtsform')}
        options={[
          ['einzelunternehmen', tt('Einzelunternehmen / Freiberufler (Einkommensteuer)')],
          ['kapitalgesellschaft', tt('GmbH / UG (Körperschaftsteuer)')],
          ['keine', tt('Keine Steuern (Ergebnis vor Steuern)')],
        ]}
      />
      {form === 'einzelunternehmen' && (
        <>
          <label className="calc-f" title={tt('2024–2026 sind eingebaut; die Tarifwerte darunter lassen sich bearbeiten')}>
            <span>{tt('Steuerjahr der Tarifwerte')}</span>
            <span className="calc-in">
              <select
                aria-label={tt('Steuerjahr')}
                value={builtIn ? String(year) : 'custom'}
                onChange={(e) => {
                  const y = Number(e.target.value);
                  if (!EST_YEARS[y]) return;
                  update((x) => {
                    x.tax.est = { ...EST_YEARS[y] };
                    x.tax.soli.freigrenze = SOLI_FREIGRENZE[y];
                  });
                }}
              >
                {Object.keys(EST_YEARS).map((y) => (
                  <option key={y} value={y}>
                    {y}
                    {Number(y) === 2026 ? tt(' (aktuell, Steuerfortentwicklungsgesetz)') : ''}
                  </option>
                ))}
                {!builtIn && <option value="custom">{tt('Angepasst')}</option>}
              </select>
            </span>
          </label>
          <div className="calc-grid-f">
            <Chk p="tax.joint" label={tt('Zusammenveranlagung (Splitting)')} />
            <Chk p="tax.church.enabled" label={tt('Kirchensteuer')} />
            {input.tax.church.enabled && <N p="tax.church.rate" label={tt('Kirchensteuersatz')} />}
            <N p="tax.other_income" label={tt('Weitere Einkünfte')} />
            <N p="tax.deductions" label={tt('Weitere Abzüge')} />
            <N p="tax.vorsorge_monat" label={tt('Kranken-/Rentenversicherung')} />
            <N p="tax.soli.rate" label={tt('Soli')} />
            <N p="tax.soli.freigrenze" label={tt('Soli-Freigrenze')} />
          </div>
          <details className="calc-sub">
            <summary>{tt('Tarifwerte § 32a EStG bearbeiten')}</summary>
            <div className="calc-grid-f">
              {EST_FIELDS.map(([k, l]) => (
                <N key={k} p={`tax.est.${k}`} label={tt(l)} />
              ))}
            </div>
            <button type="button" className="btn ghost small" onClick={() => set('tax.est', { ...EST_YEARS[2026] })}>
              {tt('Auf 2026 zurücksetzen')}
            </button>
          </details>
        </>
      )}
      {form === 'kapitalgesellschaft' && (
        <div className="calc-grid-f">
          <N p="tax.kst.rate" label={tt('Körperschaftsteuer')} />
          <N p="tax.kst.soli_rate" label={tt('Soli auf die KSt')} />
          <N p="tax.kst.distribution_pct" label={tt('Ausschüttung an den Inhaber')} />
          <N p="tax.kst.dividend_rate" label={tt('Steuer auf Ausschüttung')} />
        </div>
      )}
      {form !== 'keine' && (
        <>
          <h4>{tt('Gewerbesteuer')}</h4>
          <Chk p="tax.gewerbesteuer.enabled" label={tt('Gewerbesteuer berechnen (Freiberufler: aus)')} />
          {input.tax.gewerbesteuer.enabled && (
            <div className="calc-grid-f">
              <N p="tax.gewerbesteuer.hebesatz" label={tt('Hebesatz')} />
              <N p="tax.gewerbesteuer.messzahl" label={tt('Messzahl')} />
              {form === 'einzelunternehmen' && <N p="tax.gewerbesteuer.freibetrag" label={tt('Freibetrag')} />}
              <N p="tax.gewerbesteuer.hinzurechnung" label={tt('Hinzurechnungen')} />
              {form === 'einzelunternehmen' && <N p="tax.gewerbesteuer.s35_factor" label={tt('Anrechnung § 35 (Faktor)')} />}
            </div>
          )}
        </>
      )}
    </Sec>
  );
}

// --- Matrix ------------------------------------------------------------------------------------------------------------------

function MatrixSection() {
  const tt = useT('x_finance');
  const { input } = useCalc();
  const cols = input.matrix.columns;
  return (
    <Sec title={tt('Tabelle (Matrix)')} tour="calc-matrix-settings" hint={tt('Zeilen und Spalten')}>
      <NumList p="matrix.customers" label={tt('Zeilen: Kundenzahlen (mit ; trennen)')} />
      <Sel
        p="matrix.columns"
        label={tt('Spalten')}
        options={[
          ['price', tt('Grundpreise')],
          ['factor', tt('Preisfaktoren')],
          ['plan', tt('Ein Tarif je Spalte')],
        ]}
      />
      {cols === 'price' && <NumList p="matrix.prices" label={tt('Grundpreise je Monat')} max={12} />}
      {cols === 'factor' && <NumList p="matrix.factors" label={tt('Faktoren (1 = aktuelle Preise)')} max={12} />}
      {cols !== 'plan' && input.pricing.plans.length > 1 && (
        <Sel p="matrix.plan_index" label={tt('Tarif, dessen Preis sich ändert')} options={input.pricing.plans.map((p, i): [string, string] => [String(i), p.name || `Tarif ${i + 1}`])} />
      )}
      <N p="matrix.sensitivity_pct" label={tt('Schwankung für die Hebel-Analyse')} />
    </Sec>
  );
}

export function CalcInputs() {
  return (
    <div className="calc-sections" data-tour="calc-inputs">
      <PricingSection />
      <CustomersSection />
      <VatSection />
      <CostsSection />
      <FixedSection />
      <TaxSection />
      <MatrixSection />
    </div>
  );
}
