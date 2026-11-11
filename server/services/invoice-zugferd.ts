import type { App } from '../core/app.js';
import { HttpError } from '../core/http.js';
import { ciiXml } from './einvoice-cii.js';
import { buildEInvoice, type DocSnapshot } from './einvoice-model.js';
import { validateEInvoice, type ValidationResult } from './einvoice-validate.js';
import type { Inv } from './invoice-flow.js';
import { docTitle } from './invoice-model.js';
import { invoicePdfOf, pdfFilename } from './invoice-render.js';
import { FX_PROFILES, makeHybridPdf, readEmbeddedFiles, type FxProfile } from './zugferd-pdf.js';
import { tApp, tLoc, type STFn } from '../i18n/index.js';

/**
 * The ZUGFeRD / Factur-X file of a finalised invoice or credit note: the invoice PDF (the same one as the PDF download) with
 * the CII XML attached. Profile EN 16931 (default, guideline urn:cen.eu:en16931:2017) or XRECHNUNG (the XRechnung CIUS –
 * the attached XML is then byte for byte the XRechnung CII download). Same data requirements and the same own rule check as
 * the XRechnung; a file that would fail is refused with the list of what is missing.
 */

export interface ZugferdOut {
  pdf: Buffer;
  xml: string;
  /** Name of the XML inside the PDF (factur-x.xml or xrechnung.xml). */
  embedded: string;
  filename: string;
  profile: FxProfile;
  validation: ValidationResult;
  doc: DocSnapshot;
}

export const zugferdFilename = (doc: Pick<DocSnapshot, 'kind' | 'inv_type' | 'credit_type' | 'number'>, profile: FxProfile, t: STFn = tApp()) => pdfFilename(doc, t).replace(/\.pdf$/, profile === 'xrechnung' ? '-zugferd-xrechnung.pdf' : '-zugferd.pdf');

/** The CII of the profile (refuses like the XRechnung when information is missing or a rule fails). */
export function zugferdXml(doc: DocSnapshot, profile: FxProfile, t: STFn = tApp()): { xml: string; validation: ValidationResult } {
  const { einvoice, problems } = buildEInvoice(doc);
  if (problems.length) throw new HttpError(422, t('Für die ZUGFeRD-Rechnung fehlt noch etwas: {problems}', { problems: problems.map((p) => t(p.message)).join(' · ') }), { problems: problems.map((p) => t(p.message)) });
  const xml = ciiXml({ ...einvoice, customization: FX_PROFILES[profile].guideline });
  const validation = validateEInvoice(xml, { profile });
  if (!validation.valid) throw new HttpError(422, t('Die ZUGFeRD-Rechnung besteht die Prüfung nicht: {errors}', { errors: validation.errors.map((e) => `${e.rule}: ${t(e.message)}`).join(' · ') }), { errors: validation.errors });
  return { xml, validation };
}

export function zugferdOf(app: App, inv: Inv, profile: FxProfile = 'en16931'): ZugferdOut {
  if (inv.kind === 'estimate') throw new HttpError(409, 'Für Angebote gibt es keine E-Rechnung');
  if (!inv.finalised_at) throw new HttpError(409, 'Die ZUGFeRD-Rechnung gibt es erst, wenn die Rechnung festgeschrieben ist – vorher kann sich noch etwas ändern');
  const t = tLoc(app, inv.location_id);
  const base = invoicePdfOf(app, inv);
  const doc = base.doc;
  const { xml, validation } = zugferdXml(doc, profile, t);
  const fx = FX_PROFILES[profile];
  const title = `${t(docTitle(doc))} ${doc.number}`;
  const pdf = makeHybridPdf(base.pdf, {
    xml,
    profile,
    meta: {
      title,
      author: doc.seller.name || 'Neso CRM',
      subject: t('{title} an {customer}', { title, customer: doc.buyer.company || doc.buyer.name || t('Kunde') }),
      creator: t('HyperLevel Rechnungen'),
      producer: `HyperLevel (ZUGFeRD 2.3 / Factur-X 1.07, ${fx.conformance})`,
      date: String(inv.finalised_at),
    },
  });
  // what leaves must read back as written
  const back = readEmbeddedFiles(pdf).find((f) => f.name === fx.filename);
  if (!back || !back.af || back.data.toString('utf8') !== xml) throw new Error('Interner Fehler: der ZUGFeRD-Anhang ist nicht lesbar');
  return { pdf, xml, embedded: fx.filename, filename: zugferdFilename(doc, profile, t), profile, validation, doc };
}
