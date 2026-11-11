/**
 * Neso fork: the server's default language is English (server/i18n), but the upstream suite asserts the German source
 * texts. Every test file therefore runs with PGHL_LOCALE=de unless the environment already sets a language;
 * tests/server-i18n.test.ts covers the English side.
 */
process.env.PGHL_LOCALE ??= 'de';
