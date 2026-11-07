import { useEffect, useState } from 'react';
import { Icon } from '../icons';
import { api, dt } from '../api';
import { Badge, CodeBox, Field, Input, Select, Spinner, act, confirmAsk, useLoad } from '../ui';
import { SignupLink } from '../referrals';
import { useT } from '../i18n';

/**
 * Einstellungen → E-Mail & SMS: transactional email APIs (Resend, Postmark, Amazon SES, Brevo,
 * Mailgun) and SMS APIs (seven.io, Bird, Vonage, Plivo) as providers of the sub-account. The
 * fields come from the server (/api/settings/channels/mail|sms), secrets are never shown again.
 */

export const EMAIL_PROVIDER_OPTIONS: [string, string][] = [
  ['resend', 'Resend (API)'],
  ['postmark', 'Postmark (API)'],
  ['ses', 'Amazon SES (API)'],
  ['brevo', 'Brevo (API)'],
  ['mailgun', 'Mailgun (API)'],
];
export const SMS_PROVIDER_OPTIONS: [string, string][] = [
  ['seven', 'seven.io (Deutschland/EU)'],
  ['bird', 'Bird / MessageBird'],
  ['vonage', 'Vonage'], // i18n-ignore
  ['plivo', 'Plivo'], // i18n-ignore
];
export const isApiProvider = (kind: 'mail' | 'sms', p: string) => (kind === 'mail' ? EMAIL_PROVIDER_OPTIONS : SMS_PROVIDER_OPTIONS).some(([k]) => k === p);

const WEBHOOK_HINT: Record<string, string> = {
  resend: 'Resend → Webhooks → Add Endpoint: diese Adresse, Ereignisse email.sent/delivered/bounced/complained/delivery_delayed/failed. Das Signing Secret oben eintragen.',
  postmark: 'Postmark → Server → Webhooks: diese Adresse für Delivery, Bounce, Spam Complaint. Für eingehende Mails dieselbe Adresse unter „Inbound“ als Webhook eintragen.',
  ses: 'SES → Configuration Set → Event destination „Amazon SNS“ (Send, Delivery, Bounce, Complaint, Reject). Im SNS-Topic ein HTTPS-Abo mit dieser Adresse anlegen – es wird automatisch bestätigt. Eingehend: Receipt Rule mit SNS-Aktion (Encoding Base64) auf ein Topic mit derselben Adresse.',
  brevo: 'Brevo → Transaktional → Einstellungen → Webhooks: diese Adresse (delivered, hard/soft bounce, spam, blocked, unsubscribed). Eingehend: Inbound Parsing auf dieselbe Adresse.',
  mailgun: 'Mailgun → Sending → Webhooks: diese Adresse für delivered, permanent/temporary failure, complained, unsubscribed. Eingehend: Receiving → Route mit forward("…diese Adresse").',
  seven: 'seven.io → Entwickler → Webhooks: diese Adresse für „SMS-Status“ (dlr) und „Eingehende SMS“ (sms_mo).',
  bird: 'Bird → Developer → Webhooks: Abo für sms.outbound (Status) und sms.inbound mit dieser Adresse.',
  vonage: 'Vonage-Application → Messages: Inbound URL und Status URL = diese Adresse; „Signed webhooks“ mit dem Signature Secret.',
  plivo: 'Plivo → Messaging → Applications: Message URL = diese Adresse (POST). Statusmeldungen schickt HyperLevel bei jeder SMS mit.',
};

export function ProviderPanel({ kind, provider, onSaved }: { kind: 'mail' | 'sms'; provider: string; onSaved: (patch: Record<string, string>) => void }) {
  const tt = useT('x_comms');
  const s = useLoad(() => api.get(`/api/settings/channels/${kind}`), [kind]);
  const [f, setF] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: boolean; text: string }>();
  const d = s.data?.providers?.[provider];
  useEffect(() => {
    if (!d) return;
    const from = s.data.from ?? {};
    setF({ ...d.config, ...(kind === 'mail' ? { fromName: from.fromName ?? '', fromEmail: from.fromEmail ?? '', replyTo: from.replyTo ?? '' } : {}) });
    setResult(undefined);
  }, [d?.provider, s.data]);
  if (!s.data) return s.error ? <p className="muted">{s.error}</p> : <Spinner />;
  if (!d) return null;
  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  const save = async () => {
    const body: Record<string, any> = { ...f, activate: true };
    for (const sf of d.fields.secrets) if (!body[sf.key]) delete body[sf.key];
    const r = await act(() => api.put(`/api/settings/channels/${kind}/${provider}`, body), tt('{label} gespeichert und aktiv', { label: d.label }));
    if (!r) return;
    onSaved(kind === 'mail' ? { provider, fromName: f.fromName ?? '', fromEmail: f.fromEmail ?? '', replyTo: f.replyTo ?? '' } : { provider });
    s.reload();
  };
  const test = async () => {
    try {
      const r = await api.post(`/api/settings/channels/${kind}/${provider}/test`);
      setResult({ ok: true, text: r.info });
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message });
    }
  };
  return (
    <div className="provider-panel" data-tour={`provider-${kind}`}>
      <div className="row" style={{ alignItems: 'center', gap: 8 }}>
        <strong>{d.label}</strong>
        <SignupLink id={provider} />
        {d.configured ? <Badge tone="green">{tt('eingerichtet')}</Badge> : <Badge>{tt('unvollständig')}</Badge>}
        {s.data.active === provider && <Badge tone="blue">{tt('aktiv')}</Badge>}
      </div>
      <div className="grid2">
        {d.fields.secrets.map((x: any) => (
          <Field key={x.key} label={`${x.label}${x.optional ? tt(' (optional)') : ''}`}>
            <Input type="password" autoComplete="new-password" value={f[x.key] ?? ''} onChange={(v) => set(x.key, v)} placeholder={d.secrets_set[x.key] ? tt('•••••• gespeichert') : x.hint ?? ''} />
          </Field>
        ))}
        {d.fields.config.map((x: any) => (
          <Field key={x.key} label={`${x.label}${x.optional ? tt(' (optional)') : ''}`}>
            {x.options ? <Select value={f[x.key] || x.options[0][0]} onChange={(v) => set(x.key, v)} options={x.options} /> : <Input value={f[x.key] ?? ''} onChange={(v) => set(x.key, v)} placeholder={x.hint ?? ''} />}
          </Field>
        ))}
        {kind === 'mail' && (
          <>
            <Field label={tt('Absendername')}>
              <Input value={f.fromName ?? ''} onChange={(v) => set('fromName', v)} />
            </Field>
            <Field label={tt('Absender-E-Mail (beim Anbieter bestätigt)')}>
              <Input value={f.fromEmail ?? ''} onChange={(v) => set('fromEmail', v)} placeholder={tt('info@deine-domain.de')} />
            </Field>
            <Field label={tt('Antwort an (optional)')}>
              <Input value={f.replyTo ?? ''} onChange={(v) => set('replyTo', v)} />
            </Field>
          </>
        )}
      </div>
      {d.webhook_url ? (
        <Field label={kind === 'mail' ? (d.inbound ? tt('Webhook für Zustell-Meldungen und eingehende Mails') : tt('Webhook für Zustell-Meldungen')) : tt('Webhook für Zustellberichte und eingehende SMS')} hint={<>{tt('{v} Prüfung: {signed}.', { v: tt(WEBHOOK_HINT[provider] ?? ''), signed: d.signed })}</>}>
          <CodeBox text={d.webhook_url} />
        </Field>
      ) : (
        <p className="muted small">{tt('Die Webhook-Adresse erscheint nach dem ersten Speichern.')}</p>
      )}
      <div className="row">
        <button className="btn" onClick={save}>
          {tt('Speichern & aktivieren')}
        </button>
        <button className="btn secondary" disabled={!d.configured} onClick={test}>
          {tt('Verbindung testen')}
        </button>
        {d.configured && (
          <button className="btn ghost danger-text" onClick={async () => confirmAsk(tt('{label}-Zugang löschen?', { label: d.label })) && (await act(() => api.del(`/api/settings/channels/${kind}/${provider}`), tt('Gelöscht'))) && (s.reload(), s.data.active === provider && onSaved({ provider: 'log' }))}>
            {tt('Zugang löschen')}
          </button>
        )}
      </div>
      {result && <div className={`meta-result ${result.ok ? 'ok' : 'err'}`}>{result.ok ? <Icon name="ok" size={14} /> : <Icon name="fail" size={14} />} {result.text}</div>}
      {(d.last_webhook_at || d.last_error) && (
        <p className="muted small">
          {d.last_webhook_at && <>{tt('Letzte Meldung: {dt}.', { dt: dt(d.last_webhook_at) })} </>}
          {d.last_error && <span style={{ color: 'var(--red)' }}>{d.last_error}</span>}
        </p>
      )}
    </div>
  );
}
