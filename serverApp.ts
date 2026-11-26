import 'dotenv/config';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  AiBrainSettings,
  AnalyzeVideoResponse,
  ExtractedLink,
  InboxItemType,
  TranscriptEntry,
  VideoPlatform,
  VideoSegment,
} from './src/types/video.ts';
import {
  getCallerUsageSnapshot,
  guardAiRequest,
  guardGeneralApiRateLimit,
  isSafePublicHttpUrl,
  issueHumanChallenge,
  verifyCallerIdentity,
  verifyHumanChallenge,
} from './serverRateLimit.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const GEMINI_MODEL = 'gemini-4-hydrogen';
export const GEMINI_FALLBACK_MODEL = 'gemini-3.1-flash-lite';

interface FirebaseAppletConfig {
  projectId?: string;
  firestoreDatabaseId?: string;
}

let cachedFirebaseConfig: FirebaseAppletConfig | null = null;
function getFirebaseAppletConfig(): FirebaseAppletConfig {
  if (cachedFirebaseConfig) return cachedFirebaseConfig;

  const envProjectId = (process.env.FIREBASE_PROJECT_ID || '').trim();
  const envDbId = (process.env.FIREBASE_DATABASE_ID || '').trim();

  const candidatePaths = [
    path.resolve(__dirname, 'firebase-applet-config.json'),
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
  ];

  for (const configPath of candidatePaths) {
    try {
      if (fs.existsSync(configPath)) {
        const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as FirebaseAppletConfig;
        cachedFirebaseConfig = {
          projectId: envProjectId || parsed.projectId,
          firestoreDatabaseId: envDbId || parsed.firestoreDatabaseId,
        };
        return cachedFirebaseConfig;
      }
    } catch {
      // Ignore missing/invalid config file
    }
  }

  cachedFirebaseConfig = {
    ...(envProjectId ? { projectId: envProjectId } : {}),
    ...(envDbId ? { firestoreDatabaseId: envDbId } : {}),
  };
  return cachedFirebaseConfig;
}

export interface ServerSiteSettings {
  siteName: string;
  metaTitle: string;
  metaDescription: string;
  faviconUrl: string;
  appleTouchIconUrl: string;
  pwaIcon192Url: string;
  pwaIcon512Url: string;
  pwaMaskableIconUrl: string;
  ogImageUrl: string;
  canonicalUrl: string;
  googleSiteVerification: string;
  googleHtmlFileName: string;
  googleHtmlFileContent: string;
}

const DEFAULT_SERVER_SITE_SETTINGS: ServerSiteSettings = {
  siteName: 'ClipIndex',
  metaTitle: 'ClipIndex — Video Timestamps, Summaries & Searchable Library',
  metaDescription:
    'Extract timestamped segments, AI summaries, transcripts, links, and searchable tags from shared videos, screenshots, and web pages.',
  faviconUrl: '',
  appleTouchIconUrl: '',
  pwaIcon192Url: '',
  pwaIcon512Url: '',
  pwaMaskableIconUrl: '',
  ogImageUrl: '',
  canonicalUrl: '',
  googleSiteVerification: '',
  googleHtmlFileName: '',
  googleHtmlFileContent: '',
};

let siteSettingsCache: { data: ServerSiteSettings; expiresAt: number } | null = null;

function readFirestoreStringField(
  fields: Record<string, { stringValue?: string } | undefined> | undefined,
  key: string
): string {
  return typeof fields?.[key]?.stringValue === 'string' ? fields[key]!.stringValue! : '';
}

function sanitizeServerHttpUrl(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

/** Allows public https URLs and admin-uploaded `media:<id>` references. */
function sanitizeServerImageRef(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('media:')) {
    const id = trimmed.slice('media:'.length).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
    return id ? `media:${id}` : '';
  }
  return sanitizeServerHttpUrl(trimmed);
}

/** Converts a stored image reference into a browser-fetchable absolute URL. */
export function resolveServerImageRef(raw: string, requestOrigin: string): string {
  const value = sanitizeServerImageRef(raw);
  if (!value) return '';
  if (value.startsWith('media:')) {
    const origin = sanitizeServerHttpUrl(requestOrigin).replace(/\/+$/, '');
    return origin ? `${origin}/api/site-media/${value.slice('media:'.length)}` : '';
  }
  return value;
}

const SITE_MEDIA_MIME_ALLOWLIST = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/avif',
  'image/x-icon',
  'image/vnd.microsoft.icon',
]);

const MAX_SITE_MEDIA_BASE64_CHARS = 1_000_000;
const siteMediaCache = new Map<string, { mime: string; base64: string; expiresAt: number }>();
const SITE_MEDIA_CACHE_TTL_MS = 5 * 60 * 1000;
const SITE_MEDIA_CACHE_LIMIT = 80;

/**
 * Reads an admin-uploaded image from `siteMedia/{id}` via the Firestore REST API
 * and returns the decoded MIME type + base64 payload for `/api/site-media/:id`.
 */
async function readSiteMediaData(
  id: string
): Promise<{ mime: string; base64: string } | null> {
  const cleanId = (id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  if (!cleanId) return null;

  const now = Date.now();
  const cached = siteMediaCache.get(cleanId);
  if (cached && cached.expiresAt > now) {
    return { mime: cached.mime, base64: cached.base64 };
  }

  const cfg = getFirebaseAppletConfig();
  if (!cfg.projectId || !cfg.firestoreDatabaseId) return null;

  try {
    const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      cfg.projectId
    )}/databases/${encodeURIComponent(cfg.firestoreDatabaseId)}/documents/siteMedia/${encodeURIComponent(
      cleanId
    )}`;
    const res = await fetchWithTimeout(endpoint, 3000);
    if (!res.ok) return null;
    const docJson = (await res.json()) as {
      fields?: Record<string, { stringValue?: string } | undefined>;
    };
    const dataUrl = readFirestoreStringField(docJson.fields, 'dataUrl').trim();
    const storedMime = readFirestoreStringField(docJson.fields, 'mime').trim().toLowerCase();
    const match = /^data:([a-zA-Z0-9.+/;-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
    if (!match) return null;

    const mime = (match[1] || storedMime).toLowerCase().split(';')[0];
    if (!SITE_MEDIA_MIME_ALLOWLIST.has(mime)) return null;

    const base64 = match[2].replace(/\s+/g, '');
    if (!base64 || base64.length > MAX_SITE_MEDIA_BASE64_CHARS) return null;

    if (siteMediaCache.size >= SITE_MEDIA_CACHE_LIMIT) {
      const oldestKey = siteMediaCache.keys().next().value;
      if (oldestKey) siteMediaCache.delete(oldestKey);
    }
    siteMediaCache.set(cleanId, { mime, base64, expiresAt: now + SITE_MEDIA_CACHE_TTL_MS });
    return { mime, base64 };
  } catch {
    return null;
  }
}

export async function getPublicSiteSettings(): Promise<ServerSiteSettings> {
  const now = Date.now();
  if (siteSettingsCache && siteSettingsCache.expiresAt > now) {
    return siteSettingsCache.data;
  }

  const cfg = getFirebaseAppletConfig();
  if (!cfg.projectId || !cfg.firestoreDatabaseId) {
    return DEFAULT_SERVER_SITE_SETTINGS;
  }

  try {
    const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      cfg.projectId
    )}/databases/${encodeURIComponent(cfg.firestoreDatabaseId)}/documents/settings/site`;
    const res = await fetchWithTimeout(endpoint, 2500);
    if (!res.ok) {
      siteSettingsCache = { data: DEFAULT_SERVER_SITE_SETTINGS, expiresAt: now + 15000 };
      return DEFAULT_SERVER_SITE_SETTINGS;
    }
    const docJson = (await res.json()) as {
      fields?: Record<string, { stringValue?: string } | undefined>;
    };
    const f = docJson.fields;
    const siteName = readFirestoreStringField(f, 'siteName') || DEFAULT_SERVER_SITE_SETTINGS.siteName;
    const data: ServerSiteSettings = {
      siteName,
      metaTitle: readFirestoreStringField(f, 'metaTitle') || `${siteName} — Video Timestamps & Summaries`,
      metaDescription:
        readFirestoreStringField(f, 'metaDescription') || DEFAULT_SERVER_SITE_SETTINGS.metaDescription,
      faviconUrl: sanitizeServerImageRef(readFirestoreStringField(f, 'faviconUrl')),
      appleTouchIconUrl: sanitizeServerImageRef(readFirestoreStringField(f, 'appleTouchIconUrl')),
      pwaIcon192Url: sanitizeServerImageRef(readFirestoreStringField(f, 'pwaIcon192Url')),
      pwaIcon512Url: sanitizeServerImageRef(readFirestoreStringField(f, 'pwaIcon512Url')),
      pwaMaskableIconUrl: sanitizeServerImageRef(
        readFirestoreStringField(f, 'pwaMaskableIconUrl')
      ),
      ogImageUrl: sanitizeServerImageRef(readFirestoreStringField(f, 'ogImageUrl')),
      canonicalUrl: sanitizeServerHttpUrl(readFirestoreStringField(f, 'canonicalUrl')),
      googleSiteVerification: readFirestoreStringField(f, 'googleSiteVerification').replace(
        /[^a-zA-Z0-9_-]/g,
        ''
      ),
      googleHtmlFileName: readFirestoreStringField(f, 'googleHtmlFileName'),
      googleHtmlFileContent: readFirestoreStringField(f, 'googleHtmlFileContent'),
    };
    siteSettingsCache = { data, expiresAt: now + 15000 };
    return data;
  } catch {
    return siteSettingsCache?.data || DEFAULT_SERVER_SITE_SETTINGS;
  }
}

interface PublicCatalogSummary {
  pages: Array<{ slug: string; title: string; subtitle: string; pageType: string }>;
  plans: Array<{ name: string; tagline: string; monthlyPrice: number; yearlyMonthlyPrice: number }>;
}

let publicCatalogCache: { data: PublicCatalogSummary; expiresAt: number } | null = null;

async function getPublicCatalogSummary(): Promise<PublicCatalogSummary> {
  const now = Date.now();
  if (publicCatalogCache && publicCatalogCache.expiresAt > now) {
    return publicCatalogCache.data;
  }
  const cfg = getFirebaseAppletConfig();
  if (!cfg.projectId || !cfg.firestoreDatabaseId) {
    return { pages: [], plans: [] };
  }

  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    cfg.projectId
  )}/databases/${encodeURIComponent(cfg.firestoreDatabaseId)}/documents`;

  try {
    const [pagesRes, plansRes] = await Promise.allSettled([
      fetchWithTimeout(`${base}/pages?pageSize=25`, 2500),
      fetchWithTimeout(`${base}/pricingPlans?pageSize=12`, 2500),
    ]);

    const pages: PublicCatalogSummary['pages'] = [];
    if (pagesRes.status === 'fulfilled' && pagesRes.value.ok) {
      const json = (await pagesRes.value.json()) as {
        documents?: Array<{
          fields?: Record<string, { stringValue?: string; booleanValue?: boolean } | undefined>;
        }>;
      };
      for (const d of json.documents || []) {
        const f = d.fields;
        if (f?.isPublished?.booleanValue !== true) continue;
        const slug = readFirestoreStringField(f, 'slug');
        const title = readFirestoreStringField(f, 'title');
        if (!slug || !title) continue;
        pages.push({
          slug: slug.slice(0, 100),
          title: title.slice(0, 160),
          subtitle: readFirestoreStringField(f, 'subtitle').slice(0, 240),
          pageType: readFirestoreStringField(f, 'pageType') || 'custom',
        });
      }
    }

    const plans: PublicCatalogSummary['plans'] = [];
    if (plansRes.status === 'fulfilled' && plansRes.value.ok) {
      const json = (await plansRes.value.json()) as {
        documents?: Array<{
          fields?: Record<
            string,
            { stringValue?: string; integerValue?: string; doubleValue?: number } | undefined
          >;
        }>;
      };
      const rawPlans = (json.documents || []).map((d) => {
        const f = d.fields;
        const readNum = (k: string): number => {
          const entry = f?.[k];
          if (!entry) return 0;
          if (typeof entry.doubleValue === 'number') return entry.doubleValue;
          if (typeof entry.integerValue === 'string') return Number(entry.integerValue) || 0;
          return 0;
        };
        return {
          name: readFirestoreStringField(f as Record<string, { stringValue?: string }>, 'name').slice(0, 80),
          tagline: readFirestoreStringField(f as Record<string, { stringValue?: string }>, 'tagline').slice(0, 200),
          monthlyPrice: readNum('monthlyPrice'),
          yearlyMonthlyPrice: readNum('yearlyMonthlyPrice'),
          sortOrder: readNum('sortOrder'),
        };
      });
      rawPlans.sort((a, b) => a.sortOrder - b.sortOrder);
      for (const p of rawPlans) {
        if (p.name) {
          plans.push({
            name: p.name,
            tagline: p.tagline,
            monthlyPrice: p.monthlyPrice,
            yearlyMonthlyPrice: p.yearlyMonthlyPrice,
          });
        }
      }
    }

    const catalog = { pages, plans };
    publicCatalogCache = { data: catalog, expiresAt: now + 15000 };
    return catalog;
  } catch {
    return publicCatalogCache?.data || { pages: [], plans: [] };
  }
}

function escapeHtmlAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function injectSiteMetaIntoHtml(
  html: string,
  settings: ServerSiteSettings,
  requestOrigin: string
): string {
  const safeTitle = escapeHtmlAttr(settings.metaTitle || settings.siteName || 'ClipIndex');
  const safeDesc = escapeHtmlAttr(settings.metaDescription);
  const safeSiteName = escapeHtmlAttr(settings.siteName || 'ClipIndex');

  let updated = html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`)
    .replace(
      /<meta\s+name=["']description["'][\s\S]*?\/?>/i,
      `<meta name="description" content="${safeDesc}" />`
    )
    .replace(
      /<meta\s+property=["']og:title["'][\s\S]*?\/?>/i,
      `<meta property="og:title" content="${safeTitle}" />`
    )
    .replace(
      /<meta\s+property=["']og:description["'][\s\S]*?\/?>/i,
      `<meta property="og:description" content="${safeDesc}" />`
    )
    .replace(
      /<meta\s+name=["']apple-mobile-web-app-title["'][\s\S]*?\/?>/i,
      `<meta name="apple-mobile-web-app-title" content="${safeSiteName}" />`
    );

  const extraTags: string[] = [`<meta property="og:site_name" content="${safeSiteName}" />`];

  const injectLinkTag = (rel: string, href: string) => {
    const tag = `<link rel="${rel}" href="${escapeHtmlAttr(href)}" />`;
    const pattern = new RegExp(`<link\\s+rel=["']${rel}["'][^>]*>`, 'i');
    if (pattern.test(updated)) {
      updated = updated.replace(pattern, tag);
    } else {
      extraTags.push(tag);
    }
  };

  if (settings.googleSiteVerification) {
    extraTags.push(
      `<meta name="google-site-verification" content="${escapeHtmlAttr(
        settings.googleSiteVerification
      )}" />`
    );
  }
  const resolvedOgImage = resolveServerImageRef(settings.ogImageUrl, requestOrigin);
  if (resolvedOgImage) {
    const safeOgImg = escapeHtmlAttr(resolvedOgImage);
    extraTags.push(`<meta property="og:image" content="${safeOgImg}" />`);
    extraTags.push(`<meta name="twitter:image" content="${safeOgImg}" />`);
  }
  const canonicalBase = settings.canonicalUrl || sanitizeServerHttpUrl(requestOrigin);
  if (canonicalBase) {
    extraTags.push(`<link rel="canonical" href="${escapeHtmlAttr(canonicalBase)}" />`);
  }

  const resolvedFavicon = resolveServerImageRef(settings.faviconUrl, requestOrigin);
  const resolvedAppleTouch =
    resolveServerImageRef(settings.appleTouchIconUrl, requestOrigin) || resolvedFavicon;
  if (resolvedFavicon) {
    injectLinkTag('icon', resolvedFavicon);
  }
  if (resolvedAppleTouch) {
    injectLinkTag('apple-touch-icon', resolvedAppleTouch);
  }
  injectLinkTag('manifest', '/manifest.webmanifest');

  const ldJson = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: settings.siteName || 'ClipIndex',
    description: settings.metaDescription,
    url: canonicalBase || undefined,
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Any',
  }).replace(/</g, '\\u003c');

  if (/<script[^>]+id=["']clipindex-jsonld["'][^>]*>[\s\S]*?<\/script>/i.test(updated)) {
    updated = updated.replace(
      /<script[^>]+id=["']clipindex-jsonld["'][^>]*>[\s\S]*?<\/script>/i,
      `<script id="clipindex-jsonld" type="application/ld+json">${ldJson}</script>`
    );
  } else {
    extraTags.push(`<script id="clipindex-jsonld" type="application/ld+json">${ldJson}</script>`);
  }

  return updated.replace('</head>', `    ${extraTags.join('\n    ')}\n  </head>`);
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 16000,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractCanonicalUrl(rawInput: string): string {
  const trimmed = (rawInput || '').trim();
  const urlMatch = trimmed.match(/https?:\/\/[^\s<>"'`]+/i);
  if (urlMatch) {
    return urlMatch[0].replace(/[),.;!?]+$/, '');
  }
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function detectPlatform(url: string): VideoPlatform {
  const lower = url.toLowerCase();
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  if (lower.includes('tiktok.com')) return 'tiktok';
  if (lower.includes('instagram.com') || lower.includes('instagr.am')) return 'instagram';
  if (lower.includes('facebook.com') || lower.includes('fb.watch') || lower.includes('fb.com')) return 'facebook';
  if (lower.includes('vimeo.com')) return 'vimeo';
  if (lower.includes('x.com/i/grok')) return 'llm';
  if (lower.includes('twitter.com') || lower.includes('x.com')) return 'x';
  if (lower.includes('chatgpt.com') || lower.includes('chat.openai.com')) return 'chatgpt';
  if (lower.includes('gemini.google.com') || lower.includes('g.co/gemini') || lower.includes('bard.google.com')) return 'gemini';
  if (lower.includes('claude.ai')) return 'claude';
  if (
    lower.includes('perplexity.ai') ||
    lower.includes('grok.com') ||
    lower.includes('poe.com') ||
    lower.includes('copilot.microsoft.com') ||
    lower.includes('chat.deepseek.com')
  ) {
    return 'llm';
  }
  return 'web';
}

function classifyUrlItemType(
  url: string,
  platform: VideoPlatform,
  modeHint?: string
): InboxItemType {
  if (modeHint === 'ai-chat') return 'ai-chat';
  if (modeHint === 'document') return 'document';
  if (modeHint === 'link') return 'link';
  if (modeHint === 'video') return 'video';
  if (platform === 'chatgpt' || platform === 'gemini' || platform === 'claude' || platform === 'llm') {
    return 'ai-chat';
  }
  if (platform === 'document' || platform === 'pdf') {
    return 'document';
  }
  if (platform === 'youtube' || platform === 'tiktok' || platform === 'vimeo') {
    return 'video';
  }
  if (platform === 'instagram' || platform === 'facebook' || platform === 'x') {
    const lower = url.toLowerCase();
    if (
      lower.includes('/reel') ||
      lower.includes('/watch') ||
      lower.includes('/video') ||
      lower.includes('/tv/') ||
      lower.includes('fb.watch') ||
      lower.includes('/status/')
    ) {
      return 'video';
    }
    return 'video';
  }
  return 'link';
}

const NOISY_LINK_HOSTS = [
  'www.w3.org',
  'schema.org',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'i.ytimg.com',
  'yt3.ggpht.com',
  'static.xx.fbcdn.net',
];

function extractUrlsFromText(text: string, excludeUrl = ''): string[] {
  if (!text) return [];
  const matches = text.match(/https?:\/\/[^\s<>"'`)\]]+/gi) || [];
  const seen = new Set<string>();
  const normalizedExclude = excludeUrl.trim().toLowerCase();
  const out: string[] = [];

  for (const raw of matches) {
    const cleaned = raw.replace(/[.,;:!?]+$/, '');
    try {
      const parsed = new URL(cleaned);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
      if (NOISY_LINK_HOSTS.includes(parsed.hostname.toLowerCase())) continue;
      if (/\.(js|css|woff2?|png|jpe?g|gif|webp|svg|ico)(\?|$)/i.test(parsed.pathname)) continue;
      const key = parsed.toString().toLowerCase();
      if (key === normalizedExclude || seen.has(key)) continue;
      seen.add(key);
      out.push(parsed.toString().slice(0, 1000));
      if (out.length >= 25) break;
    } catch {
      // Ignore malformed URLs
    }
  }
  return out;
}

function extractReadableTextFromHtml(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ');
  const textOnly = decodeHtmlEntities(withoutScripts.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
  return textOnly.slice(0, 6000);
}

function extractAnchorLinksFromHtml(html: string, baseUrl: string): ExtractedLink[] {
  const results: ExtractedLink[] = [];
  const seen = new Set<string>();
  let baseOrigin = '';
  try {
    baseOrigin = new URL(baseUrl).origin;
  } catch {
    baseOrigin = '';
  }

  const anchorRegex = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRegex.exec(html)) !== null) {
    const rawHref = decodeHtmlEntities(m[1]).trim();
    if (!rawHref || /^(javascript|mailto|tel|data):/i.test(rawHref)) continue;
    let resolved = '';
    try {
      resolved = new URL(rawHref, baseUrl).toString();
    } catch {
      continue;
    }
    if (!/^https?:\/\//i.test(resolved)) continue;
    const key = resolved.toLowerCase();
    if (seen.has(key) || key === baseUrl.toLowerCase()) continue;
    const label = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 120);
    if (!label && resolved.startsWith(baseOrigin)) continue;
    seen.add(key);
    results.push({
      url: resolved.slice(0, 1000),
      label: label || new URL(resolved).hostname,
      kind: 'resource',
    });
    if (results.length >= 20) break;
  }
  return results;
}

function extractYouTubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.split('/').filter(Boolean)[0] || null;
    }
    if (parsed.pathname.includes('/shorts/')) {
      return parsed.pathname.split('/shorts/')[1]?.split('/')[0] || null;
    }
    if (parsed.pathname.includes('/embed/')) {
      return parsed.pathname.split('/embed/')[1]?.split('/')[0] || null;
    }
    if (parsed.pathname.includes('/live/')) {
      return parsed.pathname.split('/live/')[1]?.split('/')[0] || null;
    }
    return parsed.searchParams.get('v');
  } catch {
    return null;
  }
}

function formatSeconds(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const rem = safe % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

function parseTimestampToSeconds(ts: string): number {
  const parts = ts
    .trim()
    .split(':')
    .map((p) => Number(p))
    .filter((n) => !Number.isNaN(n));
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return 0;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

interface FetchedMetadata {
  title: string;
  creator: string;
  thumbnailUrl: string;
  description: string;
  captionsText: string;
  pageText: string;
  extractedLinks: ExtractedLink[];
  durationSeconds: number;
  metadataSource: string;
}

async function fetchWithTimeout(
  url: string,
  timeoutMs = 5000,
  accept = 'text/html,application/json,application/xhtml+xml'
): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: accept,
      },
      redirect: 'follow',
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPlatformMetadata(url: string, platform: VideoPlatform): Promise<FetchedMetadata> {
  const result: FetchedMetadata = {
    title: '',
    creator: '',
    thumbnailUrl: '',
    description: '',
    captionsText: '',
    pageText: '',
    extractedLinks: [],
    durationSeconds: 0,
    metadataSource: 'url-grounding',
  };

  if (!isSafePublicHttpUrl(url)) {
    return result;
  }

  try {
    if (platform === 'youtube') {
      const ytId = extractYouTubeId(url);
      if (ytId) {
        result.thumbnailUrl = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
      }

      const [oembedOutcome, pageOutcome] = await Promise.allSettled([
        fetchWithTimeout(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
          3500
        ),
        fetchWithTimeout(url, 4000),
      ]);

      if (oembedOutcome.status === 'fulfilled' && oembedOutcome.value.ok) {
        try {
          const data = (await oembedOutcome.value.json()) as {
            title?: string;
            author_name?: string;
            thumbnail_url?: string;
          };
          result.title = data.title || result.title;
          result.creator = data.author_name || result.creator;
          result.thumbnailUrl = data.thumbnail_url || result.thumbnailUrl;
          result.metadataSource = 'youtube-oembed';
        } catch {
          // Ignore malformed oEmbed JSON
        }
      }

      if (pageOutcome.status === 'fulfilled' && pageOutcome.value.ok) {
        try {
          const html = await pageOutcome.value.text();
          const descMatch = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
          if (descMatch?.[1]) {
            result.description = JSON.parse(`"${descMatch[1]}"`) as string;
          }
          const lenMatch = html.match(/"lengthSeconds":"(\d+)"/);
          if (lenMatch?.[1]) {
            result.durationSeconds = Number(lenMatch[1]) || 0;
          }
          const captionMatch = html.match(/"captionTracks":\[\{"baseUrl":"(https:[^"]+)"/);
          if (captionMatch?.[1]) {
            const captionUrl = captionMatch[1].replace(/\\u0026/g, '&');
            const capRes = await fetchWithTimeout(captionUrl, 3500);
            if (capRes.ok) {
              const xml = await capRes.text();
              const lines: string[] = [];
              const textRegex = /<text start="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g;
              let m: RegExpExecArray | null;
              while ((m = textRegex.exec(xml)) !== null) {
                const startSec = Number(m[1]) || 0;
                const cleanText = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
                if (cleanText) {
                  lines.push(`[${formatSeconds(startSec)}] ${cleanText}`);
                }
                if (lines.length >= 250) break;
              }
              if (lines.length > 0) {
                result.captionsText = lines.join('\n');
                result.metadataSource = 'youtube-captions';
              }
            }
          }
        } catch {
          // Ignore watch-page parse failures; oEmbed and Gemini grounding continue
        }
      }
      return result;
    }

    if (platform === 'tiktok') {
      try {
        const oembedRes = await fetchWithTimeout(
          `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
          4500
        );
        if (oembedRes.ok) {
          const data = (await oembedRes.json()) as {
            title?: string;
            author_name?: string;
            thumbnail_url?: string;
          };
          result.title = data.title || '';
          result.creator = data.author_name || '';
          result.thumbnailUrl = data.thumbnail_url || '';
          result.metadataSource = 'tiktok-oembed';
          return result;
        }
      } catch {
        // Continue to OpenGraph fallback
      }
    }

    if (platform === 'vimeo') {
      try {
        const oembedRes = await fetchWithTimeout(
          `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`,
          4500
        );
        if (oembedRes.ok) {
          const data = (await oembedRes.json()) as {
            title?: string;
            author_name?: string;
            thumbnail_url?: string;
            description?: string;
            duration?: number;
          };
          result.title = data.title || '';
          result.creator = data.author_name || '';
          result.thumbnailUrl = data.thumbnail_url || '';
          result.description = data.description || '';
          result.durationSeconds = data.duration || 0;
          result.metadataSource = 'vimeo-oembed';
          return result;
        }
      } catch {
        // Continue to OpenGraph fallback
      }
    }

    // OpenGraph + readable text + link fallback for Web links, Instagram, Facebook, X
    const pageRes = await fetchWithTimeout(url, 4500);
    if (pageRes.ok) {
      const html = await pageRes.text();
      const ogTitle =
        html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
        html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ||
        '';
      const ogDesc =
        html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
        html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
        '';
      const ogImage =
        html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] || '';
      const ogSite =
        html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)?.[1] || '';

      if (ogTitle) {
        result.title = decodeHtmlEntities(ogTitle).trim();
        result.metadataSource = 'opengraph-meta';
      }
      if (ogSite) result.creator = decodeHtmlEntities(ogSite).trim();
      if (ogDesc) result.description = decodeHtmlEntities(ogDesc).trim();
      if (ogImage) result.thumbnailUrl = decodeHtmlEntities(ogImage).trim();

      result.pageText = extractReadableTextFromHtml(html);
      result.extractedLinks = extractAnchorLinksFromHtml(html, url);
    }
  } catch {
    // Non-fatal; Gemini URL context + search grounding handles metadata discovery
  }

  return result;
}

const analysisResponseSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: 'Clear, descriptive title for the video, screenshot, or web/product link.' },
    creator: { type: Type.STRING, description: 'Creator, channel, brand, or website name.' },
    durationLabel: { type: Type.STRING, description: 'Duration like 03:45 for videos, or type label like Screenshot / Product Page.' },
    category: { type: Type.STRING, description: 'Primary topic category (1-3 words, e.g. Software, Shopping, Marketing, Design).' },
    summary: { type: Type.STRING, description: 'Concise 2-4 sentence executive summary.' },
    tldrBullets: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '3 to 6 crisp, actionable takeaway bullet points.',
    },
    tags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '5 to 10 lowercase searchable topic tags without # prefix.',
    },
    segments: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          timestamp: { type: Type.STRING, description: 'Timestamp formatted MM:SS or section marker like 00:00.' },
          seconds: { type: Type.INTEGER, description: 'Numeric offset in seconds (or sequential index for screenshots/pages).' },
          title: { type: Type.STRING, description: 'Short chapter/section heading.' },
          summary: { type: Type.STRING, description: '1-2 sentence explanation of this segment or page section.' },
          keyQuote: { type: Type.STRING, description: 'Notable quote, price, or key phrase from this section, if any.' },
        },
        required: ['timestamp', 'seconds', 'title', 'summary'],
      },
      description: '3 to 12 chronological key segments or visual/page sections.',
    },
    transcript: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          timestamp: { type: Type.STRING, description: 'Timestamp formatted MM:SS.' },
          seconds: { type: Type.INTEGER, description: 'Numeric offset in seconds.' },
          speaker: { type: Type.STRING, description: 'Speaker, OCR Region, or Section name.' },
          text: { type: Type.STRING, description: 'Spoken transcript line, OCR extracted text, or key factual details.' },
        },
        required: ['timestamp', 'seconds', 'text'],
      },
      description: 'Chronological timestamped transcript, screenshot OCR text lines, or webpage facts.',
    },
    links: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          url: { type: Type.STRING, description: 'Full valid https:// or http:// URL mentioned, shown on screen, or found in description.' },
          label: { type: Type.STRING, description: 'Short human-readable name of the product, service, tool, or resource.' },
          kind: { type: Type.STRING, description: 'One of: product, service, resource, social, other.' },
          context: { type: Type.STRING, description: 'Brief context on why this link was mentioned or what it offers.' },
        },
        required: ['url', 'label'],
      },
      description: 'Any URLs, product links, service websites, or resources retrieved from the video/screenshot/page.',
    },
  },
  required: ['title', 'creator', 'durationLabel', 'category', 'summary', 'tldrBullets', 'tags', 'segments', 'transcript'],
};

function mergeExtractedLinks(
  aiLinks: unknown,
  fallbackUrls: ExtractedLink[]
): ExtractedLink[] {
  const seen = new Set<string>();
  const merged: ExtractedLink[] = [];

  const pushLink = (candidate: { url?: unknown; label?: unknown; kind?: unknown; context?: unknown }) => {
    if (typeof candidate.url !== 'string') return;
    let trimmed = candidate.url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) {
        trimmed = `https://${trimmed}`;
      } else {
        return;
      }
    }
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
      if (NOISY_LINK_HOSTS.includes(parsed.hostname.toLowerCase())) return;
      const key = parsed.toString().toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      const rawKind = String(candidate.kind || '').toLowerCase();
      const kind: ExtractedLink['kind'] =
        rawKind === 'product' || rawKind === 'service' || rawKind === 'resource' || rawKind === 'social'
          ? rawKind
          : 'other';
      merged.push({
        url: parsed.toString().slice(0, 1000),
        label: String(candidate.label || parsed.hostname).trim().slice(0, 140),
        kind,
        ...(candidate.context ? { context: String(candidate.context).trim().slice(0, 260) } : {}),
      });
    } catch {
      // Ignore invalid URL
    }
  };

  if (Array.isArray(aiLinks)) {
    for (const item of aiLinks) {
      if (item && typeof item === 'object') {
        pushLink(item as Record<string, unknown>);
      }
      if (merged.length >= 30) break;
    }
  }

  for (const fb of fallbackUrls) {
    if (merged.length >= 30) break;
    pushLink(fb);
  }

  return merged;
}

function normalizeAnalysisPayload(
  raw: Record<string, unknown>,
  fallbackTitle: string,
  fallbackCreator: string,
  fallbackDuration: string,
  fallbackLinks: ExtractedLink[] = []
): Omit<AnalyzeVideoResponse, 'url' | 'platform' | 'thumbnailUrl' | 'metadataSource' | 'itemType'> {
  const rawSegments = Array.isArray(raw.segments) ? raw.segments : [];
  const segments: VideoSegment[] = rawSegments
    .slice(0, 60)
    .map((s) => {
      const obj = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
      const rawTs = typeof obj.timestamp === 'string' && obj.timestamp.trim() ? obj.timestamp.trim() : '00:00';
      const seconds =
        typeof obj.seconds === 'number' && Number.isFinite(obj.seconds)
          ? Math.max(0, Math.floor(obj.seconds))
          : parseTimestampToSeconds(rawTs);
      return {
        timestamp: formatSeconds(seconds),
        seconds,
        title: String(obj.title || 'Key Moment').slice(0, 140),
        summary: String(obj.summary || '').slice(0, 600),
        ...(obj.keyQuote ? { keyQuote: String(obj.keyQuote).slice(0, 280) } : {}),
      };
    })
    .sort((a, b) => a.seconds - b.seconds);

  const rawTranscript = Array.isArray(raw.transcript) ? raw.transcript : [];
  const transcript: TranscriptEntry[] = rawTranscript
    .slice(0, 200)
    .map((t) => {
      const obj = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
      const rawTs = typeof obj.timestamp === 'string' && obj.timestamp.trim() ? obj.timestamp.trim() : '00:00';
      const seconds =
        typeof obj.seconds === 'number' && Number.isFinite(obj.seconds)
          ? Math.max(0, Math.floor(obj.seconds))
          : parseTimestampToSeconds(rawTs);
      return {
        timestamp: formatSeconds(seconds),
        seconds,
        speaker: obj.speaker ? String(obj.speaker).slice(0, 60) : 'Speaker',
        text: String(obj.text || '').slice(0, 800),
      };
    })
    .filter((entry) => entry.text.length > 0)
    .sort((a, b) => a.seconds - b.seconds);

  const tldrBullets = (Array.isArray(raw.tldrBullets) ? raw.tldrBullets : [])
    .map((b) => String(b).trim())
    .filter(Boolean)
    .slice(0, 10);

  const tags = Array.from(
    new Set(
      (Array.isArray(raw.tags) ? raw.tags : [])
        .map((t) => String(t).trim().toLowerCase().replace(/^#/, ''))
        .filter((t) => t.length > 0 && t.length <= 40)
    )
  ).slice(0, 15);

  const links = mergeExtractedLinks(raw.links, fallbackLinks);

  return {
    title: String(raw.title || fallbackTitle || 'Untitled Item').slice(0, 300),
    creator: String(raw.creator || fallbackCreator || 'Creator').slice(0, 150),
    durationLabel: String(raw.durationLabel || fallbackDuration || '—').slice(0, 32),
    category: String(raw.category || 'General').slice(0, 80),
    summary: String(raw.summary || 'Summary generated from shared source.').slice(0, 5000),
    tldrBullets,
    tags,
    segments,
    transcript,
    links,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientGeminiError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('503') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('502') ||
    msg.includes('504') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('aborted') ||
    msg.includes('fetch failed') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout')
  );
}

let primaryCooldownUntil = 0;

async function generateWithRetryAndFallback<T>(
  runner: (model: string, isFallback: boolean) => Promise<T>
): Promise<T> {
  const now = Date.now();
  let lastError: unknown;

  if (now >= primaryCooldownUntil) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await runner(GEMINI_MODEL, false);
      } catch (err) {
        lastError = err;
        if (!isTransientGeminiError(err)) {
          throw err;
        }
        if (attempt === 0) {
          await sleep(400 + Math.floor(Math.random() * 200));
        }
      }
    }
    primaryCooldownUntil = Date.now() + 120_000;
    console.warn(`[Gemini] ${GEMINI_MODEL} returned transient 503/timeout; switching to ${GEMINI_FALLBACK_MODEL} for 120s.`);
  }

  try {
    return await runner(GEMINI_FALLBACK_MODEL, true);
  } catch (fallbackErr) {
    if (isTransientGeminiError(fallbackErr)) {
      await sleep(500);
      return await runner(GEMINI_FALLBACK_MODEL, true);
    }
    throw fallbackErr || lastError;
  }
}

function formatGeminiError(err: unknown): { status: number; message: string } {
  const rawMsg = err instanceof Error ? err.message : String(err);
  let msg = rawMsg;

  try {
    const jsonStart = rawMsg.indexOf('{');
    if (jsonStart >= 0) {
      const parsed = JSON.parse(rawMsg.slice(jsonStart)) as {
        error?: { message?: string; status?: string; code?: number };
      };
      if (parsed?.error?.message) {
        msg = parsed.error.message;
      }
    }
  } catch {
    // Keep rawMsg if not JSON
  }

  const lower = `${rawMsg} ${msg}`.toLowerCase();
  if (rawMsg.includes('503') || rawMsg.includes('UNAVAILABLE') || lower.includes('high demand') || lower.includes('overloaded')) {
    return {
      status: 503,
      message:
        'ZOTOMIC AI is temporarily experiencing high demand. Please wait a few seconds and try again.',
    };
  }
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('aborted')) {
    return {
      status: 504,
      message:
        'ZOTOMIC AI took too long to respond while inspecting this item. Please try again in a few seconds.',
    };
  }
  if (rawMsg.includes('403') || rawMsg.includes('PERMISSION_DENIED')) {
    return {
      status: 403,
      message: 'Gemini API permission denied. Please verify your API key in Settings > Secrets.',
    };
  }
  if (rawMsg.includes('429') || rawMsg.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message: 'Gemini API rate or quota limit reached. Please retry shortly or check your quota in Settings > Secrets.',
    };
  }
  if (rawMsg.includes('API_KEY_INVALID') || rawMsg.includes('GEMINI_API_KEY')) {
    return {
      status: 400,
      message: 'Gemini API key is missing or invalid. Please check Settings > Secrets.',
    };
  }
  return { status: 500, message: msg || 'Failed to analyze video.' };
}

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

const ALLOWED_MEDIA_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/mp4',
  'audio/webm',
  'audio/ogg',
]);

const ALLOWED_DOCUMENT_MIME_TYPES = new Set(['application/pdf']);

function normalizeAndValidateMimeType(rawMime: string | undefined): string | null {
  const clean = (rawMime || '').split(';')[0].trim().toLowerCase();
  const normalized = clean === 'image/jpg' ? 'image/jpeg' : clean;
  if (
    ALLOWED_IMAGE_MIME_TYPES.has(normalized) ||
    ALLOWED_MEDIA_MIME_TYPES.has(normalized) ||
    ALLOWED_DOCUMENT_MIME_TYPES.has(normalized)
  ) {
    return normalized;
  }
  return null;
}

function hasValidPdfMagicBytes(base64Data: string): boolean {
  try {
    const header = Buffer.from(base64Data.slice(0, 16), 'base64');
    return header.length >= 4 && header.subarray(0, 4).toString('ascii') === '%PDF';
  } catch {
    return false;
  }
}

function formatChatExportTextIfJson(rawContent: string): string {
  const trimmed = rawContent.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return rawContent;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    // Handle ChatGPT conversations.json array or single conversation object
    const conv = Array.isArray(parsed) ? parsed[0] : parsed;
    if (conv && typeof conv === 'object' && 'mapping' in conv && conv.mapping && typeof conv.mapping === 'object') {
      const mapping = conv.mapping as Record<
        string,
        { message?: { author?: { role?: string }; content?: { parts?: unknown[] }; create_time?: number } }
      >;
      const turns: Array<{ role: string; text: string; ts: number }> = [];
      for (const node of Object.values(mapping)) {
        const msg = node?.message;
        const role = msg?.author?.role;
        if (!role || (role !== 'user' && role !== 'assistant')) continue;
        const parts = Array.isArray(msg?.content?.parts) ? msg!.content!.parts : [];
        const text = parts
          .filter((p) => typeof p === 'string')
          .join('\n')
          .trim();
        if (text) {
          turns.push({ role: role === 'user' ? 'User' : 'Assistant', text, ts: msg?.create_time || 0 });
        }
      }
      if (turns.length > 0) {
        turns.sort((a, b) => a.ts - b.ts);
        const titleLine =
          'title' in conv && typeof (conv as { title?: unknown }).title === 'string'
            ? `Title: ${(conv as { title: string }).title}\n\n`
            : '';
        return (
          titleLine +
          turns.map((t, i) => `[Turn ${i + 1}] ${t.role}:\n${t.text}`).join('\n\n')
        );
      }
    }
    // Handle generic array of {role/sender, content/text/message}
    const msgs = Array.isArray(parsed)
      ? parsed
      : conv && typeof conv === 'object' && 'messages' in conv && Array.isArray((conv as { messages?: unknown[] }).messages)
        ? (conv as { messages: unknown[] }).messages
        : conv && typeof conv === 'object' && 'chat_messages' in conv && Array.isArray((conv as { chat_messages?: unknown[] }).chat_messages)
          ? (conv as { chat_messages: unknown[] }).chat_messages
          : null;
    if (msgs && msgs.length > 0) {
      const formatted = msgs
        .map((m, idx) => {
          if (!m || typeof m !== 'object') return '';
          const rec = m as Record<string, unknown>;
          const role = String(rec.role || rec.sender || rec.author || `Turn ${idx + 1}`);
          const text = String(rec.text || rec.content || rec.message || '').trim();
          return text ? `${role}:\n${text}` : '';
        })
        .filter(Boolean)
        .join('\n\n');
      if (formatted) return formatted;
    }
  } catch {
    // Not structured JSON; return original text
  }
  return rawContent;
}

function detectLlmProviderFromText(text: string, hintedProvider?: string): VideoPlatform {
  const hint = (hintedProvider || '').toLowerCase();
  if (hint === 'chatgpt' || hint === 'openai') return 'chatgpt';
  if (hint === 'gemini' || hint === 'google') return 'gemini';
  if (hint === 'claude' || hint === 'anthropic') return 'claude';
  const sample = text.slice(0, 2000).toLowerCase();
  if (sample.includes('chatgpt') || sample.includes('gpt-4') || sample.includes('openai')) return 'chatgpt';
  if (sample.includes('gemini') || sample.includes('google ai')) return 'gemini';
  if (sample.includes('claude') || sample.includes('anthropic')) return 'claude';
  return 'llm';
}

function hasValidImageMagicBytes(base64Data: string, mimeType: string): boolean {
  try {
    const header = Buffer.from(base64Data.slice(0, 32), 'base64');
    if (header.length < 4) return false;
    if (mimeType === 'image/png') {
      return header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47;
    }
    if (mimeType === 'image/jpeg') {
      return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    }
    if (mimeType === 'image/gif') {
      return header.subarray(0, 3).toString('ascii') === 'GIF';
    }
    if (mimeType === 'image/webp') {
      return (
        header.length >= 12 &&
        header.subarray(0, 4).toString('ascii') === 'RIFF' &&
        header.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    }
    return false;
  } catch {
    return false;
  }
}

function resolveAllowedOrigins(): string[] {
  const envOrigins = [process.env.CORS_ORIGIN || '', process.env.APP_URL || '']
    .join(',')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const vercelHost = (process.env.VERCEL_URL || '').trim();
  const vercelProdHost = (process.env.VERCEL_PROJECT_PRODUCTION_URL || '').trim();
  if (vercelHost) envOrigins.push(`https://${vercelHost.replace(/^https?:\/\//i, '').replace(/\/+$/, '')}`);
  if (vercelProdHost) envOrigins.push(`https://${vercelProdHost.replace(/^https?:\/\//i, '').replace(/\/+$/, '')}`);

  return Array.from(new Set(envOrigins));
}

export function createApiApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '45mb' }));

  // Baseline HTTP security headers (iframe-compatible for AI Studio preview & mobile web)
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), display-capture=(self), clipboard-read=(self)'
    );
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader('X-DNS-Prefetch-Control', 'on');
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // Strict CORS allowlist (exact configured origins + Vercel project hostnames; no wildcard *.vercel.app)
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestOrigin = req.headers.origin;
    if (requestOrigin) {
      const allowedOrigins = resolveAllowedOrigins();
      const normalizedOrigin = requestOrigin.replace(/\/+$/, '');
      const isDevLocal =
        process.env.NODE_ENV !== 'production' &&
        (normalizedOrigin === 'http://localhost:3000' || normalizedOrigin === 'http://localhost:5173');
      const isAllowed =
        allowedOrigins.includes(normalizedOrigin) || isDevLocal;

      if (isAllowed) {
        res.setHeader('Access-Control-Allow-Origin', requestOrigin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      }
    }

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // General API IP flood guard
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (!guardGeneralApiRateLimit(req, res, 120)) return;
    next();
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()),
      model: GEMINI_MODEL,
    });
  });

  // Public admin-uploaded brand/homepage images stored as data URLs in Firestore.
  app.get('/api/site-media/:id', async (req: Request, res: Response) => {
    const id = String(req.params.id || '')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 128);
    if (!id) {
      res.status(404).end();
      return;
    }
    const media = await readSiteMediaData(id);
    if (!media) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', media.mime);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).send(Buffer.from(media.base64, 'base64'));
  });

  // Dynamic browser/app icons so admin-managed branding applies even when the
  // static Vite HTML is served directly (for example on Vercel).
  type BrandIconSlot = 'favicon' | 'apple' | 'icon192' | 'icon512' | 'maskable';

  const resolveBrandIcon = async (req: Request, slot: BrandIconSlot) => {
    const settings = await getPublicSiteSettings();
    const fallbackOrigin = `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
    const origin = (settings.canonicalUrl || fallbackOrigin).replace(/\/+$/, '');
    const favicon = resolveServerImageRef(settings.faviconUrl, origin);
    const appleTouch = resolveServerImageRef(settings.appleTouchIconUrl, origin);
    const icon192 = resolveServerImageRef(settings.pwaIcon192Url, origin);
    const icon512 = resolveServerImageRef(settings.pwaIcon512Url, origin);
    const maskable = resolveServerImageRef(settings.pwaMaskableIconUrl, origin);
    switch (slot) {
      case 'apple':
        return appleTouch || favicon || '/apple-touch-icon.png';
      case 'icon192':
        return icon192 || favicon || '/pwa-192x192.png';
      case 'icon512':
        return icon512 || favicon || '/pwa-512x512.png';
      case 'maskable':
        return maskable || icon512 || favicon || '/pwa-maskable-512x512.png';
      default:
        return favicon || '/icon.svg';
    }
  };

  // Reads the icon bytes so the response is same-origin. That keeps installed
  // app icons working even if the remote (for example Cloudinary) URL blocks
  // cross-origin fetches or the referenced media is stored in Firestore.
  const loadBrandIconBytes = async (
    src: string
  ): Promise<{ buffer: Buffer; mime: string } | null> => {
    if (!src) return null;
    const mediaMatch = /\/api\/site-media\/([A-Za-z0-9_-]+)/.exec(src);
    if (mediaMatch) {
      const media = await readSiteMediaData(mediaMatch[1]);
      if (!media) return null;
      return {
        buffer: Buffer.from(media.base64, 'base64'),
        mime: media.mime,
      };
    }
    if (!/^https?:/i.test(src)) return null;
    try {
      const upstream = await fetchWithTimeout(
        src,
        6000,
        'image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5'
      );
      if (!upstream.ok) return null;
      const mime = (upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!mime.startsWith('image/')) return null;
      const buffer = Buffer.from(await upstream.arrayBuffer());
      if (buffer.length === 0 || buffer.length > 3 * 1024 * 1024) return null;
      return { buffer, mime };
    } catch {
      return null;
    }
  };

  const sendBrandIcon = async (req: Request, res: Response, slot: BrandIconSlot) => {
    const target = await resolveBrandIcon(req, slot);
    const bytes = await loadBrandIconBytes(target);
    if (bytes) {
      res.setHeader('Content-Type', bytes.mime);
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.status(200).send(bytes.buffer);
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.redirect(302, target);
  };

  app.get('/api/brand/favicon', async (req: Request, res: Response) => {
    await sendBrandIcon(req, res, 'favicon');
  });

  app.get('/api/brand/apple-touch-icon', async (req: Request, res: Response) => {
    await sendBrandIcon(req, res, 'apple');
  });

  app.get('/api/brand/icon-192', async (req: Request, res: Response) => {
    await sendBrandIcon(req, res, 'icon192');
  });

  app.get('/api/brand/icon-512', async (req: Request, res: Response) => {
    await sendBrandIcon(req, res, 'icon512');
  });

  app.get('/api/brand/icon-maskable', async (req: Request, res: Response) => {
    await sendBrandIcon(req, res, 'maskable');
  });

  // Fallback path some browsers request directly even when a <link> is present.
  app.get('/favicon.ico', async (req: Request, res: Response) => {
    await sendBrandIcon(req, res, 'favicon');
  });

  // Dynamic web app manifest so admin-managed PWA icons and brand name apply.
  app.get('/manifest.webmanifest', async (req: Request, res: Response) => {
    const settings = await getPublicSiteSettings();
    const fallbackOrigin = `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
    const origin = (settings.canonicalUrl || fallbackOrigin).replace(/\/+$/, '');
    const favicon = resolveServerImageRef(settings.faviconUrl, origin);
    const icon192 = resolveServerImageRef(settings.pwaIcon192Url, origin);
    const icon512 = resolveServerImageRef(settings.pwaIcon512Url, origin);
    const maskable = resolveServerImageRef(settings.pwaMaskableIconUrl, origin);

    const icons: Array<{ src: string; sizes: string; type?: string; purpose: string }> = [];
    const iconType = (src: string): string | undefined => {
      if (!src) return undefined;
      const clean = src.split('?')[0].toLowerCase();
      if (clean.includes('/api/site-media/')) return undefined;
      if (clean.endsWith('.svg')) return 'image/svg+xml';
      if (clean.endsWith('.webp')) return 'image/webp';
      if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
      if (clean.endsWith('.gif')) return 'image/gif';
      if (clean.endsWith('.avif')) return 'image/avif';
      if (clean.endsWith('.ico')) return 'image/x-icon';
      return 'image/png';
    };
    const pushIcon = (
      src: string,
      sizes: string,
      purpose: string,
      typeSource: string = src
    ) => {
      if (!src) return;
      if (icons.some((icon) => icon.src === src && icon.sizes === sizes && icon.purpose === purpose)) {
        return;
      }
      const type = iconType(typeSource);
      icons.push({ src, sizes, purpose, ...(type ? { type } : {}) });
    };

    // Same-origin endpoints that stream the admin-managed icon bytes. Browser
    // icon discovery, install prompts, splash screens and notification icons
    // all read these instead of build-time files.
    pushIcon('/api/brand/icon-192', '192x192', 'any', icon192 || favicon || '/pwa-192x192.png');
    pushIcon('/api/brand/icon-512', '512x512', 'any', icon512 || icon192 || favicon || '/pwa-512x512.png');
    pushIcon(
      '/api/brand/icon-maskable',
      '512x512',
      'maskable',
      maskable || icon512 || icon192 || favicon || '/pwa-maskable-512x512.png'
    );

    const siteName = settings.siteName || 'ClipIndex';
    const manifest = {
      id: '/',
      name: `${siteName}${settings.metaTitle && !settings.metaTitle.startsWith(siteName) ? ` — ${settings.metaTitle}` : ''}`.slice(0, 120),
      short_name: siteName.slice(0, 12),
      description: settings.metaDescription,
      theme_color: '#0F172A',
      background_color: '#F8FAFC',
      display: 'standalone',
      start_url: '/',
      scope: '/',
      icons,
      share_target: {
        action: '/share-target',
        method: 'POST',
        enctype: 'multipart/form-data',
        params: {
          title: 'title',
          text: 'text',
          url: 'url',
          files: [{ name: 'media', accept: ['image/*'] }],
        },
      },
    };

    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.status(200).send(JSON.stringify(manifest));
  });

  app.get('/api/usage', async (req: Request, res: Response) => {
    const cfg = getFirebaseAppletConfig();
    const caller = await verifyCallerIdentity(req, cfg.projectId);
    res.json(getCallerUsageSnapshot(caller));
  });

  // Anti-bot / anti-AI signup verification endpoints
  app.get('/api/auth/challenge', (req: Request, res: Response) => {
    const result = issueHumanChallenge(req);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      challengeId: result.challengeId,
      prompt: result.prompt,
      token: result.token,
      minSubmitMs: result.minSubmitMs,
    });
  });

  app.post('/api/auth/verify-human', (req: Request, res: Response) => {
    const body = (req.body || {}) as {
      token?: string;
      answer?: string | number;
      honeypot?: string;
      elapsedMs?: number;
      webdriverFlag?: boolean;
    };
    const result = verifyHumanChallenge(req, body);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ verified: true, humanPassToken: result.humanPassToken });
  });

  app.post('/api/site-settings/invalidate', async (req: Request, res: Response) => {
    const cfg = getFirebaseAppletConfig();
    const caller = await verifyCallerIdentity(req, cfg.projectId);
    if (caller.tier !== 'admin') {
      res.status(403).json({ error: 'Administrator verification required.' });
      return;
    }
    siteSettingsCache = null;
    publicCatalogCache = null;
    res.json({ ok: true });
  });

  app.get(/^\/(google[a-zA-Z0-9]+\.html)$/, async (req: Request, res: Response, next) => {
    const requestedFile = req.path.replace(/^\/+/, '');
    const settings = await getPublicSiteSettings();
    if (settings.googleHtmlFileName && settings.googleHtmlFileName === requestedFile) {
      const content =
        settings.googleHtmlFileContent.trim() ||
        `google-site-verification: ${settings.googleHtmlFileName}`;
      res.status(200).type('text/plain; charset=utf-8').send(content);
      return;
    }
    next();
  });

  app.get('/robots.txt', async (req: Request, res: Response) => {
    const settings = await getPublicSiteSettings();
    const fallbackOrigin = `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
    const baseUrl = (settings.canonicalUrl || process.env.APP_URL || fallbackOrigin).replace(/\/+$/, '');
    const body = [
      'User-agent: *',
      'Allow: /',
      'Allow: /llms.txt',
      'Allow: /.well-known/agent.json',
      'Allow: /sitemap.xml',
      'Disallow: /api/auth/',
      'Disallow: /admin',
      '',
      `Sitemap: ${baseUrl}/sitemap.xml`,
    ].join('\n');
    res.status(200).type('text/plain; charset=utf-8').send(body + '\n');
  });

  app.get('/sitemap.xml', async (req: Request, res: Response) => {
    const [settings, catalog] = await Promise.all([getPublicSiteSettings(), getPublicCatalogSummary()]);
    const fallbackOrigin = `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
    const baseUrl = (settings.canonicalUrl || process.env.APP_URL || fallbackOrigin).replace(/\/+$/, '');
    const urls = [
      { loc: `${baseUrl}/`, changefreq: 'daily', priority: '1.0' },
      { loc: `${baseUrl}/llms.txt`, changefreq: 'weekly', priority: '0.7' },
      ...catalog.pages.map((p) => ({
        loc: `${baseUrl}/?page=${encodeURIComponent(p.slug)}`,
        changefreq: 'weekly',
        priority: '0.6',
      })),
    ];
    const urlNodes = urls
      .map(
        (u) =>
          `  <url>\n    <loc>${escapeHtmlAttr(u.loc)}</loc>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
      )
      .join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlNodes}\n</urlset>\n`;
    res.status(200).type('application/xml; charset=utf-8').send(xml);
  });

  // Agentic Browsing & LLM Discovery Endpoints
  const serveLlmsTxt = async (req: Request, res: Response) => {
    const [settings, catalog] = await Promise.all([getPublicSiteSettings(), getPublicCatalogSummary()]);
    const fallbackOrigin = `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
    const baseUrl = (settings.canonicalUrl || process.env.APP_URL || fallbackOrigin).replace(/\/+$/, '');

    const lines = [
      `# ${settings.siteName}`,
      '',
      `> ${settings.metaDescription}`,
      '',
      '## Core Capabilities',
      '- Universal Share Inbox: Index videos (YouTube, TikTok, Instagram, Facebook, Vimeo), screenshots (vision OCR), and web/product links.',
      '- Structured Extraction: Produces timestamped segments, transcripts, retrieved outbound links, and searchable tags.',
      '- Intent & Privacy: Captures a "Why I saved this" note and stores uploaded binary media locally on the user device via IndexedDB.',
      '',
      '## Access & Account Creation Policy',
      '- Public documentation, pricing plans, and discovery metadata are openly crawlable for search and agentic browsing.',
      '- Account registration and authentication require verified human interaction (automated / AI account creation is blocked).',
      '',
      '## Public Endpoints',
      `- [Web App](${baseUrl}/)`,
      `- [Agent Discovery Manifest](${baseUrl}/.well-known/agent.json)`,
      `- [XML Sitemap](${baseUrl}/sitemap.xml)`,
    ];

    if (catalog.plans.length > 0) {
      lines.push('', '## Published Plans');
      for (const plan of catalog.plans) {
        lines.push(`- **${plan.name}** ($${plan.monthlyPrice}/mo): ${plan.tagline}`);
      }
    }

    if (catalog.pages.length > 0) {
      lines.push('', '## Information Pages');
      for (const page of catalog.pages) {
        lines.push(`- [${page.title}](${baseUrl}/?page=${encodeURIComponent(page.slug)}): ${page.subtitle || page.pageType}`);
      }
    }

    res.status(200).type('text/plain; charset=utf-8').send(lines.join('\n') + '\n');
  };

  app.get('/llms.txt', serveLlmsTxt);
  app.get('/.well-known/llms.txt', serveLlmsTxt);

  app.get('/.well-known/agent.json', async (req: Request, res: Response) => {
    const [settings, catalog] = await Promise.all([getPublicSiteSettings(), getPublicCatalogSummary()]);
    const fallbackOrigin = `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
    const baseUrl = (settings.canonicalUrl || process.env.APP_URL || fallbackOrigin).replace(/\/+$/, '');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({
      schemaVersion: '1.0',
      name: settings.siteName,
      title: settings.metaTitle,
      description: settings.metaDescription,
      url: baseUrl,
      capabilities: [
        'video-timestamp-indexing',
        'screenshot-ocr-extraction',
        'web-link-summarization',
        'outbound-link-retrieval',
        'local-device-media-storage',
      ],
      authPolicy: {
        automatedSignupAllowed: false,
        humanVerificationRequired: true,
        publicReadOnlyDiscovery: true,
      },
      discovery: {
        llmsTxt: `${baseUrl}/llms.txt`,
        sitemap: `${baseUrl}/sitemap.xml`,
        robotsTxt: `${baseUrl}/robots.txt`,
      },
      publicPages: catalog.pages.map((p) => ({
        slug: p.slug,
        title: p.title,
        subtitle: p.subtitle,
        url: `${baseUrl}/?page=${encodeURIComponent(p.slug)}`,
      })),
      plans: catalog.plans,
    });
  });

  app.post('/api/analyze-video', async (req: Request, res: Response) => {
    let releaseGuard: (() => void) | undefined;
    try {
      const {
        url: inputUrl,
        rawShareText,
        title: hintedTitle,
        customFocus,
        saveReason,
        userNote,
        modeHint,
        fileData,
        textData,
        aiSettings,
      } = req.body as {
        url?: string;
        rawShareText?: string;
        title?: string;
        customFocus?: string;
        saveReason?: string;
        userNote?: string;
        modeHint?: 'auto' | 'video' | 'screenshot' | 'link' | 'document' | 'ai-chat';
        fileData?: { mimeType: string; base64: string; fileName?: string };
        textData?: {
          content: string;
          fileName?: string;
          sourceKind?: 'text' | 'llm-chat';
          llmProvider?: string;
        };
        aiSettings?: Partial<AiBrainSettings>;
      };

      // Validate input sizes before touching Gemini
      if ((inputUrl && inputUrl.length > 2048) || (rawShareText && rawShareText.length > 4096)) {
        res.status(400).json({ error: 'Input URL or share text is too long (max 2,048 characters).' });
        return;
      }
      if ((userNote && userNote.length > 1000) || (customFocus && customFocus.length > 500)) {
        res.status(400).json({ error: 'Note or focus text exceeds allowed length.' });
        return;
      }
      if (textData?.content && textData.content.length > 120000) {
        res.status(400).json({ error: 'Pasted or uploaded text exceeds 120,000 character limit.' });
        return;
      }

      let validatedMimeType = '';
      if (fileData?.base64) {
        const safeMime = normalizeAndValidateMimeType(fileData.mimeType);
        if (!safeMime) {
          res.status(400).json({
            error:
              'Unsupported file type. Upload PNG/JPEG/WebP/GIF images, MP4/WebM/MP3/WAV media, or PDF documents.',
          });
          return;
        }
        validatedMimeType = safeMime;
        const isImg = ALLOWED_IMAGE_MIME_TYPES.has(safeMime);
        const isDoc = ALLOWED_DOCUMENT_MIME_TYPES.has(safeMime);
        if (isImg && !hasValidImageMagicBytes(fileData.base64, safeMime)) {
          res.status(400).json({
            error: 'Uploaded image content does not match its declared image format.',
          });
          return;
        }
        if (isDoc && !hasValidPdfMagicBytes(fileData.base64)) {
          res.status(400).json({
            error: 'Uploaded PDF does not appear to be a valid PDF document.',
          });
          return;
        }

        const approxBytes = Math.ceil((fileData.base64.length * 3) / 4);
        const maxBytes = isImg ? 6 * 1024 * 1024 : isDoc ? 15 * 1024 * 1024 : 20 * 1024 * 1024;
        if (approxBytes > maxBytes) {
          res.status(413).json({
            error: isImg
              ? 'Screenshot exceeds 6 MB limit. Please upload a smaller or compressed image.'
              : isDoc
                ? 'PDF exceeds 15 MB server analysis limit.'
                : 'Uploaded clip exceeds 20 MB server analysis limit.',
          });
          return;
        }
      }

      const hasTextPayload = Boolean(textData?.content && textData.content.trim().length > 0);
      const candidateUrl =
        !fileData?.base64 && !hasTextPayload ? extractCanonicalUrl(inputUrl || rawShareText || '') : '';
      if (!fileData?.base64 && !hasTextPayload) {
        if (!candidateUrl || !/^https?:\/\//i.test(candidateUrl)) {
          res.status(400).json({
            error:
              'Please provide a valid URL (video, AI chat share, product, or website) or upload/paste a file or text.',
          });
          return;
        }
        if (!isSafePublicHttpUrl(candidateUrl)) {
          res.status(400).json({ error: 'Private, local, or invalid network URLs are not allowed.' });
          return;
        }
      }

      const cfg = getFirebaseAppletConfig();
      const caller = await verifyCallerIdentity(req, cfg.projectId);
      const fingerprint = fileData?.base64
        ? `file:${fileData.fileName || 'media'}:${fileData.base64.slice(0, 64)}`
        : hasTextPayload
          ? `text:${textData?.sourceKind || 'text'}:${textData!.content.slice(0, 64)}`
          : `url:${candidateUrl.toLowerCase()}`;

      const guard = guardAiRequest(caller, 'analyze', res, fingerprint);
      if (!guard.allowed) {
        return;
      }
      releaseGuard = guard.release;

      const ai = getGeminiClient();
      const thinkingLevel =
        aiSettings?.depth === 'balanced' ? ThinkingLevel.MEDIUM : ThinkingLevel.LOW;
      const targetLanguage = aiSettings?.language?.slice(0, 60).trim();
      const adminGuidance = aiSettings?.customInstruction?.slice(0, 1000).trim();
      const reasonContext = [
        saveReason ? `Why the user saved this: ${saveReason.slice(0, 80)}` : '',
        userNote ? `User's personal note / context: ${userNote.slice(0, 1000)}` : '',
        customFocus ? `User focus area: ${customFocus.slice(0, 500)}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      // Path 1: Uploaded Screenshot / Image (OCR, product/service detection, URL extraction)
      if (fileData?.base64 && validatedMimeType && ALLOWED_IMAGE_MIME_TYPES.has(validatedMimeType)) {
        const fileName = fileData.fileName || 'Screenshot';
        const prompt = [
          `Inspect this screenshot/image (${fileName}) thoroughly for a Universal Share Inbox.`,
          reasonContext,
          adminGuidance ? `Workspace guidance: ${adminGuidance}` : '',
          targetLanguage && targetLanguage.toLowerCase() !== 'auto-detect'
            ? `Write summary, TL;DR bullets, section titles, and descriptions in ${targetLanguage}.`
            : '',
          `Instructions:`,
          `- Identify what the screenshot shows (e.g., product listing, service ad, WhatsApp/Messenger chat, UI, receipt, social post, article).`,
          `- Extract ALL visible text verbatim into 'transcript' lines (using sequential section markers like 00:00, 00:01, 00:02 and speaker set to the visual region like 'Header', 'Product Details', 'Pricing', 'Footer').`,
          `- Break down the visual sections into 'segments' so the user can scan what each part of the screenshot contains.`,
          `- Extract EVERY visible URL, website domain (convert bare domains like example.com/deal into https://example.com/deal), @handle link, or product/service link into 'links' with clear labels and kind ('product' | 'service' | 'resource' | 'social' | 'other').`,
          `- Generate 5-10 clean lowercase searchable tags (including brand names, product names, prices/keywords, and why-saved keywords).`,
          `- Set durationLabel to 'Screenshot'.`,
        ]
          .filter(Boolean)
          .join('\n');

        const response = await generateWithRetryAndFallback((model, isFallback) =>
          ai.models.generateContent({
            model,
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: validatedMimeType,
                    data: fileData.base64,
                  },
                },
                { text: prompt },
              ],
            },
            config: {
              thinkingConfig: {
                thinkingLevel: isFallback ? ThinkingLevel.LOW : thinkingLevel,
              },
              responseMimeType: 'application/json',
              responseSchema: analysisResponseSchema,
            },
          })
        );

        const parsed = JSON.parse((response.text ?? '{}').trim()) as Record<string, unknown>;
        const normalized = normalizeAnalysisPayload(
          parsed,
          hintedTitle || fileName,
          'Screenshot Capture',
          'Screenshot'
        );

        const payload: AnalyzeVideoResponse = {
          itemType: 'screenshot',
          url: `local://device/${encodeURIComponent(fileName)}`,
          platform: 'screenshot',
          thumbnailUrl: '',
          metadataSource: 'gemini-vision-ocr',
          ...normalized,
        };
        guard.recordSuccess?.();
        res.json(payload);
        return;
      }

      // Path 2: Direct uploaded video or audio file analysis (true multimodal inspection)
      if (fileData?.base64 && validatedMimeType && ALLOWED_MEDIA_MIME_TYPES.has(validatedMimeType)) {
        const fileName = fileData.fileName || 'Uploaded Video';
        const prompt = [
          `Analyze this uploaded video/audio clip (${fileName}) thoroughly.`,
          reasonContext,
          adminGuidance ? `Workspace guidance: ${adminGuidance}` : '',
          targetLanguage && targetLanguage.toLowerCase() !== 'auto-detect'
            ? `Write summary, TL;DR bullets, segment titles, and descriptions in ${targetLanguage}.`
            : '',
          `Produce accurate chronological timestamped key segments, a detailed timestamped transcript of spoken dialogue/visual events, a concise summary, TL;DR bullets, category, searchable lowercase tags, AND extract any websites, products, services, or URLs mentioned or shown on screen into 'links'.`,
        ]
          .filter(Boolean)
          .join('\n');

        const response = await generateWithRetryAndFallback((model, isFallback) =>
          ai.models.generateContent({
            model,
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: validatedMimeType,
                    data: fileData.base64,
                  },
                },
                { text: prompt },
              ],
            },
            config: {
              thinkingConfig: {
                thinkingLevel: isFallback ? ThinkingLevel.LOW : thinkingLevel,
              },
              responseMimeType: 'application/json',
              responseSchema: analysisResponseSchema,
            },
          })
        );

        const parsed = JSON.parse((response.text ?? '{}').trim()) as Record<string, unknown>;
        const normalized = normalizeAnalysisPayload(parsed, hintedTitle || fileName, 'Local Device', 'Video Clip');

        const payload: AnalyzeVideoResponse = {
          itemType: 'video',
          url: `local://device/${encodeURIComponent(fileName)}`,
          platform: 'upload',
          thumbnailUrl: '',
          metadataSource: 'multimodal-video',
          ...normalized,
        };
        guard.recordSuccess?.();
        res.json(payload);
        return;
      }

      // Path 2B: Uploaded PDF Document (true Gemini PDF multimodal reading)
      if (fileData?.base64 && validatedMimeType && ALLOWED_DOCUMENT_MIME_TYPES.has(validatedMimeType)) {
        const fileName = fileData.fileName || 'Document.pdf';
        const prompt = [
          `Read and index this PDF document (${fileName}) thoroughly for a Universal Share Inbox.`,
          reasonContext,
          adminGuidance ? `Workspace guidance: ${adminGuidance}` : '',
          targetLanguage && targetLanguage.toLowerCase() !== 'auto-detect'
            ? `Write summary, TL;DR bullets, section titles, and descriptions in ${targetLanguage}.`
            : '',
          `Instructions:`,
          `- Produce an executive summary and 4-8 crisp TL;DR takeaways.`,
          `- Break the document into logical sections/chapters in 'segments' (using sequential markers 00:00, 00:01, etc. and page/section headings).`,
          `- Extract the most important verbatim facts, figures, dates, and action items into 'transcript' lines (with speaker = Page/Section name).`,
          `- Extract any URLs, product names, citations, or tools mentioned in the PDF into 'links'.`,
          `- Generate 5-10 clean lowercase searchable tags.`,
          `- Set durationLabel to 'PDF Document'.`,
        ]
          .filter(Boolean)
          .join('\n');

        const response = await generateWithRetryAndFallback((model, isFallback) =>
          ai.models.generateContent({
            model,
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: 'application/pdf',
                    data: fileData.base64,
                  },
                },
                { text: prompt },
              ],
            },
            config: {
              thinkingConfig: {
                thinkingLevel: isFallback ? ThinkingLevel.LOW : thinkingLevel,
              },
              responseMimeType: 'application/json',
              responseSchema: analysisResponseSchema,
            },
          })
        );

        const parsed = JSON.parse((response.text ?? '{}').trim()) as Record<string, unknown>;
        const normalized = normalizeAnalysisPayload(parsed, hintedTitle || fileName, 'PDF Document', 'PDF Document');

        const payload: AnalyzeVideoResponse = {
          itemType: 'document',
          url: `local://device/${encodeURIComponent(fileName)}`,
          platform: 'pdf',
          thumbnailUrl: '',
          metadataSource: 'gemini-pdf-analysis',
          ...normalized,
        };
        guard.recordSuccess?.();
        res.json(payload);
        return;
      }

      // Path 2C: Pasted / Uploaded Text Note OR Exported LLM Chat History
      if (hasTextPayload && textData) {
        const isLlmChat = textData.sourceKind === 'llm-chat' || modeHint === 'ai-chat';
        const formattedText = isLlmChat
          ? formatChatExportTextIfJson(textData.content)
          : textData.content;
        const safeSlice = formattedText.slice(0, 60000);
        const extractedTextLinks: ExtractedLink[] = extractUrlsFromText(safeSlice).map((u) => {
          let label = u;
          try {
            label = new URL(u).hostname.replace(/^www\./, '');
          } catch {
            // Keep URL
          }
          return { url: u, label, kind: 'resource' as const };
        });

        const resolvedPlatform: VideoPlatform = isLlmChat
          ? detectLlmProviderFromText(safeSlice, textData.llmProvider)
          : 'document';
        const resolvedItemType: InboxItemType = isLlmChat ? 'ai-chat' : 'document';
        const fileName = textData.fileName || (isLlmChat ? 'AI Chat Conversation' : 'Saved Note');

        const prompt = [
          isLlmChat
            ? `Analyze and structure this shared AI / LLM conversation (${resolvedPlatform.toUpperCase()}) for a searchable personal library.`
            : `Analyze and index this shared text / markdown / document (${fileName}) for a Universal Share Inbox.`,
          reasonContext,
          adminGuidance ? `Workspace guidance: ${adminGuidance}` : '',
          targetLanguage && targetLanguage.toLowerCase() !== 'auto-detect'
            ? `Write summary, TL;DR bullets, section titles, and descriptions in ${targetLanguage}.`
            : '',
          `Content:\n${safeSlice}`,
          `Instructions:`,
          isLlmChat
            ? `- Organize the conversation turns / topic shifts chronologically into 'segments' (e.g., 00:00 User Prompt 1, 00:01 Assistant Response & Solution) with key decisions/code highlights in keyQuote.`
            : `- Break the text into logical sections in 'segments' (00:00, 00:01, etc.).`,
          isLlmChat
            ? `- Extract key prompt-and-answer lines into 'transcript' (set speaker to 'User' or 'Assistant').`
            : `- Extract key quotes, facts, action items, or structured lines into 'transcript'.`,
          `- Extract all referenced URLs, tools, libraries, products, or resources into 'links'.`,
          `- Generate 5-10 clean lowercase searchable tags.`,
          `- Set durationLabel to '${isLlmChat ? 'AI Chat' : 'Text Note'}'.`,
        ]
          .filter(Boolean)
          .join('\n\n');

        const response = await generateWithRetryAndFallback((model, isFallback) =>
          ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              thinkingConfig: {
                thinkingLevel: isFallback ? ThinkingLevel.LOW : thinkingLevel,
              },
              responseMimeType: 'application/json',
              responseSchema: analysisResponseSchema,
            },
          })
        );

        const parsed = JSON.parse((response.text ?? '{}').trim()) as Record<string, unknown>;
        const normalized = normalizeAnalysisPayload(
          parsed,
          hintedTitle || fileName,
          isLlmChat ? `${resolvedPlatform.toUpperCase()} Assistant` : 'Text Document',
          isLlmChat ? 'AI Chat' : 'Text Note',
          extractedTextLinks
        );

        const payload: AnalyzeVideoResponse = {
          itemType: resolvedItemType,
          url: `local://text/${encodeURIComponent(fileName)}`,
          platform: resolvedPlatform,
          thumbnailUrl: '',
          metadataSource: isLlmChat ? 'gemini-llm-chat-index' : 'gemini-text-index',
          ...normalized,
        };
        guard.recordSuccess?.();
        res.json(payload);
        return;
      }

      // Path 3: Shared URL analysis (Videos + AI Chat Shares + Web / Product / Service Links)
      const canonicalUrl = candidateUrl;

      const platform = detectPlatform(canonicalUrl);
      const itemType = classifyUrlItemType(canonicalUrl, platform, modeHint);
      const meta = await fetchPlatformMetadata(canonicalUrl, platform);
      const fallbackTitle =
        meta.title ||
        hintedTitle ||
        (itemType === 'ai-chat'
          ? `${platform.toUpperCase()} Shared Chat`
          : itemType === 'link'
            ? new URL(canonicalUrl).hostname
            : `${platform.toUpperCase()} Video`);
      const fallbackDuration =
        meta.durationSeconds > 0
          ? formatSeconds(meta.durationSeconds)
          : itemType === 'ai-chat'
            ? 'AI Chat'
            : itemType === 'link'
              ? 'Web Page'
              : '—';

      const researchPrompt =
        itemType === 'ai-chat'
          ? [
              `Inspect and summarize this shared ${platform.toUpperCase()} AI chat conversation link: ${canonicalUrl}`,
              hintedTitle ? `Share title: ${hintedTitle}` : '',
              meta.title ? `Page title: ${meta.title}` : '',
              meta.description ? `Meta description:\n${meta.description.slice(0, 2000)}` : '',
              meta.pageText ? `Fetched conversation excerpt:\n${meta.pageText.slice(0, 8000)}` : '',
              reasonContext,
              `Extract the user's main questions, the AI assistant's core solutions/answers, code or tool recommendations, all mentioned URLs/resources, and searchable tags.`,
            ]
              .filter(Boolean)
              .join('\n\n')
          : itemType === 'link'
            ? [
                `Inspect and analyze this shared web/product/service link: ${canonicalUrl}`,
                hintedTitle ? `Share title: ${hintedTitle}` : '',
                meta.title ? `Page title: ${meta.title}` : '',
                meta.creator ? `Site/Brand: ${meta.creator}` : '',
                meta.description ? `Meta description:\n${meta.description.slice(0, 2000)}` : '',
                meta.pageText ? `Fetched webpage content:\n${meta.pageText.slice(0, 5000)}` : '',
                reasonContext,
                `Extract product/service details, pricing or key offering, main sections, important links (buy/signup/docs/social), and searchable keywords.`,
              ]
                .filter(Boolean)
                .join('\n\n')
            : [
              `Inspect and analyze this shared ${platform} video link: ${canonicalUrl}`,
              hintedTitle ? `Share sheet title: ${hintedTitle}` : '',
              meta.title ? `Fetched title: ${meta.title}` : '',
              meta.creator ? `Fetched creator/channel: ${meta.creator}` : '',
              meta.durationSeconds > 0
                ? `Known duration: ${formatSeconds(meta.durationSeconds)} (${meta.durationSeconds} seconds)`
                : '',
              meta.description ? `Fetched description/caption:\n${meta.description.slice(0, 3000)}` : '',
              meta.captionsText ? `Fetched timestamped captions:\n${meta.captionsText.slice(0, 12000)}` : '',
              reasonContext,
              `Extract all factual details about this video: exact topic, speaker/creator, key chapters with accurate timestamps (if short-form < 90s, segment by 00:00, 00:15, 00:30, etc.; if long-form, use chapter/caption timestamps), key takeaways, transcript/spoken flow, mentioned links/products/services, and searchable tags.`,
            ]
              .filter(Boolean)
              .join('\n\n');

      let groundedNotes = '';
      const hasRichLocalPageContent =
        itemType === 'link' && Boolean(meta.title) && meta.pageText.length >= 600;

      if (!meta.captionsText && !hasRichLocalPageContent) {
        try {
          const groundedRes = await generateWithRetryAndFallback((model) =>
            ai.models.generateContent({
              model,
              contents: researchPrompt,
              config: {
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
                tools: [{ urlContext: {} }, { googleSearch: {} }],
              },
            })
          );
          groundedNotes = groundedRes.text || '';
        } catch (groundErr) {
          if (!isTransientGeminiError(groundErr)) {
            try {
              const searchRes = await generateWithRetryAndFallback((model) =>
                ai.models.generateContent({
                  model,
                  contents: researchPrompt,
                  config: {
                    thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
                    tools: [{ googleSearch: {} }],
                  },
                })
              );
              groundedNotes = searchRes.text || '';
            } catch {
              groundedNotes = '';
            }
          }
        }
      }

      const rawTextUrls = [
        ...extractUrlsFromText(meta.description, canonicalUrl),
        ...extractUrlsFromText(meta.captionsText, canonicalUrl),
        ...extractUrlsFromText(groundedNotes, canonicalUrl),
      ];
      const fallbackLinks: ExtractedLink[] = [
        ...meta.extractedLinks,
        ...rawTextUrls.map((u) => {
          let label = u;
          try {
            label = new URL(u).hostname.replace(/^www\./, '');
          } catch {
            // Keep URL as label
          }
          return { url: u, label, kind: 'resource' as const };
        }),
      ];

      const synthesisPrompt = [
        itemType === 'ai-chat'
          ? `Convert the following shared AI conversation metadata and notes into a structured JSON Universal Share Inbox breakdown.`
          : itemType === 'link'
            ? `Convert the following webpage/product/service metadata and content into a structured JSON Universal Share Inbox breakdown.`
            : `Convert the following verified video metadata, captions, and grounded analysis into a structured JSON breakdown.`,
        `Item Type: ${itemType}`,
        `Platform: ${platform}`,
        `Canonical URL: ${canonicalUrl}`,
        meta.title ? `Title: ${meta.title}` : '',
        meta.creator ? `Creator / Brand: ${meta.creator}` : '',
        meta.durationSeconds > 0 ? `Duration: ${formatSeconds(meta.durationSeconds)}` : '',
        meta.description ? `Description:\n${meta.description.slice(0, 2500)}` : '',
        meta.pageText ? `Webpage Text Excerpt:\n${meta.pageText.slice(0, 5000)}` : '',
        meta.captionsText ? `Timestamped Captions:\n${meta.captionsText.slice(0, 12000)}` : '',
        groundedNotes ? `Grounded Analysis Notes:\n${groundedNotes.slice(0, 12000)}` : '',
        fallbackLinks.length > 0
          ? `Discovered Candidate URLs:\n${fallbackLinks
              .slice(0, 20)
              .map((l) => `- ${l.url} (${l.label})`)
              .join('\n')}`
          : '',
        reasonContext,
        adminGuidance ? `Workspace guidance: ${adminGuidance}` : '',
        targetLanguage && targetLanguage.toLowerCase() !== 'auto-detect'
          ? `Write summary, TL;DR bullets, segment titles, and descriptions in ${targetLanguage}.`
          : '',
        `Rules:`,
        itemType === 'link'
          ? `- Organize the page highlights into 'segments' (e.g., 00:00 Overview, 00:01 Key Features / Pricing, 00:02 Details) and key specs/facts into 'transcript'.`
          : `- Keep timestamps strictly chronological and formatted MM:SS (or HH:MM:SS), covering opening, middle, and conclusion clearly.`,
        `- Retrieve and label all useful URLs, product links, service links, or tools mentioned or linked into 'links' (classify kind as product, service, resource, social, or other).`,
        `- Generate clean lowercase tags (5-10 items, no # prefix) including product/service/keyword terms for instant retrieval later.`,
        `- Do not invent fake verbatim quotes if captions/text were restricted.`,
      ]
        .filter(Boolean)
        .join('\n\n');

      const structuredRes = await generateWithRetryAndFallback((model, isFallback) =>
        ai.models.generateContent({
          model,
          contents: synthesisPrompt,
          config: {
            thinkingConfig: {
              thinkingLevel: isFallback ? ThinkingLevel.LOW : thinkingLevel,
            },
            responseMimeType: 'application/json',
            responseSchema: analysisResponseSchema,
          },
        })
      );

      const parsed = JSON.parse((structuredRes.text ?? '{}').trim()) as Record<string, unknown>;
      const normalized = normalizeAnalysisPayload(
        parsed,
        fallbackTitle,
        meta.creator || (itemType === 'link' ? new URL(canonicalUrl).hostname.replace(/^www\./, '') : 'Creator'),
        fallbackDuration,
        fallbackLinks
      );

      const responsePayload: AnalyzeVideoResponse = {
        itemType,
        url: canonicalUrl,
        platform,
        thumbnailUrl: meta.thumbnailUrl,
        metadataSource: meta.metadataSource,
        ...normalized,
      };

      guard.recordSuccess?.();
      res.json(responsePayload);
    } catch (err) {
      const { status, message } = formatGeminiError(err);
      res.status(status).json({ error: message });
    } finally {
      releaseGuard?.();
    }
  });

  app.post('/api/ask-video', async (req: Request, res: Response) => {
    let releaseGuard: (() => void) | undefined;
    try {
      const { video, question, history } = req.body as {
        video?: {
          itemType?: InboxItemType;
          title: string;
          creator: string;
          platform: string;
          summary: string;
          segments: VideoSegment[];
          transcript: TranscriptEntry[];
          links?: ExtractedLink[];
          saveReason?: string;
          notes?: string;
        };
        question?: string;
        history?: Array<{ role: 'user' | 'model'; text: string }>;
      };

      if (!video || !question?.trim()) {
        res.status(400).json({ error: 'Item context and question are required.' });
        return;
      }
      if (question.trim().length > 1000) {
        res.status(400).json({ error: 'Question is too long (max 1,000 characters).' });
        return;
      }

      const cfg = getFirebaseAppletConfig();
      const caller = await verifyCallerIdentity(req, cfg.projectId);
      const guard = guardAiRequest(caller, 'ask', res);
      if (!guard.allowed) {
        return;
      }
      releaseGuard = guard.release;

      const ai = getGeminiClient();
      const contextBlock = [
        `Item Type: ${video.itemType || 'video'}`,
        `Title: ${String(video.title || '').slice(0, 300)}`,
        `Source/Creator: ${String(video.creator || '').slice(0, 150)} (${String(video.platform || '').slice(0, 32)})`,
        video.saveReason ? `Why User Saved This: ${String(video.saveReason).slice(0, 80)}` : '',
        video.notes ? `User Notes: ${String(video.notes).slice(0, 1000)}` : '',
        `Summary: ${String(video.summary || '').slice(0, 4000)}`,
        `Segments / Sections:\n${(Array.isArray(video.segments) ? video.segments : [])
          .slice(0, 40)
          .map((s) => `[${s.timestamp}] ${String(s.title).slice(0, 140)}: ${String(s.summary).slice(0, 400)}${s.keyQuote ? ` ("${String(s.keyQuote).slice(0, 200)}")` : ''}`)
          .join('\n')}`,
        `Transcript / Extracted Text:\n${(Array.isArray(video.transcript) ? video.transcript : [])
          .slice(0, 80)
          .map((t) => `[${t.timestamp}] ${String(t.speaker || 'Speaker').slice(0, 50)}: ${String(t.text).slice(0, 400)}`)
          .join('\n')}`,
        video.links && video.links.length > 0
          ? `Retrieved Links:\n${video.links
              .slice(0, 25)
              .map((l) => `- ${String(l.label).slice(0, 140)}: ${String(l.url).slice(0, 500)}${l.context ? ` (${String(l.context).slice(0, 200)})` : ''}`)
              .join('\n')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      const historyText = (Array.isArray(history) ? history : [])
        .slice(-6)
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${String(m.text || '').slice(0, 800)}`)
        .join('\n');

      const response = await generateWithRetryAndFallback((model) =>
        ai.models.generateContent({
          model,
          contents: `${contextBlock}\n\n${historyText ? `Conversation so far:\n${historyText}\n\n` : ''}User question: ${question.trim()}`,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            systemInstruction:
              'You answer questions concisely using only the provided summary, segments/sections, transcript/OCR text, notes, and retrieved links. Cite relevant timestamps or section markers in square brackets like [01:24] when applicable.',
          },
        })
      );

      guard.recordSuccess?.();
      res.json({ answer: response.text || 'No response generated.' });
    } catch (err) {
      const { status, message } = formatGeminiError(err);
      res.status(status).json({ error: message });
    } finally {
      releaseGuard?.();
    }
  });

  // WhatsApp Connector Endpoints
  app.get('/api/whatsapp/status', (_req: Request, res: Response) => {
    const token = (process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
    const phoneId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
    res.json({
      cloudApiConfigured: Boolean(token && phoneId),
    });
  });

  app.post('/api/whatsapp/send-reminder', async (req: Request, res: Response) => {
    try {
      const cfg = getFirebaseAppletConfig();
      const caller = await verifyCallerIdentity(req, cfg.projectId);
      if (!caller.uid) {
        res.status(401).json({ error: 'Sign in required to dispatch WhatsApp API reminders.' });
        return;
      }

      const { phoneNumber, message } = (req.body || {}) as {
        phoneNumber?: string;
        message?: string;
      };
      const cleanDigits = String(phoneNumber || '').replace(/[^0-9]/g, '');
      const cleanMessage = String(message || '').trim().slice(0, 1000);
      if (cleanDigits.length < 7 || cleanDigits.length > 15) {
        res.status(400).json({ error: 'Enter a valid WhatsApp phone number including country code.' });
        return;
      }
      if (!cleanMessage) {
        res.status(400).json({ error: 'Reminder message cannot be empty.' });
        return;
      }

      const fallbackUrl = `https://wa.me/${cleanDigits}?text=${encodeURIComponent(cleanMessage)}`;
      const accessToken = (process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
      const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();

      if (!accessToken || !phoneNumberId) {
        res.json({
          sent: false,
          cloudApiConfigured: false,
          fallbackUrl,
        });
        return;
      }

      const graphController = new AbortController();
      const graphTimer = setTimeout(() => graphController.abort(), 8000);
      let graphRes: globalThis.Response;
      try {
        graphRes = await fetch(
          `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/messages`,
          {
            method: 'POST',
            signal: graphController.signal,
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: cleanDigits,
              type: 'text',
              text: { body: cleanMessage },
            }),
          }
        );
      } finally {
        clearTimeout(graphTimer);
      }

      if (!graphRes.ok) {
        const errBody = await graphRes.text().catch(() => '');
        res.status(502).json({
          sent: false,
          cloudApiConfigured: true,
          fallbackUrl,
          error: `WhatsApp Cloud API returned HTTP ${graphRes.status}${errBody ? `: ${errBody.slice(0, 140)}` : ''}`,
        });
        return;
      }

      res.json({
        sent: true,
        cloudApiConfigured: true,
        fallbackUrl,
      });
    } catch (err) {
      res.status(500).json({
        sent: false,
        cloudApiConfigured: false,
        fallbackUrl: '',
        error: err instanceof Error ? err.message : 'Unable to send WhatsApp reminder.',
      });
    }
  });

  return app;
}
