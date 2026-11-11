import { money, deDate } from './creator-kit.js';
import { A4, Page, fitLine, latin, pdfOf, sizeToFit, textW } from './creator-pdf.js';
import { tApp, type STFn } from '../i18n/index.js';

/**
 * The dunning letter as a PDF (A4): sender, recipient, subject, the claim in lines (invoice, fee, interest, flat fee, total),
 * the deadline and the bank details. Same facts as the e-mail, laid out for printing or forwarding.
 */

export interface LetterInput {
  title: string;
  /** Sender. */
  brand: { name: string; address?: string; email?: string; tax_id?: string; color?: string; iban?: string; bic?: string; bank?: string };
  recipient: { name: string; company?: string; address?: string; postal_code?: string; city?: string; country?: string };
  date: string;
  tz: string;
  reference: { number: string; issued_at: string; due_at: string };
  currency: string;
  amounts: { principal_cents: number; prior_fee_cents?: number; fee_cents: number; interest_cents: number; flat_fee_cents: number; total_cents: number; rate: number; days: number };
  levelLabel: string;
  deadline: string;
  /** Body text (already filled in). */
  body: string;
  invoiceUrl: string;
  smallBusiness?: boolean;
  /** The letter's language (the sub-account's); the instance default when left out. */
  t?: STFn;
}

export function dunningPdf(i: LetterInput): Buffer {
  return pdfOf([dunningPage(i)], { title: latin(`${i.levelLabel} ${i.reference.number}`) });
}

/** The laid-out letter (what `dunningPdf` writes). */
export function dunningPage(i: LetterInput): Page {
  const color = /^#[0-9a-f]{6}$/i.test(i.brand.color ?? '') ? i.brand.color! : '#1e3a8a';
  const t = i.t ?? tApp();
  const p = new Page();
  const L = 72;
  const R = A4.w - 72;
  const W = R - L;
  let y = 64;

  p.rect(0, 0, A4.w, 10, { fill: color });
  y += p.para(L, y - 2, latin(i.brand.name), W, 18, { bold: true, color, maxLines: 2 }) + 2;
  const sender = [i.brand.address, i.brand.email, i.brand.tax_id ? t('USt-ID/St.-Nr.: {id}', { id: i.brand.tax_id }) : ''].filter(Boolean).join('  ·  ');
  if (sender) y += p.para(L, y, latin(sender), W, 10, { color: '#64748b' });

  // address field
  y = Math.max(y + 36, 170);
  const date = latin(deDate(i.date, i.tz));
  // The address ends before the date on the right: long lines get smaller, then wrap.
  const AW = W - textW(date, 11) - 24;
  const ret = fitLine(latin(`${i.brand.name}${i.brand.address ? ` · ${i.brand.address.replace(/\s*\n\s*/g, ', ')}` : ''}`), 8, AW, { min: 7 });
  p.text(L, y - 18, ret.text, ret.size, { color: '#94a3b8' });
  const addr = [i.recipient.company, i.recipient.name, i.recipient.address, [i.recipient.postal_code, i.recipient.city].filter(Boolean).join(' '), i.recipient.country].filter((x) => x && String(x).trim());
  for (const line of addr) {
    const size = sizeToFit(latin(String(line)), 12, AW, { min: 10 });
    if (size) {
      p.text(L, y, latin(String(line)), size);
      y += 17;
    } else y += p.para(L, y, latin(String(line)), AW, 10, { maxLines: 3 }) + 3;
  }
  p.text(R, 170, date, 11, { anchor: 'end', color: '#475569' });

  y = Math.max(y + 40, 300);
  p.text(L, y, latin(t('{label} – Rechnung {number}', { label: i.levelLabel, number: i.reference.number })), 17, { bold: true });
  y += 36;
  y += p.para(L, y, latin(i.body), W, 11.5, { gap: 18 });

  // the claim
  const row = (label: string, value: string, o: { bold?: boolean; line?: boolean } = {}) => {
    if (o.line) p.line(L, y - 4, R, y - 4, { stroke: '#334155', sw: 1 });
    p.text(L, y, latin(label), 11.5, { bold: o.bold });
    p.text(R, y, latin(value), 11.5, { bold: o.bold, anchor: 'end' });
    y += 22;
  };
  const a = i.amounts;
  row(t('Rechnung {number} vom {date}, fällig am {due}', { number: i.reference.number, date: deDate(i.reference.issued_at, i.tz), due: deDate(i.reference.due_at, i.tz) }), money(a.principal_cents, i.currency));
  if (a.prior_fee_cents) row(t('Mahngebühren früherer Schreiben'), money(a.prior_fee_cents, i.currency));
  if (a.fee_cents) row(t('Mahngebühr ({label})', { label: i.levelLabel }), money(a.fee_cents, i.currency));
  if (a.interest_cents) row(t('Verzugszinsen {rate} % p. a. für {days} Tage', { rate: t.locale === 'de' ? String(a.rate).replace('.', ',') : String(a.rate), days: a.days }), money(a.interest_cents, i.currency));
  if (a.flat_fee_cents) row(t('Verzugspauschale gem. § 288 Abs. 5 BGB'), money(a.flat_fee_cents, i.currency));
  row(t('Gesamtforderung'), money(a.total_cents, i.currency), { bold: true, line: true });
  y += 8;
  y += p.para(L, y, latin(t('Bitte überweisen Sie den Betrag bis zum {date}.', { date: i.deadline })), W, 11.5, { bold: true, gap: 8 });
  if (i.brand.iban) {
    const bank = [t('Empfänger: {name}', { name: i.brand.name }), `IBAN: ${i.brand.iban}${i.brand.bic ? `   BIC: ${i.brand.bic}` : ''}`, i.brand.bank ? t('Bank: {bank}', { bank: i.brand.bank }) : '', t('Verwendungszweck: {ref}', { ref: i.reference.number })].filter(Boolean);
    for (const line of bank) {
      p.text(L, y, latin(line), 11);
      y += 16;
    }
  }
  y += 10;
  if (i.invoiceUrl) y += p.para(L, y, latin(t('Rechnung online ansehen und bezahlen: {url}', { url: i.invoiceUrl })), W, 10, { color: '#1d4ed8' });
  if (i.smallBusiness) y += p.para(L, y + 6, latin(t('Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.')), W, 9, { color: '#64748b' });

  p.text(L, A4.h - 56, latin(i.brand.name), 9, { color: '#94a3b8' });
  return p;
}
