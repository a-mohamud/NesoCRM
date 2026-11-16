import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp } from './helpers.js';
import { EMPTY_FACTS, cleanProfile, docToHtml, type Facts, type LegalProfile } from '../server/services/legal-texts.js';
import { KE_LEGAL_NOTICE, KE_TODO_PREFIX, kenyaCompany, kenyaDpa, kenyaPrivacy, kenyaTerms, kindsFor, publicKind } from '../server/services/legal-texts-ke.js';
import { docPdf } from '../server/services/legal-pdf.js';

/** Kenyan legal documents (company information, privacy policy, terms, data processing agreement) – Neso fork. */

const ke = (extra: Partial<LegalProfile> = {}): LegalProfile =>
  cleanProfile({
    jurisdiction: 'ke',
    ke_form: 'ltd',
    company: 'Neso Example Appliances Limited',
    trading_name: 'Neso Kitchens',
    owner: 'Amina Example, Juma Example',
    brs_no: 'PVT-AB1CD2EF',
    kra_pin: 'p051234567x',
    vat_registered: true,
    building: 'Example Plaza, 3rd Floor',
    street: 'Example Road',
    city: 'Nairobi',
    county: 'Nairobi City County',
    po_box: 'P.O. Box 12345-00100, Nairobi',
    phone: '+254 700 000 000',
    email: 'info@example.co.ke',
    website: 'https://example.co.ke',
    hosting: 'Hostinger International Ltd. (servers in Germany)',
    ...extra,
  });
const facts = (extra: Partial<Facts> = {}): Facts => ({ ...EMPTY_FACTS, ...extra });
const text = (d: { sections: { heading: string; body: string }[] }) => d.sections.map((s) => `${s.heading}\n${s.body}`).join('\n\n');
const heads = (d: { sections: { heading: string }[] }) => d.sections.map((s) => s.heading);
/** Every gap marker in the text is listed in `missing`, and a document without gaps has no marker. */
const gapsListed = (d: { sections: { heading: string; body: string }[]; missing: string[] }) => {
  const markers = text(d).match(/\[please complete: [^\]]+\]/g) ?? [];
  expect(markers.length > 0, `markers ${markers.join(', ')} vs missing ${d.missing.join(', ')}`).toBe(d.missing.length > 0);
};

describe('jurisdiction and Kenyan profile fields', () => {
  it('Kenya is the default for a new profile; the country decides when no jurisdiction is stored', () => {
    expect(cleanProfile({})).toMatchObject({ jurisdiction: 'ke', country: 'Kenya' });
    expect(cleanProfile({ country: 'Kenya' }).jurisdiction).toBe('ke');
    expect(cleanProfile({ country: 'Deutschland' }).jurisdiction).toBe('de');
    // A profile stored before the Kenyan option existed always carried its country: it stays German.
    expect(cleanProfile({ form: 'gmbh', company: 'Alt GmbH', country: 'Deutschland' }).jurisdiction).toBe('de');
    // Without a country, a German VAT id or phone number is the hint.
    expect(cleanProfile({ vat_id: 'DE123456789' })).toMatchObject({ jurisdiction: 'de', country: 'Deutschland' });
    expect(cleanProfile({ phone: '+49 30 1' }).jurisdiction).toBe('de');
    expect(cleanProfile({ phone: '+254 700 000 000' }).jurisdiction).toBe('ke');
    expect(cleanProfile({ street: 'Hauptstraße 1', zip: '10115', city: 'Berlin' }).jurisdiction).toBe('de');
    expect(cleanProfile({ street: 'Moi Avenue 12', city: 'Nairobi' }).jurisdiction).toBe('ke');
    expect(cleanProfile({ jurisdiction: 'de' })).toMatchObject({ jurisdiction: 'de', country: 'Deutschland' });
    expect(cleanProfile({ jurisdiction: 'nope', country: 'Kenya' }).jurisdiction).toBe('ke');
  });

  it('cleans the Kenyan fields', () => {
    const p = cleanProfile({ ke_form: 'weird', kra_pin: ' p05 1234567x ', vat_registered: 'yes', arbitration: 1, odpc_no: 'x'.repeat(300), county: 'Mombasa County' });
    expect(p.ke_form).toBe('ltd');
    expect(p.kra_pin).toBe('P051234567X');
    expect(p.vat_registered).toBe(false);
    expect(p.arbitration).toBe(false);
    expect(p.odpc_no.length).toBeLessThanOrEqual(80);
    expect(p.county).toBe('Mombasa County');
    expect(cleanProfile({}).odpc_no).toBe('');
  });

  it('each jurisdiction has its own set of documents; public links map to the right one', () => {
    expect(kindsFor('ke')).toEqual(['company', 'privacy', 'terms', 'dpa']);
    expect(kindsFor('de')).toEqual(['impressum', 'datenschutz', 'widerruf', 'avv', 'vvt']);
    expect(publicKind('ke', 'datenschutz')).toBe('privacy');
    expect(publicKind('ke', 'impressum')).toBe('company');
    expect(publicKind('ke', 'widerruf')).toBe('terms');
    expect(publicKind('ke', 'privacy')).toBe('privacy');
    expect(publicKind('de', 'privacy')).toBe('datenschutz');
    expect(publicKind('de', 'company')).toBe('impressum');
    expect(publicKind('de', 'datenschutz')).toBe('datenschutz');
    expect(publicKind('ke', 'agb')).toBeUndefined();
  });
});

describe('Company information (Kenya)', () => {
  it('a limited company with everything filled in: no gaps, the disclosures of the Companies Act and KRA', () => {
    const d = kenyaCompany(ke());
    expect(d.kind).toBe('company');
    expect(d.title).toBe('Company information');
    expect(d.missing).toEqual([]);
    gapsListed(d);
    const t = text(d);
    for (const w of ['Neso Example Appliances Limited', 'Neso Kitchens', 'private limited company', 'Companies Act, 2015', 'PVT-AB1CD2EF', 'P051234567X', 'Registered for VAT', 'Example Plaza', 'Nairobi City County', 'P.O. Box 12345-00100', '+254 700 000 000', 'info@example.co.ke']) expect(t, w).toContain(w);
    expect(t).not.toContain('Office of the Data Protection Commissioner');
    expect(t).not.toContain('please complete');
    expect(d.notice).toBe(KE_LEGAL_NOTICE);
    expect(d.notice).toContain('not legal advice');
    expect(d.notice).toContain('advocate of the High Court of Kenya');
  });

  it('shows the ODPC certificate, the DPO and the business permit only when they are set', () => {
    const d = kenyaCompany(ke({ odpc_no: 'ODPC/2026/12345', dpo_name: 'Halima Example', dpo_email: 'dpo@example.co.ke', business_permit: 'NCC-2026-778899' }));
    const t = text(d);
    expect(t).toContain('ODPC/2026/12345');
    expect(t).toContain('Office of the Data Protection Commissioner');
    expect(t).toContain('dpo@example.co.ke');
    expect(t).toContain('NCC-2026-778899');
    expect(text(kenyaCompany(ke()))).not.toContain('permit');
  });

  it('marks gaps: a missing registered name, PIN, e-mail and a company name without "Limited"', () => {
    const d = kenyaCompany(cleanProfile({ jurisdiction: 'ke', ke_form: 'ltd' }));
    expect(d.missing).toEqual(expect.arrayContaining(['Registered name', 'KRA PIN', 'Email', 'Physical address', 'BRS registration number']));
    expect(text(d)).toContain(`${KE_TODO_PREFIX}registered name`);
    gapsListed(d);
    const noEnding = kenyaCompany(ke({ company: 'Neso Example Appliances' }));
    expect(noEnding.missing).toContain('Registered name ending');
    expect(text(noEnding)).toMatch(/Limited.*Ltd/);
  });

  it('a sole proprietorship names its owner (Registration of Business Names Act) and a partnership its partners', () => {
    const sole = text(kenyaCompany(ke({ ke_form: 'sole', company: 'Neso Kitchens', owner: 'Amina Example', brs_no: 'BN-12345' })));
    expect(sole).toContain('Registration of Business Names Act');
    expect(sole).toContain('Amina Example');
    expect(sole).not.toContain('Companies Act');
    const firm = kenyaCompany(ke({ ke_form: 'partnership', company: 'Neso Kitchens', owner: '' }));
    expect(firm.missing).toContain('Owners / partners');
    const vat = text(kenyaCompany(ke({ vat_registered: false })));
    expect(vat).toContain('Not registered for VAT');
  });
});

describe('Privacy policy (Data Protection Act, 2019)', () => {
  it('a bare sub-account: every part the Act asks for, no services it does not use', () => {
    const d = kenyaPrivacy(ke(), facts());
    expect(d.kind).toBe('privacy');
    expect(d.title).toBe('Privacy policy');
    const h = heads(d).join('|');
    for (const w of ['Who we are', 'Personal data we collect', 'Why we use your data', 'Do you have to give us your data', 'Who receives your data', 'Transfers outside Kenya', 'How long we keep your data', 'How we protect your data', 'Your rights', 'Direct marketing', 'Children', 'Data breaches', 'Complaints', 'Contact us', 'Changes to this policy']) expect(h, w).toContain(w);
    const t = text(d);
    for (const w of ['Data Protection Act, 2019', 'Data Protection (General) Regulations, 2021', 'section 30', 'consent', 'legitimate interests', 'Office of the Data Protection Commissioner', 'Britam', 'odpc.go.ke', '72 hours', 'withdraw your consent', '7 days', '14 days', '30 days', 'under 18', 'Hostinger International Ltd.', 'Last updated']) expect(t, w).toContain(w);
    for (const w of ['Stripe', 'M-Pesa', 'Google Analytics', 'Meta Pixel', 'WhatsApp', 'OpenAI', 'Anthropic', 'Twilio', 'YouTube', 'Resend']) expect(t, w).not.toContain(w);
    for (const w of ['DSGVO', 'bitte ergänzen', 'GDPR']) expect(t, w).not.toContain(w);
    expect(d.services).toEqual([]);
    expect(d.missing).toEqual([]);
    gapsListed(d);
  });

  it('every feature in use is described and its processor and country named in the transfers', () => {
    const d = kenyaPrivacy(
      ke(),
      facts({ forms: true, newsletter: true, doi: true, email_provider: 'resend', sms_provider: 'twilio', whatsapp: true, stripe: true, mpesa: true, invoices: true, calendars: true, calendar_sync: ['google'], chat: true, cmp: true, attribution: true, trackers: ['ga', 'meta_pixel'], embeds: ['youtube', 'gmaps'], ai_provider: 'claude' }),
    );
    const h = heads(d).join('|');
    for (const w of ['Contact forms', 'Newsletters', 'Email delivery', 'SMS', 'WhatsApp', 'Card payments (Stripe)', 'M-Pesa', 'Invoices', 'Online booking', 'Calendar sync', 'Live chat', 'Cookies', 'AI features', 'Google Analytics', 'Meta Pixel', 'YouTube', 'Google Maps']) expect(h, w).toContain(w);
    for (const w of ['TikTok', 'Hotjar', 'Webinars', 'Telephony', 'Vimeo']) expect(h, w).not.toContain(w);
    const transfers = d.sections.find((s) => s.heading.startsWith('Transfers outside Kenya'))!.body;
    for (const w of ['Hostinger', 'Resend', 'USA', 'Twilio', 'Meta Platforms', 'Stripe', 'Google', 'Anthropic', 'section 48']) expect(transfers, w).toContain(w);
    expect(transfers).not.toContain('OpenAI');
    expect(transfers).not.toContain('Safaricom'); // M-Pesa stays in Kenya
    const t = text(d);
    expect(t).toContain('Safaricom');
    expect(t).toContain('unsubscribe');
    expect(t).toContain('STOP');
    expect(t).toContain('section 35');
    expect(t).toContain('(#cookie-settings)');
    expect(d.services).toEqual(expect.arrayContaining(['stripe', 'mpesa', 'ga', 'meta_pixel', 'ai', 'whatsapp']));
    const openai = text(kenyaPrivacy(ke(), facts({ ai_provider: 'openai' })));
    expect(openai).toContain('OpenAI');
    expect(openai).not.toContain('Anthropic');
  });

  it('names each provider once, gives one legal basis per purpose and states the transfer risks (regulations 4 and 5)', () => {
    const d = kenyaPrivacy(ke(), facts({ sms_provider: 'twilio', telephony: true, calendar_sync: ['google'], trackers: ['ga'], embeds: ['gmaps'], newsletter: true, invoices: true }));
    const recipients = d.sections.find((s) => s.heading === 'Who receives your data')!.body;
    expect(recipients.match(/\*\*Twilio Inc\.\*\*/g)).toHaveLength(1);
    expect(recipients).toContain('**Twilio Inc.** – sending SMS and phone calls (USA)');
    expect(recipients.match(/\*\*Google LLC\*\*/g)).toHaveLength(1);
    expect(recipients).toContain('calendar sync, website analytics and maps');
    expect(recipients).not.toContain('videos or fonts');
    const purposes = d.sections.find((s) => s.heading.startsWith('Why we use'))!.body.split('Our purposes:')[1].split('\n').filter((l) => l.startsWith('- '));
    expect(purposes.length).toBeGreaterThan(5);
    for (const l of purposes) expect(l.match(/section 30\(1\)/g), l).toHaveLength(1);
    const transfers = d.sections.find((s) => s.heading === 'Transfers outside Kenya')!.body;
    expect(transfers).toContain('adequacy decision');
    expect(text(d)).toContain('withdraw it');
    // Hosted in Kenya and nothing else abroad: no transfer to list.
    const local = kenyaPrivacy(ke({ hosting: 'Example Cloud Limited, data centre in Nairobi' }), facts({ mpesa: true }));
    expect(local.sections.find((s) => s.heading === 'Transfers outside Kenya')!.body).toContain('We do not currently transfer personal data outside Kenya');
  });

  it('shows the ODPC certificate number and the DPO when set; gaps are marked and listed', () => {
    const withNo = text(kenyaPrivacy(ke({ odpc_no: 'ODPC/2026/12345', dpo_name: 'Halima Example', dpo_email: 'dpo@example.co.ke' }), facts()));
    expect(withNo).toContain('ODPC/2026/12345');
    expect(withNo).toContain('Data Protection Officer');
    expect(withNo).toContain('dpo@example.co.ke');
    expect(text(kenyaPrivacy(ke(), facts()))).not.toContain('certificate');
    const d = kenyaPrivacy(cleanProfile({ jurisdiction: 'ke', company: 'Test Limited' }), facts());
    expect(d.missing).toEqual(expect.arrayContaining(['Email', 'Hosting provider', 'Physical address']));
    expect(text(d)).toContain('[please complete: hosting provider and the country of its servers]');
    gapsListed(d);
  });

  it('the owner\'s overrides decide like in the German policy', () => {
    const d = kenyaPrivacy(ke({ overrides: { stripe: false, tiktok: true } }), facts({ stripe: true }));
    expect(heads(d).join('|')).not.toContain('Stripe');
    expect(heads(d).join('|')).toContain('TikTok');
 
    // Switched on by hand without a provider in the system: a gap, never an empty provider name.
    const manual = kenyaPrivacy(ke({ overrides: { email: true, sms: true, ai: true } }), facts());
    expect(text(manual)).not.toMatch(/through \.|provided by \./);
    expect(manual.missing).toEqual(expect.arrayContaining(['Email provider', 'SMS provider', 'AI provider']));
    gapsListed(manual);
    expect(kenyaDpa(ke({ overrides: { sms: true } }), { controller: { name: 'C Ltd', address: 'Nairobi' } }, facts()).missing).toContain('SMS provider');
  });
});

describe('Terms and conditions (Consumer Protection Act, 2012)', () => {
  it('covers ordering, prices with VAT, payment, delivery, cancellation, warranties, liability, disputes and Kenyan law', () => {
    const d = kenyaTerms(ke({ mpesa_number: 'Paybill 123456' }), facts({ mpesa: true, stripe: true }));
    expect(d.kind).toBe('terms');
    expect(d.title).toBe('Terms and conditions');
    const h = heads(d).join('|');
    for (const w of ['About us', 'Ordering', 'Prices and VAT', 'Payment', 'Delivery', 'Installation and services', 'Cancellation and refunds', 'Warranties', 'Limitation of liability', 'Complaints and disputes', 'Governing law']) expect(h, w).toContain(w);
    const t = text(d);
    for (const w of ['Consumer Protection Act, 2012', 'Sale of Goods Act', 'VAT at 16%', 'eTIMS', 'M-Pesa', 'Paybill 123456', 'Stripe', '30 days', 'Small Claims Court', 'KSh 1,000,000', 'laws of Kenya', 'P051234567X', 'Neso Example Appliances Limited']) expect(t, w).toContain(w);
    expect(t).not.toMatch(/no refunds?\b(?! clause)/i);
    expect(t).not.toContain('Arbitration Act');
    // The contracting party is the company itself; phone orders (remote agreements) and refunds through eTIMS are covered.
    expect(t).toContain('"we" and "us" means Neso Example Appliances Limited (Neso Kitchens)');
    expect(t).toContain('CPA section 38');
    expect(t).toContain('credit note through eTIMS');
    expect(t).toContain('M-Pesa number or card you paid from');
  });

  it('without VAT registration, M-Pesa or Stripe the text says so and asks for what is missing', () => {
    const d = kenyaTerms(ke({ vat_registered: false }), facts());
    const t = text(d);
    expect(t).toContain('not registered for VAT');
    expect(t).not.toContain('VAT at 16%');
    expect(t).not.toContain('Paybill');
    expect(t).not.toContain('Stripe');
    expect(d.missing).toContain('Payment methods');
    gapsListed(d);
    const mp = kenyaTerms(ke(), facts({ mpesa: true }));
    expect(mp.missing).toContain('M-Pesa Paybill or Till number');
  });

  it('arbitration under the Arbitration Act, 1995 only when chosen – and never closing the courts to consumers', () => {
    const t = text(kenyaTerms(ke({ arbitration: true }), facts()));
    expect(t).toContain('Arbitration Act, 1995');
    expect(t).toContain('business customers');
    expect(t).toMatch(/consumer.*court/i);
  });
});

describe('Data processing agreement (section 42)', () => {
  it('has the parts of section 42 and regulation 24, the parties and the sub-processors in use', () => {
    const d = kenyaDpa(ke({ odpc_no: 'ODPC/2026/12345' }), { controller: { name: 'Client Example Limited', address: 'Moi Avenue, Mombasa', representative: 'Peter Client' } }, facts({ email_provider: 'brevo', telephony: true, ai_provider: 'openai' }));
    expect(d.kind).toBe('dpa');
    expect(d.title).toContain('Data processing agreement');
    expect(d.missing).toEqual([]);
    gapsListed(d);
    const t = text(d);
    for (const w of ['Client Example Limited', 'Neso Example Appliances Limited', 'section 42', 'Data Protection Act, 2019', 'regulation 24', 'regulation 25', 'instructions', 'confidential', '48 hours', 'audit', 'delete or return', 'Schedule 1', 'Schedule 2', 'Hostinger', 'Brevo', 'France', 'Twilio', 'OpenAI', 'ODPC/2026/12345', 'laws of Kenya']) expect(t, w).toContain(w);
    for (const w of ['Stripe', 'Meta', 'Anthropic', 'Art. 28']) expect(t, w).not.toContain(w);
  });

  it('marks the missing controller', () => {
    const d = kenyaDpa(ke(), {}, facts());
    expect(d.missing).toEqual(expect.arrayContaining(['Controller', 'Controller address']));
    gapsListed(d);
  });

  it('renders like the German documents (HTML, PDF)', () => {
    const html = docToHtml(kenyaPrivacy(ke(), facts({ cmp: true })), { notice: true });
    expect(html).toContain('advocate of the High Court of Kenya');
    expect(html).toContain('<h1>Privacy policy</h1>');
    const pdf = docPdf(kenyaTerms(ke(), facts()));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

// --- through the app --------------------------------------------------------------------------------------------------------

let t: Awaited<ReturnType<typeof startTestApp>>;
let loc = '';

beforeAll(async () => {
  t = await startTestApp();
  await t.setup();
  const created = (await t.api.post('/api/locations', { name: 'Neso Example Appliances Limited' })).data;
  loc = created.id;
  t.api.setLocation(loc);
});
afterAll(async () => {
  await t.close();
});

describe('Kenyan legal pages in the app', () => {
  it('a new sub-account starts in Kenya with the Kenyan documents', async () => {
    await t.api.patch('/api/location', { phone: '+254 700 000 000', email: 'info@example.co.ke', address: 'Example Plaza, Example Road\nNairobi' });
    const p = (await t.api.get('/api/legal/profile')).data;
    expect(p.profile).toMatchObject({ jurisdiction: 'ke', country: 'Kenya', company: 'Neso Example Appliances Limited', email: 'info@example.co.ke' });
    expect(p.docs.map((d: any) => d.kind)).toEqual(['company', 'privacy', 'terms', 'dpa']);
    expect(p.ke_forms.map((f: any) => f.key)).toEqual(expect.arrayContaining(['sole', 'partnership', 'ltd', 'plc', 'llp', 'ngo']));
    expect(p.notice).toBe(KE_LEGAL_NOTICE);
    const saved = (await t.api.put('/api/legal/profile', { ke_form: 'ltd', kra_pin: 'P051234567X', brs_no: 'PVT-AB1CD2EF', vat_registered: true, county: 'Nairobi City County', po_box: 'P.O. Box 12345-00100, Nairobi', odpc_no: 'ODPC/2026/12345', hosting: 'Hostinger International Ltd. (Germany)', mpesa_number: 'Till 987654' })).data.profile;
    expect(saved).toMatchObject({ jurisdiction: 'ke', kra_pin: 'P051234567X', vat_registered: true, odpc_no: 'ODPC/2026/12345' });
    const services = (await t.api.get('/api/legal/services')).data;
    // Entering a Paybill/Till number means M-Pesa is in use.
    expect(services.services.find((s: any) => s.id === 'mpesa')).toMatchObject({ detected: true, active: true });
  });

  it('generates each Kenyan document with the Kenyan notice; exports work', async () => {
    for (const kind of ['company', 'privacy', 'terms', 'dpa']) {
      const r = (await t.api.post('/api/legal/generate', { kind, controller_name: 'Client Example Limited', controller_address: 'Moi Avenue, Mombasa' })).data;
      expect(r.doc.sections.length, kind).toBeGreaterThan(3);
      expect(r.markdown, kind).toContain('advocate of the High Court of Kenya');
      expect(r.notice, kind).toBe(KE_LEGAL_NOTICE);
      expect(r.label, kind).toMatch(/^[A-Z][a-z]/);
    }
    const priv = (await t.api.post('/api/legal/generate', { kind: 'privacy' })).data;
    expect(JSON.stringify(priv.doc)).toContain('ODPC/2026/12345');
    expect(JSON.stringify(priv.doc)).toContain('M-Pesa');
    const h = { cookie: t.api.cookie, 'x-location-id': loc };
    const md = await t.api.raw('/api/legal/export?kind=terms&format=md', { headers: h });
    expect(await md.text()).toContain('# Terms and conditions');
  });

  it('hosts the Kenyan pages under new slugs, and the old links show the Kenyan texts', async () => {
    for (const [slug, title] of [['privacy', 'Privacy policy'], ['datenschutz', 'Privacy policy'], ['company', 'Company information'], ['impressum', 'Company information'], ['terms', 'Terms and conditions'], ['widerruf', 'Terms and conditions']]) {
      const r = await t.api.raw(`/legal/${loc}/${slug}`);
      expect(r.status, slug).toBe(200);
      const html = await r.text();
      expect(html, slug).toContain(title);
      expect(html, slug).not.toContain('not legal advice');
      expect(html, slug).toContain('<html lang="en">');
    }
    expect((await t.api.raw(`/legal/${loc}/dpa`)).status).toBe(404);
    const lt = t.app.services.legalTexts;
    expect(lt.hostedUrl(loc, 'datenschutz')).toBe(`http://localhost/legal/${loc}/privacy`);
    expect(lt.hostedUrl(loc, 'impressum')).toBe(`http://localhost/legal/${loc}/company`);
    expect(lt.hostedUrl(loc, 'widerruf')).toBe(`http://localhost/legal/${loc}/terms`);
    expect(lt.kinds()).toEqual(expect.arrayContaining(['company', 'privacy', 'terms', 'dpa', 'impressum']));
  });

  it('a new website gets Kenyan pages instead of the placeholders, linked in the footer', async () => {
    const funnel = (await t.api.post('/api/funnels', { name: 'Site', template: 'website' })).data;
    const pages = (await t.api.get(`/api/funnels/${funnel.id}`)).data.pages;
    const slugs = pages.map((p: any) => p.slug);
    expect(slugs).toEqual(expect.arrayContaining(['company', 'privacy']));
    expect(slugs).not.toContain('impressum');
    expect(slugs).not.toContain('datenschutz');
    expect(JSON.stringify(pages.find((p: any) => p.slug === 'privacy').blocks)).toContain('Data Protection Act, 2019');
    const f = (await t.api.get(`/api/funnels/${funnel.id}`)).data;
    expect(f.settings.footer_text).toContain(`[Privacy policy](/p/${funnel.slug}/privacy)`);
    expect(f.settings.footer_text).toContain(`[Company information](/p/${funnel.slug}/company)`);
    const terms = (await t.api.post(`/api/legal/funnels/${funnel.id}/apply`, { kinds: ['terms'] })).data;
    expect(terms.pages[0]).toMatchObject({ kind: 'terms', created: true, url: `http://localhost/p/${funnel.slug}/terms` });
  });

  it('switching to Germany brings back the German set – the public links keep working', async () => {
    await t.api.put('/api/legal/profile', { country: 'Deutschland' });
    const p = (await t.api.get('/api/legal/profile')).data;
    expect(p.profile.jurisdiction).toBe('de');
    expect(p.docs.map((d: any) => d.kind)).toEqual(['impressum', 'datenschutz', 'widerruf', 'avv', 'vvt']);
    const de = await (await t.api.raw(`/legal/${loc}/privacy`)).text();
    expect(de).toContain('Datenschutzerklärung');
    expect(de).toContain('<html lang="de">');
    await t.api.put('/api/legal/profile', { jurisdiction: 'ke' });
    expect((await t.api.get('/api/legal/profile')).data.profile).toMatchObject({ jurisdiction: 'ke', country: 'Kenya' });
  });
});
