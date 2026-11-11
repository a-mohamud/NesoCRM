import type { Catalog } from '../index.js';
import errors from './errors.js';
/**
 * Somali (Beta) catalogs of the server. Texts missing here fall back to English (server/i18n/index.ts), never to the
 * German source: add customer-facing areas here as they are translated.
 */
const parts: Catalog[] = [errors];
export default Object.assign({}, ...parts) as Catalog;
