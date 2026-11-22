# Security Summary

**Reviewed Files**: 14 (`server.ts`, `serverApp.ts`, `serverRateLimit.ts`, `firestore.rules`, `vercel.json`, `vite.config.ts`, `src/lib/pageDefaults.ts`, `src/lib/firebase.ts`, `src/lib/adminStore.ts`, `src/lib/libraryStore.ts`, `src/components/AuthModal.tsx`, `src/components/VideoLibraryList.tsx`, `src/components/VideoInspector.tsx`, `src/components/SitePageView.tsx`)
**Issues Resolved**: 6

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Predictable Human-Check Challenge | `serverRateLimit.ts` | 663 | The signup challenge token embedded the math answer in base64url JSON, allowing a script to decode the payload and read the answer directly. | High | Fixed | Replaced the plaintext `answer` field with an HMAC-SHA256 `answerHash` keyed with the server secret and per-challenge cryptographic nonce, verified via `crypto.timingSafeEqual`. |
| Unauthenticated Cache Invalidation | `serverApp.ts` | 1238 | `POST /api/site-settings/invalidate` could be triggered without verifying administrator credentials. | Medium | Fixed | Added `verifyCallerIdentity` enforcement requiring `caller.tier === 'admin'` (returning HTTP `403` otherwise) and updated admin client calls to use `authorizedFetch`. |
| Broad CORS Wildcard Pattern | `serverApp.ts` | 1161 | CORS origin validation previously permitted any subdomain ending in `.vercel.app`. | Medium | Fixed | Restricted CORS to an explicit origin allowlist (`CORS_ORIGIN`, `APP_URL`, `VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL`, plus local dev ports in non-production). |
| Unvalidated Upload File Signatures | `serverApp.ts` | 1070 | Uploaded screenshots/clips were accepted based on client-provided metadata without strict magic-byte and allowlist validation. | Medium | Fixed | Added a strict image/media MIME allowlist (`normalizeAndValidateMimeType`) and binary header signature check (`hasValidImageMagicBytes`) rejecting spoofed uploads with HTTP `400`. |
| Client Challenge Payload Mismatch | `src/components/AuthModal.tsx` | 111 | Signup challenge UI read `data.question` instead of `data.prompt` and sent `webdriver` instead of `webdriverFlag`, preventing the prompt from displaying and bypassing the client `navigator.webdriver` flag check. | Medium | Fixed | Aligned `AuthModal.tsx` to read `data.prompt` and submit `webdriverFlag` so human checks render properly and automated browsers are blocked server-side. |
| Unsafe External Link Rendering | `src/components/VideoLibraryList.tsx` & `src/components/VideoInspector.tsx` | 226 / 531 | External item URLs and AI-extracted links needed uniform protocol filtering before binding to `<a href>` attributes. | Medium | Fixed | Enforced `sanitizeHttpUrl` (`http:` / `https:` only) across all item source links and extracted resource/product links. |
| API-Level Bot Account Protection | Firebase Console (App Check) | — | Automated scripts targeting Firebase Auth directly outside the web UI are additionally mitigated when Firebase App Check is enabled on the project. | Medium | Needs Follow-Up | Client/server human-check gating is active on the app signup UI; enable Firebase App Check (reCAPTCHA v3 / Enterprise) in Firebase Console for platform-level Auth/Firestore token enforcement. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| API Keys & Secrets | `serverApp.ts` | `GEMINI_API_KEY` and challenge HMAC keys remain exclusively in server-side `process.env` and are never shipped to browser bundles. |
| Firestore Access & Privilege Boundaries | `firestore.rules` | Default-deny root rule, strict field allowlists, owner-scoped subcollections, and server-side rule enforcement preventing non-admins from modifying `role`, `status`, `badgeIds`, `/pricingPlans`, `/badges`, or `/settings/site`. Verified clean with `npx eslint firestore.rules` (exit 0) and deployed live. |
| SSRF Protection | `serverRateLimit.ts` | `isSafePublicHttpUrl` restricts URL fetching to `http:`/`https:` and blocks loopback, localhost, link-local metadata (`169.254.169.254`), and private IPv4/IPv6 ranges before `fetchPlatformMetadata` or AI grounding runs. |
| Security Headers & Transport | `serverApp.ts`, `vercel.json` | Sets `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin-allow-popups`, conditional `Strict-Transport-Security`, and disables `X-Powered-By` while preserving iframe preview compatibility. |
| Rate Limiting & Abuse Controls | `serverRateLimit.ts` | Enforces per-IP general API rate limits (120 req/min), per-tier daily & per-minute AI quotas, duplicate submission cooldowns, and single-use cryptographic nonces on verification challenges. |
| Safe Rendering | `src/` | Zero uses of `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `document.write`, or `eval`; all dynamic values render via React text bindings. |
| Dependencies | `package.json`, `bun.lock` | `bun audit` reported 4 transitive advisories (`@grpc/grpc-js` inside `firebase`, `glob`/`minimatch` inside `vite-plugin-pwa`/`eslint`), with zero advisories in custom server/client code and clean `npm run lint` (`tsc --noEmit`) and `npm run build` (`vite build`). |

---

## PoC Verification

### 1. Predictable Human-Check Challenge & Bot/Replay Bypass Prevention

#### Summary
| Field | Value |
|---|---|
| Issue Type | Challenge Token Answer Exposure & Automated Signup Bypass |
| Impact | High |
| Affected File | `serverRateLimit.ts:657-784` & `src/components/AuthModal.tsx:111-162` |
| Test Scenario | Fetch challenge as `GPTBot/1.0` and `curl`, decode token payload as a standard browser UA, replay the same nonce twice, submit `<900ms`, and submit with `webdriverFlag: true` / filled `honeypot`. |

#### How It Was Fixed
`issueHumanChallenge` computes an HMAC-SHA256 `answerHash` over `${nonce}:${answer}` using the server secret instead of embedding the answer in cleartext JSON, and `verifyHumanChallenge` tracks consumed `nonce` values, enforces minimum human completion time (`>= 900ms`), checks IP HMAC parity, rejects automated user agents/`webdriverFlag`/`honeypot`, and verifies `answerHash` with constant-time comparison.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | `GET /api/auth/challenge` with `GPTBot/1.0` or default `curl` UA reaches `issueHumanChallenge` at `serverRateLimit.ts:635` | Blocked with HTTP `403` |
| 2 | `GET /api/auth/challenge` with standard browser UA returns signed token; base64url decoding `token.split('.')[0]` reveals only `nonce`, `ipHash`, and HMAC `answerHash` | Plaintext answer absent |
| 3 | `POST /api/auth/verify-human` with `honeypot: "https://bot.spam"` or `webdriverFlag: true` hits `serverRateLimit.ts:693-707` | Blocked with HTTP `403` |
| 4 | `POST /api/auth/verify-human` with `elapsedMs: 200` or wrong answer hits `serverRateLimit.ts:709-779` | Blocked with HTTP `400` |
| 5 | Valid human answer succeeds with HTTP `200`, then immediate replay of the same `token` hits `usedChallengeNonces.has(parsed.nonce)` at `serverRateLimit.ts:751` | Replay blocked with HTTP `400` |

#### Conclusion
**Fix Verified** - Automated scrapers, bots, and replay scripts can no longer extract the challenge answer or reuse verification tokens.

---

### 2. Unauthenticated Admin Cache Invalidation (`POST /api/site-settings/invalidate`)

#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Administrator Authorization Check |
| Impact | Medium |
| Affected File | `serverApp.ts:1238-1248` |
| Test Scenario | `curl -X POST http://localhost:3000/api/site-settings/invalidate` without a Bearer token |

#### How It Was Fixed
`serverApp.ts:1240-1244` verifies the Firebase ID token via `verifyCallerIdentity` and rejects any caller where `caller.tier !== 'admin'` with HTTP `403`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Unauthenticated `POST /api/site-settings/invalidate` enters handler at `serverApp.ts:1238` | Enters route |
| 2 | `verifyCallerIdentity(req, cfg.projectId)` inspects `Authorization` header (`serverRateLimit.ts:70`) | Returns `tier: 'guest'` |
| 3 | `if (caller.tier !== 'admin')` triggers at `serverApp.ts:1241` | Returns HTTP `403` (`Administrator verification required.`) |

#### Conclusion
**Fix Verified** - Only verified administrators can clear server-side metadata caches.

---

### 3. Untrusted CORS Origin & Spoofed Upload / SSRF Validation

#### Summary
| Field | Value |
|---|---|
| Issue Type | Broad CORS Origin & Spoofed File Upload / SSRF Filtering |
| Impact | Medium |
| Affected File | `serverApp.ts:1070-1185` & `serverApp.ts:1423-1465` |
| Test Scenario | `OPTIONS /api/health` with `Origin: https://evil.vercel.app`; `POST /api/analyze-video` with `text/html` MIME, spoofed `image/png` script bytes, and `http://169.254.169.254/latest/meta-data/` |

#### How It Was Fixed
Removed wildcard `.endsWith('.vercel.app')` matching from CORS middleware and added MIME allowlisting, image magic-byte verification, and `isSafePublicHttpUrl` checks before processing URLs or calling Gemini.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | `OPTIONS /api/health` with `Origin: https://evil.vercel.app` is evaluated against `resolveAllowedOrigins()` at `serverApp.ts:1169` | Returns `204` with **no** `Access-Control-Allow-Origin` header |
| 2 | `POST /api/analyze-video` with `mimeType: "text/html"` fails `normalizeAndValidateMimeType` at `serverApp.ts:1425` | Blocked with HTTP `400` |
| 3 | `POST /api/analyze-video` with `mimeType: "image/png"` and HTML script bytes fails `hasValidImageMagicBytes` at `serverApp.ts:1434` | Blocked with HTTP `400` |
| 4 | `POST /api/analyze-video` with `http://169.254.169.254/latest/meta-data/` fails `isSafePublicHttpUrl` at `serverApp.ts:1461` | Blocked with HTTP `400` |

#### Conclusion
**Fix Verified** - Cross-origin abuse from arbitrary subdomains, spoofed file uploads, and metadata SSRF payloads are rejected before reaching AI or outbound fetch logic.
