import type { SiteSettings } from '../types/video';

/** Shared with the inline bootstrap script in index.html. */
export const SITE_SETTINGS_CACHE_KEY = 'zotomic_site_settings_v1';

/**
 * The public site settings document is fetched asynchronously. Caching the last
 * known copy lets the app paint the real brand (name, logo, nav) immediately on
 * refresh instead of flashing the built-in defaults first.
 */
export function readCachedSiteSettings(): Partial<SiteSettings> | null {
  try {
    const raw = localStorage.getItem(SITE_SETTINGS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SiteSettings> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.siteName !== 'string' || !parsed.siteName.trim()) return null;
    if (!Array.isArray(parsed.headerLinks) || !Array.isArray(parsed.footerLinks)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedSiteSettings(settings: SiteSettings): void {
  try {
    localStorage.setItem(SITE_SETTINGS_CACHE_KEY, JSON.stringify(settings));
  } catch {
    // Storage may be full or disabled; branding still loads from Firestore.
  }
}
