import { useEffect, useState } from 'react';
import { api, d } from '../api';
import { Icon } from '../icons';
import { useSession } from '../session';
import { useAcademy } from './progress';
import { Badge, Link, Spinner } from '../ui';
import { tr, useT } from '../i18n';

/**
 * „Übergabe-Status“: what is set up and what is still missing, who has access and what needs
 * attention – read from the existing status endpoints (which never return secrets), so a successor
 * sees at a glance what is left to do. Agency only.
 */

type State = 'ok' | 'missing' | 'off' | 'unknown';
interface Check {
  key: string;
  label: string;
  scope: 'location' | 'agency';
  /** Where to set it up. */
  to: string;
  /** Not having it is fine (optional feature) – shown grey instead of red. */
  optional?: boolean;
  load: () => Promise<{ state: State; detail: string }>;
}

/** Details are built when a check runs, in the language active then. */
const th = tr('x_tours_b');
const ok = (detail: string) => ({ state: 'ok' as const, detail });
const missing = (detail: string) => ({ state: 'missing' as const, detail });
const off = (detail: string) => ({ state: 'off' as const, detail });

const CHECKS: Check[] = [
  {
    key: 'email',
    label: 'E-Mail-Versand',
    scope: 'location',
    to: 'settings/messaging',
    load: async () => {
      const l = await api.get('/api/location');
      const e = l.settings?.email ?? {};
      return e.provider && e.provider !== 'log' ? ok(`SMTP ${e.host ?? ''}`.trim()) : missing(th('Nur speichern – es geht keine E-Mail raus'));
    },
  },
  {
    key: 'sms',
    label: 'SMS-Versand',
    scope: 'location',
    to: 'settings/messaging',
    optional: true,
    load: async () => {
      const l = await api.get('/api/location');
      const p = l.settings?.sms?.provider;
      return p && p !== 'log' ? ok(p === 'twilio' ? 'Twilio' : 'HTTP-Gateway') : off(th('Nur speichern'));
    },
  },
  {
    key: 'invoices',
    label: 'Rechnungsdaten (IBAN, Steuernummer)',
    scope: 'location',
    to: 'settings/billing',
    load: async () => {
      const l = await api.get('/api/location');
      const s = l.settings?.invoices ?? {};
      return s.iban && (s.tax_id || s.small_business) ? ok(th('IBAN und Steuerangaben hinterlegt')) : missing(!s.iban ? th('IBAN fehlt') : th('Steuernummer / USt-ID fehlt'));
    },
  },
  {
    key: 'channels',
    label: 'WhatsApp, Messenger, Instagram',
    scope: 'location',
    to: 'settings/channels',
    optional: true,
    load: async () => {
      const m = await api.get('/api/settings/meta');
      const on = [m.whatsapp?.configured && 'WhatsApp', m.messenger?.configured && 'Messenger', m.instagram?.configured && 'Instagram'].filter(Boolean);
      return on.length ? ok(on.join(', ')) : off(th('Nicht verbunden'));
    },
  },
  {
    key: 'telephony',
    label: 'Telefonie (Twilio)',
    scope: 'location',
    to: 'settings/telephony',
    optional: true,
    load: async () => {
      const s = await api.get('/api/calls/status');
      return s.ready ? ok((s.numbers ?? []).join(', ') || th('bereit')) : off(s.missing?.length ? th('Fehlt: {list}', { list: s.missing.join(', ') }) : th('Nicht eingerichtet'));
    },
  },
  {
    key: 'phone',
    label: 'Browser-Telefon',
    scope: 'location',
    to: 'settings/telephony',
    optional: true,
    load: async () => {
      const s = await api.get('/api/phone/status');
      return s.enabled && s.ready ? ok(th('bereit')) : off(s.enabled ? th('Fehlt: {list}', { list: (s.missing ?? []).join(', ') }) : th('Aus'));
    },
  },
  {
    key: 'ai',
    label: 'KI-Assistent',
    scope: 'location',
    to: 'settings/ai',
    optional: true,
    load: async () => {
      const s = await api.get('/api/ai/status');
      return s.enabled ? ok(s.assistant_name || th('an')) : off(th('Aus oder kein Anthropic-Schlüssel'));
    },
  },
  {
    key: 'voice',
    label: 'KI-Telefonagent',
    scope: 'location',
    to: 'settings/telephony',
    optional: true,
    load: async () => {
      const s = await api.get('/api/voice-ai/settings');
      const mode = s.settings?.mode ?? 'off';
      return mode !== 'off' ? (s.ai_ready && s.telephony_ready ? ok(th('Modus: {mode}', { mode })) : missing(s.ai_problem || th('Telefonie nicht bereit'))) : off(th('Aus'));
    },
  },
  {
    key: 'stripe',
    label: 'Stripe (Online-Zahlung)',
    scope: 'location',
    to: 'settings/stripe',
    optional: true,
    load: async () => {
      const s = await api.get('/api/stripe');
      if (!s.connected) return off(th('Nicht verbunden'));
      return s.webhook_set ? ok(`${s.account?.name ?? th('verbunden')}${s.live ? ' · Live' : th(' · Testmodus')}`) : missing(th('Webhook-Signing-Secret fehlt – Zahlungen werden nicht verbucht'));
    },
  },
  {
    key: 'google',
    label: 'Google-Bewertungen / Unternehmensprofil',
    scope: 'location',
    to: 'settings/reviews',
    optional: true,
    load: async () => {
      const [b, p] = await Promise.all([api.get('/api/google-reviews/business').catch(() => ({})), api.get('/api/google-reviews/settings').catch(() => ({}))]);
      if (b.connected) return b.needs_reconnect ? missing(th('Unternehmensprofil neu verbinden')) : ok(b.location_title || th('Unternehmensprofil verbunden'));
      return p.api_key_set && p.place_id ? ok(p.place_name || 'Places API') : off(th('Nicht verbunden'));
    },
  },
  {
    key: 'livechat',
    label: 'Website-Chat',
    scope: 'location',
    to: 'settings/chat',
    optional: true,
    load: async () => {
      const s = await api.get('/api/livechat');
      return s.enabled ? ok(th('an')) : off(th('Aus'));
    },
  },
  {
    key: 'social',
    label: 'Social Planner (Postiz)',
    scope: 'location',
    to: 'social',
    optional: true,
    load: async () => {
      const s = await api.get('/api/social');
      return s.configured ? (s.channels?.length ? ok(th('{n} Kanäle', { n: s.channels.length })) : missing(th('Postiz verbunden, aber keine Kanäle'))) : off(th('Postiz nicht verbunden'));
    },
  },
  {
    key: 'helpdesk',
    label: 'Service (Tickets, Zuweisung, Support-Postfach)',
    scope: 'location',
    to: 'settings/helpdesk',
    optional: true,
    load: async () => {
      const [h, open] = await Promise.all([api.get('/api/helpdesk/settings'), api.get('/api/tickets?state=open&owner=none&limit=1').catch(() => ({ total: 0 }))]);
      const s = h.settings ?? {};
      const on = [
        s.assignment?.mode && s.assignment.mode !== 'manual' && th('automatische Zuweisung'),
        s.email_to_ticket?.mode && s.email_to_ticket.mode !== 'off' && th('E-Mail → Ticket'),
        s.help_center?.enabled && th('Hilfe-Center öffentlich'),
      ].filter(Boolean);
      if (open.total) return missing(th('{n} offene Tickets ohne Zuständige', { n: open.total }));
      return on.length ? ok(on.join(', ')) : off(th('Nicht eingerichtet (Zuweisung manuell, kein Support-Postfach)'));
    },
  },
  {
    key: 'hubspot',
    label: 'Umzug aus HubSpot',
    scope: 'location',
    to: 'settings/import',
    optional: true,
    load: async () => {
      const s = await api.get('/api/import/hubspot');
      const job = s.job;
      if (job?.status === 'running') return ok(th('Import läuft gerade'));
      if (job && job.status !== 'done') return missing(th('Import unterbrochen – unter Einstellungen → Import fortsetzen'));
      if (job) return ok(th('Importiert am {date}', { date: d(job.finished_at ?? job.updated_at) }) + (s.connection?.connected ? th(' · Token noch verbunden (nach dem Umzug trennen)') : ''));
      return s.connection?.connected ? missing(th('Verbunden, aber noch nicht importiert')) : off(th('Kein Umzug aus HubSpot'));
    },
  },
  {
    key: 'branding',
    label: 'White-Label (Name, Logo, App-Domain)',
    scope: 'agency',
    to: 'agency/branding',
    load: async () => {
      const b = await api.get('/api/agency/branding');
      const dom = b.app_domain ? `${b.app_domain}${b.app_domain_status?.status === 'active' ? '' : th(' (noch nicht aktiv)')}` : th('keine eigene Domain');
      return b.name && b.name !== 'HyperLevel' ? ok(`${b.name} · ${dom}`) : missing(th('Name und Logo der Agentur fehlen'));
    },
  },
  {
    key: 'domains',
    label: 'Eigene Domains',
    scope: 'agency',
    to: 'agency/domains',
    optional: true,
    load: async () => {
      const s = await api.get('/api/agency/domains');
      const list: any[] = s.domains ?? [];
      if (!list.length) return off(th('Keine eingetragen'));
      const bad = list.filter((x) => x.status !== 'active');
      return bad.length ? missing(th('{bad} von {total} nicht aktiv: {list}', { bad: bad.length, total: list.length, list: bad.map((x) => x.domain).slice(0, 3).join(', ') })) : ok(th('{n} aktiv', { n: list.length }));
    },
  },
  {
    key: 'oauth',
    label: 'Google-/Microsoft-Anmeldung (OAuth)',
    scope: 'agency',
    to: 'agency/integrations/setup',
    optional: true,
    load: async () => {
      const s = await api.get('/api/agency/oauth');
      const on = [s.google?.configured && 'Google', s.microsoft?.configured && 'Microsoft'].filter(Boolean);
      return on.length ? ok(on.join(', ')) : off(th('Keine OAuth-App'));
    },
  },
  {
    key: 'mail',
    label: 'Postfach-Sync (IMAP)',
    scope: 'agency',
    to: 'agency/integrations/setup',
    optional: true,
    load: async () => {
      const list: any[] = await api.get('/api/agency/mail-accounts');
      const on = list.filter((m) => m.enabled);
      return on.length ? ok(on.map((m) => m.own_address || m.username).join(', ')) : off(th('Kein Postfach'));
    },
  },
  {
    key: 'supabase',
    label: 'Supabase-Spiegel',
    scope: 'agency',
    to: 'agency/integrations/setup',
    optional: true,
    load: async () => {
      const s = await api.get('/api/agency/supabase');
      return s.enabled && s.key_set ? ok(s.url) : off(th('Aus'));
    },
  },
  {
    key: 'todoist',
    label: 'Todoist-Abgleich',
    scope: 'agency',
    to: 'agency/integrations/setup',
    optional: true,
    load: async () => {
      const s = await api.get('/api/agency/todoist');
      return s.enabled && s.token_set ? ok(s.account?.name ?? th('an')) : off(th('Aus'));
    },
  },
  {
    key: 'saas',
    label: 'SaaS-Modus (Agentur-Stripe)',
    scope: 'agency',
    to: 'agency/saas',
    optional: true,
    load: async () => {
      const s = await api.get('/api/saas/settings');
      return s.connected ? (s.webhook_set ? ok(`${s.account?.name ?? th('verbunden')}${s.live ? ' · Live' : th(' · Testmodus')}`) : missing(th('Webhook-Signing-Secret fehlt'))) : off(th('Nicht genutzt'));
    },
  },
  {
    key: 'backups',
    label: 'Tägliche Backups',
    scope: 'agency',
    to: 'settings/locations',
    load: async () => {
      const s = await api.get('/api/admin/backups');
      if (!s.enabled) return missing(th('Automatische Backups sind aus (PGHL_BACKUPS=0)'));
      const latest = (s.backups ?? [])[0];
      if (!latest) return missing(th('Noch kein Backup vorhanden'));
      const age = (Date.now() - new Date(latest.at).getTime()) / 864e5;
      return age > 2 ? missing(th('Letztes Backup vom {date}', { date: d(latest.at) })) : ok(th('Letztes Backup {date}', { date: d(latest.at) }));
    },
  },
  {
    key: 'mcp',
    label: 'Agentur-API / MCP-Schlüssel',
    scope: 'agency',
    to: 'agency/api',
    optional: true,
    load: async () => {
      const list: any[] = await api.get('/api/agency/api-keys');
      return list.length ? ok(th('{n} Schlüssel ({names})', { n: list.length, names: list.map((k) => k.name).slice(0, 3).join(', ') })) : off(th('Keiner angelegt'));
    },
  },
  {
    key: 'mobile',
    label: 'Android-App (Handy gekoppelt)',
    scope: 'agency',
    to: 'settings/account',
    optional: true,
    load: async () => {
      const [release, devices] = await Promise.all([api.get('/api/mobile/app').catch(() => null), api.get('/api/mobile/devices').catch(() => [])]);
      if (!release) return off(th('Die App ist noch nicht hochgeladen'));
      const list: any[] = Array.isArray(devices) ? devices : [];
      const version = release.version_name ? th(' · App {version}', { version: release.version_name }) : '';
      return list.length ? ok(th.plural(list.length, { one: '{n} Handy gekoppelt', other: '{n} Handys gekoppelt' }) + version) : off(th('Noch kein Handy gekoppelt') + version);
    },
  },
];

type Result = { state: State; detail: string };
const ICON: Record<State, string> = { ok: '✓', missing: '!', off: '–', unknown: '?' };

export function Handover() {
  const tt = useT('x_tours_b');
  const session = useSession();
  const sandbox = useAcademy()?.sandbox?.id;
  const [res, setRes] = useState<Record<string, Result>>({});
  const [users, setUsers] = useState<any[] | null>(null);
  const [projects, setProjects] = useState<any[] | null>(null);
  useEffect(() => {
    setRes({});
    for (const c of CHECKS)
      c.load()
        .catch(() => ({ state: 'unknown' as const, detail: tt('Konnte nicht geprüft werden') }))
        .then((r) => setRes((cur) => ({ ...cur, [c.key]: r })));
    api.get<any[]>('/api/users').then(setUsers).catch(() => setUsers([]));
    api.get<any[]>('/api/agency/projects').then(setProjects).catch(() => setProjects([]));
  }, [session.locationId]);
  // The practice company's made-up tasks and messages are not real open items.
  const real = (projects ?? []).filter((p) => p.id !== sandbox);

  const admins = (users ?? []).filter((u) => u.role === 'admin');
  const no2fa = admins.filter((u) => !u.totp_enabled);
  const down = real.filter((p) => p.profile?.website && p.profile?.uptime?.last && !p.profile.uptime.last.ok);
  const overdue = real.reduce((s, p) => s + (p.stats?.overdue_tasks ?? 0), 0);
  const unread = real.reduce((s, p) => s + (p.stats?.unread ?? 0), 0);
  const required = CHECKS.filter((c) => !c.optional);
  const crit: { text: string; to: string }[] = [
    ...no2fa.map((u) => ({ text: tt('{name} (Admin) hat keinen Zwei-Faktor-Login', { name: u.name }), to: 'settings/account' })),
    ...required.filter((c) => res[c.key]?.state === 'missing').map((c) => ({ text: `${tt(c.label)}: ${res[c.key].detail}`, to: c.to })),
    ...CHECKS.filter((c) => c.optional && res[c.key]?.state === 'missing').map((c) => ({ text: `${tt(c.label)}: ${res[c.key].detail}`, to: c.to })),
    ...down.map((p) => ({ text: tt('Website von „{name}“ ist nicht erreichbar', { name: p.name }), to: 'agency/projects' })),
    ...(overdue ? [{ text: tt.plural(overdue, { one: '{n} überfällige Aufgabe in allen Projekten', other: '{n} überfällige Aufgaben in allen Projekten' }), to: 'agency/tasks' }] : []),
    ...(unread > 20 ? [{ text: tt('{n} ungelesene Nachrichten in allen Projekten', { n: unread }), to: 'agency/projects' }] : []),
  ];
  const loc = session.locations.find((l) => l.id === session.locationId)?.name ?? '';
  const done = CHECKS.filter((c) => res[c.key]?.state === 'ok').length;

  const Row = ({ c }: { c: Check }) => {
    const r = res[c.key];
    const st = r?.state ?? 'unknown';
    const tone = st === 'ok' ? 'ok' : st === 'missing' ? 'bad' : 'off';
    return (
      <li className={`ho-row ${tone}`}>
        <span className="ho-ico" aria-label={st}>{r ? ICON[st] : '…'}</span>
        <span className="grow">
          {tt(c.label)}
          <small>{r ? r.detail : tt('wird geprüft …')}</small>
        </span>
        <Link to={c.to} className="small">
          {st === 'ok' ? tt('Ansehen') : tt('Einrichten')}
        </Link>
      </li>
    );
  };

  return (
    <div className="card handover" data-tour="academy-handover">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2>
          <Icon name="shield" size={18} /> {tt('Übergabe-Status')}
        </h2>
        <span className="muted small">
          {tt('{done} von {length} Punkten eingerichtet · Geheimnisse werden nie angezeigt', { done: done, length: CHECKS.length })}
        </span>
      </div>
      <div className="ho-grid">
        <div>
          <h3>{tt('Offene Punkte')}</h3>
          {users === null || projects === null ? (
            <Spinner />
          ) : crit.length ? (
            <ul className="ho-list">
              {crit.map((c, i) => (
                <li key={i} className="ho-row bad">
                  <span className="ho-ico">!</span>
                  <span className="grow">{c.text}</span>
                  <Link to={c.to} className="small">
                    {tt('Öffnen')}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="tour-ok">
              <Icon name="ok" size={15} /> {tt('Nichts Dringendes offen.')}
            </p>
          )}
          <h3 style={{ marginTop: 14 }}>{tt('Wer hat Zugang?')}</h3>
          {users === null ? (
            <Spinner />
          ) : (
            <ul className="ho-list">
              {users.map((u) => (
                <li key={u.id} className="ho-row">
                  <span className="ho-ico">{u.role === 'admin' ? <Icon name="lock" size={14} /> : <Icon name="contact" size={14} />}</span>
                  <span className="grow">
                    {u.name} <span className="muted small">{u.email}</span>
                    <small>
                      {u.role === 'admin' ? tt('Agentur-Admin – sieht alles') : tt('Mitglied · {n} Sub-Account(s) · {areas}', { n: u.locations?.length ?? 0, areas: u.permissions ? tt('{length} Bereiche', { length: u.permissions.length }) : tt('alle Bereiche') })}
                    </small>
                  </span>
                  {u.totp_enabled ? <Badge tone="green">2FA</Badge> : <Badge tone={u.role === 'admin' ? 'red' : 'gray'}>{tt('ohne 2FA')}</Badge>}
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">
            {tt('Zugänge verwaltest du unter')} <Link to="settings/team">{tt('Einstellungen → Team')}</Link>{tt(', Kunden-Logins unter')} <Link to="agency/clients">{tt('Agentur → Kunden')}</Link>.
          </p>
        </div>
        <div>
          <h3>{tt('Dieser Sub-Account')}{loc ? `: ${loc}` : ''}</h3>
          <ul className="ho-list">
            {CHECKS.filter((c) => c.scope === 'location').map((c) => (
              <Row key={c.key} c={c} />
            ))}
          </ul>
        </div>
        <div>
          <h3>{tt('Agentur & Server')}</h3>
          <ul className="ho-list">
            {CHECKS.filter((c) => c.scope === 'agency').map((c) => (
              <Row key={c.key} c={c} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
