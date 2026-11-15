import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp } from './helpers.js';

/** Neso fork: a sub-account's own currency (Settings → Company) is the default of new invoices, products and deals. */

let t: Awaited<ReturnType<typeof startTestApp>>;
let pipe: any;
let contactId = '';

beforeAll(async () => {
  t = await startTestApp();
  await t.setup();
  pipe = (await t.api.post('/api/pipelines', { name: 'Sales', stages: ['New', 'Offer'] })).data;
  contactId = (await t.api.post('/api/contacts', { first_name: 'Wanjiku', email: 'wanjiku@example.com' })).data.id;
});
afterAll(() => t.close());

describe('sub-account currency', () => {
  it('defaults to EUR, then follows the currency set under Settings → Company', async () => {
    expect((await t.api.post('/api/products', { name: 'Before', price_cents: 1000 })).data.currency).toBe('EUR');

    expect((await t.api.patch('/api/location', { settings: { currency: 'kes!' } })).status).toBe(400);
    const saved = await t.api.patch('/api/location', { settings: { currency: 'KES' } });
    expect(saved.status).toBe(200);
    expect(saved.data.settings.currency).toBe('KES');
    expect((await t.api.get('/api/me')).data.locations.find((l: any) => l.id === t.api.location).currency).toBe('KES');

    expect((await t.api.post('/api/products', { name: 'Consulting', price_cents: 2000000 })).data.currency).toBe('KES');
    const inv = await t.api.post('/api/invoices', { contact_id: contactId, title: 'Consulting', items: [{ name: 'Consulting', qty: 1, price_cents: 2000000, tax_rate: 16 }] });
    expect(inv.status).toBe(200);
    expect(inv.data.currency).toBe('KES');
    const deal = await t.api.post('/api/opportunities', { pipeline_id: pipe.id, contact_id: contactId, name: 'Website', value: 192000 });
    expect(deal.data.currency).toBe('KES');
    // an explicit currency still wins
    expect((await t.api.post('/api/opportunities', { pipeline_id: pipe.id, contact_id: contactId, name: 'Export', value: 100, currency: 'USD' })).data.currency).toBe('USD');
  });
});
