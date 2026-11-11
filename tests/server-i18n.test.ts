import { afterEach, describe, expect, it } from 'vitest';
import en from '../server/i18n/en/index.js';
import { defaultLocale, fromAcceptLanguage, tApp, translator } from '../server/i18n/index.js';

// The rest of the suite runs in German (tests/setup-locale.ts); this file checks the English layer of the Neso fork.
describe('server i18n', () => {
  const saved = process.env.PGHL_LOCALE;
  afterEach(() => {
    process.env.PGHL_LOCALE = saved;
  });

  it('defaults to English when PGHL_LOCALE is unset', () => {
    delete process.env.PGHL_LOCALE;
    expect(defaultLocale()).toBe('en');
    expect(tApp()('Kalender fehlt')).toBe('Calendar is missing');
  });

  it('keeps the German source text for de and for unknown texts', () => {
    expect(translator('de')('Kalender fehlt')).toBe('Kalender fehlt');
    expect(translator('en')('Ein Text, den es nicht gibt')).toBe('Ein Text, den es nicht gibt');
  });

  it('interpolates and pluralises', () => {
    const t = translator('en');
    expect(t('{what}: Zahl von {min} bis {max} erwartet', { what: t('Plätze pro Termin'), min: 0, max: 5 })).toMatch(/0.*5/);
    expect(t.plural(1, { one: '{n} Element', other: '{n} Elemente' })).toBe('1 element');
    expect(t.plural(3, { one: '{n} Element', other: '{n} Elemente' })).toBe('3 elements');
  });

  it('Somali (Beta) uses its own texts and falls back to English, never to the German source', () => {
    const t = translator('so');
    expect(t('Nicht angemeldet')).toBe('Ma aadan soo gelin');
    expect(t('Kalender fehlt')).toBe('Calendar is missing');
    expect(fromAcceptLanguage('so-KE,so;q=0.9,en;q=0.5')).toBe('so');
  });

  it('picks the browser language', () => {
    expect(fromAcceptLanguage('de-DE,de;q=0.9,en;q=0.8')).toBe('de');
    expect(fromAcceptLanguage('fr-FR,en;q=0.5')).toBe('en');
    expect(fromAcceptLanguage('*')).toBeUndefined();
  });

  it('has English for every catalog value and keeps placeholders', () => {
    for (const [k, v] of Object.entries(en)) {
      const vals = typeof v === 'string' ? [v] : Object.values(v);
      for (const s of vals) {
        expect(s, k).toBeTruthy();
        for (const m of s.matchAll(/\{(\w+)\}/g)) if (m[1] !== 'n') expect(k, `${k} → ${s}`).toContain(`{${m[1]}}`);
      }
    }
  });
});
