import crypto from 'crypto';
import type { Request, Response } from 'express';

export interface VerifiedCaller {
  key: string;
  tier: 'guest' | 'user' | 'admin';
  uid?: string;
  email?: string;
  ip: string;
}

interface JwkRecord {
  kid: string;
  kty: string;
  alg?: string;
  n?: string;
  e?: string;
  [k: string]: unknown;
}

let cachedJwks: { keys: Record<string, JwkRecord>; expiresAt: number } | null = null;
const ADMIN_EMAIL = 'zotomic.com@gmail.com';

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, 'base64');
}

async function getFirebasePublicKeys(): Promise<Record<string, JwkRecord>> {
  const now = Date.now();
  if (cachedJwks && cachedJwks.expiresAt > now) {
    return cachedJwks.keys;
  }

  const res = await fetch(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
  );
  if (!res.ok) {
    throw new Error('Failed to load Firebase verification keys.');
  }

  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const ttlMs = maxAgeMatch ? Math.max(60, Number(maxAgeMatch[1])) * 1000 : 3600_000;
  const body = (await res.json()) as { keys?: JwkRecord[] };

  const keyMap: Record<string, JwkRecord> = {};
  for (const k of body.keys || []) {
    if (k.kid) keyMap[k.kid] = k;
  }

  cachedJwks = { keys: keyMap, expiresAt: now + ttlMs };
  return keyMap;
}

export function getClientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  const firstForwarded = Array.isArray(xff) ? xff[0] : typeof xff === 'string' ? xff.split(',')[0] : '';
  const raw = (firstForwarded || req.ip || req.socket?.remoteAddress || 'unknown').trim();
  return raw.replace(/^::ffff:/, '').slice(0, 80) || 'unknown';
}

export async function verifyCallerIdentity(
  req: Request,
  firebaseProjectId?: string
): Promise<VerifiedCaller> {
  const ip = getClientIp(req);
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ') || !firebaseProjectId) {
    return { key: `guest:${ip}`, tier: 'guest', ip };
  }

  const token = authHeader.slice(7).trim();
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { key: `guest:${ip}`, tier: 'guest', ip };
  }

  try {
    const headerJson = JSON.parse(base64UrlDecode(parts[0]).toString('utf8')) as {
      alg?: string;
      kid?: string;
    };
    const payloadJson = JSON.parse(base64UrlDecode(parts[1]).toString('utf8')) as {
      aud?: string;
      iss?: string;
      sub?: string;
      exp?: number;
      iat?: number;
      email?: string;
      email_verified?: boolean;
    };

    const nowSec = Math.floor(Date.now() / 1000);
    if (
      headerJson.alg !== 'RS256' ||
      !headerJson.kid ||
      payloadJson.aud !== firebaseProjectId ||
      payloadJson.iss !== `https://securetoken.google.com/${firebaseProjectId}` ||
      !payloadJson.sub ||
      typeof payloadJson.exp !== 'number' ||
      payloadJson.exp <= nowSec - 30
    ) {
      return { key: `guest:${ip}`, tier: 'guest', ip };
    }

    const keys = await getFirebasePublicKeys();
    const jwk = keys[headerJson.kid];
    if (!jwk) {
      return { key: `guest:${ip}`, tier: 'guest', ip };
    }

    const publicKey = crypto.createPublicKey({ key: jwk as crypto.JsonWebKey, format: 'jwk' });
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${parts[0]}.${parts[1]}`);
    verifier.end();

    const validSig = verifier.verify(publicKey, base64UrlDecode(parts[2]));
    if (!validSig) {
      return { key: `guest:${ip}`, tier: 'guest', ip };
    }

    const email = (payloadJson.email || '').toLowerCase();
    const isAdmin = Boolean(payloadJson.email_verified && email === ADMIN_EMAIL);
    const tier: VerifiedCaller['tier'] = isAdmin ? 'admin' : payloadJson.email_verified ? 'user' : 'guest';

    if (tier === 'guest') {
      return { key: `guest:${ip}`, tier: 'guest', ip };
    }

    return {
      key: `user:${payloadJson.sub}`,
      tier,
      uid: payloadJson.sub,
      email,
      ip,
    };
  } catch {
    return { key: `guest:${ip}`, tier: 'guest', ip };
  }
}

export function isSafePublicHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      !host ||
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host === '[::1]' ||
      host.endsWith('.local') ||
      host.endsWith('.internal')
    ) {
      return false;
    }

    // Block private IPv4 ranges (SSRF protection)
    const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const a = Number(ipv4Match[1]);
      const b = Number(ipv4Match[2]);
      if (
        a === 10 ||
        a === 127 ||
        a === 0 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 100 && b >= 64 && b <= 127)
      ) {
        return false;
      }
    }

    // Block IPv6 loopback/link-local/ULA
    const cleanHost = host.replace(/^\[|\]$/g, '');
    if (cleanHost.includes(':')) {
      if (cleanHost === '::1' || cleanHost.startsWith('fc') || cleanHost.startsWith('fd') || cleanHost.startsWith('fe80')) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function readIntEnv(name: string, fallback: number, min = 1): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= min ? Math.floor(raw) : fallback;
}

export interface TierLimits {
  analyzePerMinute: number;
  analyzePerDay: number;
  askPerMinute: number;
  askPerDay: number;
}

export function getTierLimits(tier: VerifiedCaller['tier']): TierLimits {
  if (tier === 'admin') {
    return {
      analyzePerMinute: readIntEnv('FREE_TIER_ADMIN_ANALYZE_RPM', 6),
      analyzePerDay: readIntEnv('FREE_TIER_ADMIN_ANALYZE_DAILY', 80),
      askPerMinute: readIntEnv('FREE_TIER_ADMIN_ASK_RPM', 10),
      askPerDay: readIntEnv('FREE_TIER_ADMIN_ASK_DAILY', 150),
    };
  }
  if (tier === 'user') {
    return {
      analyzePerMinute: readIntEnv('FREE_TIER_USER_ANALYZE_RPM', 3),
      analyzePerDay: readIntEnv('FREE_TIER_USER_ANALYZE_DAILY', 15),
      askPerMinute: readIntEnv('FREE_TIER_USER_ASK_RPM', 6),
      askPerDay: readIntEnv('FREE_TIER_USER_ASK_DAILY', 30),
    };
  }
  // Guest (unauthenticated IP-scoped)
  return {
    analyzePerMinute: readIntEnv('FREE_TIER_GUEST_ANALYZE_RPM', 2),
    analyzePerDay: readIntEnv('FREE_TIER_GUEST_ANALYZE_DAILY', 4),
    askPerMinute: readIntEnv('FREE_TIER_GUEST_ASK_RPM', 3),
    askPerDay: readIntEnv('FREE_TIER_GUEST_ASK_DAILY', 8),
  };
}

function getGlobalLimits() {
  return {
    rpm: readIntEnv('GEMINI_GLOBAL_RPM', 10),
    daily: readIntEnv('GEMINI_GLOBAL_DAILY', 200),
    maxConcurrent: readIntEnv('GEMINI_MAX_CONCURRENT', 3),
  };
}

function currentUtcDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function nextUtcMidnightIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0)).toISOString();
}

function secondsUntilUtcMidnight(): number {
  const target = Date.parse(nextUtcMidnightIso());
  return Math.max(60, Math.ceil((target - Date.now()) / 1000));
}

// Sliding 60s timestamps per bucket key
const minuteBuckets = new Map<string, number[]>();
// Daily counter per bucket key: `${dateKey}:${scope}:${action}`
const dailyCounters = new Map<string, number>();
// Short duplicate cooldown: `${callerKey}:${fingerprint}` -> expiresAtMs
const recentFingerprints = new Map<string, number>();
// Active in-flight locks
const activePerCaller = new Set<string>();
let activeGlobalRequests = 0;

function pruneAndCountMinute(bucketKey: string, now: number): number {
  const cutoff = now - 60_000;
  const arr = (minuteBuckets.get(bucketKey) || []).filter((ts) => ts > cutoff);
  if (arr.length === 0) {
    minuteBuckets.delete(bucketKey);
  } else {
    minuteBuckets.set(bucketKey, arr);
  }
  return arr.length;
}

function pushMinuteTimestamp(bucketKey: string, now: number): void {
  const cutoff = now - 60_000;
  const arr = (minuteBuckets.get(bucketKey) || []).filter((ts) => ts > cutoff);
  arr.push(now);
  minuteBuckets.set(bucketKey, arr);
}

function cleanupOldDays(today: string): void {
  if (dailyCounters.size > 2000) {
    for (const k of dailyCounters.keys()) {
      if (!k.startsWith(`${today}:`)) {
        dailyCounters.delete(k);
      }
    }
  }
  const now = Date.now();
  if (recentFingerprints.size > 1000) {
    for (const [k, exp] of recentFingerprints.entries()) {
      if (exp <= now) recentFingerprints.delete(k);
    }
  }
}

export type AiActionKind = 'analyze' | 'ask';

export interface UsageSnapshot {
  authenticated: boolean;
  tier: VerifiedCaller['tier'];
  resetsAtIso: string;
  analyze: {
    usedToday: number;
    limitToday: number;
    remainingToday: number;
    rpmLimit: number;
  };
  ask: {
    usedToday: number;
    limitToday: number;
    remainingToday: number;
    rpmLimit: number;
  };
}

export function getCallerUsageSnapshot(caller: VerifiedCaller): UsageSnapshot {
  const today = currentUtcDateKey();
  const limits = getTierLimits(caller.tier);
  const analyzeUsed = dailyCounters.get(`${today}:${caller.key}:analyze`) || 0;
  const askUsed = dailyCounters.get(`${today}:${caller.key}:ask`) || 0;

  return {
    authenticated: caller.tier !== 'guest',
    tier: caller.tier,
    resetsAtIso: nextUtcMidnightIso(),
    analyze: {
      usedToday: analyzeUsed,
      limitToday: limits.analyzePerDay,
      remainingToday: Math.max(0, limits.analyzePerDay - analyzeUsed),
      rpmLimit: limits.analyzePerMinute,
    },
    ask: {
      usedToday: askUsed,
      limitToday: limits.askPerDay,
      remainingToday: Math.max(0, limits.askPerDay - askUsed),
      rpmLimit: limits.askPerMinute,
    },
  };
}

export interface GuardResult {
  allowed: boolean;
  release?: () => void;
  recordSuccess?: () => void;
}

export function guardAiRequest(
  caller: VerifiedCaller,
  action: AiActionKind,
  res: Response,
  dedupeFingerprint?: string
): GuardResult {
  const now = Date.now();
  const today = currentUtcDateKey();
  cleanupOldDays(today);

  const tierLimits = getTierLimits(caller.key.startsWith('user:') ? caller.tier : 'guest');
  const globalLimits = getGlobalLimits();

  const perMinLimit = action === 'analyze' ? tierLimits.analyzePerMinute : tierLimits.askPerMinute;
  const perDayLimit = action === 'analyze' ? tierLimits.analyzePerDay : tierLimits.askPerDay;

  const userDailyKey = `${today}:${caller.key}:${action}`;
  const ipDailyKey = `${today}:ip:${caller.ip}:${action}`;
  const globalDailyKey = `${today}:global:all`;

  const userDailyCount = dailyCounters.get(userDailyKey) || 0;
  const ipDailyCount = dailyCounters.get(ipDailyKey) || 0;
  const globalDailyCount = dailyCounters.get(globalDailyKey) || 0;

  // Prevent multi-account spam from a single IP (cap single IP at 2x authenticated user daily limit)
  const ipCap = Math.max(perDayLimit * 2, 30);

  const reject = (status: number, retryAfterSec: number, limitType: string, message: string): GuardResult => {
    res.setHeader('Retry-After', String(Math.max(1, retryAfterSec)));
    res.setHeader('X-RateLimit-Limit', String(perDayLimit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, perDayLimit - userDailyCount)));
    res.setHeader('X-RateLimit-Reset', nextUtcMidnightIso());
    res.status(status).json({
      error: message,
      limitType,
      retryAfterSeconds: Math.max(1, retryAfterSec),
    });
    return { allowed: false };
  };

  // 1. Concurrent request lock
  if (activePerCaller.has(`${caller.key}:${action}`)) {
    return reject(
      429,
      5,
      'concurrent',
      'An AI request is already running for your account. Please wait a few seconds for it to finish.'
    );
  }
  if (activeGlobalRequests >= globalLimits.maxConcurrent) {
    return reject(
      429,
      6,
      'global-concurrency',
      'Server is handling peak AI traffic right now. Please retry in a few seconds.'
    );
  }

  // 2. Short duplicate-submission cooldown (prevents double-click token waste)
  if (dedupeFingerprint) {
    const fpKey = `${caller.key}:${dedupeFingerprint}`;
    const fpExp = recentFingerprints.get(fpKey);
    if (fpExp && fpExp > now) {
      const waitSec = Math.ceil((fpExp - now) / 1000);
      return reject(
        429,
        waitSec,
        'duplicate',
        `This exact item was just submitted. Please wait ${waitSec}s before re-analyzing.`
      );
    }
  }

  // 3. Per-user / per-IP minute burst limit
  const userMinKey = `min:${caller.key}:${action}`;
  const userMinCount = pruneAndCountMinute(userMinKey, now);
  if (userMinCount >= perMinLimit) {
    return reject(
      429,
      30,
      'minute',
      `Rate limit reached (${perMinLimit} ${action === 'analyze' ? 'analyses' : 'questions'} per minute). Please wait ~30 seconds.`
    );
  }

  // 4. Per-user / guest daily quota
  if (userDailyCount >= perDayLimit) {
    const msg =
      caller.tier === 'guest'
        ? `Guest preview limit reached (${perDayLimit} free ${action === 'analyze' ? 'analyses' : 'questions'}/day). Sign in for up to ${getTierLimits('user').analyzePerDay} analyses/day.`
        : `Daily free-tier limit reached (${perDayLimit} ${action === 'analyze' ? 'analyses' : 'questions'}/day). Quota resets at midnight UTC.`;
    return reject(429, secondsUntilUtcMidnight(), caller.tier === 'guest' ? 'guest-daily' : 'user-daily', msg);
  }

  // 5. Anti-multi-account IP daily ceiling (skip for admin)
  if (caller.tier !== 'admin' && ipDailyCount >= ipCap) {
    return reject(
      429,
      secondsUntilUtcMidnight(),
      'ip-daily',
      'Daily network quota reached for this IP address. Please try again tomorrow.'
    );
  }

  // 6. Global free-tier Gemini key protection
  const globalMinCount = pruneAndCountMinute('min:global:all', now);
  if (globalMinCount >= globalLimits.rpm) {
    return reject(
      429,
      20,
      'global-minute',
      'Shared free-tier AI capacity is busy right now. Please retry in ~20 seconds.'
    );
  }
  if (globalDailyCount >= globalLimits.daily) {
    return reject(
      429,
      secondsUntilUtcMidnight(),
      'global-daily',
      'Daily shared AI quota has been reached to protect the free-tier API key. Please try again tomorrow.'
    );
  }

  // Reserve burst & concurrency immediately; record daily count on start (or keep even if upstream is slow, protecting key)
  const callerLockKey = `${caller.key}:${action}`;
  activePerCaller.add(callerLockKey);
  activeGlobalRequests += 1;

  pushMinuteTimestamp(userMinKey, now);
  pushMinuteTimestamp('min:global:all', now);

  if (dedupeFingerprint) {
    recentFingerprints.set(`${caller.key}:${dedupeFingerprint}`, now + 30_000);
  }

  let released = false;
  let counted = false;

  const recordSuccess = () => {
    if (counted) return;
    counted = true;
    if (dedupeFingerprint) {
      recentFingerprints.set(`${caller.key}:${dedupeFingerprint}`, Date.now() + 30_000);
    }
    dailyCounters.set(userDailyKey, (dailyCounters.get(userDailyKey) || 0) + 1);
    dailyCounters.set(ipDailyKey, (dailyCounters.get(ipDailyKey) || 0) + 1);
    dailyCounters.set(globalDailyKey, (dailyCounters.get(globalDailyKey) || 0) + 1);
  };

  // Expose remaining headers on response
  res.setHeader('X-RateLimit-Limit', String(perDayLimit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, perDayLimit - userDailyCount - 1)));
  res.setHeader('X-RateLimit-Reset', nextUtcMidnightIso());

  const release = () => {
    if (released) return;
    released = true;
    activePerCaller.delete(callerLockKey);
    activeGlobalRequests = Math.max(0, activeGlobalRequests - 1);
  };

  return { allowed: true, release, recordSuccess };
}

// --- General API IP Flood Protection ---
const generalApiBuckets = new Map<string, number[]>();

export function guardGeneralApiRateLimit(req: Request, res: Response, maxPerMinute = 120): boolean {
  const ip = getClientIp(req);
  const now = Date.now();
  const cutoff = now - 60_000;
  const timestamps = (generalApiBuckets.get(ip) || []).filter((ts) => ts > cutoff);
  if (timestamps.length >= maxPerMinute) {
    res.setHeader('Retry-After', '30');
    res.status(429).json({
      error: 'Too many requests from this network. Please slow down and try again shortly.',
    });
    return false;
  }
  timestamps.push(now);
  generalApiBuckets.set(ip, timestamps);
  if (generalApiBuckets.size > 3000) {
    for (const [k, list] of generalApiBuckets.entries()) {
      if (list.every((ts) => ts <= cutoff)) {
        generalApiBuckets.delete(k);
      }
    }
  }
  return true;
}

// --- Anti-AI / Anti-Bot Signup Challenge ---
const EPHEMERAL_CHALLENGE_SECRET = crypto.randomBytes(32).toString('hex');
const usedChallengeNonces = new Map<string, number>();
const challengeIssueBuckets = new Map<string, number[]>();

function getChallengeSecret(): string {
  return (
    process.env.AUTH_CHALLENGE_SECRET ||
    process.env.GEMINI_API_KEY ||
    EPHEMERAL_CHALLENGE_SECRET
  );
}

function hashIp(ip: string): string {
  return crypto
    .createHmac('sha256', getChallengeSecret())
    .update(ip)
    .digest('hex')
    .slice(0, 24);
}

export function isAutomatedUserAgent(uaRaw: string | undefined): boolean {
  const ua = (uaRaw || '').trim().toLowerCase();
  if (!ua || ua.length < 12) return true;
  const botPatterns = [
    'headlesschrome',
    'playwright',
    'puppeteer',
    'selenium',
    'phantomjs',
    'cypress',
    'curl/',
    'wget/',
    'python-requests',
    'python-urllib',
    'httpx',
    'aiohttp',
    'axios/',
    'node-fetch',
    'undici',
    'go-http-client',
    'scrapy',
    'gptbot',
    'chatgpt-user',
    'oai-searchbot',
    'claudebot',
    'claude-web',
    'anthropic-ai',
    'perplexitybot',
    'bytespider',
    'ccbot',
    'google-extended',
    'cohere-ai',
    'applebot-extended',
    'meta-externalagent',
  ];
  return botPatterns.some((pat) => ua.includes(pat));
}

function signChallengePayload(payloadObj: Record<string, unknown>): string {
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getChallengeSecret())
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sig}`;
}

function verifySignedToken<T extends Record<string, unknown>>(token: string): T | null {
  const parts = (token || '').split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;
  const expectedSig = crypto
    .createHmac('sha256', getChallengeSecret())
    .update(payloadB64)
    .digest();
  let actualSig: Buffer;
  try {
    actualSig = Buffer.from(sigB64, 'base64url');
  } catch {
    return null;
  }
  if (actualSig.length !== expectedSig.length || !crypto.timingSafeEqual(actualSig, expectedSig)) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

export function issueHumanChallenge(
  req: Request
): { ok: true; challengeId: string; prompt: string; token: string; minSubmitMs: number } | { ok: false; status: number; error: string } {
  const ua = req.get('user-agent') || '';
  if (isAutomatedUserAgent(ua)) {
    return {
      ok: false,
      status: 403,
      error: 'Automated browsers, scripts, and AI agents are not permitted to create accounts.',
    };
  }

  const ip = getClientIp(req);
  const now = Date.now();
  const windowStart = now - 15 * 60_000;
  const recent = (challengeIssueBuckets.get(ip) || []).filter((ts) => ts > windowStart);
  if (recent.length >= 25) {
    return {
      ok: false,
      status: 429,
      error: 'Too many verification attempts. Please wait a few minutes and try again.',
    };
  }
  recent.push(now);
  challengeIssueBuckets.set(ip, recent);

  const a = 4 + crypto.randomInt(0, 14);
  const b = 2 + crypto.randomInt(0, 9);
  const useSubtraction = crypto.randomInt(0, 2) === 1 && a > b;
  const answer = useSubtraction ? a - b : a + b;
  const prompt = useSubtraction ? `What is ${a} − ${b}?` : `What is ${a} + ${b}?`;
  const nonce = crypto.randomBytes(12).toString('hex');
  const answerHash = crypto
    .createHmac('sha256', getChallengeSecret())
    .update(`${nonce}:${answer}`)
    .digest('hex');

  const token = signChallengePayload({
    kind: 'challenge',
    nonce,
    ipHash: hashIp(ip),
    answerHash,
    iat: now,
    exp: now + 5 * 60_000,
  });

  return {
    ok: true,
    challengeId: nonce,
    prompt,
    token,
    minSubmitMs: 1200,
  };
}

export function verifyHumanChallenge(
  req: Request,
  body: {
    token?: string;
    answer?: string | number;
    honeypot?: string;
    elapsedMs?: number;
    webdriverFlag?: boolean;
  }
): { ok: true; humanPassToken: string } | { ok: false; status: number; error: string } {
  const ua = req.get('user-agent') || '';
  if (isAutomatedUserAgent(ua) || body.webdriverFlag === true) {
    return {
      ok: false,
      status: 403,
      error: 'Automated browsers and AI agents are blocked from account creation.',
    };
  }

  if (typeof body.honeypot === 'string' && body.honeypot.trim().length > 0) {
    return {
      ok: false,
      status: 403,
      error: 'Bot-like form submission rejected.',
    };
  }

  if (typeof body.elapsedMs !== 'number' || !Number.isFinite(body.elapsedMs) || body.elapsedMs < 900) {
    return {
      ok: false,
      status: 400,
      error: 'Verification submitted too quickly. Please complete the human check naturally.',
    };
  }

  const parsed = verifySignedToken<{
    kind?: string;
    nonce?: string;
    ipHash?: string;
    answerHash?: string;
    exp?: number;
  }>(String(body.token || ''));

  if (!parsed || parsed.kind !== 'challenge' || !parsed.nonce || typeof parsed.answerHash !== 'string') {
    return {
      ok: false,
      status: 400,
      error: 'Verification challenge expired or invalid. Please refresh the challenge.',
    };
  }

  const now = Date.now();
  if (typeof parsed.exp !== 'number' || now > parsed.exp) {
    return {
      ok: false,
      status: 400,
      error: 'Verification challenge expired. Please try the new question.',
    };
  }

  const ip = getClientIp(req);
  if (parsed.ipHash !== hashIp(ip)) {
    return {
      ok: false,
      status: 403,
      error: 'Verification session mismatch. Please refresh the challenge.',
    };
  }

  if (usedChallengeNonces.has(parsed.nonce)) {
    return {
      ok: false,
      status: 400,
      error: 'This verification challenge has already been used. Please request a new one.',
    };
  }

  const numericAnswer = Number(String(body.answer ?? '').trim());
  if (!Number.isFinite(numericAnswer)) {
    return {
      ok: false,
      status: 400,
      error: 'Incorrect human verification answer. Please try again.',
    };
  }

  const expectedAnswerHash = crypto
    .createHmac('sha256', getChallengeSecret())
    .update(`${parsed.nonce}:${numericAnswer}`)
    .digest();
  let actualAnswerHash: Buffer;
  try {
    actualAnswerHash = Buffer.from(parsed.answerHash, 'hex');
  } catch {
    actualAnswerHash = Buffer.alloc(0);
  }
  if (
    actualAnswerHash.length !== expectedAnswerHash.length ||
    !crypto.timingSafeEqual(actualAnswerHash, expectedAnswerHash)
  ) {
    return {
      ok: false,
      status: 400,
      error: 'Incorrect human verification answer. Please try again.',
    };
  }

  usedChallengeNonces.set(parsed.nonce, parsed.exp);
  if (usedChallengeNonces.size > 2000) {
    for (const [k, exp] of usedChallengeNonces.entries()) {
      if (exp <= now) usedChallengeNonces.delete(k);
    }
  }

  const humanPassToken = signChallengePayload({
    kind: 'human_pass',
    nonce: crypto.randomBytes(10).toString('hex'),
    ipHash: hashIp(ip),
    iat: now,
    exp: now + 10 * 60_000,
  });

  return { ok: true, humanPassToken };
}

