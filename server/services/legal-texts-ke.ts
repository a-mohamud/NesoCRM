/**
 * Neso fork – Kenyan legal document generators (pure): company information, privacy policy (Data Protection Act, 2019 and
 * Data Protection (General) Regulations, 2021), terms and conditions for an SME selling goods and services (Consumer
 * Protection Act, 2012) and a data processing agreement (section 42 of the Act). English source texts – they are legal
 * documents for Kenya, not UI – built from the same LegalProfile and Facts as the German set in legal-texts.ts, so the privacy
 * policy names only the services the sub-account really uses.
 *
 * Drafts, not legal advice: every document carries KE_LEGAL_NOTICE, gaps are marked `[please complete: …]` and listed in
 * `missing`. Sections and regulations are cited only where the research briefs verified them against the statute.
 */
import { DE_DOC_KINDS, KE_DOC_KINDS, activeServices, type AvvInput, type DocKind, type Facts, type Jurisdiction, type KeForm, type LegalDoc, type LegalProfile, type Section } from './legal-texts.js';

export const KE_LEGAL_NOTICE =
  'Draft – not legal advice. This template was generated automatically from your details and the features you actually use. Check every section, complete the parts marked [please complete: …] and have the text reviewed by an advocate of the High Court of Kenya (and your Data Protection Officer, if you have one) before you publish or sign it.';
export const KE_TODO_PREFIX = '[please complete: ';
const TODO = (what: string) => `${KE_TODO_PREFIX}${what}]`;

export const KE_FORM_LABEL: Record<KeForm, string> = {
  sole: 'Sole proprietorship',
  partnership: 'Partnership',
  ltd: 'Private limited company',
  plc: 'Public limited company',
  llp: 'Limited liability partnership (LLP)',
  ngo: 'NGO / non-profit organisation',
  other: 'Other',
};

/** The documents of a jurisdiction, in the order the wizard shows them. */
export function kindsFor(j: Jurisdiction): DocKind[] {
  return j === 'ke' ? [...KE_DOC_KINDS] : [...DE_DOC_KINDS];
}

/**
 * Public legal pages (/legal/<sub-account>/<slug>, website pages): which document a slug shows in a jurisdiction. The German
 * and the Kenyan slugs both work in both, so links in footers, forms and checkouts keep working when the jurisdiction changes.
 */
const PUBLIC: Record<Jurisdiction, Record<string, DocKind>> = {
  de: { impressum: 'impressum', datenschutz: 'datenschutz', widerruf: 'widerruf', company: 'impressum', privacy: 'datenschutz', terms: 'widerruf' },
  ke: { impressum: 'company', datenschutz: 'privacy', widerruf: 'terms', company: 'company', privacy: 'privacy', terms: 'terms' },
};
export function publicKind(j: Jurisdiction, slug: string): DocKind | undefined {
  return Object.hasOwn(PUBLIC[j], slug) ? PUBLIC[j][slug] : undefined;
}

const or = (v: string, what: string, missing: string[], label: string) => {
  if (v.trim()) return v.trim();
  if (!missing.includes(label)) missing.push(label);
  return TODO(what);
};
const dateKe = (at: Date) => new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Nairobi' }).format(at);
const doc = (kind: DocKind, title: string, subtitle: string, sections: Section[], missing: string[], services: string[] = []): LegalDoc => ({ kind, title, subtitle, sections, missing, notice: KE_LEGAL_NOTICE, services });

/** Building, street, town, county – what of it is there; a gap when nothing is. */
function physical(p: LegalProfile, missing: string[]): string {
  const lines = [p.building, p.street, p.city, p.county].map((x) => x.trim()).filter(Boolean);
  if (!lines.length) return or('', 'physical address (building, street, town, county)', missing, 'Physical address');
  return [...lines, 'Kenya'].join('\n');
}
const oneLine = (v: string) => v.replace(/\n+/g, ', ');
const isCompany = (f: KeForm) => f === 'ltd' || f === 'plc' || f === 'llp';
const ENDING: Partial<Record<KeForm, { re: RegExp; rule: string }>> = {
  ltd: { re: /\b(limited|ltd\.?)$/i, rule: 'a private company\'s registered name ends with "Limited" or "Ltd." (Companies Act, 2015, section 54)' },
  plc: { re: /\b(plc|public limited company)$/i, rule: 'a public company\'s registered name ends with "public limited company" or "PLC" (Companies Act, 2015, section 53)' },
  llp: { re: /\b(llp|limited liability partnership)$/i, rule: 'an LLP\'s name ends with "limited liability partnership" or "LLP" (Limited Liability Partnerships Act, 2011, section 20)' },
};

/** "A private limited company incorporated in Kenya …" – the legal form in one sentence (owners for business names). */
function formSentence(p: LegalProfile, missing: string[]): string {
  const owners = () => or(p.owner, 'full names of the owner(s) or partners', missing, 'Owners / partners');
  switch (p.ke_form) {
    case 'ltd':
      return 'A private limited company incorporated in Kenya under the Companies Act, 2015.';
    case 'plc':
      return 'A public limited company incorporated in Kenya under the Companies Act, 2015.';
    case 'llp':
      return 'A limited liability partnership registered in Kenya under the Limited Liability Partnerships Act, 2011.';
    case 'sole':
      return `A business name registered under the Registration of Business Names Act (Cap. 499), owned by ${owners()}.`;
    case 'partnership':
      return `A partnership trading under a business name registered under the Registration of Business Names Act (Cap. 499). Partners: ${owners()}.`;
    default:
      return `${p.ke_form === 'ngo' ? 'A non-profit organisation in Kenya' : 'An organisation in Kenya'}, ${or('', 'legal form and the law it is registered under', missing, 'Legal form')}.`;
  }
}

/** Registered name (+ ending check) and "trading as". */
function nameLines(p: LegalProfile, missing: string[]): string {
  const name = or(p.company, 'registered name exactly as on the certificate of incorporation or registration', missing, 'Registered name');
  const end = ENDING[p.ke_form];
  const check = p.company.trim() && end && !end.re.test(p.company.trim()) ? `\n${or('', `check the registered name – ${end.rule}`, missing, 'Registered name ending')}` : '';
  return `**${name}**${check}${p.trading_name ? `\nTrading as: ${p.trading_name}` : ''}`;
}

// --- Company information (the Kenyan counterpart of an "Impressum") -----------------------------------------------------

export function kenyaCompany(p: LegalProfile, now = new Date()): LegalDoc {
  const missing: string[] = [];
  const S: Section[] = [];
  S.push({ heading: 'Business name and legal form', body: `${nameLines(p, missing)}\n\n${formSentence(p, missing)}` });
  const reg: string[] = [];
  if (isCompany(p.ke_form)) reg.push(`${p.ke_form === 'llp' ? 'LLP registration number' : 'Company registration number'} (Business Registration Service): ${or(p.brs_no, 'registration number from the certificate', missing, 'BRS registration number')}`);
  else if (p.brs_no) reg.push(`${p.ke_form === 'sole' || p.ke_form === 'partnership' ? 'Business name registration number' : 'Registration number'}: ${p.brs_no}`);
  if (reg.length) S.push({ heading: 'Registration', body: reg.join('\n') });
  S.push({ heading: 'Address', body: `${isCompany(p.ke_form) ? 'Registered office' : 'Physical address'}:\n${physical(p, missing)}${p.po_box ? `\n\nPostal address: ${p.po_box}` : ''}` });
  S.push({ heading: 'Contact', body: [p.phone ? `Phone: ${p.phone}` : '', `Email: ${or(p.email, 'email address', missing, 'Email')}`, p.website ? `Website: ${p.website}` : ''].filter(Boolean).join('\n') });
  S.push({ heading: 'Tax', body: `KRA PIN: ${or(p.kra_pin, 'KRA PIN', missing, 'KRA PIN')}\n${p.vat_registered ? 'Registered for VAT.' : 'Not registered for VAT.'}\nWe issue electronic tax invoices through the KRA eTIMS system.` });
  const dp: string[] = ['How we handle personal data is explained in our privacy policy.'];
  if (p.odpc_no) dp.push(`We are registered with the Office of the Data Protection Commissioner (ODPC) as a data controller, certificate no. ${p.odpc_no}.`);
  if (p.dpo_name || p.dpo_email) dp.push(`Data Protection Officer: ${[p.dpo_name, p.dpo_email].filter(Boolean).join(', ')}`);
  S.push({ heading: 'Data protection', body: dp.join('\n\n') });
  if (p.business_permit) S.push({ heading: 'County business permit', body: `Single business permit no. ${p.business_permit}${p.county ? ` (${p.county})` : ''}` });
  return doc('company', 'Company information', `Last updated: ${dateKe(now)}`, S, missing);
}

// --- who receives what: processors and other recipients with their country -----------------------------------------------

interface Recipient {
  name: string;
  task: string;
  country: string;
  /** Processes on our behalf (sub-processor in the DPA); false = independent recipient (payment provider, platform). */
  processor: boolean;
}
const EMAIL: Record<string, [string, string]> = {
  resend: ['Resend, Inc.', 'USA'],
  sendgrid: ['SendGrid (Twilio Inc.)', 'USA'],
  mailgun: ['Mailgun Technologies, Inc.', 'USA'],
  postmark: ['Postmark (ActiveCampaign, LLC)', 'USA'],
  brevo: ['Brevo (Sendinblue SAS)', 'France'],
  ses: ['Amazon SES (Amazon Web Services EMEA SARL)', 'Luxembourg / the AWS region we use'],
  mailjet: ['Mailjet SAS', 'France'],
};
const SMS: Record<string, [string, string]> = {
  seven: ['seven communications GmbH', 'Germany'],
  twilio: ['Twilio Inc.', 'USA'],
  sinch: ['Sinch Sweden AB', 'Sweden'],
  bird: ['Bird B.V. (MessageBird)', 'Netherlands'],
  messagebird: ['Bird B.V. (MessageBird)', 'Netherlands'],
  vonage: ['Vonage Holdings Corp.', 'USA'],
  plivo: ['Plivo Inc.', 'USA'],
};
const COUNTRY_UNKNOWN = 'see the provider\'s terms';
const known = (map: Record<string, [string, string]>, id: string): [string, string] => map[id.toLowerCase()] ?? [id, COUNTRY_UNKNOWN];
/**
 * The provider of a service the owner switched on by hand (services table) although the system has none configured: a gap,
 * never an empty name ("We send SMS through .").
 */
function provider(lookup: (id: string) => [string, string], id: string, what: string, label: string, missing: string[]): [string, string] {
  return id.trim() ? lookup(id) : [or('', what, missing, label), COUNTRY_UNKNOWN];
}
const EMAIL_GAP = ['name of your email provider and the country where it processes data', 'Email provider'] as const;
const SMS_GAP = ['name of your SMS provider and the country where it processes data', 'SMS provider'] as const;
const AI_GAP = ['name of your AI provider and the country where it processes data', 'AI provider'] as const;
function aiProvider(id: string): [string, string] {
  const k = id.toLowerCase();
  if (k.includes('anthropic') || k.includes('claude')) return ['Anthropic PBC (Claude)', 'USA'];
  if (k.includes('openai') || k.includes('chatgpt')) return ['OpenAI, L.L.C.', 'USA'];
  return [id, COUNTRY_UNKNOWN];
}
/** "Brevo (Sendinblue SAS)" + "France" → "Brevo (Sendinblue SAS; France)"; a provider without a known country stays as it is. */
const at = (name: string, country: string) => (country === COUNTRY_UNKNOWN ? name : name.endsWith(')') ? `${name.slice(0, -1)}; ${country})` : `${name} (${country})`);
const GOOGLE = 'Google LLC';
/** "a", "a and b", "a, b and c". */
const and = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const META = 'Meta Platforms, Inc.';

function recipients(p: LegalProfile, f: Facts, on: Set<string>, missing: string[]): Recipient[] {
  // A hosting entry that names Kenya (or a Kenyan town) is not a transfer out of Kenya; otherwise the entry names the country itself.
  const hostedInKenya = /\b(kenya|nairobi|mombasa|kisumu|nakuru|eldoret)\b/i.test(p.hosting);
  const out: Recipient[] = [{ name: or(p.hosting, 'hosting provider and the country of its servers', missing, 'Hosting provider'), task: 'hosting, operation and backups', country: hostedInKenya ? 'Kenya' : '', processor: true }];
  if (on.has('email')) {
    const [n, c] = provider((x) => known(EMAIL, x), f.email_provider, ...EMAIL_GAP, missing);
    out.push({ name: n, task: 'sending emails', country: c, processor: true });
  }
  if (on.has('sms')) {
    const [n, c] = provider((x) => known(SMS, x), f.sms_provider, ...SMS_GAP, missing);
    out.push({ name: n, task: 'sending SMS', country: c, processor: true });
  }
  if (on.has('telephony') || on.has('voice_ai')) out.push({ name: 'Twilio Inc.', task: 'phone calls', country: 'USA', processor: true });
  if (on.has('ai')) {
    const [n, c] = provider(aiProvider, f.ai_provider, ...AI_GAP, missing);
    out.push({ name: n, task: 'AI features', country: c, processor: true });
  }
  if (on.has('whatsapp')) out.push({ name: `${META} and WhatsApp LLC`, task: 'WhatsApp, Messenger and Instagram messages', country: 'USA', processor: true });
  if (on.has('calendar_sync')) out.push({ name: [f.calendar_sync.includes('google') ? GOOGLE : '', f.calendar_sync.includes('microsoft') ? 'Microsoft Corporation' : ''].filter(Boolean).join(' / ') || GOOGLE, task: 'calendar sync', country: 'USA', processor: true });
  if (on.has('stripe')) out.push({ name: 'Stripe, Inc. (or the Stripe company named in our Stripe account)', task: 'card payments', country: 'USA', processor: false });
  if (on.has('mpesa')) out.push({ name: 'Safaricom PLC (M-Pesa)', task: 'M-Pesa payments', country: 'Kenya', processor: false });
  const GOOGLE_TASK: Record<string, string> = { ga: 'website analytics', google_ads: 'advertising measurement', youtube: 'embedded videos', gmaps: 'maps', gfonts: 'fonts', google_reviews: 'reviews' };
  for (const x of Object.keys(GOOGLE_TASK)) if (on.has(x)) out.push({ name: GOOGLE, task: GOOGLE_TASK[x], country: 'USA', processor: false });
  if (on.has('meta_pixel') && !on.has('whatsapp')) out.push({ name: META, task: 'Meta Pixel (advertising measurement)', country: 'USA', processor: false });
  if (on.has('tiktok')) out.push({ name: 'TikTok (the TikTok company operating the service for Kenya)', task: 'TikTok Pixel', country: 'Singapore, USA and other countries', processor: false });
  if (on.has('linkedin')) out.push({ name: 'LinkedIn Corporation', task: 'LinkedIn Insight Tag', country: 'USA', processor: false });
  if (on.has('hotjar')) out.push({ name: 'Hotjar Ltd. / Microsoft Corporation (Clarity)', task: 'usage analysis', country: 'Malta / USA', processor: false });
  if (on.has('vimeo')) out.push({ name: 'Vimeo.com, Inc.', task: 'embedded videos', country: 'USA', processor: false });
  return out;
}
/** One line per provider: entries with the same name and country (Twilio for SMS and calls, Google for calendar and maps) are merged. */
function merged(list: Recipient[]): Recipient[] {
  const out: { r: Recipient; tasks: string[] }[] = [];
  for (const r of list) {
    const same = out.find((x) => x.r.name === r.name && x.r.country === r.country);
    if (same) {
      if (!same.tasks.includes(r.task)) same.tasks.push(r.task);
      same.r.processor ||= r.processor;
    } else out.push({ r: { ...r }, tasks: [r.task] });
  }
  return out.map(({ r, tasks }) => ({ ...r, task: and(tasks) }));
}
const recipientLine = (r: Recipient) => `- **${r.name}** – ${r.task}${r.country ? ` (${r.country})` : ''}`;

// --- Privacy policy ----------------------------------------------------------------------------------------------------------

const ACT = 'the Data Protection Act, 2019 ("the Act")';

export function kenyaPrivacy(p: LegalProfile, f: Facts, now = new Date()): LegalDoc {
  const missing: string[] = [];
  const on = new Set(activeServices(f, p.overrides));
  const has = (id: string) => on.has(id);
  const S: Section[] = [];
  const name = or(p.company, 'registered name', missing, 'Registered name');
  const email = or(p.email, 'email address', missing, 'Email');
  const dpo = p.dpo_name || p.dpo_email ? [p.dpo_name, p.dpo_email].filter(Boolean).join(', ') : '';
  const tracking = ['ga', 'google_ads', 'meta_pixel', 'tiktok', 'linkedin', 'hotjar'].some(has);
  const embeds = ['youtube', 'vimeo', 'gmaps', 'gfonts', 'calendly'].some(has);
  const marketing = has('newsletter');
  const payments = has('stripe') || has('mpesa') || has('invoices');

  S.push({
    heading: 'Who we are',
    body: [
      `**${name}**${p.trading_name ? ` (trading as ${p.trading_name})` : ''}\n${physical(p, missing)}${p.po_box ? `\n${p.po_box}` : ''}\nEmail: ${email}${p.phone ? `\nPhone: ${p.phone}` : ''}`,
      `We are the data controller for the personal data described in this policy: we decide why and how it is used.${p.odpc_no ? ` We are registered with the Office of the Data Protection Commissioner (ODPC) as a data controller, certificate no. ${p.odpc_no}.` : ''}`,
      dpo ? `Our Data Protection Officer: ${dpo}.` : '',
    ].filter(Boolean).join('\n\n'),
  });
  S.push({
    heading: 'About this policy',
    body: `This policy explains what personal data we collect, why, on which legal basis, who receives it, how long we keep it and what rights you have. It is our notice under section 29 of ${ACT} and the Data Protection (General) Regulations, 2021 ("the Regulations"). It applies to our website, our forms and booking pages, our messages to you and our dealings with customers and enquirers.`,
  });

  const data = [
    'Identity and contact details: name, phone number, email address, physical or delivery address, company name if you buy for a business.',
    'Your messages and our communication with you (emails, calls, notes of conversations).',
  ];
  if (payments) data.push('Order and payment details: what you bought, amounts, dates, invoices, payment references; your KRA PIN if you ask for an invoice in your business\'s name.');
  if (has('calendars') || has('webinars')) data.push('Booking details: the appointment or event you chose and your answers in the booking form.');
  if (marketing) data.push('Your marketing choices and the record of your consent.');
  if (has('cmp') || has('attribution') || tracking || embeds) data.push('Online identifiers from cookies and similar technologies, as described under "Cookies and similar technologies".');
  data.push('Technical data when you visit our website: IP address, date and time, the page visited, browser and device type (server logs).');
  S.push({
    heading: 'Personal data we collect',
    body: `${data.map((x) => `- ${x}`).join('\n')}\n\nMost of this data comes from you. If we receive your data from someone else (for example a person who refers you to us), we tell you within 14 days (regulation 6).\n\n**Sensitive personal data.** The Act treats some data as sensitive (section 2), including health data, ethnic origin, property details and family details such as the names of your spouse or children. We ask for such data only where we need it for a service you request – for example details of a property where we deliver or install. We use it only for that purpose and only on a ground that section 45 of the Act allows – for example where it is necessary to carry out our obligations or exercise rights, or to establish, exercise or defend a legal claim. We never use it for direct marketing, and we transfer it outside Kenya only with your consent (section 49).`,
  });

  const CONTRACT = '**contract** (section 30(1)(b)(i))';
  const LEGIT = '**legitimate interests** (section 30(1)(b)(vii))';
  const CONSENT = '**consent** (section 30(1)(a))';
  const purposes: string[] = [
    `Answering your enquiries about our products and services and preparing quotes – ${CONTRACT}, as steps you ask us to take before a contract.`,
    `Answering other messages and requests – ${LEGIT}: our interest in replying to you.`,
    `Performing our contracts with you${payments ? ' – orders, delivery, installation, payment and after-sales service' : ''} – ${CONTRACT}.`,
    `Keeping customer records so that we can deal with complaints, warranty claims and legal claims – ${LEGIT}.`,
    `Running our website and systems securely – ${LEGIT}.`,
  ];
  if (payments) purposes.push(`Issuing tax invoices through eTIMS and keeping accounting and tax records – **legal obligation** (section 30(1)(b)(ii); Tax Procedures Act, 2015).`);
  if (has('calendars') || has('webinars')) purposes.push(`Bookings, reminders and events – ${CONTRACT}.`);
  if (marketing) purposes.push(`Newsletters and other marketing messages – ${CONSENT}.`);
  if (tracking || has('attribution') || embeds) purposes.push(`Analytics, advertising measurement and embedded content – ${CONSENT}.`);
  if (has('ai') || has('voice_ai')) purposes.push(`AI-assisted replies, summaries and call handling – ${LEGIT}: our interest in answering you quickly.`);
  S.push({
    heading: 'Why we use your data and our legal basis',
    body: `We process personal data only on a legal basis under section 30 of the Act, and we rely on one basis for each purpose (regulation 5):\n\n- **Consent** – section 30(1)(a). You can withdraw your consent at any time. If you do not give it, or withdraw it, we simply stop the processing that depends on it (for example you no longer receive newsletters, or analytics cookies are not set); it does not affect your orders or our other dealings with you.\n- **Contract** – section 30(1)(b)(i): to perform a contract with you, or to take steps you ask for before one.\n- **Legal obligation** – section 30(1)(b)(ii), for example tax records.\n- **Legitimate interests** – section 30(1)(b)(vii), where our interests are not overridden by your interests, rights and freedoms.\n\nOur purposes:\n\n${purposes.map((x) => `- ${x}`).join('\n')}\n\nWe do not use your data for a new purpose that is not compatible with the original one without telling you and, where needed, asking for your consent.`,
  });
  S.push({
    heading: 'Do you have to give us your data?',
    body: 'Giving us personal data is voluntary. Some details are needed to answer you or to perform a contract – for example a phone number and delivery address for a delivery. If you do not give them, we may not be able to take or deliver your order or reply to you. Tax law requires us to record invoice details; we need your KRA PIN only if you want an invoice in your business\'s name.',
  });

  // What each feature in use does with personal data.
  if (has('forms')) S.push({ heading: 'Contact forms and enquiries', body: 'When you contact us through a form, we store what you enter (for example name, email, phone number and message) in our customer management system to answer you. Fields marked as required are needed to reply; the others are optional.' });
  if (has('newsletter')) {
    S.push({
      heading: 'Newsletters and marketing messages',
      body: `We send newsletters and other marketing messages only if you have expressly agreed (section 37 of the Act; regulation 15). ${f.doi || has('forms') ? 'After you sign up we send a confirmation link; only your click completes the sign-up. ' : ''}We keep a record of your consent (time, source, the consent text shown and a shortened network address) to prove it.\n\nEvery message says who it is from and how to stop further messages free of charge – an unsubscribe link in every email (regulations 15 and 17). You can also tell us at any time that you do not want any more marketing. We stop without delay.${f.email_tracking ? '\n\nWe measure whether our emails are opened and links clicked, on our own server, to improve our messages.' : ''}`,
    });
  }
  if (has('email')) {
    const [n, c] = provider((x) => known(EMAIL, x), f.email_provider, ...EMAIL_GAP, missing);
    S.push({ heading: 'Email delivery', body: `We send emails through ${at(n, c)}. The email address and the content of the message pass through this provider, which processes them on our behalf under a written agreement.` });
  }
  if (has('sms')) {
    const [n, c] = provider((x) => known(SMS, x), f.sms_provider, ...SMS_GAP, missing);
    S.push({ heading: 'SMS messages', body: `We send SMS through ${at(n, c)}. Your phone number and the message pass through this provider. Service messages (for example booking reminders) are part of our contract with you; promotional SMS we send only with your consent, and you can stop them at any time by replying STOP.` });
  }
  if (has('whatsapp')) S.push({ heading: 'WhatsApp, Facebook Messenger and Instagram', body: `When you write to us on WhatsApp, Messenger or Instagram, or we reply there, the messages are carried by ${META} and WhatsApp LLC (USA). We receive your profile name, phone number or user ID and the messages, and keep them in our customer management system. We send promotional WhatsApp messages only with your consent. Meta's own privacy policy also applies.` });
  if (has('stripe')) S.push({ heading: 'Card payments (Stripe)', body: 'Card payments are handled by Stripe, Inc. (USA) or the Stripe company named in our Stripe account. The data needed for the payment (name, email, amount, card details, order) goes directly to Stripe; card details do not reach our systems. Stripe also processes data as a controller in its own right, for example to prevent fraud – see Stripe\'s privacy policy.' });
  if (has('mpesa')) S.push({ heading: 'M-Pesa payments', body: 'When you pay with M-Pesa, Safaricom PLC (Kenya) processes the payment. We receive your name, phone number, the amount and the M-Pesa transaction code and use them to match your payment to your order. Safaricom processes your data as a controller in its own right under its own privacy statement.' });
  if (has('invoices')) S.push({ heading: 'Invoices, tax records and accounting', body: 'For quotes, invoices and our accounts we process your name, address, contact details, what you bought and payment details. Invoices are issued through the KRA eTIMS system, so their details are transmitted to the Kenya Revenue Authority as the Tax Procedures Act, 2015 (section 23A) requires. We keep tax records for five years (Tax Procedures Act, 2015, section 23; VAT Act, 2013, section 43) and may share them with our accountants and auditors.' });
  if (has('calendars')) S.push({ heading: 'Online booking', body: 'When you book an appointment on our booking page, we process your name, contact details, the time you chose and your answers, to hold the appointment and send confirmations and reminders by email or SMS. You can move or cancel the appointment through the link in the confirmation.' });
  if (has('calendar_sync')) S.push({ heading: `Calendar sync (${[f.calendar_sync.includes('google') ? 'Google' : '', f.calendar_sync.includes('microsoft') ? 'Microsoft' : ''].filter(Boolean).join(' / ') || 'external calendar'})`, body: `So that bookings appear in our calendar and our availability is right, we sync appointments with ${[f.calendar_sync.includes('google') ? 'Google Calendar (Google LLC, USA)' : '', f.calendar_sync.includes('microsoft') ? 'Microsoft 365 / Outlook (Microsoft Corporation, USA)' : ''].filter(Boolean).join(' and ') || 'an external calendar service'}. The appointment details (time, title, attendees) are transferred.` });
  if (has('webinars')) S.push({ heading: 'Webinars', body: `When you register for a webinar we process your name, email (and phone number if you give it), the session and your time zone to send access, reminders and any recording. During the webinar we record attendance, viewing time, questions and poll answers to run and evaluate it.${f.video_hosts.length ? ` The video is embedded from ${f.video_hosts.map((h) => (h === 'youtube' ? 'YouTube' : h === 'vimeo' ? 'Vimeo' : h)).join(' or ')} (see below).` : ' The video is streamed from our own server.'}` });
  if (has('chat')) S.push({ heading: 'Live chat', body: 'If you use the chat on our website, we store your messages, your name and email if you give them, and the page you were on, to answer you. The chat runs on our own system.' });
  if (has('community')) S.push({ heading: 'Courses, community and member area', body: 'For access to courses and the community we process your name, email, posts, comments, progress and activity. You log in with a link sent by email; a session cookie keeps you logged in. Your posts are visible to other members of the group. You can ask us to delete your account at any time.' });
  if (has('telephony')) S.push({ heading: 'Telephony', body: 'Calls through our system are connected by Twilio Inc. (USA). Phone numbers, time and duration are processed. We record calls only after telling you at the start of the call.' });
  if (has('voice_ai')) S.push({ heading: 'AI phone agent', body: 'Our phone agent answers calls with the help of artificial intelligence. You are told at the start of the call that you are speaking to an AI. The conversation is converted to text and processed by our AI provider (see "AI features"). On request we put you through to a person.' });
  if (has('ai')) {
    const [n, c] = provider(aiProvider, f.ai_provider, ...AI_GAP, missing);
    S.push({ heading: 'AI features', body: `We use AI features (for example suggested replies, summaries and writing help) provided by ${at(n, c)}. The content of messages or requests may be sent to this provider, which processes it on our behalf. We do not let AI take decisions about you that have legal or similarly significant effects (section 35 of the Act).` });
  }
  if (has('tickets')) S.push({ heading: 'Support tickets', body: 'For support requests we store your messages, attachments and contact details as a ticket to resolve it and to measure the quality of our service. Satisfaction surveys after a ticket are voluntary.' });
  if (has('affiliates')) S.push({ heading: 'Referral programme', body: 'If you reach us through a partner\'s referral link, we record the partner code so that the partner\'s commission can be calculated. We do not pass your personal data to the partner.' });
  if (has('google_reviews')) S.push({ heading: 'Google reviews', body: 'We read reviews you post about us on Google (name, review text and date) through Google\'s interface and may show them on our website.' });
  if (has('hr')) S.push({ heading: 'Employee data', body: 'We process the data of our employees to manage employment (personal details, leave, working time, documents). Employees receive a separate notice. Delete this section if you do not want to cover employees here.' });

  if (has('cmp') || has('attribution') || tracking || embeds) {
    const parts: string[] = ['Our website uses cookies and similar technologies. Cookies that are strictly necessary for the site to work are always set; everything else only with your consent.'];
    if (has('cmp')) parts.push('Our cookie banner stores your choice in a cookie (`pghl_cmp`, up to 180 days) and keeps a record of your decision as proof (time, banner version, your choice, a shortened network address). You can change or withdraw your choice at any time: [Open cookie settings](#cookie-settings).');
    if (has('attribution')) parts.push('Without third parties, we measure on our own server where visitors come from (for example an advert, a search engine or a link). A cookie that recognises you when you return (`pghl_vid`, up to 90 days) is only set with your consent.');
    if (tracking || embeds) parts.push('The third-party tools we use are described below. They are loaded only after you agree in the cookie banner.');
    parts.push('Session cookies are deleted when you close your browser; persistent cookies stay for the period stated. First-party cookies are set by our own website; third-party cookies are set by the providers named below.');
    parts.push('You can also block or delete cookies in your browser settings; some parts of the site may then not work.');
    S.push({ heading: 'Cookies and similar technologies', body: parts.join('\n\n') });
  }
  const third: { id: string; heading: string; body: string | (() => string) }[] = [
    { id: 'ga', heading: 'Google Analytics / Google Tag Manager', body: `With your consent we use Google Analytics and Google Tag Manager (${GOOGLE}, USA) to understand how our website is used. Cookies or identifiers are set and data such as IP address, pages viewed and device information is sent to Google. Without your consent no analytics data is sent.` },
    { id: 'google_ads', heading: 'Google Ads', body: `With your consent we use Google Ads (${GOOGLE}, USA) to measure the success of our adverts. Cookies may be set and data sent to Google.` },
    { id: 'meta_pixel', heading: 'Meta Pixel (Facebook / Instagram)', body: `With your consent we use the Meta Pixel of ${META} (USA) to measure our adverts and build audiences. Cookies are set and data such as IP address, pages viewed and actions are sent to Meta.` },
    { id: 'tiktok', heading: 'TikTok Pixel', body: 'With your consent we use the TikTok Pixel to measure our adverts. Cookies are set and data is sent to TikTok, which may process it outside Kenya.' },
    { id: 'linkedin', heading: 'LinkedIn Insight Tag', body: 'With your consent we use the LinkedIn Insight Tag (LinkedIn Corporation, USA) to measure conversions and build audiences. Cookies are set and data is sent to LinkedIn.' },
    { id: 'hotjar', heading: 'Hotjar / Microsoft Clarity', body: 'With your consent we use a tool (Hotjar Ltd., Malta, or Microsoft Clarity, Microsoft Corporation, USA) that records mouse movements, clicks and scrolling to improve our website. What you type into form fields is masked.' },
    { id: 'youtube', heading: 'YouTube videos', body: `We embed YouTube videos (${GOOGLE}, USA) in privacy-enhanced mode. They load only after you agree (category "external media"); your IP address is then sent to YouTube.` },
    { id: 'vimeo', heading: 'Vimeo videos', body: 'We embed Vimeo videos (Vimeo.com, Inc., USA). They load only after you agree; your IP address is then sent to Vimeo.' },
    { id: 'gmaps', heading: 'Google Maps', body: `We embed maps from Google Maps (${GOOGLE}, USA). They load only after you agree; your IP address is then sent to Google.` },
    { id: 'gfonts', heading: 'Google Fonts', body: `Fonts are loaded from Google Fonts (${GOOGLE}, USA) only after you agree; your IP address is then sent to Google. Without consent we use system fonts.` },
    { id: 'calendly', heading: 'Other embedded services', body: () => `On some pages we embed services of other providers (for example booking tools, forms or media). They load only after you agree; your IP address is then sent to the provider. ${or('', 'name each provider and what it is used for', missing, 'Embedded services')}` },
  ];
  for (const t of third) if (has(t.id)) S.push({ heading: t.heading, body: typeof t.body === 'function' ? t.body() : t.body });

  const rec = merged(recipients(p, f, on, missing));
  S.push({
    heading: 'Who receives your data',
    body: `Within our business, only the people who need your data for their work can see it. Outside it, your data goes to:\n\n${rec.map(recipientLine).join('\n')}${has('invoices') ? '\n- **Kenya Revenue Authority** – invoices through eTIMS (Kenya)' : ''}${payments ? '\n- couriers and installers we engage to deliver or install your order – your name, phone number and delivery address' : ''}\n- our accountants, auditors and advocates, where needed for their work\n- public authorities and courts, where the law requires it\n\nService providers that process data on our behalf do so under a written agreement and only on our instructions (section 42 of the Act). We do not sell personal data.`,
  });
  const abroad = rec.filter((r) => r.country !== 'Kenya');
  S.push({
    heading: 'Transfers outside Kenya',
    body: !abroad.length ? 'We do not currently transfer personal data outside Kenya. If that changes, we will do so only as sections 48 and 49 of the Act allow and will update this policy first.' : `Some of our service providers store or process data outside Kenya. Storing data with a cloud provider whose servers are outside Kenya is itself such a transfer. We transfer personal data out of Kenya only as section 48 of the Act allows: with appropriate safeguards – written agreements with the providers, encryption in transit, access controls and our assessment of each provider's protection – or where the transfer is necessary to perform a contract with you. Sensitive personal data leaves Kenya only with your consent (section 49). We document these transfers and can show the record to the Data Commissioner (regulation 41).\n\nWe do not rely on an adequacy decision of the Data Commissioner for these countries. Their laws may protect your data less than Kenyan law – for example, authorities there may be able to access it, and it may be harder for you to enforce your rights. The safeguards above are meant to reduce these risks.\n\nThe providers concerned and where they process data:\n\n${abroad.map(recipientLine).join('\n')}`,
  });

  const keep = [
    'Enquiries that do not lead to a contract: up to 2 years after our last contact.',
    'Customer records and contracts: while we do business with you and up to 6 years after the last transaction, the period in which contract claims can be brought (Limitation of Actions Act, section 4).',
  ];
  if (has('invoices') || payments) keep.push('Invoices and tax records: 5 years (Tax Procedures Act, 2015, section 23; VAT Act, 2013, section 43).');
  if (marketing) keep.push('Marketing contacts: until you unsubscribe; the record of your consent as long as we need it to prove that you gave it (section 32(1) of the Act).');
  if (has('cmp')) keep.push('Records of cookie choices: up to 3 years, to prove your consent (section 32(1) of the Act).');
  keep.push('Server logs: up to 30 days, unless we need them to investigate a security incident.');
  S.push({ heading: 'How long we keep your data', body: `We keep personal data only as long as we need it for the purpose we collected it for, or as long as the law requires (section 39 of the Act; regulation 19):\n\n${keep.map((x) => `- ${x}`).join('\n')}\n\nAfter that we delete or anonymise it (section 39(2)).` });
  S.push({
    heading: 'How we protect your data',
    body: 'We protect personal data with technical and organisational measures (sections 41 and 42 of the Act; regulation 32), including:\n\n- encrypted connections (TLS) and encrypted storage of access keys and credentials;\n- personal user accounts, strong passwords and two-factor sign-in, with access only for people who need it;\n- separation of the data of different businesses on our systems and a log of changes;\n- regular backups kept apart from the live system, so data can be restored after an incident;\n- confidentiality duties for our staff and written agreements with our service providers;\n- a procedure for detecting, handling and reporting data breaches.',
  });
  S.push({
    heading: 'Your rights',
    body: `Under the Act you have the right:\n\n- to be informed how your data is used (section 26) – this policy;\n- to access your personal data – we answer within 7 days (regulation 9);\n- to have false, misleading, outdated or incomplete data corrected – within 14 days (section 40; regulation 10);\n- to have data deleted that we are no longer allowed to keep, that is irrelevant or excessive, or that was obtained unlawfully – within 14 days (section 40; regulation 12);\n- to restrict the processing of your data – within 14 days (section 34; regulation 7);\n- to object to processing – within 14 days (section 36; regulation 8); an objection to direct marketing is always granted;\n- to receive your data in a structured, commonly used, machine-readable format, or have it sent to another controller – within 30 days (section 38);\n- not to be subject to a decision based solely on automated processing that significantly affects you (section 35).\n\n**Consent:** you can withdraw your consent at any time. This does not affect processing that took place before (section 32).\n\n**How to exercise your rights:** write to ${email}${p.phone ? ` or call ${p.phone}` : ''}. You may use the forms in the Regulations (Forms DPG 1 to DPG 5), but you do not have to. We may ask you to confirm your identity. Exercising your rights is free of charge; for data portability we may charge a reasonable fee that does not exceed our actual cost. A parent or guardian exercises the rights of a child (section 27). If we refuse a request, we tell you why and how you can complain.`,
  });
  S.push({
    heading: 'Direct marketing',
    body: marketing || has('sms') || has('whatsapp')
      ? 'We use your data for direct marketing only with your express consent (section 37 of the Act), and every marketing message includes a free and simple way to opt out of all further marketing (regulations 15 to 17). We do not use sensitive personal data for direct marketing and we do not pass your data to others for their marketing. You can ask us at any time not to use or disclose your data for direct marketing; we comply within 7 days, free of charge (regulation 18).'
      : 'We do not use your personal data for direct marketing. If we want to in future, we will first ask for your express consent (section 37 of the Act), and every message will include a free and simple way to opt out. We do not pass your data to others for their marketing.',
  });
  S.push({
    heading: 'Automated decision-making',
    body: has('ai') || has('voice_ai')
      ? 'We use AI to help us answer you, as described above. We do not make decisions about you based solely on automated processing that produce legal effects or similarly significantly affect you (section 35 of the Act). You can always ask for a person to look at your matter.'
      : 'We do not make decisions about you based solely on automated processing, including profiling (section 35 of the Act).',
  });
  S.push({ heading: 'Children', body: 'Our services are not directed at children (persons under 18). We do not knowingly collect children\'s data. Where we need a child\'s data, we process it only with the consent of a parent or guardian and in the child\'s best interests (section 33 of the Act), and we never profile children for direct marketing (regulation 13). If you believe we hold data of a child without such consent, please contact us.' });
  S.push({ heading: 'Data breaches', body: 'If personal data is accessed or acquired by an unauthorised person and there is a real risk of harm, we notify the Data Commissioner within 72 hours of becoming aware of it, and we inform the people affected in writing as soon as reasonably practicable, with what happened, what we have done and what they can do to protect themselves (section 43 of the Act). We keep a record of every breach.' });
  S.push({
    heading: 'Complaints to the Data Commissioner',
    body: `If you are unhappy with how we handle your data, please tell us first so we can put it right. You can also complain to the Office of the Data Protection Commissioner (ODPC) at any time, free of charge – you do not have to contact us first (section 56 of the Act; Data Protection (Complaints Handling Procedure and Enforcement) Regulations, 2021).\n\nOffice of the Data Protection Commissioner\nBritam Towers, 12th Floor\nP.O. Box 30920-00100, Nairobi\nWebsite: www.odpc.go.ke – the current complaint channels (online complaint form, email, Form DPC 1) are listed there.`,
  });
  S.push({ heading: 'Contact us', body: `For any question about this policy or your data: ${email}${p.phone ? `, ${p.phone}` : ''}${p.po_box ? `, ${p.po_box}` : ''}.${dpo ? `\n\nData Protection Officer: ${dpo}` : ''}` });
  S.push({ heading: 'Changes to this policy', body: `We update this policy when our services or the law change. The current version always applies.\n\nLast updated: ${dateKe(now)}` });
  return doc('privacy', 'Privacy policy', `Last updated: ${dateKe(now)}`, S, missing, [...on]);
}

// --- Terms and conditions ------------------------------------------------------------------------------------------------------

const CPA = 'the Consumer Protection Act, 2012 ("CPA")';

export function kenyaTerms(p: LegalProfile, f: Facts, now = new Date()): LegalDoc {
  const missing: string[] = [];
  const on = new Set(activeServices(f, p.overrides));
  const mpesa = on.has('mpesa') || !!p.mpesa_number;
  const card = on.has('stripe');
  const S: Section[] = [];
  const name = or(p.company, 'registered name', missing, 'Registered name');
  const email = or(p.email, 'email address', missing, 'Email');
  S.push({
    heading: 'About us',
    body: `These terms apply when you buy goods or services from **${name}**${p.trading_name ? ` (trading as ${p.trading_name})` : ''}, ${oneLine(physical(p, missing))}${p.po_box ? `, ${p.po_box}` : ''}. KRA PIN: ${or(p.kra_pin, 'KRA PIN', missing, 'KRA PIN')}. Email: ${email}${p.phone ? `, phone: ${p.phone}` : ''}. In these terms "we" and "us" means ${name}${p.trading_name ? ` (${p.trading_name})` : ''}, and "you" means our customer.`,
  });
  S.push({
    heading: 'About these terms',
    body: `These terms apply to orders placed on our website, by phone, by email or other messages, and in our premises. Some parts apply only to consumers (people who buy for private use); where that is so, we say it.\n\nNothing in these terms limits any right you have under ${CPA}, the Sale of Goods Act (Cap. 31) or the Competition Act, 2010. If a part of these terms is unclear, it is read in your favour (CPA section 7). You can save, download and print these terms.`,
  });
  S.push({
    heading: 'Ordering and how the contract is made',
    body: 'Our product and service descriptions, adverts and price lists are invitations to order, not binding offers. Before you place an order online, you see a summary of the order with all charges, can correct any mistakes and choose to accept or decline (CPA section 31). The contract is made when we confirm your order in writing (for example by email or message).\n\nWe send you a copy of the agreement – the order confirmation with these terms – straight after the order (CPA section 32). Orders and confirmations made electronically are valid contracts (Kenya Information and Communications Act, section 83J).',
  });
  S.push({
    heading: 'Prices and VAT',
    body: `Prices are in Kenya Shillings (KSh). ${p.vat_registered ? 'Prices include VAT at 16% where VAT applies (VAT Act, 2013, section 5).' : 'We are not registered for VAT, so no VAT is charged.'} Delivery, installation and any payment charges are shown separately before you order; you pay nothing that was not shown to you (Competition Act, 2010, section 56(4)).\n\nWe issue an electronic tax invoice through the KRA eTIMS system for every sale (Tax Procedures Act, 2015, section 23A). If you buy for a business, give us your KRA PIN before we invoice so that it appears on the invoice.`,
  });
  const methods: string[] = [];
  if (mpesa) methods.push(`- **M-Pesa:** ${or(p.mpesa_number, 'M-Pesa Paybill or Till number', missing, 'M-Pesa Paybill or Till number')}. Please use your order number as the account reference.`);
  if (card) methods.push('- **Card:** through our payment provider Stripe. Card details go directly to Stripe and do not reach us.');
  if (!methods.length) methods.push(`- ${or('', 'the payment methods you accept, e.g. M-Pesa, bank transfer or cash', missing, 'Payment methods')}`);
  S.push({
    heading: 'Payment',
    body: `You can pay by:\n\n${methods.join('\n')}\n\nWe confirm your order once we have received the payment, unless we have agreed other terms with you. For goods made or imported to your order we may ask for a deposit; we tell you the amount, and what happens to it if the order is cancelled, before you order.\n\nThe goods remain ours until they are paid for in full; the risk passes to you when they are delivered to you (Sale of Goods Act, sections 20 and 22). If you buy in instalments and have paid two-thirds or more of the price, we will not repossess the goods without the leave of the High Court (CPA section 20).`,
  });
  S.push({
    heading: 'Delivery in Kenya',
    body: `We deliver within Kenya: ${or('', 'the areas you deliver to and the delivery charges or how they are worked out', missing, 'Delivery areas and charges')}.\n\nWith every order we give you a delivery date or period. If we do not deliver (or start a service) within 30 days after that date – or, where no date was agreed, within 30 days after the contract was made – you may cancel the order and get all your money back (CPA section 21). Please check the goods when they arrive and tell us about any damage or missing items as soon as you can; you have a reasonable opportunity to examine them before you are taken to have accepted them (Sale of Goods Act, section 35).`,
  });
  S.push({
    heading: 'Installation and services',
    body: 'We carry out installation and other services with reasonable care and skill, and they will be of a reasonably merchantable quality (CPA section 5). If we give you an estimate, the final price will not exceed it by more than 10% unless you agree to the higher amount first (CPA section 6).',
  });
  S.push({
    heading: 'Cancellation and refunds',
    body: `**Your statutory rights to cancel.** As a consumer you may cancel:\n\n- an online order at any time until 7 days after you receive your copy of the agreement, if we did not give you the required information or a chance to review and correct your order before you placed it (CPA section 33(1));\n- an online order within 30 days after it was made, if we did not meet the other requirements the CPA sets for online agreements (CPA section 33(2));\n- an order placed by phone or other remote means, until 7 days after you receive your copy of the agreement if we did not give you the required information first, or within one year if we did not give you a copy at all (CPA section 38);\n- an order that is delivered or started more than 30 days late (CPA section 21);\n- an agreement made with you at your home, your site or another place that is not our business premises, as section 35 of the CPA provides.\n\n**How to cancel.** Tell us in any way that shows you want to cancel – by phone, email, message or letter (CPA section 76). A written notice counts as given when you send it.\n\n**Refunds.** When you cancel under the CPA, we refund all payments you made under the agreement (CPA section 80). We do this within 14 days, by the method you paid with${mpesa || card ? ` – to the ${[mpesa ? 'M-Pesa number' : '', card ? 'card' : ''].filter(Boolean).join(' or ')} you paid from –` : ''} and issue a credit note through eTIMS. You return the goods or let us collect them, and take reasonable care of them until then.\n\n**Change of mind.** ${or('', 'whether you accept returns when a customer simply changes their mind – within how many days, in what condition and who pays for the return', missing, 'Change-of-mind returns')}\n\nGoods that are faulty or not as described are always covered by your rights under "Warranties".`,
  });
  S.push({
    heading: 'Warranties',
    body: 'The goods we sell will be of merchantable quality, match their description and be fit for any particular purpose you told us about (Sale of Goods Act, sections 15 and 16; CPA section 5). These statutory warranties cannot be excluded or reduced (CPA section 5(3)).\n\nMany products also come with a manufacturer\'s or our own warranty; its terms are given on the product page or warranty card. Such a warranty is in addition to your rights under the CPA and the Sale of Goods Act, which are not affected. If goods are faulty, tell us and we will repair or replace them or refund you.\n\nPlease use products as described in their instructions and tell us about any defect or safety concern straight away.',
  });
  S.push({
    heading: 'Limitation of liability',
    body: 'We are not liable for loss that was not foreseeable when the contract was made, or for loss of business or profit if you buy for a business. Otherwise our liability for any order is limited to the price of that order.\n\nNothing in these terms limits our liability for death or personal injury caused by our negligence, for fraud, or for any liability that cannot be limited under the CPA, the Sale of Goods Act or the Competition Act, 2010.',
  });
  const disputes = [
    `If you are unhappy with our goods or service, please contact us first at ${email}${p.phone ? ` or ${p.phone}` : ''}. We will try to settle the matter with you by negotiation in good faith.`,
    'If we cannot agree, you may take the claim to the Small Claims Court (claims up to KSh 1,000,000; Small Claims Court Act, 2016, section 12) or to any other competent court of Kenya. Nothing in these terms stops a consumer from going to court, including the High Court, or from joining a class proceeding (CPA sections 4 and 88).',
  ];
  if (p.arbitration) disputes.push(`**Business customers – arbitration.** A dispute with a customer who buys for a business that is not settled by negotiation within 30 days will be referred to arbitration by a sole arbitrator under the Arbitration Act, 1995, seated in Nairobi and conducted in English. The arbitrator is agreed by the parties or, if they cannot agree within 14 days, appointed by ${or('', 'the appointing body, e.g. the Chartered Institute of Arbitrators (Kenya Branch)', missing, 'Arbitration appointing body')}. This clause applies only to business customers. It does not apply to consumers: a consumer may agree to arbitration only after a dispute has arisen, and is never prevented from going to court (CPA section 88).`);
  S.push({ heading: 'Complaints and disputes', body: disputes.join('\n\n') });
  S.push({ heading: 'Privacy', body: 'How we use your personal data is explained in our privacy policy.' });
  S.push({ heading: 'Changes to these terms', body: 'We may change these terms for future orders. The terms that applied when you placed your order apply to that order.' });
  S.push({ heading: 'Governing law', body: `These terms and every contract made under them are governed by the laws of Kenya.\n\nLast updated: ${dateKe(now)}` });
  return doc('terms', 'Terms and conditions', `Last updated: ${dateKe(now)}`, S, missing, [...on]);
}

// --- Data processing agreement (section 42 of the Act; regulations 24 and 25) ---------------------------------------------------

const KE_SECURITY = [
  'Access control: personal user accounts with strong passwords, optional two-factor sign-in and passkeys; sessions expire; accounts are locked after repeated failed attempts.',
  'Authorisation: roles and permissions per area; every query is limited to the controller\'s own account (logical separation of each customer\'s data); API keys per account.',
  'Encryption: connections are encrypted with TLS; access keys and credentials are stored encrypted (AES-256-GCM); webhooks are signed.',
  'Logging: an audit log of changes and the possibility to undo changes to records.',
  'Availability: regular backups, stored separately from the live system, and restore tests; monitoring of the systems.',
  'Data minimisation and deletion: contacts can be exported in full and deleted; network addresses in consent records are stored shortened.',
  'Organisation: staff are bound to confidentiality and trained in data protection; a procedure for detecting and reporting personal data breaches.',
];

export function kenyaDpa(p: LegalProfile, input: Partial<AvvInput>, f: Facts, now = new Date()): LegalDoc {
  const missing: string[] = [];
  const proc = input.processor ?? { name: p.company, address: [p.building, p.street, p.city, p.county].map((x) => x.trim()).filter(Boolean).concat(p.building || p.street || p.city || p.county ? ['Kenya'] : []).join(', '), representative: p.owner };
  const ctrl = input.controller ?? { name: '', address: '' };
  const pname = or(proc.name, 'name of the processor', missing, 'Processor');
  const cname = or(ctrl.name, 'name of the controller (your customer)', missing, 'Controller');
  const on = new Set(activeServices(f, p.overrides));
  const subs = (input.subprocessors ?? merged(recipients(p, f, on, missing).filter((r) => r.processor)).map((r) => ({ name: r.name, task: r.task, place: r.country }))).map((x) => `- **${x.name}** – ${x.task}${x.place ? ` (${x.place})` : ''}`);
  const kinds = ['contact details (name, email, phone, address, company)', 'communication data (emails, SMS, chat and other messages)', 'contract, order and billing data', 'usage and log data (IP address, time stamps, source)', 'consent records (time, source, version of the text, shortened network address)'];
  if (on.has('calendars') || on.has('webinars')) kinds.push('booking and registration data');
  if (on.has('hr')) kinds.push('employee data (only if separately agreed)');
  const S: Section[] = [
    { heading: 'Parties', body: `**Controller:**\n${cname}\n${or(ctrl.address, 'address of the controller', missing, 'Controller address')}${ctrl.representative ? `\nRepresented by: ${ctrl.representative}` : ''}\n\n**Processor:**\n${pname}\n${or(proc.address, 'address of the processor', missing, 'Processor address')}${proc.representative ? `\nRepresented by: ${proc.representative}` : ''}${!input.processor && p.kra_pin ? `\nKRA PIN: ${p.kra_pin}` : ''}` },
    { heading: '1. Background and roles', body: `1.1 The processor processes personal data on behalf of the controller under the main agreement between them. This agreement is the written contract required by section 42(2) of the Data Protection Act, 2019 ("the Act") and regulation 24 of the Data Protection (General) Regulations, 2021 ("the Regulations").\n\n1.2 The controller decides the purposes and means of the processing. A processor that processes personal data other than as instructed by the controller is treated as a controller for that processing (section 42(3)).` },
    { heading: '2. Subject matter and duration', body: `2.1 Subject matter: ${input.service?.trim() || 'the provision and operation of customer management, communication and marketing software (CRM, forms, pages, email/SMS, bookings, payments) for the controller'}.\n\n2.2 Duration: as long as the main agreement runs, and until all personal data has been deleted or returned under clause 12.` },
    { heading: '3. Nature, purpose, data and data subjects', body: `3.1 Nature and purpose: storing, retrieving, transmitting, analysing and deleting personal data to provide the agreed services.\n\n3.2 Types of personal data:\n${kinds.map((x) => `- ${x}`).join('\n')}\n\n3.3 Categories of data subjects: the controller's customers and prospects, newsletter subscribers, people who book appointments or events, community members, contact persons of business customers and the controller's staff.\n\n3.4 The controller is responsible for the lawfulness of the processing (including a legal basis under section 30 of the Act), for informing data subjects and for its own registration with the Data Commissioner.` },
    { heading: '4. Instructions', body: '4.1 The processor processes personal data only on the documented instructions of the controller, including with regard to transfers outside Kenya, unless a law of Kenya requires otherwise; in that case it tells the controller before processing, unless the law forbids this.\n\n4.2 Instructions are given in writing; email is sufficient. The processor tells the controller without delay if it believes an instruction infringes the Act.' },
    { heading: '5. Confidentiality', body: 'The processor ensures that everyone it authorises to process the personal data is bound to keep it confidential (regulation 24(2)(c)) and processes it only as instructed.' },
    { heading: '6. Security', body: 'The processor takes the technical and organisational measures described in **Schedule 1** to protect the integrity, confidentiality and availability of the personal data (sections 41 and 42(1) of the Act; regulation 32) and keeps them up to date. It ensures that its staff and agents comply with them (section 42(4)).' },
    { heading: '7. Sub-processors', body: '7.1 The controller authorises the sub-processors listed in **Schedule 2** (regulation 25). The processor engages them under a written contract that contains the particulars of regulation 24(2) and remains liable to the controller for their performance.\n\n7.2 The processor gives the controller at least 14 days\' written notice of any new or replaced sub-processor; the controller may object on reasonable grounds.' },
    { heading: '8. Transfers outside Kenya', body: 'Personal data is transferred out of Kenya only on the controller\'s instructions and as sections 48 and 49 of the Act allow – with appropriate safeguards, which include written agreements with each recipient (regulation 48), or where another ground in section 48 applies. Sensitive personal data is transferred only where the data subject has consented (section 49). The processor gives the controller the information it needs to keep the record of transfers required by regulation 41(2).' },
    { heading: '9. Assistance', body: 'Taking into account the nature of the processing, the processor helps the controller to answer requests from data subjects within the time limits of the Act and the Regulations (the software provides export and deletion per contact), to carry out data protection impact assessments (section 31) and to meet its security and breach-notification duties.' },
    { heading: '10. Personal data breaches', body: 'The processor notifies the controller of a personal data breach without delay and, where reasonably practicable, within 48 hours of becoming aware of it (section 43(3)), with the information the controller needs to notify the Data Commissioner within 72 hours and to inform the data subjects (section 43(1)). The processor keeps a record of every breach.' },
    { heading: '11. Audits and inspections', body: 'The processor makes available to the controller all information needed to show compliance with this agreement and allows and contributes to audits and inspections by the controller or an auditor it appoints, after reasonable notice (regulation 24(2)(f)).' },
    { heading: '12. End of processing', body: 'When the services end, the processor will, at the controller\'s choice, permanently delete or return all personal data (export) and delete existing copies, unless a law of Kenya requires it to keep them (regulation 24(2)(e)).' },
    { heading: '13. Registration with the Data Commissioner', body: `Each party confirms that it is registered with the Office of the Data Protection Commissioner where section 18 of the Act requires it and will keep its registration current.${p.odpc_no && !input.processor ? ` The processor's registration certificate no.: ${p.odpc_no}.` : ' The processor gives its registration certificate number on request.'}` },
    { heading: '14. Liability', body: 'Each party is liable to data subjects as section 65 of the Act provides; the processor is liable only where it has not complied with the obligations of a processor or has acted outside the controller\'s lawful instructions. Otherwise the liability provisions of the main agreement apply.' },
    { heading: '15. General', body: `If this agreement and the main agreement conflict on data protection, this agreement prevails. Changes must be in writing. If a provision is invalid, the rest remains in force. This agreement is governed by the laws of Kenya and the courts of Kenya have jurisdiction.\n\nPlace and date: ____________\n\n______________________ (Controller)        ______________________ (Processor)` },
    { heading: 'Schedule 1 – Technical and organisational security measures', body: KE_SECURITY.map((x) => `- ${x}`).join('\n') },
    { heading: 'Schedule 2 – Authorised sub-processors', body: subs.length ? subs.join('\n') : '- none' },
  ];
  return doc('dpa', 'Data processing agreement (section 42, Data Protection Act, 2019)', `Draft of ${dateKe(now)}`, S, missing, [...on]);
}
