// Shared site constants — links and the current version, in one place so pages
// (and the header/footer components) can't drift out of sync.
import pkg from '../package.json';

/** Canonical project links. */
export const REPO_URL = 'https://github.com/jimbuck/casewright';
export const DOWNLOAD_URL = `${REPO_URL}/releases`;
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;

/** Published version, sourced from package.json so the site never hard-codes a stale number. */
export const VERSION = pkg.version;

/**
 * Prefix an internal path with the configured base — `/` locally, `/casewright/`
 * on GitHub Pages — so links resolve in both. `withBase()` returns the site root.
 */
export function withBase(path = ''): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  const rest = path.replace(/^\/+/, '');
  return (rest ? `${base}/${rest}` : base) || '/';
}
