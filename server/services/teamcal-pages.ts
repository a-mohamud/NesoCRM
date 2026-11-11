import type { App } from '../core/app.js';
import { jsonForScript, noscriptNotice, publicPage } from '../core/page.js';
import { escapeHtml } from '../core/template.js';
import { centsToMoney } from '../core/util.js';
import { formatInTz } from '../core/time.js';
import type { CalendarRow } from '../modules/calendars.js';
import { durationChoices, guestsAllowed, mayChange, multiAllowed, VIDEO_LABEL, type TeamCalConfig } from './teamcal-model.js';
import { tApp, tLoc, type STFn } from '../i18n/index.js';

/**
 * The public pages of the Team-Kalender, rendered on the server like the plain booking page: booking (with questions, price,
 * policy), the page of a booked appointment (cancel, reschedule, link), the return page after paying, routing forms and the
 * waiting-list offer. Plain HTML plus a little script; labels belong to their fields, status changes are announced to screen
 * readers, targets are at least 44 px high, everything works on a phone.
 */

const CSS = `
<style>
.tc :focus-visible { outline: 3px solid #1d4ed8; outline-offset: 2px; }
.tc h1:focus { outline: none; }
.tc h2 { font-size: 17px; margin: 22px 0 10px; }
.tc .meta { list-style: none; padding: 0; margin: 4px 0 14px; display: flex; flex-wrap: wrap; gap: 8px; }
.tc .meta li { background: #f3f4f6; border-radius: 999px; padding: 6px 14px; font-size: 14px; }
.tc .price { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e3a8a; border-radius: 12px; padding: 12px 14px; margin: 0 0 14px; }
.tc details.policy { border: 1px solid var(--line); border-radius: 12px; padding: 10px 14px; margin: 0 0 14px; }
.tc details.policy summary { cursor: pointer; font-weight: 600; min-height: 32px; display: flex; align-items: center; }
.tc .days { display: flex; gap: 8px; overflow-x: auto; padding: 6px 2px 12px; }
.tc .day { flex: 0 0 auto; min-width: 68px; min-height: 58px; padding: 8px 12px; background: #fff; color: var(--text); border: 1px solid #d1d5db; border-radius: 12px; font-weight: 600; line-height: 1.25; }
.tc .day:hover { border-color: var(--brand); }
.tc .day[aria-pressed="true"] { background: var(--brand); border-color: var(--brand); color: #fff; }
.tc .day.none { opacity: .7; border-style: dashed; }
.tc .slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(108px, 1fr)); gap: 10px; margin-top: 8px; }
.tc .slot { min-height: 52px; padding: 8px; background: #fff; color: var(--brand); border: 2px solid var(--brand); border-radius: 12px; font-weight: 700; font-size: 16px; }
.tc .slot:hover, .tc .slot:focus-visible { background: var(--brand); color: #fff; }
.tc .slot small { display: block; font-weight: 500; font-size: 12px; }
.tc .slot.full { border-style: dashed; border-color: #6b7280; color: #374151; }
.tc .nav { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
.tc .nav button, .tc button.secondary, .tc a.btn { min-height: 48px; }
.tc button.secondary { background: #fff; color: var(--text); border: 1px solid #d1d5db; }
.tc button.danger { background: #b91c1c; }
.tc fieldset { border: 0; padding: 0; margin: 14px 0 0; }
.tc legend { font-weight: 600; font-size: 14px; padding: 0; margin-bottom: 6px; }
.tc .opt { display: flex; gap: 10px; align-items: center; min-height: 44px; padding: 6px 12px; border: 1px solid #d1d5db; border-radius: 10px; margin: 0 0 8px; font-weight: 400; cursor: pointer; }
.tc .opt input { width: 22px; height: 22px; margin: 0; flex: 0 0 auto; }
.tc .opt:has(input:checked) { border-color: var(--brand); background: #eff6ff; }
.tc .help { font-size: 13px; color: var(--muted); margin: 4px 0 0; }
.tc .live { min-height: 24px; }
.tc .status { display: inline-block; padding: 4px 12px; border-radius: 999px; font-weight: 700; font-size: 14px; }
.tc .status.ok { background: #dcfce7; color: #166534; } .tc .status.off { background: #fee2e2; color: #991b1b; }
.tc .sr { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
.tc .linkbox { background: #f3f4f6; border-radius: 12px; padding: 12px 14px; word-break: break-all; margin: 10px 0; }
@media (max-width: 560px) { .tc .slots { grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); } .tc .nav > * { flex: 1 1 100%; text-align: center; } }
</style>`;

/** The texts the page scripts show, in the sub-account's language (the scripts read them from `L`, `tx` fills the {placeholders}). */
const scriptTexts = (t: STFn) => ({
  locale: t.locale === 'de' ? 'de-DE' : 'en-GB',
  dayFree: t('{n} freie Zeiten'),
  dayNone: t('keine freien Zeiten'),
  noneThisDay: t('Keine freien Zeiten an diesem Tag.'),
  fullWait: t('ausgebucht – Warteliste'),
  seatOne: t('{n} Platz frei'),
  seatMany: t('{n} Plätze frei'),
  fullWaitAria: t('ausgebucht, Warteliste'),
  freeOn: t('{n} freie Zeiten am {date}'),
  loading: t('Lade freie Zeiten …'),
  loadFailed: t('Die freien Zeiten konnten nicht geladen werden.'),
  atTime: t('{time} Uhr'),
  waitlistSuffix: t(' – Warteliste'),
  toWaitlist: t('Auf die Warteliste setzen'),
  failed: t('Das hat nicht geklappt.'),
  needFirst: t('Bitte den Vornamen angeben.'),
  needEmail: t('Bitte eine gültige E-Mail-Adresse angeben.'),
  answer: t('Bitte beantworten: {label}'),
  needConsent: t('Bitte stimme der Speicherung deiner Angaben zu.'),
  toStripe: t('Weiter zu Stripe …'),
  waitlisted: t('Du stehst auf der Warteliste.'),
  booked: t('Termin gebucht! ✅'),
  waitlistInfo: t('Wird ein Platz frei, bekommst du eine E-Mail mit einem Link, der ihn 24 Stunden für dich reserviert.'),
  confirmMail: t('Eine Bestätigung kommt per E-Mail.'),
  withHosts: t('Mit {names}'),
  and: t(' und '),
  video: t('Zum Video-Gespräch'),
  addCal: t('In Kalender eintragen'),
  manage: t('Termin verwalten'),
  offline: t('Keine Verbindung – bitte noch einmal versuchen.'),
  cancelFailed: t('Absagen ging nicht.'),
  moveFailed: t('Verschieben ging nicht.'),
  paidOk: t('Zahlung erhalten – dein Termin ist bestätigt! ✅ Die Bestätigung kommt per E-Mail.'),
  holdExpired: t('Die Reservierung ist abgelaufen. Bitte wähle eine neue Zeit.'),
  pickNew: t('Neuen Termin wählen'),
  takenRefund: t('Der Termin war inzwischen vergeben – deine Zahlung wird erstattet.'),
  payCancelled: t('Die Zahlung wurde abgebrochen. Deine Zeit ist noch bis {time} reserviert.'),
  payNow: t('Jetzt bezahlen'),
  pickOther: t('Andere Zeit wählen'),
  slow: t('Die Bestätigung dauert länger als gewöhnlich. Du bekommst eine E-Mail, sobald die Zahlung angekommen ist.'),
  pickAnswer: t('Bitte eine Antwort wählen.'),
  toPayment: t('Weiter zur Zahlung …'),
  bookedMail: t('Gebucht! Die Bestätigung kommt per E-Mail.'),
  seatGone: t('Der Platz ist leider nicht mehr frei.'),
});
const textsJs = (t: STFn) => `var L = ${jsonForScript(scriptTexts(t))};
function tx(s, v) { return s.replace(/\{(\w+)\}/g, function (m, k) { return v[k] !== undefined ? v[k] : m; }); }`;

/** The slot picker shared by the booking page and the page of a booked appointment (reschedule); needs `textsJs` before it. */
const PICKER_JS = `
function makePicker(o) {
  var $ = function (id) { return document.getElementById(id); };
  var from = new Date().toISOString().slice(0, 10), days = [], sel = null;
  var fmtDay = function (d) { var dt = new Date(d + 'T12:00:00'); return dt.toLocaleDateString(L.locale, { weekday: 'short' }) + '<br>' + dt.toLocaleDateString(L.locale, { day: '2-digit', month: '2-digit' }); };
  var hm = function (s) { return new Date(s).toLocaleTimeString(L.locale, { hour: '2-digit', minute: '2-digit' }); };
  function draw() {
    var box = $(o.days); box.innerHTML = '';
    days.forEach(function (d) {
      var n = d.slots.length + (d.full ? d.full.length : 0);
      var b = document.createElement('button'); b.type = 'button'; b.className = 'day' + (n ? '' : ' none');
      b.setAttribute('aria-pressed', d === sel ? 'true' : 'false'); b.innerHTML = fmtDay(d.date);
      b.setAttribute('aria-label', new Date(d.date + 'T12:00:00').toLocaleDateString(L.locale, { weekday: 'long', day: 'numeric', month: 'long' }) + ', ' + (d.slots.length ? tx(L.dayFree, { n: d.slots.length }) : L.dayNone));
      b.onclick = function () { sel = d; draw(); $(o.slots).focus(); };
      box.appendChild(b);
    });
    var sl = $(o.slots); sl.innerHTML = '';
    var list = sel ? sel.slots.map(function (s) { return { s: s, full: false }; }).concat((sel.full || []).map(function (s) { return { s: s, full: true }; })).sort(function (a, b) { return a.s < b.s ? -1 : 1; }) : [];
    if (!list.length) { var p = document.createElement('p'); p.className = 'muted'; p.textContent = L.noneThisDay; sl.appendChild(p); }
    list.forEach(function (x) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'slot' + (x.full ? ' full' : '');
      b.textContent = hm(x.s);
      if (x.full) { var sm = document.createElement('small'); sm.textContent = L.fullWait; b.appendChild(sm); }
      else if (sel.left && sel.left[x.s] && o.seats) { var sm2 = document.createElement('small'); sm2.textContent = tx(sel.left[x.s] === 1 ? L.seatOne : L.seatMany, { n: sel.left[x.s] }); b.appendChild(sm2); }
      b.setAttribute('aria-label', new Date(x.s).toLocaleString(L.locale, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) + (x.full ? ', ' + L.fullWaitAria : ''));
      b.onclick = function () { o.onPick(x.s, x.full); };
      sl.appendChild(b);
    });
    $(o.live).textContent = sel ? (sel.slots.length ? tx(L.freeOn, { n: sel.slots.length, date: new Date(sel.date + 'T12:00:00').toLocaleDateString(L.locale, { weekday: 'long', day: 'numeric', month: 'long' }) }) : L.noneThisDay) : '';
  }
  function load() {
    $(o.live).textContent = L.loading;
    return fetch(o.url + (o.url.indexOf('?') > -1 ? '&' : '?') + 'from=' + from + '&days=7').then(function (r) { return r.json(); }).then(function (j) {
      days = j.days || []; sel = days.filter(function (d) { return d.slots.length; })[0] || days[0] || null; draw();
    }).catch(function () { $(o.live).textContent = L.loadFailed; });
  }
  $(o.prev).onclick = function () { var d = new Date(from + 'T12:00:00'); d.setDate(d.getDate() - 7); var t = new Date().toISOString().slice(0, 10); var n = d.toISOString().slice(0, 10); from = n < t ? t : n; load(); };
  $(o.next).onclick = function () { var d = new Date(from + 'T12:00:00'); d.setDate(d.getDate() + 7); from = d.toISOString().slice(0, 10); load(); };
  return { load: load };
}`;

const money = (c: number, cur: string) => centsToMoney(c, cur);

const nl = (s: string) => escapeHtml(s).replace(/\n/g, '<br>');

/** The booking page of a team calendar. */
export function bookingPage(app: App, cal: CalendarRow, cfg: TeamCalConfig, o: { embed: boolean }): string {
  const loc = app.location(cal.location_id)!;
  const t = tLoc(app, cal.location_id);
  const e = (s: string) => escapeHtml(s);
  const s = cal.settings;
  const pay = cfg.payment;
  const durs = cfg.kind === 'group' ? [cal.duration] : durationChoices(cal.duration, cfg);
  const meta: string[] = [`⏱ ${e(t('{minutes} Minuten', { minutes: durs.join(' / ') }))}`];
  if (cfg.video !== 'none') meta.push(`🎥 ${cfg.video === 'static' && s.meeting_location ? escapeHtml(String(s.meeting_location)) : e(t(VIDEO_LABEL[cfg.video]))}`);
  else if (s.meeting_location) meta.push(`📍 ${escapeHtml(String(s.meeting_location))}`);
  if (cfg.kind === 'group') meta.push(`👥 ${e(t('Gruppe · bis {n} Plätze', { n: cfg.capacity }))}`);
  if (cfg.kind === 'collective') meta.push(`👥 ${e(t('Gespräch mit dem ganzen Team'))}`);
  const price =
    pay.mode === 'none'
      ? ''
      : `<p class="price" role="note"><strong>${e(pay.mode === 'deposit' ? t('Anzahlung {amount}', { amount: money(pay.deposit_cents, pay.currency) }) : t('Preis {amount}', { amount: money(pay.amount_cents, pay.currency) }))}</strong> – ${e(t('du bezahlst direkt bei der Buchung (Karte, SEPA, Apple Pay …) und der Termin gilt nach der Zahlung.'))}${pay.mode === 'deposit' ? ` ${e(t('Der Gesamtpreis beträgt {amount}, den Rest bezahlst du vor Ort.', { amount: money(pay.amount_cents, pay.currency) }))}` : ''} ${e(t('Wir reservieren deine Zeit {n} Minuten.', { n: pay.hold_minutes }))}</p>`;
  const policy = cfg.policy_text || !cfg.allow_cancel || cfg.cancel_cutoff_hours
    ? `<details class="policy"><summary>${e(t('Absage- und Erstattungsregeln'))}</summary><p>${cfg.policy_text ? nl(cfg.policy_text) : ''}</p>${cfg.cancel_cutoff_hours ? `<p class="muted">${e(t('Online absagen oder verschieben geht bis {n} Stunden vor dem Termin.', { n: cfg.cancel_cutoff_hours }))}</p>` : ''}${cfg.allow_cancel ? '' : `<p class="muted">${e(t('Dieser Termin kann online nicht abgesagt werden.'))}</p>`}</details>`
    : '';
  const submitLabel = pay.mode === 'none' ? t('Termin buchen') : t('Weiter zur Zahlung ({amount})', { amount: money(pay.mode === 'deposit' ? pay.deposit_cents : pay.amount_cents, pay.currency) });
  const guests = guestsAllowed(cfg);
  const body = `
<main class="wrap tc" id="main">
  <div class="card">
    <p class="muted" style="margin:0 0 4px">${escapeHtml(loc.name)}</p>
    <h1 id="title" tabindex="-1">${escapeHtml(cal.name)}</h1>
    <ul class="meta" aria-label="${e(t('Details'))}">${meta.map((m) => `<li>${m}</li>`).join('')}</ul>
    ${cal.description ? `<p>${nl(cal.description)}</p>` : ''}
    ${price}${policy}
    <section id="step1" aria-labelledby="h-pick">
      <h2 id="h-pick">${e(t('Termin wählen'))}</h2>
      ${durs.length > 1 ? `<fieldset class="durs" id="durs" style="border:0;padding:0;margin:0 0 12px"><legend>${e(t('Dauer'))}</legend>${durs.map((d, i) => `<label class="opt" style="display:inline-flex;margin-right:12px"><input type="radio" name="duration" value="${d}"${i === 0 ? ' checked' : ''}> <span>${e(t('{minutes} Minuten', { minutes: d }))}</span></label>`).join('')}</fieldset>` : ''}
      ${noscriptNotice(t('einen Termin zu buchen'))}
      <div class="days" id="days" role="group" aria-label="${e(t('Tage'))}"></div>
      <div class="slots" id="slots" role="group" aria-label="${e(t('Freie Zeiten'))}" tabindex="-1"></div>
      <div class="nav"><button class="secondary" id="prev" type="button">← ${e(t('Früher'))}</button><button class="secondary" id="next" type="button">${e(t('Später'))} →</button></div>
      <p class="muted" style="font-size:13px">${e(t('Zeiten in deiner Zeitzone:'))} <span id="tz"></span></p>
      <p class="live sr" id="live" role="status" aria-live="polite"></p>
    </section>
    <form id="step2" hidden novalidate aria-labelledby="h-data">
      <h2 id="h-data" tabindex="-1">${e(t('Deine Angaben'))}</h2>
      <p><strong id="chosen"></strong> <a href="#" id="back">${e(t('Zeit ändern'))}</a>${multiAllowed(cfg) > 1 ? ` · <a href="#" id="more">${e(t('Weitere Zeit hinzufügen'))}</a>` : ''}</p>
      <div class="row">
        <div><label for="f-first">${e(t('Vorname'))} *</label><input id="f-first" name="first_name" required autocomplete="given-name"></div>
        <div><label for="f-last">${e(t('Nachname'))}</label><input id="f-last" name="last_name" autocomplete="family-name"></div>
      </div>
      <label for="f-email">${e(t('E-Mail'))} *</label><input id="f-email" name="email" type="email" required autocomplete="email" inputmode="email">
      ${s.ask_phone !== false ? `<label for="f-phone">${e(t('Telefon'))}</label><input id="f-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel">` : ''}
      <div id="questions"></div>
      ${guests ? `<label for="f-guests">${e(t('Gäste (optional)'))}</label><textarea id="f-guests" name="guests" rows="2" inputmode="email" placeholder="${e(t('E-Mail-Adressen, eine pro Zeile'))}"></textarea><p class="help">${e(t.plural(guests, { one: 'Bis zu {n} Person bekommt eine Einladung mit dem Termin.', other: 'Bis zu {n} Personen bekommen eine Einladung mit dem Termin.' }))}</p>` : ''}
      ${s.ask_notes !== false ? `<label for="f-notes">${e(cfg.questions.length ? t('Weitere Anmerkungen (optional)') : t('Worum geht es?'))}</label><textarea id="f-notes" name="notes"></textarea>` : ''}
      <div style="position:absolute;left:-9999px" aria-hidden="true"><label for="f-hp">${e(t('Webseite'))}</label><input id="f-hp" name="website" tabindex="-1" autocomplete="off"></div>
      <label class="check" for="f-consent"><input id="f-consent" type="checkbox" required> <span>${escapeHtml(t(cfg.consent_text))}</span></label>
      <div class="nav"><button type="submit" id="submit">${escapeHtml(submitLabel)}</button></div>
      <div class="error" id="err" role="alert"></div>
    </form>
    <div id="done" hidden class="ok" role="status" tabindex="-1"></div>
  </div>
</main>${CSS}
<script>
${textsJs(t)}
${PICKER_JS}
(function () {
const CFG = ${jsonForScript({ slug: cal.slug, redirect: s.redirect_url || '', questions: cfg.questions, kind: cfg.kind, payment: pay.mode, waitlist: cfg.waitlist, multi: multiAllowed(cfg) })};
const $ = function (id) { return document.getElementById(id); };
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; $('tz').textContent = tz;
const q = new URLSearchParams(location.search);
let chosen = null, chosenFull = false;
const longDate = function (s) { var d = new Date(s); return d.toLocaleDateString(L.locale, { weekday: 'long', day: '2-digit', month: 'long' }) + ', ' + tx(L.atTime, { time: d.toLocaleTimeString(L.locale, { hour: '2-digit', minute: '2-digit' }) }); };
// the questions of this calendar
const qbox = $('questions');
CFG.questions.forEach(function (qq) {
  const id = 'q-' + qq.id;
  const qbox = document.createElement('div'); qbox.id = 'qb-' + qq.id; $('questions').appendChild(qbox);
  if (qq.type === 'text' || qq.type === 'textarea') {
    const l = document.createElement('label'); l.htmlFor = id; l.textContent = qq.label + (qq.required ? ' *' : '');
    const f = document.createElement(qq.type === 'text' ? 'input' : 'textarea'); f.id = id; f.name = id; if (qq.required) f.required = true; f.maxLength = qq.type === 'text' ? 500 : 5000;
    qbox.appendChild(l); qbox.appendChild(f);
  } else if (qq.type === 'checkbox') {
    const l = document.createElement('label'); l.className = 'check'; l.htmlFor = id;
    const f = document.createElement('input'); f.type = 'checkbox'; f.id = id; f.name = id; if (qq.required) f.required = true;
    const sp = document.createElement('span'); sp.textContent = qq.label + (qq.required ? ' *' : ''); l.appendChild(f); l.appendChild(sp); qbox.appendChild(l);
  } else {
    const fs = document.createElement('fieldset'); fs.id = id; const lg = document.createElement('legend'); lg.textContent = qq.label + (qq.required ? ' *' : ''); fs.appendChild(lg);
    qq.options.forEach(function (opt, i) {
      const l = document.createElement('label'); l.className = 'opt';
      const f = document.createElement('input'); f.type = qq.type === 'multi' ? 'checkbox' : 'radio'; f.name = id; f.value = opt; f.id = id + '-' + i;
      const sp = document.createElement('span'); sp.textContent = opt; l.appendChild(f); l.appendChild(sp); fs.appendChild(l);
    });
    qbox.appendChild(fs);
  }
  if (qq.help) { const h = document.createElement('p'); h.className = 'help'; h.textContent = qq.help; qbox.appendChild(h); }
});
// conditional questions: shown only when an earlier answer matches (the server checks the same)
function shownQ(qq) { return !$('qb-' + qq.id).hidden; }
function refreshQ() {
  const a = answers(true);
  CFG.questions.forEach(function (qq) {
    if (!qq.show_if) return;
    const ref = CFG.questions.filter(function (x) { return x.id === qq.show_if.id; })[0];
    let vals = ref && shownQ(ref) ? a[ref.id] : null;
    if (ref && ref.type === 'checkbox') vals = vals === null ? [] : [vals ? 'Ja' : 'Nein'];
    vals = vals === null || vals === undefined ? [] : Array.isArray(vals) ? vals : [vals];
    $('qb-' + qq.id).hidden = !vals.some(function (v) { return qq.show_if.values.indexOf(v) >= 0; });
  });
}
qbox.addEventListener('change', refreshQ); qbox.addEventListener('input', refreshQ); refreshQ();
const PO = { url: '/api/public/team-calendars/' + CFG.slug + '/slots', days: 'days', slots: 'slots', live: 'live', prev: 'prev', next: 'next', seats: CFG.kind === 'group',
  onPick: function (s, full) {
    if (adding && !full) { if (picked.indexOf(s) < 0) picked.push(s); picked.sort(); } else picked = [s];
    adding = false; chosen = picked[0]; chosenFull = full; $('chosen').textContent = picked.map(longDate).join(' · ') + (full ? L.waitlistSuffix : '');
    if ($('more')) $('more').hidden = full || picked.length >= CFG.multi;
    $('step1').hidden = true; $('step2').hidden = false; $('h-data').focus();
    if (full) $('submit').textContent = L.toWaitlist;
  } };
let picked = [], adding = false;
const picker = makePicker(PO);
let duration = 0;
if ($('more')) $('more').onclick = function (e) { e.preventDefault(); adding = true; $('step2').hidden = true; $('step1').hidden = false; $('title').focus(); };
if ($('durs')) $('durs').addEventListener('change', function (e) { duration = Number(e.target.value) || 0; PO.url = '/api/public/team-calendars/' + CFG.slug + '/slots?duration=' + duration; picker.load(); });
$('back').onclick = function (e) { e.preventDefault(); $('step2').hidden = true; $('step1').hidden = false; $('title').focus(); };
function answers(all) {
  const out = {};
  CFG.questions.forEach(function (qq) {
    if (!all && !shownQ(qq)) return;
    const id = 'q-' + qq.id;
    if (qq.type === 'checkbox') out[qq.id] = $(id).checked;
    else if (qq.type === 'multi') out[qq.id] = Array.prototype.map.call(document.querySelectorAll('input[name="' + id + '"]:checked'), function (x) { return x.value; });
    else if (qq.type === 'choice') { const c = document.querySelector('input[name="' + id + '"]:checked'); out[qq.id] = c ? c.value : ''; }
    else out[qq.id] = $(id).value;
  });
  return out;
}
$('step2').onsubmit = function (e) {
  e.preventDefault();
  const btn = $('submit'), err = $('err'); err.textContent = '';
  if ($('f-hp').value) { err.textContent = L.failed; return; }
  if (!$('f-first').value.trim()) { err.textContent = L.needFirst; $('f-first').focus(); return; }
  if (!$('f-email').validity.valid || !$('f-email').value) { err.textContent = L.needEmail; $('f-email').focus(); return; }
  for (let i = 0; i < CFG.questions.length; i++) {
    const qq = CFG.questions[i]; if (!qq.required || !shownQ(qq)) continue; const a = answers()[qq.id];
    if (!a || (Array.isArray(a) && !a.length)) { err.textContent = tx(L.answer, { label: qq.label }); const t = document.getElementById('q-' + qq.id) || document.getElementById('q-' + qq.id + '-0'); if (t) t.focus(); return; }
  }
  if (!$('f-consent').checked) { err.textContent = L.needConsent; $('f-consent').focus(); return; }
  btn.disabled = true;
  const data = { start: chosen, waitlist: chosenFull, first_name: $('f-first').value, last_name: $('f-last').value, email: $('f-email').value, phone: $('f-phone') ? $('f-phone').value : '', notes: $('f-notes') ? $('f-notes').value : '', answers: answers(), consent: true, timezone: tz, via: q.get('via') || '', duration: duration || undefined, guests: $('f-guests') ? $('f-guests').value.split(/[\\s,;]+/).filter(Boolean) : [] };
  const ab = q.get('ab'); if (ab) data._ab = ab;
  q.forEach(function (v, k) { if (/^(utm_[a-z]+|gclid|fbclid|ref)$/.test(k)) data['_' + k] = v; }); if (q.get('_a')) data._attr = q.get('_a');
  data._page = (window.top === window ? location.href : document.referrer) || '';
  if (picked.length > 1) data.starts = picked;
  fetch('/api/public/team-calendars/' + CFG.slug + (picked.length > 1 ? '/book-many' : '/book'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
    .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); })
    .then(function (x) {
      btn.disabled = false;
      if (!x.ok) { err.textContent = x.j.error || L.failed; if (x.status === 409) { $('step2').hidden = true; $('step1').hidden = false; picker.load(); $('live').textContent = err.textContent; } return; }
      const j = x.j;
      if (j.status === 'payment_required') { $('err').textContent = ''; btn.disabled = true; btn.textContent = L.toStripe; location.href = j.checkout_url; return; }
      if (CFG.redirect && j.status === 'confirmed') { location.href = CFG.redirect; return; }
      $('step2').hidden = true; const d = $('done'); d.hidden = false; d.innerHTML = '';
      const h = document.createElement('strong'); h.textContent = j.status === 'waitlisted' ? L.waitlisted : L.booked; d.appendChild(h); d.appendChild(document.createElement('br'));
      const t = document.createElement('span'); t.textContent = j.appointments ? j.appointments.map(function (a) { return longDate(a.start_at); }).join(' · ') : longDate(chosen); d.appendChild(t); d.appendChild(document.createElement('br'));
      if (j.appointments) { j.manageUrl = ''; j.icsUrl = j.appointments[0].icsUrl; j.meetingUrl = j.appointments[0].meetingUrl; }
      const m = document.createElement('span'); m.textContent = j.status === 'waitlisted' ? L.waitlistInfo : L.confirmMail; d.appendChild(m);
      if (j.hosts && j.hosts.length) { d.appendChild(document.createElement('br')); const hs = document.createElement('span'); hs.textContent = tx(L.withHosts, { names: j.hosts.join(L.and) }); d.appendChild(hs); }
      const links = document.createElement('p'); d.appendChild(links);
      if (j.meetingUrl) { const a = document.createElement('a'); a.href = j.meetingUrl; a.textContent = L.video; a.className = 'btn'; links.appendChild(a); links.appendChild(document.createTextNode(' ')); }
      if (j.icsUrl) { const a = document.createElement('a'); a.href = j.icsUrl; a.textContent = L.addCal; a.className = 'btn secondary'; links.appendChild(a); links.appendChild(document.createTextNode(' ')); }
      if (j.manageUrl) { const a = document.createElement('a'); a.href = j.manageUrl; a.textContent = L.manage; a.className = 'btn secondary'; links.appendChild(a); }
      d.focus();
    })
    .catch(function () { btn.disabled = false; err.textContent = L.offline; });
};
picker.load();
})();
</script>`;
  return publicPage({ title: `${cal.name} – ${loc.name}`, body, color: cal.color, embed: o.embed });
}

/** The page of a booked appointment: details, link, add to calendar, reschedule, cancel (with the calendar's rules). */
export function managePage(app: App, appt: any, cal: CalendarRow, cfg: TeamCalConfig, hosts: string[]): string {
  const cancelled = appt.status === 'cancelled';
  const started = Date.parse(appt.start_at) <= Date.now();
  const canCancel = !cancelled && !started && cfg.allow_cancel && mayChange(cfg.cancel_cutoff_hours, appt.start_at);
  const canMove = !cancelled && !started && appt.status === 'confirmed' && cfg.allow_reschedule && mayChange(cfg.reschedule_cutoff_hours, appt.start_at);
  const t = tLoc(app, cal.location_id);
  const e = (s: string) => escapeHtml(s);
  let pay: any = null;
  try {
    pay = appt.payment ? JSON.parse(appt.payment) : null;
  } catch {
    pay = null;
  }
  const payLine =
    pay?.status === 'paid'
      ? t('Bezahlt: {amount}', { amount: money(pay.due_cents ?? pay.amount_cents, pay.currency) }) + (pay.mode === 'deposit' ? ` ${t('(Anzahlung, Rest {rest} vor Ort)', { rest: money(pay.amount_cents - pay.due_cents, pay.currency) })}` : '')
      : pay?.status === 'refunded'
        ? t('Die Zahlung wurde erstattet.')
        : pay?.status === 'refund_pending'
          ? t('Die Erstattung wird geprüft – wir melden uns.')
          : '';
  const token = escapeHtml(appt.manage_token);
  const body = `
<main class="wrap tc" id="main"><div class="card">
  <h1 id="title" tabindex="-1">${escapeHtml(cal.name)}</h1>
  <p><strong>${escapeHtml(formatInTz(appt.start_at, cal.timezone))}</strong> <span class="muted">(${escapeHtml(cal.timezone)})</span></p>
  <p>${e(t('Status:'))} <span class="status ${cancelled ? 'off' : 'ok'}">${cancelled ? e(t('abgesagt')) : appt.status === 'confirmed' ? e(t('bestätigt')) : escapeHtml(appt.status)}</span></p>
  ${hosts.length && cfg.show_hosts ? `<p>${e(t('Mit {names}', { names: hosts.join(t(' und ')) }))}</p>` : ''}
  ${appt.meeting_url && !cancelled ? `<p><a class="btn" href="${escapeHtml(/^https?:\/\//.test(appt.meeting_url) ? appt.meeting_url : '#')}" target="_blank" rel="noopener">${/^https?:\/\//.test(appt.meeting_url) ? e(t('Zum Video-Gespräch')) : escapeHtml(appt.meeting_url)}</a></p>` : ''}
  ${payLine ? `<p class="price">${escapeHtml(payLine)}</p>` : ''}
  ${cfg.policy_text ? `<details class="policy"><summary>${e(t('Absage- und Erstattungsregeln'))}</summary><p>${nl(cfg.policy_text)}</p></details>` : ''}
  ${
    cancelled
      ? `<p><a class="btn" href="/book/${escapeHtml(cal.slug)}">${e(t('Neuen Termin buchen'))}</a></p>`
      : `<div class="nav"><a class="btn secondary" href="/book/ics/${token}">${e(t('In Kalender eintragen'))}</a> <a class="btn secondary" href="/book/ticket/${token}">${e(t('Ticket (QR-Code)'))}</a>
         ${canMove ? `<button type="button" class="secondary" id="move">${e(t('Termin verschieben'))}</button>` : ''}
         ${canCancel ? `<button type="button" class="danger" id="cancel">${e(t('Termin absagen'))}</button>` : ''}</div>
         ${!canMove && !cancelled && !started ? `<p class="muted">${e(cfg.allow_reschedule ? t('Online verschieben geht bis {n} Stunden vor dem Termin.', { n: cfg.reschedule_cutoff_hours }) : t('Dieser Termin kann online nicht verschoben werden.'))} ${e(t('Bitte melde dich direkt, wenn etwas dazwischenkommt.'))}</p>` : ''}
         ${!canCancel && !cancelled && !started ? `<p class="muted">${e(cfg.allow_cancel ? t('Online absagen geht bis {n} Stunden vor dem Termin.', { n: cfg.cancel_cutoff_hours }) : t('Dieser Termin kann online nicht abgesagt werden.'))}</p>` : ''}`
  }
  ${canMove || canCancel ? noscriptNotice(t('den Termin zu verschieben oder abzusagen')) : ''}
  <div id="confirm" hidden role="alertdialog" aria-labelledby="cq"><p id="cq"><strong>${e(t('Termin wirklich absagen?'))}</strong>${pay?.status === 'paid' ? ` ${e(cfg.payment.refund === 'auto' ? t('Deine Zahlung wird erstattet.') : t('Über eine Erstattung entscheiden wir nach den oben genannten Regeln.'))}` : ''}</p>
    <label for="reason">${e(t('Grund (optional)'))}</label><input id="reason" maxlength="300">
    <div class="nav"><button type="button" class="danger" id="yes">${e(t('Ja, absagen'))}</button><button type="button" class="secondary" id="no">${e(t('Doch nicht'))}</button></div></div>
  <section id="mv" hidden aria-labelledby="h-mv"><h2 id="h-mv" tabindex="-1">${e(t('Neue Zeit wählen'))}</h2>
    <div class="days" id="days" role="group" aria-label="${e(t('Tage'))}"></div><div class="slots" id="slots" role="group" aria-label="${e(t('Freie Zeiten'))}" tabindex="-1"></div>
    <div class="nav"><button class="secondary" id="prev" type="button">← ${e(t('Früher'))}</button><button class="secondary" id="next" type="button">${e(t('Später'))} →</button><button class="secondary" id="mvx" type="button">${e(t('Abbrechen'))}</button></div>
    <p class="live sr" id="live" role="status" aria-live="polite"></p></section>
  <p class="live" id="msg" role="status" aria-live="polite"></p>
</div></main>${CSS}
<script>
${textsJs(t)}
${PICKER_JS}
(function () {
const TOKEN = ${jsonForScript(appt.manage_token)};
const $ = function (id) { return document.getElementById(id); };
const say = function (t, bad) { $('msg').textContent = t; $('msg').style.color = bad ? '#b91c1c' : ''; };
const post = function (path, body) { return fetch('/api/public/team-calendars/manage/' + TOKEN + '/' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }); };
if ($('cancel')) {
  $('cancel').onclick = function () { $('confirm').hidden = false; $('yes').focus(); };
  $('no').onclick = function () { $('confirm').hidden = true; $('cancel').focus(); };
  $('yes').onclick = function () { $('yes').disabled = true; post('cancel', { reason: $('reason').value }).then(function (x) { if (x.ok) location.reload(); else { $('yes').disabled = false; say(x.j.error || L.cancelFailed, true); } }); };
}
if ($('move')) {
  const picker = makePicker({ url: '/api/public/team-calendars/manage/' + TOKEN + '/slots', days: 'days', slots: 'slots', live: 'live', prev: 'prev', next: 'next',
    onPick: function (s) { post('reschedule', { start: s }).then(function (x) { if (x.ok) location.reload(); else say(x.j.error || L.moveFailed, true); }); } });
  $('move').onclick = function () { $('mv').hidden = false; picker.load().then(function () { $('h-mv').focus(); }); };
  $('mvx').onclick = function () { $('mv').hidden = true; $('move').focus(); };
}
})();
</script>`;
  return publicPage({ title: t('Termin verwalten'), body, color: cal.color });
}

/** After Stripe: waits for the payment to be confirmed, then shows the booked appointment. */
export function paidPage(app: App, hold: { token: string; start_at: string }, cal: CalendarRow, cancelled: boolean, sessionId: string): string {
  const t = tLoc(app, cal.location_id);
  const body = `
<main class="wrap tc" id="main"><div class="card">
  <h1 id="title" tabindex="-1">${escapeHtml(cal.name)}</h1>
  <p><strong>${escapeHtml(formatInTz(hold.start_at, cal.timezone))}</strong> <span class="muted">(${escapeHtml(cal.timezone)})</span></p>
  <div id="state" role="status" aria-live="polite" tabindex="-1">${escapeHtml(cancelled ? t('Die Zahlung wurde abgebrochen.') : t('Wir bestätigen deine Zahlung …'))}</div>
  <p class="nav" id="actions"></p>
</div></main>${CSS}
<script>
${textsJs(t)}
(function () {
const TOKEN = ${jsonForScript(hold.token)}, SESSION = ${jsonForScript(sessionId)};
const $ = function (id) { return document.getElementById(id); };
let tries = 0;
function link(href, text, cls) { const a = document.createElement('a'); a.href = href; a.textContent = text; a.className = cls; $('actions').appendChild(a); $('actions').appendChild(document.createTextNode(' ')); }
function render(j) {
  $('actions').innerHTML = '';
  if (j.status === 'confirmed') { $('state').textContent = L.paidOk; if (j.meetingUrl) link(j.meetingUrl, L.video, 'btn'); link(j.icsUrl, L.addCal, 'btn secondary'); link(j.manageUrl, L.manage, 'btn secondary'); $('state').focus(); return true; }
  if (j.status === 'expired' || j.status === 'cancelled') { $('state').textContent = L.holdExpired; link('/book/' + j.slug, L.pickNew, 'btn'); $('state').focus(); return true; }
  if (j.status === 'refunded') { $('state').textContent = L.takenRefund; link('/book/' + j.slug, L.pickNew, 'btn'); return true; }
  if (j.checkoutUrl && ${cancelled ? 'true' : 'false'}) { $('state').textContent = tx(L.payCancelled, { time: tx(L.atTime, { time: new Date(j.expiresAt).toLocaleTimeString(L.locale, { hour: '2-digit', minute: '2-digit' }) }) }); link(j.checkoutUrl, L.payNow, 'btn'); link('/book/' + j.slug, L.pickOther, 'btn secondary'); return true; }
  return false;
}
function poll() {
  fetch('/api/public/team-calendars/hold/' + TOKEN + (SESSION ? '?session_id=' + encodeURIComponent(SESSION) : '')).then(function (r) { return r.json(); }).then(function (j) {
    if (render(j)) return;
    if (++tries < 40) setTimeout(poll, 1500); else { $('state').textContent = L.slow; }
  }).catch(function () { if (++tries < 40) setTimeout(poll, 2500); });
}
poll();
})();
</script>`;
  return publicPage({ title: t('Zahlung'), body, color: cal.color });
}

/** A routing form: one question, each answer leads to a calendar. */
export function routingPage(r: { slug: string; name: string; question: string; intro: string; color: string; options: { id: string; label: string; calendar_id: string }[] }, slugs: Record<string, string>, embed: boolean, t: STFn = tApp()): string {
  const body = `
<main class="wrap tc" id="main"><div class="card">
  <h1 id="title" tabindex="-1">${escapeHtml(r.name)}</h1>
  ${r.intro ? `<p>${nl(r.intro)}</p>` : ''}
  ${noscriptNotice(t('weiterzugehen'))}
  <form id="f" novalidate><fieldset><legend>${escapeHtml(t(r.question))}</legend>
    ${r.options.map((o, i) => `<label class="opt" for="o${i}"><input type="radio" name="o" id="o${i}" value="${escapeHtml(o.id)}" data-cal="${escapeHtml(slugs[o.calendar_id] ?? '')}"><span>${escapeHtml(o.label)}</span></label>`).join('')}
  </fieldset>
  <div class="nav"><button type="submit">${escapeHtml(t('Weiter'))}</button></div><div class="error" id="err" role="alert"></div></form>
</div></main>${CSS}
<script>
${textsJs(t)}
document.getElementById('f').onsubmit = function (e) {
  e.preventDefault();
  var c = document.querySelector('input[name=o]:checked');
  if (!c) { document.getElementById('err').textContent = L.pickAnswer; return; }
  var q = new URLSearchParams(location.search); var out = new URLSearchParams(); out.set('via', ${jsonForScript(r.slug)} + ':' + c.value);
  ['embed', 'ab', '_a', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'ref'].forEach(function (k) { if (q.get(k)) out.set(k, q.get(k)); });
  location.href = '/book/' + c.dataset.cal + '?' + out.toString();
};
</script>`;
  return publicPage({ title: r.name, body, color: r.color, embed });
}

/** The offer of a freed seat: a button that books it. */
export function waitlistPage(app: App, w: { token: string; start_at: string; status: string }, cal: CalendarRow, state: 'offer' | 'expired' | 'booked'): string {
  const t = tLoc(app, cal.location_id);
  const e = (s: string) => escapeHtml(s);
  const body = `
<main class="wrap tc" id="main"><div class="card">
  <h1 id="title" tabindex="-1">${escapeHtml(cal.name)}</h1>
  <p><strong>${escapeHtml(formatInTz(w.start_at, cal.timezone))}</strong> <span class="muted">(${escapeHtml(cal.timezone)})</span></p>
  ${state === 'offer' ? `<p>${e(t('Ein Platz ist frei geworden. Wer zuerst bucht, bekommt ihn.'))}</p>${noscriptNotice(t('den Platz zu buchen'))}<div class="nav"><button type="button" id="book">${e(t('Platz jetzt buchen'))}</button></div>` : state === 'booked' ? `<p class="ok">${e(t('Du hast den Platz gebucht – die Bestätigung kommt per E-Mail.'))}</p>` : `<p>${e(t('Das Angebot ist abgelaufen oder wurde schon benutzt.'))}</p>`}
  <p class="live" id="msg" role="status" aria-live="polite"></p>
</div></main>${CSS}
<script>
${textsJs(t)}
var b = document.getElementById('book');
if (b) b.onclick = function () { b.disabled = true; fetch('/api/public/team-calendars/waitlist/' + ${jsonForScript(w.token)} + '/book', { method: 'POST' }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }).then(function (x) { var m = document.getElementById('msg'); if (x.ok && x.j.checkout_url) { m.textContent = L.toPayment; location.href = x.j.checkout_url; } else if (x.ok) { m.textContent = L.bookedMail; if (x.j.manageUrl) { var a = document.createElement('a'); a.href = x.j.manageUrl; a.className = 'btn secondary'; a.textContent = L.manage; m.appendChild(document.createElement('br')); m.appendChild(a); } } else { b.disabled = false; m.textContent = x.j.error || L.seatGone; m.style.color = '#b91c1c'; } }); };
</script>`;
  return publicPage({ title: t('Platz frei'), body, color: cal.color });
}
