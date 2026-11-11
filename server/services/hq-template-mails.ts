/**
 * The e-mails of the „Software- & SaaS-Firma (HQ)“ template (server/services/hq-template.ts): German, du, friendly and honest –
 * no fake scarcity, no invented numbers. Plain text with merge fields; the workflows send the same texts the templates hold,
 * so editing one place is enough to start with. `{{location.name}}` is the company's name in the sub-account.
 */

export interface HqMail {
  name: string;
  subject: string;
  body: string;
}

import { translator } from '../i18n/index.js';

/** Marks the German source texts (message ids); modules/hq-template.ts translates them for the sub-account. */
const de = translator('de');

export const HQ_MAILS = {
  waitlistWelcome: {
    name: 'Warteliste 1 – Willkommen',
    subject: 'Du bist auf der Warteliste 🎉',
    body: de(`Hallo {{contact.first_name|}},

danke, dass du deine Anmeldung bestätigt hast – du stehst jetzt auf der Warteliste für HyperLevel Cloud.

Kurz, was dich erwartet:
- Wir laden in Wellen ein, damit der Support für alle gut bleibt.
- Du bekommst von uns ungefähr eine Mail pro Woche, nicht mehr.
- HyperLevel ist Open Source (AGPL). Du kannst es jederzeit auch selbst hosten – kostenlos.

Eine Bitte: Antworte kurz auf diese Mail und erzähl mir, welches Tool du heute nutzt und was dich daran am meisten nervt. Ich lese jede Antwort selbst.

Liebe Grüße
{{location.name}}`),
  },
  waitlistWhy: {
    name: 'Warteliste 2 – Warum wir das bauen',
    subject: 'Warum wir HyperLevel bauen',
    body: de(`Hallo {{contact.first_name|}},

viele kleine Firmen zahlen für CRM, Newsletter, Termine, Rechnungen und Helpdesk fünf verschiedene Abos – und keins davon kennt die Daten der anderen.

HyperLevel bringt das in eine Oberfläche, gehostet in Deutschland oder auf deinem eigenen Server. Wir nutzen es selbst, um unsere Firma zu führen – jede Mail, die du von uns bekommst, kommt aus HyperLevel.

Was wir (noch) nicht können, sagen wir dir ehrlich. Die Roadmap ist öffentlich, und Wünsche aus der Warteliste kommen bei uns zuerst auf den Tisch.

Liebe Grüße
{{location.name}}`),
  },
  waitlistInvite: {
    name: 'Warteliste 3 – Einladung',
    subject: 'Dein Zugang zu HyperLevel Cloud ist frei',
    body: de(`Hallo {{contact.first_name|}},

es ist so weit: Du kannst HyperLevel Cloud jetzt 14 Tage kostenlos testen. Keine Kreditkarte, kein automatischer Vertrag – nach der Testphase entscheidest du.

Die Tarife (pro Monat):
- Solo: 49,99 €
- Team & Company: 99,99 €
- Agency: 199 €
Selbst hosten bleibt kostenlos.

Wenn du Fragen hast, antworte einfach auf diese Mail.

Liebe Grüße
{{location.name}}`),
  },
  trialDay0: {
    name: 'Testphase Tag 0 – Los geht’s',
    subject: 'Willkommen – so startest du in 10 Minuten',
    body: de(`Hallo {{contact.first_name|}},

schön, dass du HyperLevel testest! Drei Dinge reichen für den Anfang:
1. Firmendaten und Logo eintragen (Einstellungen → Firma).
2. Deine Kontakte importieren – als CSV oder direkt aus HighLevel/HubSpot (Umzug).
3. Eine Pipeline anlegen oder unsere Vorlage nehmen.

In der Akademie zeigt dir eine geführte Tour jeden Schritt direkt in der App.

Liebe Grüße
{{location.name}}`),
  },
  trialDay1: {
    name: 'Testphase Tag 1 – Erste Automation',
    subject: 'Deine erste Automation (dauert 5 Minuten)',
    body: de(`Hallo {{contact.first_name|}},

heute ein kleiner Schritt mit großer Wirkung: Lass HyperLevel neue Anfragen automatisch begrüßen.

Automationen → Neuer Workflow → Auslöser „Formular abgeschickt“ → Aktion „E-Mail senden“. Fertig.

Tipp: Teste ihn mit dem Trockenlauf, bevor du ihn aktivierst – dann geht garantiert nichts an echte Kunden.

Liebe Grüße
{{location.name}}`),
  },
  trialDay3: {
    name: 'Testphase Tag 3 – Umzug',
    subject: 'Kommst du von HighLevel oder HubSpot?',
    body: de(`Hallo {{contact.first_name|}},

der Umzug ist meistens der größte Brocken. Darum gibt es den Bereich „Umzug“: Er holt Kontakte, Pipelines, Termine und mehr aus HighLevel, HubSpot und anderen Tools – mit Vorschau und Rückgängig.

Wenn etwas nicht passt, schreib uns. Wir helfen dir beim Umzug, auch per Bildschirmteilen.

Liebe Grüße
{{location.name}}`),
  },
  trialDay7: {
    name: 'Testphase Tag 7 – Halbzeit',
    subject: 'Halbzeit: Wie läuft es bei dir?',
    body: de(`Hallo {{contact.first_name|}},

eine Woche ist um. Ganz ehrlich: Passt HyperLevel zu deiner Firma – oder fehlt etwas?

Antworte mit einem Satz, gern auch kritisch. Wenn du magst, machen wir einen 15-Minuten-Call und richten gemeinsam ein, was noch hakt.

Liebe Grüße
{{location.name}}`),
  },
  trialDay12: {
    name: 'Testphase Tag 12 – Endspurt',
    subject: 'Noch zwei Tage Testphase',
    body: de(`Hallo {{contact.first_name|}},

deine Testphase endet in zwei Tagen. Danach passiert nichts automatisch – du entscheidest:
- Weiter mit Cloud: Solo 49,99 €, Team & Company 99,99 € oder Agency 199 € pro Monat.
- Selbst hosten: kostenlos, deine Daten nimmst du mit.
- Oder Pause: Deine Daten kannst du vorher jederzeit exportieren.

Fragen? Antworte einfach.

Liebe Grüße
{{location.name}}`),
  },
  trialOffer: {
    name: 'Testphase endet – Angebot',
    subject: 'Deine Testphase endet bald – unser Angebot',
    body: de(`Hallo {{contact.first_name|}},

in drei Tagen endet deine Testphase. Wenn du jetzt in einen Cloud-Tarif wechselst, richten wir dir in einem gemeinsamen Termin (30 Minuten) deine Pipeline und die erste Automation ein – ohne Aufpreis.

Kein Druck: Wenn HyperLevel nicht passt, sag es uns gern – das hilft uns mehr als jede Bewertung.

Liebe Grüße
{{location.name}}`),
  },
  churnSorry: {
    name: 'Kündigung – Danke und eine Frage',
    subject: 'Schade, dass du gehst – eine kurze Frage',
    body: de(`Hallo {{contact.first_name|}},

deine Kündigung ist angekommen. Danke, dass du HyperLevel ausprobiert hast.

Darf ich fragen, woran es lag? Eine Zeile reicht – wir lesen jede Antwort und ändern wirklich Dinge daran.

Deine Daten kannst du bis zum Vertragsende unter Einstellungen exportieren. Und falls du selbst hosten willst: Das bleibt kostenlos.

Liebe Grüße
{{location.name}}`),
  },
  winback: {
    name: 'Rückgewinnung – Was sich geändert hat',
    subject: 'Was sich seit deinem Abschied geändert hat',
    body: de(`Hallo {{contact.first_name|}},

vor ein paar Wochen hast du HyperLevel verlassen. Seitdem haben wir einiges verbessert – auch dank Rückmeldungen wie deiner.

Wenn du noch einmal reinschauen willst: Antworte auf diese Mail, dann schalten wir dir 14 Tage kostenlos frei. Wenn nicht, ist das völlig okay – dann melden wir uns nicht mehr.

Liebe Grüße
{{location.name}}`),
  },
  supportReceived: {
    name: 'Support – Anfrage erhalten',
    subject: 'Wir haben deine Anfrage erhalten',
    body: de(`Hallo {{contact.first_name|}},

danke für deine Nachricht – sie ist als Ticket bei uns angekommen. Wir antworten an Werktagen in der Regel innerhalb von 8 Arbeitsstunden, bei dringenden Problemen schneller.

Viele Antworten findest du auch im Hilfe-Center (Cloud vs. Self-Hosting, Preise, Umzug, Datenschutz).

Liebe Grüße
{{location.name}}`),
  },
  featureThanks: {
    name: 'Feature-Wunsch – Danke',
    subject: 'Danke für deinen Wunsch',
    body: de(`Hallo {{contact.first_name|}},

danke für deinen Vorschlag! Er steht jetzt auf unserer Roadmap-Liste. Wir schauen jede Woche, was die meisten brauchen – und melden uns, wenn sich bei deinem Wunsch etwas tut.

Ehrlich gesagt: Nicht jeder Wunsch wird gebaut. Aber jeder wird gelesen.

Liebe Grüße
{{location.name}}`),
  },
} satisfies Record<string, HqMail>;

export type HqMailKey = keyof typeof HQ_MAILS;
