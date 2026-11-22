# Firestore Security Specification (ClipIndex)

## 1. Data Invariants
1. **Strict Ownership & Admin RBAC**:
   - Standard users may only access their own `/users/{userId}`, `/users/{userId}/private/info`, `/users/{userId}/collections/{collectionId}`, and `/users/{userId}/videos/{videoId}` documents where `request.auth.uid == userId` and `request.auth.token.email_verified == true`.
   - Administrators (`isAdmin()`, verified email `zotomic.com@gmail.com` or `exists(/databases/$(database)/documents/admins/$(request.auth.uid))` with `email_verified == true`) may list/read/create/update/delete `/users/{userId}` and `/users/{userId}/private/info`, inspect user videos/collections, manage `/admins/{userId}`, and manage `/pages/{pageId}`.
2. **Prevent Self-Assigned Privilege Escalation**:
   - On `/users/{userId}` create by a non-admin, `role` MUST be `'user'` and `status` MUST be `'active'`.
   - On `/users/{userId}` update by a non-admin, `role` and `status` MUST NOT change (`affectedKeys().hasOnly(['displayName', 'photoURL', 'bio', 'organization', 'location', 'videoCount', 'updatedAt'])`).
   - Non-admins CANNOT write to `/admins/{userId}` or `adminNotes` in `/users/{userId}/private/info`.
3. **PII Isolation (Split Collection)**:
   - User `email`, `phone`, `address`, and `adminNotes` live strictly in `/users/{userId}/private/info`, readable/writable only by the owner (excluding `adminNotes` writes) or an verified Admin. No blanket `isSignedIn()` reads exist anywhere.
4. **Published vs Draft Pages**:
   - `/pages/{pageId}` allows `get` and `list` for published pages (`resource.data.isPublished == true`) or Admins (`isAdmin()`). Writes (`create`, `update`, `delete`) require `isAdmin()`.
5. **Site Branding, SEO Metadata & Verification (`/settings/site`)**:
   - `/settings/site` allows public `get` (not `list`) so visitors and search engine crawlers can read brand title, logo, favicon, meta tags, and Google Search Console verification tokens. No API keys or secrets may ever be stored in `/settings/site`.
   - `create`, `update`, and `delete` on `/settings/site` require `isAdmin()` with strict field schema, regex guards on verification tokens/filenames, and `request.time` timestamp validation.
6. **Temporal & Structural Integrity**:
   - All `createdAt` must equal `request.time` on create and remain immutable on update; `updatedAt` must equal `request.time` on create and update.
   - All string fields enforce `.size()` bounds and all arrays (`blocks`, `tags`, `segments`, `transcript`, `tldrBullets`) enforce max length and element type checks.

## 2. Dirty Dozen Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Self-Admin Escalation on Signup**: Standard user `u1` creates `/users/u1` with `role: 'admin'`.
2. **Self-Status Unsuspension**: Suspended user `u1` updates `/users/u1` changing `status: 'active'`.
3. **Admin Grant Forgery**: Standard user `u1` writes `/admins/u1` granting themselves admin privileges.
4. **Unverified Admin Email Spoof**: User with `token.email == 'zotomic.com@gmail.com'` and `token.email_verified == false` attempts admin `list` on `/users`.
5. **Cross-Tenant PII Read**: Standard user `u2` reads `/users/u1/private/info`.
6. **Non-Admin User Directory Scrape**: Standard user `u1` calls `list` on `/users`.
7. **User Writing Own Admin Notes**: Standard user `u1` writes `adminNotes` inside `/users/u1/private/info`.
8. **Non-Admin Page Defacement**: Standard user `u1` attempts to update `/pages/terms-of-service`.
9. **Unpublished Draft Leak**: Standard user `u1` attempts to read `/pages/draft-policy` where `isPublished == false`.
10. **Shadow Ghost Field Injection**: User or admin sends unknown field `secretFlag: true` on `/users/{uid}` or `/pages/{pageId}`.
11. **Block Array Exhaustion**: Admin attempts to save `/pages/custom` with > 40 blocks or non-map element.
12. **Client-Forged Timestamp**: User creates `/users/u1` with client timestamp instead of `request.time`.
