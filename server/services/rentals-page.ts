import type { App } from '../core/app.js';
import { jsonForScript, noscriptNotice, publicPage } from '../core/page.js';
import { escapeHtml } from '../core/template.js';
import { centsToMoney } from '../core/util.js';
import type { CalendarRow } from '../modules/calendars.js';
import type { BookingRow, RentalRow } from './rentals-book.js';
import { rangeText } from './rentals-model.js';
import { tLoc } from '../i18n/index.js';

/**
 * Public pages of the Vermietung (docs/booking.md#rentals): the booking page with a date-range picker (`/book/rent/<slug>`, also the
 * calendar's own `/book/<slug>`), the page after paying, and the booking's own page (cancel until the start).
 */

const CSS = `<style>
.rg-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin:16px 0 8px; }
.rg-head h2 { margin:0; font-size:18px; }
.rg-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:4px; }
.rg-dow { text-align:center; font-size:12px; color:var(--muted); padding:2px 0; }
.rg-day { padding:6px 0; border-radius:8px; border:1px solid var(--line); background:#fff; color:var(--text); font-weight:600; font-size:14px; line-height:1.15; }
.rg-day small { display:block; font-weight:400; font-size:11px; color:var(--muted); }
.rg-day[disabled] { opacity:.35; }
.rg-day.in { background:color-mix(in srgb, var(--brand) 18%, #fff); border-color:var(--brand); }
.rg-day.edge { background:var(--brand); color:#fff; } .rg-day.edge small { color:#fff; }
.rg-sum { margin:14px 0 0; padding:12px 14px; border-radius:10px; background:var(--bg); }
.rg-nav { padding:6px 12px; }
</style>`;

export function rentalBookingPage(app: App, cal: CalendarRow, r: RentalRow, embed: boolean) {
  const loc = app.location(cal.location_id)!;
  const t = tLoc(app, cal.location_id);
  const nights = r.unit === 'night';
  const per = nights ? t('pro Nacht') : t('pro Tag');
  const cfg = { slug: cal.slug, unit: r.unit, quantity: r.quantity, currency: r.currency, price: r.price_cents, deposit: r.deposit_cents, min: r.min_units, max: r.max_units, redirect: cal.settings.redirect_url || '', lang: t.locale === 'de' ? 'de-DE' : 'en-GB' };
  // Texts of the page script, in the sub-account's language.
  const L = {
    error: t('Fehler'),
    dow: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => t(d)),
    free: t('{n} frei'),
    none: t('nichts frei'),
    pickEnd: nights ? t('Jetzt die Abreise wählen.') : t('Jetzt den letzten Tag wählen (oder denselben Tag noch einmal).'),
    pick: t('Bitte einen Zeitraum wählen.'),
    pieces: t('{n} Stück'),
    deposit: t('Kaution'),
    pay: t('Weiter zur Zahlung'),
    book: t('Verbindlich buchen'),
    booked: t('Gebucht!'),
    mail: t('Die Bestätigung kommt per E-Mail.'),
    ics: t('In den Kalender'),
    manage: t('Buchung ansehen oder absagen'),
  };
  const body = `${CSS}<div class="wrap"><div class="card">
  <p class="muted" style="margin:0 0 4px">${escapeHtml(loc.name)}</p>
  <h1>${escapeHtml(cal.name)}</h1>
  <p class="muted">${r.price_cents ? `${escapeHtml(centsToMoney(r.price_cents, r.currency))} ${escapeHtml(per)}` : escapeHtml(t('kostenlos'))}${r.deposit_cents ? ` · ${escapeHtml(r.quantity > 1 ? t('Kaution {amount} je Stück', { amount: centsToMoney(r.deposit_cents, r.currency) }) : t('Kaution {amount}', { amount: centsToMoney(r.deposit_cents, r.currency) }))}` : ''}${r.min_units > 1 ? ` · ${escapeHtml(nights ? t('mindestens {n} Nächte', { n: r.min_units }) : t('mindestens {n} Tage', { n: r.min_units }))}` : ''}</p>
  ${cal.description ? `<p>${escapeHtml(cal.description).replace(/\n/g, '<br>')}</p>` : ''}
  ${noscriptNotice(t('zu buchen'))}
  <div class="row">
    <div><label for="rg-from">${escapeHtml(nights ? t('Anreise') : t('Erster Tag'))}</label><input id="rg-from" type="date"></div>
    <div><label for="rg-to">${escapeHtml(nights ? t('Abreise') : t('Letzter Tag'))}</label><input id="rg-to" type="date"></div>
    ${r.quantity > 1 ? `<div><label for="rg-qty">${escapeHtml(t('Anzahl'))}</label><select id="rg-qty"></select></div>` : ''}
  </div>
  <div class="rg-head"><button type="button" class="btn secondary rg-nav" id="rg-prev" aria-label="${escapeHtml(t('Vorheriger Monat'))}">←</button><h2 id="rg-month" aria-live="polite"></h2><button type="button" class="btn secondary rg-nav" id="rg-next" aria-label="${escapeHtml(t('Nächster Monat'))}">→</button></div>
  <div class="rg-grid" id="rg-grid" role="grid" aria-label="${escapeHtml(t('Freie Tage'))}"></div>
  <p class="muted" style="font-size:13px;margin:6px 0 0">${escapeHtml(nights ? t('Anreise und Abreise antippen. Die Zahl zeigt, wie viele für diese Nacht frei sind.') : t('Ersten und letzten Tag antippen. Die Zahl zeigt, wie viele an dem Tag frei sind.'))}</p>
  <div class="rg-sum" id="rg-sum" aria-live="polite">${escapeHtml(L.pick)}</div>
  <form id="rg-form" hidden>
    <div class="row"><div><label for="rg-fn">${escapeHtml(t('Vorname'))} *</label><input id="rg-fn" name="first_name" required autocomplete="given-name"></div><div><label for="rg-ln">${escapeHtml(t('Nachname'))}</label><input id="rg-ln" name="last_name" autocomplete="family-name"></div></div>
    <label for="rg-em">${escapeHtml(t('E-Mail'))} *</label><input id="rg-em" name="email" type="email" required autocomplete="email">
    ${cal.settings.ask_phone === false ? '' : `<label for="rg-ph">${escapeHtml(t('Telefon'))}</label><input id="rg-ph" name="phone" type="tel" autocomplete="tel">`}
    ${cal.settings.ask_notes === false ? '' : `<label for="rg-no">${escapeHtml(t('Anmerkung'))}</label><textarea id="rg-no" name="notes"></textarea>`}
    <input name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
    <label class="check"><input type="checkbox" name="consent" required> ${escapeHtml(t('Ich bin einverstanden, dass meine Angaben zur Buchung gespeichert werden.'))}</label>
    <p><button type="submit" id="rg-go">${escapeHtml(L.book)}</button></p>
  </form>
  <p class="error" id="rg-err" role="alert"></p>
  <div id="rg-done" class="ok" role="status" hidden></div>
</div></div>
<script>
(function(){
  var C=${jsonForScript(cfg)},L=${jsonForScript(L)},$=function(i){return document.getElementById(i)},avail={},win=null,from='',to='',month='',seq=0;
  function h(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function money(c){return (c/100).toLocaleString(C.lang,{style:'currency',currency:C.currency||'EUR'})}
  function add(ymd,n){var d=new Date(ymd+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
  function api(p,o){return fetch('/api/public/rentals/'+C.slug+p,o).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||L.error);return j})})}
  function qty(){var q=$('rg-qty');return q?+q.value||1:1}
  if($('rg-qty')){for(var i=1;i<=C.quantity;i++){var o=document.createElement('option');o.value=i;o.textContent=i;$('rg-qty').appendChild(o)}$('rg-qty').onchange=sum}
  function load(m){month=m;var first=m+'-01',dow=(new Date(first+'T00:00:00Z').getUTCDay()+6)%7,start=add(first,-dow);
    $('rg-month').textContent=new Date(first+'T12:00:00Z').toLocaleDateString(C.lang,{month:'long',year:'numeric',timeZone:'UTC'});
    api('/availability?from='+start+'&days=42').then(function(j){win=j;j.days.forEach(function(d){avail[d.date]=d.free});draw(start)}).catch(function(e){$('rg-err').textContent=e.message})}
  function draw(start){var g=$('rg-grid'),out='';L.dow.forEach(function(x){out+='<div class="rg-dow" role="columnheader">'+x+'</div>'});
    for(var i=0;i<42;i++){var d=add(start,i),f=avail[d],inM=d.slice(0,7)===month,past=!win||d<win.today||d>win.last_day;
      var pick=!!from&&!to&&d>from&&C.unit==='night';
      var off=!inM||(past&&!pick)||(!pick&&!f);
      var cls='rg-day'+(from&&d===from||to&&d===last()?' edge':'')+(from&&to&&d>from&&d<last()?' in':'');
      out+='<button type="button" role="gridcell" class="'+cls+'" data-d="'+d+'"'+(off?' disabled':'')+' aria-pressed="'+(cls.indexOf('edge')>0)+'" aria-label="'+h(new Date(d+'T12:00:00Z').toLocaleDateString(C.lang,{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}))+', '+(f?L.free.replace('{n}',f):L.none)+'">'+(+d.slice(8))+(inM&&!past?'<small>'+(f||0)+'</small>':'')+'</button>'}
    g.innerHTML=out;g.querySelectorAll('[data-d]').forEach(function(b){b.onclick=function(){tap(b.getAttribute('data-d'))}})}
  function last(){return to}
  function tap(d){if(!from||to||d<from||(C.unit==='night'&&d===from)){from=d;to=''}else{to=d}
    $('rg-from').value=from;$('rg-to').value=to;redraw();sum()}
  function redraw(){var first=month+'-01',dow=(new Date(first+'T00:00:00Z').getUTCDay()+6)%7;draw(add(first,-dow))}
  $('rg-from').onchange=function(){from=this.value;if(to&&to<from)to='';$('rg-to').value=to;if(from)load(from.slice(0,7));sum()};
  $('rg-to').onchange=function(){to=this.value;redraw();sum()};
  $('rg-prev').onclick=function(){var p=month.split('-').map(Number);load(new Date(Date.UTC(p[0],p[1]-2,1)).toISOString().slice(0,7))};
  $('rg-next').onclick=function(){var p=month.split('-').map(Number);load(new Date(Date.UTC(p[0],p[1],1)).toISOString().slice(0,7))};
  function sum(){$('rg-err').textContent='';if(!from||!to){$('rg-sum').textContent=from?L.pickEnd:L.pick;$('rg-form').hidden=true;return}
    var n=++seq;api('/quote?from='+from+'&to='+to+'&qty='+qty()).then(function(q){if(n!==seq)return;
      var t='<strong>'+h(q.text)+'</strong>'+(q.qty>1?' · '+h(L.pieces.replace('{n}',q.qty)):'');
      if(q.total_cents)t+='<br>'+money(q.rent_cents)+(q.deposit_cents?' + '+h(L.deposit)+' '+money(q.deposit_cents)+' = <strong>'+money(q.total_cents)+'</strong>':'');
      if(!q.ok)t+='<br><span class="error">'+h(q.problem)+'</span>';
      $('rg-sum').innerHTML=t;$('rg-form').hidden=!q.ok;$('rg-go').textContent=q.total_cents?L.pay:L.book}).catch(function(e){$('rg-sum').textContent=e.message;$('rg-form').hidden=true})}
  $('rg-form').onsubmit=function(e){e.preventDefault();var f=e.target,b=$('rg-go');b.disabled=true;$('rg-err').textContent='';
    var data={from:from,to:to,qty:qty(),first_name:f.first_name.value,last_name:f.last_name.value,email:f.email.value,phone:f.phone?f.phone.value:'',notes:f.notes?f.notes.value:'',consent:f.consent.checked,website:f.website.value};
    api('/book',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)}).then(function(r){b.disabled=false;
      if(r.status==='payment_required'){location.href=r.checkout_url;return}
      if(C.redirect){location.href=C.redirect;return}
      f.hidden=true;$('rg-done').hidden=false;$('rg-done').innerHTML='<strong>'+h(L.booked)+'</strong><br>'+h(r.booking.text)+(r.booking.qty>1?' · '+h(L.pieces.replace('{n}',r.booking.qty)):'')+'<br>'+h(L.mail)+' <a href="'+h(r.ics_url)+'">'+h(L.ics)+'</a> · <a href="'+h(r.manage_url)+'">'+h(L.manage)+'</a>'})
      .catch(function(e2){b.disabled=false;$('rg-err').textContent=e2.message;load(month)})};
  fetch('/api/public/rentals/'+C.slug).then(function(r){return r.json()}).then(function(j){load((j.today||new Date().toISOString()).slice(0,7))});
})();
</script>`;
  return publicPage({ title: `${cal.name} – ${loc.name}`, body, color: cal.color, embed });
}

const statusText: Record<BookingRow['status'], string> = { pending: 'wartet auf die Zahlung', confirmed: 'bestätigt', expired: 'Reservierung abgelaufen', refunded: 'erstattet', cancelled: 'abgesagt' };

/** After the pay page: paid → booked; still open → the reservation's time; lapsed → book again. */
export function rentalPaidPage(app: App, cal: CalendarRow, r: RentalRow, b: BookingRow, cancelled: boolean) {
  const t = tLoc(app, cal.location_id);
  const e = (s: string) => escapeHtml(t(s));
  const appt = b.appointment_id ? app.db.get<any>('SELECT manage_token FROM appointments WHERE id = ?', b.appointment_id) : undefined;
  const what = `${escapeHtml(cal.name)}${b.qty > 1 ? ` ×${b.qty}` : ''} · ${escapeHtml(rangeText(r.unit, { from: b.from_date, to: b.to_date, units: b.units }, t))}`;
  const inner =
    b.status === 'confirmed'
      ? `<h1>${e('Bezahlt und gebucht')}</h1><p>${what}</p><p>${e('Die Bestätigung kommt per E-Mail.')}</p>${appt ? `<p><a class="btn secondary" href="/book/ics/${escapeHtml(appt.manage_token)}">${e('In den Kalender')}</a> <a class="btn secondary" href="/book/manage/${escapeHtml(appt.manage_token)}">${e('Buchung ansehen')}</a></p>` : ''}`
      : b.status === 'pending'
        ? `<h1>${cancelled ? e('Zahlung abgebrochen') : e('Zahlung wird geprüft')}</h1><p>${what}</p><p class="muted">${cancelled ? e('Der Zeitraum bleibt noch kurz für dich reserviert.') : e('Das dauert meist nur einen Moment – diese Seite lädt gleich neu.')}</p>${cancelled ? `<p><a class="btn" href="/book/rent/${escapeHtml(cal.slug)}">${e('Zurück zur Buchung')}</a></p>` : '<script>setTimeout(function(){location.reload()},4000)</script>'}`
        : `<h1>${e('Nicht gebucht')}</h1><p>${what}</p><p class="muted">${escapeHtml(t('Status: {status}.', { status: t(statusText[b.status]) }))}</p><p><a class="btn" href="/book/rent/${escapeHtml(cal.slug)}">${e('Neu buchen')}</a></p>`;
  return publicPage({ title: cal.name, body: `<div class="wrap"><div class="card">${inner}</div></div>`, color: cal.color });
}

/** The booking's own page (link in the confirmation): what, when, how many, paid; cancel until the start. */
export function rentalManagePage(app: App, a: any, cal: CalendarRow, r: RentalRow, b: BookingRow | undefined) {
  const t = tLoc(app, cal.location_id);
  const e = (s: string) => escapeHtml(t(s));
  const cancelled = a.status === 'cancelled';
  const started = Date.parse(a.start_at) <= Date.now();
  const what = b ? escapeHtml(rangeText(r.unit, { from: b.from_date, to: b.to_date, units: b.units }, t)) : '';
  const M = { confirm: t('Buchung wirklich absagen?'), failed: t('Die Buchung ließ sich nicht absagen.') };
  const body = `<div class="wrap"><div class="card">
  <h1>${escapeHtml(cal.name)}${b && b.qty > 1 ? ` ×${b.qty}` : ''}</h1>
  <p>${what}</p>
  ${b?.total_cents ? `<p class="muted">${b.paid_at ? e('Bezahlt') : e('Betrag')}: ${escapeHtml(centsToMoney(b.total_cents, b.currency))}${b.deposit_cents ? ` ${escapeHtml(t('(davon Kaution {amount})', { amount: centsToMoney(b.deposit_cents, b.currency) }))}` : ''}</p>` : ''}
  <p>${e('Status')}: <strong>${cancelled ? e('abgesagt') : e('bestätigt')}</strong></p>
  ${cancelled ? `<a class="btn" href="/book/rent/${escapeHtml(cal.slug)}">${e('Neu buchen')}</a>` : `${noscriptNotice(t('die Buchung abzusagen'))}<div class="row"><a class="btn secondary" href="/book/ics/${escapeHtml(a.manage_token)}">${e('In den Kalender')}</a>${started ? '' : `<button id="cancel" class="btn" type="button">${e('Buchung absagen')}</button>`}</div>${b?.paid_at && !started ? `<p class="muted" style="font-size:13px">${e('Bei einer Absage meldet sich das Team wegen der Erstattung.')}</p>` : ''}`}
  <p id="msg" class="muted" role="status"></p></div></div>
  <script>var M=${jsonForScript(M)},b=document.getElementById('cancel');if(b)b.onclick=function(){if(!confirm(M.confirm))return;fetch('/api/public/appointments/${escapeHtml(a.manage_token)}/cancel',{method:'POST'}).then(function(r){if(r.ok)location.reload();else r.json().then(function(j){document.getElementById('msg').textContent=j.error||M.failed})})};</script>`;
  return publicPage({ title: t('Buchung verwalten'), body, color: cal.color });
}
