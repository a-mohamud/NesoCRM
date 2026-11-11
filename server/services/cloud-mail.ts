import { escapeHtml } from '../core/template.js';
import { tApp, type STFn } from '../i18n/index.js';

/**
 * System mails of the hosted service (short, one action each; German texts are the message ids of server/i18n). `composeMail` returns subject, plain text
 * and a plain HTML version; the module sends them through the operator's mail sub-account.
 */

export type MailKind =
  | 'verify'
  | 'account_exists'
  | 'welcome'
  | 'invite'
  | 'trial_ending'
  | 'trial_expired'
  | 'payment_failed'
  | 'payment_reminder'
  | 'read_only'
  | 'deletion_scheduled'
  | 'self_delete'
  | 'deleted'
  | 'subscribed'
  | 'cancel_scheduled'
  | 'canceled'
  | 'plan_changed'
  /** A free-form notice (abuse decisions, statements of reasons): `subject`, `lines`, optional `button` + `link`. */
  | 'notice';

export interface MailVars {
  brand: string;
  name?: string;
  company?: string;
  link?: string;
  support?: string;
  [k: string]: string | number | string[] | undefined;
}

interface Spec {
  subject: string;
  lines: string[];
  button?: string;
}

const v = (x: unknown) => String(x ?? '');

const hi = (t: STFn, m: MailVars) => (v(m.name) ? t('Hallo {name},', { name: v(m.name) }) : t('Hallo,'));

const SPECS: Record<MailKind, (m: MailVars, t: STFn) => Spec> = {
  verify: (m, t) => ({
    subject: t('Bitte bestätige deine E-Mail-Adresse – {brand}', { brand: m.brand }),
    lines: [v(m.name) ? t('Hallo {name},', { name: v(m.name) }) : t('Hallo und willkommen,'), t('du hast bei {brand} ein Konto für „{company}“ angefragt. Mit einem Klick bestätigst du deine E-Mail-Adresse – danach geht es direkt weiter.', { brand: m.brand, company: v(m.company) }), t('Der Link ist 24 Stunden gültig. Wenn du das nicht warst, ignoriere diese Nachricht einfach.')],
    button: t('E-Mail bestätigen'),
  }),
  account_exists: (m, t) => ({
    subject: t('Du hast schon ein Konto bei {brand}', { brand: m.brand }),
    lines: [t('Hallo,'), t('für diese E-Mail-Adresse gibt es bei {brand} bereits ein Konto. Melde dich einfach an – falls du dein Passwort vergessen hast, kannst du es auf der Anmeldeseite zurücksetzen lassen.', { brand: m.brand }), t('Wenn du dich gar nicht angemeldet hast, kannst du diese Nachricht ignorieren.')],
    button: t('Zur Anmeldung'),
  }),
  welcome: (m, t) => ({
    subject: t('Willkommen bei {brand} – dein Konto ist bereit', { brand: m.brand }),
    lines: [
      hi(t, m),
      m.trial_end ? t('dein Konto „{company}“ ist startklar (Tarif {plan}, Testphase bis {trial_end}).', { company: v(m.company), plan: v(m.plan), trial_end: v(m.trial_end) }) : t('dein Konto „{company}“ ist startklar (Tarif {plan}).', { company: v(m.company), plan: v(m.plan) }),
      t('So kommst du am schnellsten ans Ziel:'),
      ...((m.checklist as string[] | undefined) ?? []).map((x) => `• ${x}`),
      m.support ? t('Fragen? Schreib uns: {support}', { support: v(m.support) }) : '',
    ].filter(Boolean),
    button: t('Konto öffnen'),
  }),
  invite: (m, t) => ({
    subject: t('{inviter} hat dich zu {company} eingeladen', { inviter: v(m.inviter) || t('Dein Team'), company: v(m.company) }),
    lines: [hi(t, m), t('{inviter} hat dich zu „{company}“ bei {brand} eingeladen. Lege dein Passwort fest und leg los.', { inviter: v(m.inviter) || t('Dein Team'), company: v(m.company), brand: m.brand }), t('Der Link ist 7 Tage gültig und nur einmal nutzbar.')],
    button: t('Passwort festlegen'),
  }),
  trial_ending: (m, t) => ({
    subject: t.plural(Number(m.days) || 0, { one: 'Deine Testphase endet in {n} Tag', other: 'Deine Testphase endet in {n} Tagen' }),
    lines: [
      hi(t, m),
      `${t('deine Testphase bei {brand} endet am {trial_end}.', { brand: m.brand, trial_end: v(m.trial_end) })} ${m.card ? t('Danach läuft dein Abo automatisch weiter.') : t('Um ohne Unterbrechung weiterzuarbeiten, wähle jetzt Tarif und Zahlungsart – sonst wird dein Konto danach schreibgeschützt.')}`,
      t('Du kannst jederzeit kündigen und alle Daten exportieren.'),
    ],
    button: t('Abo ansehen'),
  }),
  trial_expired: (m, t) => ({
    subject: t('Deine Testphase ist abgelaufen – dein Konto ist jetzt schreibgeschützt'),
    lines: [hi(t, m), t('deine Testphase ist vorbei. Alle deine Daten sind noch da und lesbar; Änderungen sind gesperrt, bis du ein Abo abschließt.'), t('Du kannst deine Daten jederzeit exportieren. Ohne Abo bieten wir den Export nach {days} Tagen noch einmal an und löschen das Konto danach.', { days: v(m.retention_days) })],
    button: t('Abo abschließen'),
  }),
  payment_failed: (m, t) => ({
    subject: t('Zahlung fehlgeschlagen – bitte Zahlungsmethode prüfen'),
    lines: [
      hi(t, m),
      m.grace_until
        ? t('die letzte Zahlung für {brand} ist fehlgeschlagen. Bitte aktualisiere deine Zahlungsmethode bis {date} – sonst wird dein Konto danach schreibgeschützt (Daten bleiben lesbar und exportierbar).', { brand: m.brand, date: v(m.grace_until) })
        : t('die letzte Zahlung für {brand} ist fehlgeschlagen. Bitte aktualisiere deine Zahlungsmethode – sonst wird dein Konto danach schreibgeschützt (Daten bleiben lesbar und exportierbar).', { brand: m.brand }),
    ],
    button: t('Zahlung aktualisieren'),
  }),
  payment_reminder: (m, t) => ({
    subject: m.last ? t('Letzte Erinnerung: Zahlung offen') : t('Erinnerung: Zahlung offen'),
    lines: [hi(t, m), `${t('deine Zahlung ist noch offen.')} ${m.grace_until ? t('Bis {date} bleibt alles wie gewohnt, danach wird dein Konto schreibgeschützt.', { date: v(m.grace_until) }) : ''}`.trim()],
    button: t('Zahlung aktualisieren'),
  }),
  read_only: (m, t) => ({
    subject: t('Dein Konto ist jetzt schreibgeschützt'),
    lines: [hi(t, m), `${v(m.reason) || t('Dein Konto ist schreibgeschützt.')} ${t('Alles bleibt lesbar, du kannst deine Daten exportieren. Mit der offenen Zahlung bzw. einem neuen Abo ist sofort wieder alles freigeschaltet.')}`],
    button: t('Konto öffnen'),
  }),
  deletion_scheduled: (m, t) => ({
    subject: t('Dein Konto wird am {date} gelöscht', { date: v(m.delete_at) }),
    lines: [hi(t, m), t('dein Konto „{company}“ ist seit längerem schreibgeschützt. Wir löschen es am {date} endgültig (Datenschutz: wir behalten Daten nicht länger als nötig).', { company: v(m.company), date: v(m.delete_at) }), t('Du kannst vorher alle Daten als ZIP exportieren (JSON und CSV). Mit einem neuen Abo bleibt dein Konto erhalten.')],
    button: t('Daten exportieren'),
  }),
  self_delete: (m, t) => ({
    subject: t('Dein Konto wird am {date} gelöscht', { date: v(m.delete_at) }),
    lines: [hi(t, m), t('du hast die Löschung von „{company}“ angefordert. Das Konto ist ab sofort schreibgeschützt und wird am {date} endgültig gelöscht. Das Abo wurde beendet.', { company: v(m.company), date: v(m.delete_at) }), t('Bis dahin kannst du alle Daten exportieren oder die Löschung zurücknehmen.')],
    button: t('Löschung verwalten'),
  }),
  deleted: (m, t) => ({
    subject: t('Dein Konto wurde gelöscht'),
    lines: [hi(t, m), t('wie angekündigt haben wir „{company}“ und alle zugehörigen Daten gelöscht. Danke, dass du {brand} ausprobiert hast.', { company: v(m.company), brand: m.brand })],
  }),
  subscribed: (m, t) => ({
    subject: t('Danke – dein Abo {plan} läuft', { plan: v(m.plan) }),
    lines: [hi(t, m), t('dein Abo „{plan}“ ist aktiv. Rechnungen findest du jederzeit unter Einstellungen → Cloud-Konto.', { plan: v(m.plan) })],
    button: t('Konto öffnen'),
  }),
  cancel_scheduled: (m, t) => ({
    subject: t('Deine Kündigung ist eingegangen'),
    lines: [hi(t, m), t('dein Abo endet am {end}. Bis dahin läuft alles wie gewohnt. Du kannst die Kündigung jederzeit zurücknehmen und deine Daten exportieren.', { end: v(m.end) || t('dem Ende des Zeitraums') })],
    button: t('Cloud-Konto öffnen'),
  }),
  canceled: (m, t) => ({
    subject: t('Dein Abo ist beendet'),
    lines: [hi(t, m), t('dein Abo ist beendet. Das Konto ist schreibgeschützt; deine Daten kannst du noch exportieren. Du kannst jederzeit ein neues Abo abschließen.')],
    button: t('Konto öffnen'),
  }),
  notice: (m) => ({
    subject: v(m.subject),
    lines: ((m.lines as string[] | undefined) ?? []).filter(Boolean),
    button: m.button ? v(m.button) : undefined,
  }),
  plan_changed: (m, t) => ({
    subject: t('Dein Tarif: {plan}', { plan: v(m.plan) }),
    lines: [hi(t, m), t('dein Tarif wurde auf „{plan}“ umgestellt. Die Differenz wird anteilig verrechnet.', { plan: v(m.plan) })],
    button: t('Cloud-Konto öffnen'),
  }),
};

export function composeMail(kind: MailKind, vars: MailVars, t: STFn = tApp()): { subject: string; text: string; html: string } {
  const spec = SPECS[kind](vars, t);
  const sign = `${t('Viele Grüße')}\n${vars.brand}`;
  const text = [...spec.lines, spec.button && vars.link ? `${spec.button}: ${vars.link}` : '', vars.support && kind !== 'welcome' ? t('Fragen? {support}', { support: v(vars.support) }) : '', sign].filter(Boolean).join('\n\n');
  const body = spec.lines.map((l) => `<p style="margin:0 0 14px">${escapeHtml(l).replace(/\n/g, '<br>')}</p>`).join('');
  const button = spec.button && vars.link ? `<p style="margin:22px 0"><a href="${escapeHtml(vars.link)}" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:9px;font-weight:600;display:inline-block">${escapeHtml(spec.button)}</a></p><p style="margin:0 0 14px;color:#6b7280;font-size:13px">${escapeHtml(t('Falls der Knopf nicht geht: {link}', { link: vars.link }))}</p>` : '';
  const foot = `<p style="margin:22px 0 0;color:#6b7280;font-size:13px">${vars.support && kind !== 'welcome' ? `${escapeHtml(t('Fragen? {support}', { support: v(vars.support) }))}<br>` : ''}${escapeHtml(t('Viele Grüße'))}<br>${escapeHtml(vars.brand)}</p>`;
  const html = `<!doctype html><html lang="${t.locale}"><body style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#1f2937;max-width:560px;margin:0 auto;padding:24px">${body}${button}${foot}</body></html>`;
  return { subject: spec.subject, text, html };
}
