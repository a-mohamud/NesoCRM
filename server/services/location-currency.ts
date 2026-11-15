/**
 * Neso fork: a sub-account's own currency (location settings.currency, e.g. KES). New invoices, products and deals start
 * in it when the request names none; EUR when it is not set (the upstream behaviour).
 */
export const CURRENCY_RE = /^[A-Z]{3}$/;

/** The currencies offered in Settings → Company (any ISO 4217 code is accepted by the API). */
export const COMPANY_CURRENCIES = ['KES', 'UGX', 'TZS', 'RWF', 'ETB', 'SOS', 'USD', 'EUR', 'GBP', 'AED', 'CHF'] as const;

export function locationCurrency(app: { location(id: string): { settings?: any } | undefined }, locationId: string | null | undefined): string {
  const c = locationId ? app.location(locationId)?.settings?.currency : undefined;
  return typeof c === 'string' && CURRENCY_RE.test(c) ? c : 'EUR';
}
