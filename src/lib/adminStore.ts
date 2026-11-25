import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import type {
  AiBrainDepth,
  AnalyzedVideo,
  CheckoutFieldConfig,
  FullUserRecord,
  HomepageContent,
  NavLinkActionType,
  NavLinkItem,
  PageBlock,
  PageType,
  PricingPlan,
  PricingPlanInput,
  SitePage,
  SiteSettings,
  UserBadge,
  UserBadgeColor,
  UserBadgeInput,
  UserPlanStatus,
  UserPrivateRecord,
  UserProfileRecord,
  UserRole,
  UserStatus,
} from '../types/video';
import { db, handleFirestoreError, OperationType } from './firebase';
import { authorizedFetch } from './apiClient';
import {
  DEFAULT_HOMEPAGE_CONTENT,
  sanitizeHomepageContent,
  sanitizeImageRef,
} from './homepageDefaults';
import { dataUrlToMime } from './imageUtils';
import { toMillis } from './libraryStore';
import { DEFAULT_SITE_PAGES, sanitizeHttpUrl } from './pageDefaults';
import { generateSafeId } from './videoUtils';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'zotomic.com@gmail.com';

export const DEFAULT_HEADER_LINKS: NavLinkItem[] = [
  {
    id: 'nav-library',
    label: 'Library',
    actionType: 'view',
    target: 'library',
    visible: true,
    sortOrder: 0,
  },
  {
    id: 'nav-pricing',
    label: 'Pricing',
    actionType: 'view',
    target: 'pricing',
    visible: true,
    sortOrder: 1,
  },
];

export const DEFAULT_FOOTER_LINKS: NavLinkItem[] = [
  {
    id: 'ftr-pricing',
    label: 'Pricing',
    actionType: 'view',
    target: 'pricing',
    visible: true,
    sortOrder: 0,
  },
  {
    id: 'ftr-terms',
    label: 'Terms of Service',
    actionType: 'page',
    target: 'terms-of-service',
    visible: true,
    sortOrder: 1,
  },
  {
    id: 'ftr-privacy',
    label: 'Privacy Policy',
    actionType: 'page',
    target: 'privacy-policy',
    visible: true,
    sortOrder: 2,
  },
];

export const DEFAULT_CHECKOUT_FIELDS: CheckoutFieldConfig[] = [
  {
    id: 'fld-company',
    label: 'Company / Brand Name (Optional)',
    placeholder: 'e.g. Zotomic Studio',
    required: false,
    visible: true,
  },
  {
    id: 'fld-billing-note',
    label: 'Billing Note / WhatsApp Contact',
    placeholder: 'Optional phone or note for faster verification',
    required: false,
    visible: true,
  },
];

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  id: 'site',
  siteName: 'ClipIndex',
  tagline: 'Video Timestamps, Summaries & Searchable Library',
  logoUrl: '',
  faviconUrl: '',
  appleTouchIconUrl: '',
  pwaIcon192Url: '',
  pwaIcon512Url: '',
  pwaMaskableIconUrl: '',
  metaTitle: 'ClipIndex — Video Timestamps, Summaries & Searchable Library',
  metaDescription:
    'Extract timestamped segments, AI summaries, transcripts, and searchable tags from shared YouTube, TikTok, Instagram, and Facebook videos.',
  ogImageUrl: '',
  canonicalUrl: '',
  googleSiteVerification: '',
  googleHtmlFileName: '',
  googleHtmlFileContent: '',
  aiDefaultDepth: 'fast',
  aiDefaultLanguage: 'English',
  aiCustomInstruction: '',
  socialLoginEnabled: true,
  googleLoginEnabled: true,
  facebookLoginEnabled: false,
  facebookAppId: '',
  pricingEnabled: true,
  headerLinks: DEFAULT_HEADER_LINKS,
  footerLinks: DEFAULT_FOOTER_LINKS,
  footerText: '',
  checkoutEnabled: true,
  checkoutTitle: 'Complete Your Plan Checkout',
  checkoutSubtitle:
    'Choose your preferred payment method below. Paid plans and badges activate as soon as payment is confirmed.',
  checkoutCurrency: 'USD',
  checkoutTaxPercent: 0,
  checkoutNotice:
    'After transferring via Bank, bKash, Nagad, or Crypto, enter your Transaction Reference ID to generate an invoice for verification.',
  checkoutCustomFields: DEFAULT_CHECKOUT_FIELDS,
  updatedBy: 'system',
  createdAtMs: 0,
  updatedAtMs: 0,
};

export const DEFAULT_PRICING_PLANS: PricingPlan[] = [
  {
    id: 'starter',
    name: 'Starter Free',
    tagline: 'For personal bookmarks, screenshots, and video highlights.',
    monthlyPrice: 0,
    yearlyMonthlyPrice: 0,
    highlighted: false,
    badge: '',
    autoBadgeId: 'badge-starter',
    ctaLabel: 'Start Free',
    features: [
      '15 AI analyses per day',
      '30 Ask AI questions per day',
      'Videos, Screenshots (OCR), & Web/Product Links',
      'Extracted links tab & "Why I saved this" notes',
      'Private on-device media storage',
      'Up to 3 Groups / Collections',
    ],
    sortOrder: 0,
    updatedBy: 'system',
    createdAtMs: 0,
    updatedAtMs: 0,
  },
  {
    id: 'pro',
    name: 'Pro Library',
    tagline: 'Recommended for heavy researchers, shoppers & creators.',
    monthlyPrice: 7,
    yearlyMonthlyPrice: 5.5,
    highlighted: true,
    badge: 'Best Value',
    autoBadgeId: 'badge-pro',
    ctaLabel: 'Choose Pro',
    features: [
      '500 AI analyses per month (up to 40/day)',
      '1,000 Ask AI questions per month',
      'Balanced deeper extraction mode',
      'Unlimited Groups / Collections & custom tags',
      'Up to 20 MB local video clip inspection',
      'Full Markdown, Chapter & Link exports',
    ],
    sortOrder: 1,
    updatedBy: 'system',
    createdAtMs: 0,
    updatedAtMs: 0,
  },
  {
    id: 'team',
    name: 'Power / Team',
    tagline: 'For power curators, agencies & shared knowledge bases.',
    monthlyPrice: 19,
    yearlyMonthlyPrice: 15,
    highlighted: false,
    badge: '',
    autoBadgeId: 'badge-team',
    ctaLabel: 'Choose Power',
    features: [
      '2,000 AI analyses per month',
      'Unlimited Ask AI Q&A (fair-use)',
      'Custom workspace extraction instructions',
      'Priority queue & fast throughput',
      'Cross-device cloud link sync + local cache tools',
      'Priority email support',
    ],
    sortOrder: 2,
    updatedBy: 'system',
    createdAtMs: 0,
    updatedAtMs: 0,
  },
];

export function extractGoogleVerificationToken(rawInput: string): string {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) return '';
  const metaMatch = trimmed.match(/content\s*=\s*["']([^"']+)["']/i);
  const candidate = metaMatch?.[1]?.trim() || trimmed;
  return candidate.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
}

export function normalizeGoogleHtmlFilename(rawInput: string): string {
  const trimmed = (rawInput || '').trim().replace(/^\/+/, '');
  if (!trimmed) return '';
  return /^google[a-zA-Z0-9]+\.html$/.test(trimmed) ? trimmed.slice(0, 80) : '';
}

export async function checkUserIsAdmin(user: User | null): Promise<boolean> {
  if (!user || !user.emailVerified) return false;
  if (user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL) return true;
  try {
    const snap = await getDoc(doc(db, 'admins', user.uid));
    return snap.exists();
  } catch {
    return false;
  }
}

function mapUserProfileDoc(id: string, d: Record<string, unknown>): UserProfileRecord {
  const rawPlanStatus = String(d.planStatus || 'none');
  const planStatus: UserPlanStatus =
    rawPlanStatus === 'active' || rawPlanStatus === 'due' || rawPlanStatus === 'expired'
      ? rawPlanStatus
      : 'none';
  return {
    uid: String(d.uid || id),
    displayName: String(d.displayName || 'Unnamed User'),
    photoURL: d.photoURL ? String(d.photoURL) : undefined,
    role: d.role === 'admin' ? 'admin' : 'user',
    status: d.status === 'suspended' || d.status === 'pending' ? d.status : 'active',
    bio: String(d.bio || ''),
    organization: String(d.organization || ''),
    location: String(d.location || ''),
    videoCount: typeof d.videoCount === 'number' ? d.videoCount : 0,
    badgeIds: Array.isArray(d.badgeIds) ? d.badgeIds.map(String).slice(0, 10) : [],
    activePlanId: d.activePlanId ? String(d.activePlanId) : '',
    planStatus,
    planExpiresAtMs: typeof d.planExpiresAtMs === 'number' ? d.planExpiresAtMs : 0,
    createdAtMs: toMillis(d.createdAt),
    updatedAtMs: toMillis(d.updatedAt),
  };
}

function mapSitePageDoc(id: string, d: Record<string, unknown>): SitePage {
  const rawBlocks = Array.isArray(d.blocks) ? d.blocks : [];
  const blocks: PageBlock[] = rawBlocks.slice(0, 40).map((b, idx) => {
    const obj = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
    const rawType = String(obj.type || 'text');
    const type =
      rawType === 'heading' || rawType === 'image' || rawType === 'video' ? rawType : 'text';
    return {
      id: String(obj.id || `blk_${idx}`),
      type,
      ...(obj.heading ? { heading: String(obj.heading) } : {}),
      ...(obj.content ? { content: String(obj.content) } : {}),
      ...(obj.mediaUrl ? { mediaUrl: sanitizeHttpUrl(String(obj.mediaUrl)) } : {}),
      ...(obj.caption ? { caption: String(obj.caption) } : {}),
    };
  });

  const rawPageType = String(d.pageType || 'custom');
  const pageType: PageType =
    rawPageType === 'legal' || rawPageType === 'guide' ? rawPageType : 'custom';

  return {
    id: String(d.id || id),
    slug: String(d.slug || id),
    title: String(d.title || 'Untitled Page'),
    subtitle: String(d.subtitle || ''),
    pageType,
    isPublished: Boolean(d.isPublished),
    blocks,
    updatedBy: String(d.updatedBy || 'system'),
    createdAtMs: toMillis(d.createdAt),
    updatedAtMs: toMillis(d.updatedAt),
  };
}

export function subscribeAllUsersAdmin(
  onData: (users: UserProfileRecord[]) => void
): () => void {
  const path = 'users';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const list = snapshot.docs
        .map((d) => mapUserProfileDoc(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export async function fetchUserFullDetailsAdmin(uid: string): Promise<{
  record: FullUserRecord | null;
  videos: AnalyzedVideo[];
}> {
  const userPath = `users/${uid}`;
  const privatePath = `users/${uid}/private/info`;
  const videosPath = `users/${uid}/videos`;

  try {
    const [profileSnap, privateSnap, videosSnap] = await Promise.all([
      getDoc(doc(db, userPath)),
      getDoc(doc(db, privatePath)),
      getDocs(collection(db, videosPath)),
    ]);

    if (!profileSnap.exists()) {
      return { record: null, videos: [] };
    }

    const profile = mapUserProfileDoc(
      profileSnap.id,
      profileSnap.data() as Record<string, unknown>
    );

    let privateInfo: UserPrivateRecord | null = null;
    if (privateSnap.exists()) {
      const p = privateSnap.data();
      privateInfo = {
        uid: String(p.uid || uid),
        email: String(p.email || ''),
        phone: String(p.phone || ''),
        address: String(p.address || ''),
        adminNotes: String(p.adminNotes || ''),
        createdAtMs: toMillis(p.createdAt),
        updatedAtMs: toMillis(p.updatedAt),
      };
    }

    const videos: AnalyzedVideo[] = videosSnap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: String(data.id || d.id),
          ownerId: String(data.ownerId || uid),
          url: String(data.url || ''),
          platform: data.platform || 'other',
          title: String(data.title || 'Untitled'),
          creator: String(data.creator || ''),
          thumbnailUrl: String(data.thumbnailUrl || ''),
          durationLabel: String(data.durationLabel || '—'),
          category: String(data.category || 'General'),
          collectionId: String(data.collectionId || ''),
          isFavorite: Boolean(data.isFavorite),
          summary: String(data.summary || ''),
          tldrBullets: Array.isArray(data.tldrBullets) ? data.tldrBullets : [],
          tags: Array.isArray(data.tags) ? data.tags : [],
          segments: Array.isArray(data.segments) ? data.segments : [],
          transcript: Array.isArray(data.transcript) ? data.transcript : [],
          notes: String(data.notes || ''),
          createdAtMs: toMillis(data.createdAt),
          updatedAtMs: toMillis(data.updatedAt),
        };
      })
      .sort((a, b) => b.createdAtMs - a.createdAtMs);

    return {
      record: { profile, privateInfo },
      videos,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, userPath);
  }
}

export interface AdminUserFormPayload {
  displayName: string;
  email: string;
  phone: string;
  address: string;
  organization: string;
  location: string;
  bio: string;
  role: UserRole;
  status: UserStatus;
  adminNotes: string;
  badgeIds: string[];
}

export async function adminCreateUser(
  adminUid: string,
  payload: AdminUserFormPayload
): Promise<string> {
  const newUid = generateSafeId('usr');
  const userPath = `users/${newUid}`;
  const privatePath = `users/${newUid}/private/info`;
  const cleanBadgeIds = Array.from(
    new Set((payload.badgeIds || []).map((id) => String(id).trim()).filter(Boolean))
  ).slice(0, 10);

  try {
    await setDoc(doc(db, userPath), {
      uid: newUid,
      displayName: payload.displayName.trim().slice(0, 120),
      role: payload.role,
      status: payload.status,
      bio: payload.bio.trim().slice(0, 500),
      organization: payload.organization.trim().slice(0, 120),
      location: payload.location.trim().slice(0, 120),
      videoCount: 0,
      badgeIds: cleanBadgeIds,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await setDoc(doc(db, privatePath), {
      uid: newUid,
      email: payload.email.trim().slice(0, 254),
      phone: payload.phone.trim().slice(0, 40),
      address: payload.address.trim().slice(0, 300),
      adminNotes: payload.adminNotes.trim().slice(0, 2000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (payload.role === 'admin') {
      await setDoc(doc(db, `admins/${newUid}`), {
        uid: newUid,
        grantedBy: adminUid,
        createdAt: serverTimestamp(),
      });
    }
    return newUid;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, userPath);
  }
}

export async function adminUpdateUser(
  adminUid: string,
  targetUid: string,
  payload: AdminUserFormPayload
): Promise<void> {
  const userPath = `users/${targetUid}`;
  const privatePath = `users/${targetUid}/private/info`;
  const cleanBadgeIds = Array.from(
    new Set((payload.badgeIds || []).map((id) => String(id).trim()).filter(Boolean))
  ).slice(0, 10);

  try {
    await updateDoc(doc(db, userPath), {
      displayName: payload.displayName.trim().slice(0, 120),
      role: payload.role,
      status: payload.status,
      bio: payload.bio.trim().slice(0, 500),
      organization: payload.organization.trim().slice(0, 120),
      location: payload.location.trim().slice(0, 120),
      badgeIds: cleanBadgeIds,
      updatedAt: serverTimestamp(),
    });

    const privateRef = doc(db, privatePath);
    const privateSnap = await getDoc(privateRef);
    if (!privateSnap.exists()) {
      await setDoc(privateRef, {
        uid: targetUid,
        email: payload.email.trim().slice(0, 254),
        phone: payload.phone.trim().slice(0, 40),
        address: payload.address.trim().slice(0, 300),
        adminNotes: payload.adminNotes.trim().slice(0, 2000),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(privateRef, {
        email: payload.email.trim().slice(0, 254),
        phone: payload.phone.trim().slice(0, 40),
        address: payload.address.trim().slice(0, 300),
        adminNotes: payload.adminNotes.trim().slice(0, 2000),
        updatedAt: serverTimestamp(),
      });
    }

    const adminGrantRef = doc(db, `admins/${targetUid}`);
    const grantSnap = await getDoc(adminGrantRef);
    if (payload.role === 'admin' && !grantSnap.exists()) {
      await setDoc(adminGrantRef, {
        uid: targetUid,
        grantedBy: adminUid,
        createdAt: serverTimestamp(),
      });
    } else if (payload.role === 'user' && grantSnap.exists()) {
      await deleteDoc(adminGrantRef);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, userPath);
  }
}

export async function adminDeleteUser(targetUid: string): Promise<void> {
  const userPath = `users/${targetUid}`;
  try {
    const privateRef = doc(db, `users/${targetUid}/private/info`);
    const privateSnap = await getDoc(privateRef);
    if (privateSnap.exists()) {
      await deleteDoc(privateRef);
    }

    const grantRef = doc(db, `admins/${targetUid}`);
    const grantSnap = await getDoc(grantRef);
    if (grantSnap.exists()) {
      await deleteDoc(grantRef);
    }

    await deleteDoc(doc(db, userPath));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, userPath);
  }
}

export function subscribePublishedPages(onData: (pages: SitePage[]) => void): () => void {
  const path = 'pages';
  const q = query(collection(db, path), where('isPublished', '==', true));

  return onSnapshot(
    q,
    (snapshot) => {
      const pages = snapshot.docs
        .map((d) => mapSitePageDoc(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => a.title.localeCompare(b.title));
      onData(pages);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export function subscribeAllPagesAdmin(onData: (pages: SitePage[]) => void): () => void {
  const path = 'pages';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const pages = snapshot.docs
        .map((d) => mapSitePageDoc(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      onData(pages);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export async function saveSitePageAdmin(
  adminUid: string,
  pageInput: {
    id?: string;
    slug: string;
    title: string;
    subtitle: string;
    pageType: PageType;
    isPublished: boolean;
    blocks: PageBlock[];
  }
): Promise<string> {
  const cleanSlug = pageInput.slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);

  const pageId = (pageInput.id || cleanSlug || generateSafeId('page'))
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .slice(0, 128);

  const path = `pages/${pageId}`;
  const cleanBlocks = pageInput.blocks.slice(0, 40).map((b, idx) => ({
    id: (b.id || `blk_${idx}`).slice(0, 64),
    type: b.type,
    ...(b.heading ? { heading: b.heading.slice(0, 300) } : {}),
    ...(b.content ? { content: b.content.slice(0, 5000) } : {}),
    ...(b.mediaUrl ? { mediaUrl: sanitizeHttpUrl(b.mediaUrl).slice(0, 2048) } : {}),
    ...(b.caption ? { caption: b.caption.slice(0, 300) } : {}),
  }));

  try {
    const ref = doc(db, path);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        id: pageId,
        slug: cleanSlug || pageId.toLowerCase(),
        title: pageInput.title.trim().slice(0, 160),
        subtitle: pageInput.subtitle.trim().slice(0, 300),
        pageType: pageInput.pageType,
        isPublished: pageInput.isPublished,
        blocks: cleanBlocks,
        updatedBy: adminUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        slug: cleanSlug || pageId.toLowerCase(),
        title: pageInput.title.trim().slice(0, 160),
        subtitle: pageInput.subtitle.trim().slice(0, 300),
        pageType: pageInput.pageType,
        isPublished: pageInput.isPublished,
        blocks: cleanBlocks,
        updatedBy: adminUid,
        updatedAt: serverTimestamp(),
      });
    }
    return pageId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteSitePageAdmin(pageId: string): Promise<void> {
  const path = `pages/${pageId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function seedDefaultLegalPagesAdmin(adminUid: string): Promise<void> {
  for (const def of DEFAULT_SITE_PAGES) {
    const ref = doc(db, `pages/${def.id}`);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await saveSitePageAdmin(adminUid, {
        id: def.id,
        slug: def.slug,
        title: def.title,
        subtitle: def.subtitle,
        pageType: def.pageType,
        isPublished: true,
        blocks: def.blocks,
      });
    }
  }
}

function mapNavLinkList(
  raw: unknown,
  fallback: NavLinkItem[],
  maxLen: number
): NavLinkItem[] {
  if (!Array.isArray(raw)) return fallback;
  return raw.slice(0, maxLen).map((item, idx) => {
    const obj = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const rawType = String(obj.actionType || 'view');
    const actionType: NavLinkActionType =
      rawType === 'page' || rawType === 'url' || rawType === 'anchor' ? rawType : 'view';
    const rawTarget = String(obj.target || 'library').trim();
    const target = actionType === 'url' ? sanitizeHttpUrl(rawTarget) || 'https://' : rawTarget.slice(0, 200);
    return {
      id: String(obj.id || `nav_${idx}`).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64),
      label: String(obj.label || 'Link').trim().slice(0, 60),
      actionType,
      target,
      visible: typeof obj.visible === 'boolean' ? obj.visible : true,
      sortOrder: Number.isFinite(Number(obj.sortOrder)) ? Math.max(0, Math.floor(Number(obj.sortOrder))) : idx,
      openInNewTab: Boolean(obj.openInNewTab),
    };
  });
}

function mapCheckoutFieldsList(
  raw: unknown,
  fallback: CheckoutFieldConfig[]
): CheckoutFieldConfig[] {
  if (!Array.isArray(raw)) return fallback;
  return raw.slice(0, 15).map((item, idx) => {
    const obj = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    return {
      id: String(obj.id || `fld_${idx}`).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64),
      label: String(obj.label || 'Field').trim().slice(0, 100),
      placeholder: String(obj.placeholder || '').trim().slice(0, 160),
      required: Boolean(obj.required),
      visible: typeof obj.visible === 'boolean' ? obj.visible : true,
    };
  });
}

function mapSiteSettingsDoc(d: Record<string, unknown>): SiteSettings {
  const depth: AiBrainDepth = d.aiDefaultDepth === 'balanced' ? 'balanced' : 'fast';
  const fallbackSocial = typeof d.socialLoginEnabled === 'boolean' ? d.socialLoginEnabled : true;
  const googleLoginEnabled =
    typeof d.googleLoginEnabled === 'boolean' ? d.googleLoginEnabled : fallbackSocial;
  const facebookLoginEnabled =
    typeof d.facebookLoginEnabled === 'boolean' ? d.facebookLoginEnabled : false;

  return {
    id: 'site',
    siteName: String(d.siteName || DEFAULT_SITE_SETTINGS.siteName),
    tagline: String(d.tagline ?? DEFAULT_SITE_SETTINGS.tagline),
    logoUrl: sanitizeImageRef(String(d.logoUrl || '')),
    faviconUrl: sanitizeImageRef(String(d.faviconUrl || '')),
    appleTouchIconUrl: sanitizeImageRef(String(d.appleTouchIconUrl || '')),
    pwaIcon192Url: sanitizeImageRef(String(d.pwaIcon192Url || '')),
    pwaIcon512Url: sanitizeImageRef(String(d.pwaIcon512Url || '')),
    pwaMaskableIconUrl: sanitizeImageRef(String(d.pwaMaskableIconUrl || '')),
    metaTitle: String(d.metaTitle ?? DEFAULT_SITE_SETTINGS.metaTitle),
    metaDescription: String(d.metaDescription ?? DEFAULT_SITE_SETTINGS.metaDescription),
    ogImageUrl: sanitizeImageRef(String(d.ogImageUrl || '')),
    canonicalUrl: sanitizeHttpUrl(String(d.canonicalUrl || '')),
    googleSiteVerification: extractGoogleVerificationToken(String(d.googleSiteVerification || '')),
    googleHtmlFileName: normalizeGoogleHtmlFilename(String(d.googleHtmlFileName || '')),
    googleHtmlFileContent: String(d.googleHtmlFileContent || ''),
    aiDefaultDepth: depth,
    aiDefaultLanguage: String(d.aiDefaultLanguage || DEFAULT_SITE_SETTINGS.aiDefaultLanguage),
    aiCustomInstruction: String(d.aiCustomInstruction || ''),
    socialLoginEnabled: Boolean(googleLoginEnabled || facebookLoginEnabled),
    googleLoginEnabled,
    facebookLoginEnabled,
    facebookAppId: String(d.facebookAppId || '').replace(/[^0-9]/g, '').slice(0, 64),
    pricingEnabled: typeof d.pricingEnabled === 'boolean' ? d.pricingEnabled : true,
    headerLinks: mapNavLinkList(d.headerLinks, DEFAULT_HEADER_LINKS, 20),
    footerLinks: mapNavLinkList(d.footerLinks, DEFAULT_FOOTER_LINKS, 25),
    footerText: String(d.footerText ?? ''),
    checkoutEnabled: typeof d.checkoutEnabled === 'boolean' ? d.checkoutEnabled : true,
    checkoutTitle: String(d.checkoutTitle ?? DEFAULT_SITE_SETTINGS.checkoutTitle),
    checkoutSubtitle: String(d.checkoutSubtitle ?? DEFAULT_SITE_SETTINGS.checkoutSubtitle),
    checkoutCurrency: String(d.checkoutCurrency || DEFAULT_SITE_SETTINGS.checkoutCurrency),
    checkoutTaxPercent: Number.isFinite(Number(d.checkoutTaxPercent))
      ? Math.min(100, Math.max(0, Number(d.checkoutTaxPercent)))
      : 0,
    checkoutNotice: String(d.checkoutNotice ?? DEFAULT_SITE_SETTINGS.checkoutNotice),
    checkoutCustomFields: mapCheckoutFieldsList(d.checkoutCustomFields, DEFAULT_CHECKOUT_FIELDS),
    updatedBy: String(d.updatedBy || 'system'),
    createdAtMs: toMillis(d.createdAt),
    updatedAtMs: toMillis(d.updatedAt),
  };
}

export function subscribeSiteSettings(onData: (settings: SiteSettings) => void): () => void {
  const path = 'settings/site';
  return onSnapshot(
    doc(db, path),
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(DEFAULT_SITE_SETTINGS);
        return;
      }
      onData(mapSiteSettingsDoc(snapshot.data() as Record<string, unknown>));
    },
    () => {
      onData(DEFAULT_SITE_SETTINGS);
    }
  );
}

export interface SiteSettingsInput {
  siteName: string;
  tagline: string;
  logoUrl: string;
  faviconUrl: string;
  appleTouchIconUrl?: string;
  pwaIcon192Url?: string;
  pwaIcon512Url?: string;
  pwaMaskableIconUrl?: string;
  metaTitle: string;
  metaDescription: string;
  ogImageUrl: string;
  canonicalUrl: string;
  googleSiteVerification: string;
  googleHtmlFileName: string;
  googleHtmlFileContent: string;
  aiDefaultDepth: AiBrainDepth;
  aiDefaultLanguage: string;
  aiCustomInstruction: string;
  socialLoginEnabled: boolean;
  googleLoginEnabled: boolean;
  facebookLoginEnabled: boolean;
  facebookAppId: string;
  pricingEnabled: boolean;
  headerLinks?: NavLinkItem[];
  footerLinks?: NavLinkItem[];
  footerText?: string;
  checkoutEnabled?: boolean;
  checkoutTitle?: string;
  checkoutSubtitle?: string;
  checkoutCurrency?: string;
  checkoutTaxPercent?: number;
  checkoutNotice?: string;
  checkoutCustomFields?: CheckoutFieldConfig[];
}

function sanitizeNavLinksForWrite(links: NavLinkItem[] | undefined, maxLen: number): NavLinkItem[] {
  if (!Array.isArray(links)) return [];
  const seen = new Set<string>();
  const cleaned: NavLinkItem[] = [];
  for (const item of links.slice(0, maxLen)) {
    const entry: NavLinkItem = {
      id: (item.id || `nav_${cleaned.length}`).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64),
      label: (item.label || 'Link').trim().slice(0, 60),
      actionType:
        item.actionType === 'page' || item.actionType === 'url' || item.actionType === 'anchor'
          ? item.actionType
          : 'view',
      target:
        item.actionType === 'url'
          ? sanitizeHttpUrl(item.target).slice(0, 400) || 'https://example.com'
          : String(item.target || 'library').trim().slice(0, 200),
      visible: Boolean(item.visible),
      sortOrder: cleaned.length,
      openInNewTab: Boolean(item.openInNewTab),
    };
    // Keep only the first entry per destination so the header/footer never
    // render duplicate Library/Pricing items.
    const key = `${entry.actionType}:${entry.target.toLowerCase().replace(/\/+$/, '')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(entry);
  }
  return cleaned;
}

function sanitizeCheckoutFieldsForWrite(fields: CheckoutFieldConfig[] | undefined): CheckoutFieldConfig[] {
  if (!Array.isArray(fields)) return [];
  return fields.slice(0, 15).map((f, idx) => ({
    id: (f.id || `fld_${idx}`).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64),
    label: (f.label || 'Field').trim().slice(0, 100),
    placeholder: String(f.placeholder || '').trim().slice(0, 160),
    required: Boolean(f.required),
    visible: Boolean(f.visible),
  }));
}

export async function saveSiteSettingsAdmin(
  adminUid: string,
  input: SiteSettingsInput
): Promise<void> {
  const path = 'settings/site';
  const cleanFileName = normalizeGoogleHtmlFilename(input.googleHtmlFileName);
  const cleanFileContent = cleanFileName
    ? (input.googleHtmlFileContent.trim() || `google-site-verification: ${cleanFileName}`).slice(0, 200)
    : '';
  const cleanGoogle = Boolean(input.googleLoginEnabled);
  const cleanFacebook = Boolean(input.facebookLoginEnabled);
  const cleanFbAppId = (input.facebookAppId || '').replace(/[^0-9]/g, '').slice(0, 64);

  try {
    const ref = doc(db, path);
    const snap = await getDoc(ref);
    const existingData = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
    const currentMapped = existingData ? mapSiteSettingsDoc(existingData) : DEFAULT_SITE_SETTINGS;

    const payload = {
      id: 'site',
      siteName: (input.siteName.trim() || 'ClipIndex').slice(0, 80),
      tagline: input.tagline.trim().slice(0, 160),
      logoUrl: sanitizeImageRef(input.logoUrl).slice(0, 1000),
      faviconUrl: sanitizeImageRef(input.faviconUrl).slice(0, 1000),
      appleTouchIconUrl: sanitizeImageRef(
        input.appleTouchIconUrl ?? currentMapped.appleTouchIconUrl
      ).slice(0, 1000),
      pwaIcon192Url: sanitizeImageRef(input.pwaIcon192Url ?? currentMapped.pwaIcon192Url).slice(
        0,
        1000
      ),
      pwaIcon512Url: sanitizeImageRef(input.pwaIcon512Url ?? currentMapped.pwaIcon512Url).slice(
        0,
        1000
      ),
      pwaMaskableIconUrl: sanitizeImageRef(
        input.pwaMaskableIconUrl ?? currentMapped.pwaMaskableIconUrl
      ).slice(0, 1000),
      metaTitle: input.metaTitle.trim().slice(0, 120),
      metaDescription: input.metaDescription.trim().slice(0, 320),
      ogImageUrl: sanitizeImageRef(input.ogImageUrl).slice(0, 1000),
      canonicalUrl: sanitizeHttpUrl(input.canonicalUrl).slice(0, 500),
      googleSiteVerification: extractGoogleVerificationToken(input.googleSiteVerification),
      googleHtmlFileName: cleanFileName,
      googleHtmlFileContent: cleanFileContent,
      aiDefaultDepth: input.aiDefaultDepth === 'balanced' ? 'balanced' : 'fast',
      aiDefaultLanguage: (input.aiDefaultLanguage.trim() || 'English').slice(0, 60),
      aiCustomInstruction: input.aiCustomInstruction.trim().slice(0, 1000),
      socialLoginEnabled: Boolean(cleanGoogle || cleanFacebook),
      googleLoginEnabled: cleanGoogle,
      facebookLoginEnabled: cleanFacebook,
      facebookAppId: cleanFbAppId,
      pricingEnabled: Boolean(input.pricingEnabled),
      headerLinks: sanitizeNavLinksForWrite(
        input.headerLinks ?? currentMapped.headerLinks,
        20
      ),
      footerLinks: sanitizeNavLinksForWrite(
        input.footerLinks ?? currentMapped.footerLinks,
        25
      ),
      footerText: String(input.footerText ?? currentMapped.footerText).trim().slice(0, 300),
      checkoutEnabled:
        typeof input.checkoutEnabled === 'boolean'
          ? input.checkoutEnabled
          : currentMapped.checkoutEnabled,
      checkoutTitle: String(input.checkoutTitle ?? currentMapped.checkoutTitle)
        .trim()
        .slice(0, 120),
      checkoutSubtitle: String(input.checkoutSubtitle ?? currentMapped.checkoutSubtitle)
        .trim()
        .slice(0, 300),
      checkoutCurrency: String(input.checkoutCurrency ?? currentMapped.checkoutCurrency)
        .trim()
        .slice(0, 12) || 'USD',
      checkoutTaxPercent: Math.min(
        100,
        Math.max(0, Number(input.checkoutTaxPercent ?? currentMapped.checkoutTaxPercent) || 0)
      ),
      checkoutNotice: String(input.checkoutNotice ?? currentMapped.checkoutNotice)
        .trim()
        .slice(0, 1000),
      checkoutCustomFields: sanitizeCheckoutFieldsForWrite(
        input.checkoutCustomFields ?? currentMapped.checkoutCustomFields
      ),
      updatedBy: adminUid,
    };

    if (!snap.exists()) {
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    }
    authorizedFetch('/api/site-settings/invalidate', { method: 'POST' }).catch(() => {});
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function updatePartialSiteSettingsAdmin(
  adminUid: string,
  patch: Partial<SiteSettingsInput>
): Promise<void> {
  const path = 'settings/site';
  try {
    const snap = await getDoc(doc(db, path));
    const current = snap.exists()
      ? mapSiteSettingsDoc(snap.data() as Record<string, unknown>)
      : DEFAULT_SITE_SETTINGS;
    await saveSiteSettingsAdmin(adminUid, {
      siteName: patch.siteName ?? current.siteName,
      tagline: patch.tagline ?? current.tagline,
      logoUrl: patch.logoUrl ?? current.logoUrl,
      faviconUrl: patch.faviconUrl ?? current.faviconUrl,
      appleTouchIconUrl: patch.appleTouchIconUrl ?? current.appleTouchIconUrl,
      pwaIcon192Url: patch.pwaIcon192Url ?? current.pwaIcon192Url,
      pwaIcon512Url: patch.pwaIcon512Url ?? current.pwaIcon512Url,
      pwaMaskableIconUrl: patch.pwaMaskableIconUrl ?? current.pwaMaskableIconUrl,
      metaTitle: patch.metaTitle ?? current.metaTitle,
      metaDescription: patch.metaDescription ?? current.metaDescription,
      ogImageUrl: patch.ogImageUrl ?? current.ogImageUrl,
      canonicalUrl: patch.canonicalUrl ?? current.canonicalUrl,
      googleSiteVerification: patch.googleSiteVerification ?? current.googleSiteVerification,
      googleHtmlFileName: patch.googleHtmlFileName ?? current.googleHtmlFileName,
      googleHtmlFileContent: patch.googleHtmlFileContent ?? current.googleHtmlFileContent,
      aiDefaultDepth: patch.aiDefaultDepth ?? current.aiDefaultDepth,
      aiDefaultLanguage: patch.aiDefaultLanguage ?? current.aiDefaultLanguage,
      aiCustomInstruction: patch.aiCustomInstruction ?? current.aiCustomInstruction,
      socialLoginEnabled: patch.socialLoginEnabled ?? current.socialLoginEnabled,
      googleLoginEnabled: patch.googleLoginEnabled ?? current.googleLoginEnabled,
      facebookLoginEnabled: patch.facebookLoginEnabled ?? current.facebookLoginEnabled,
      facebookAppId: patch.facebookAppId ?? current.facebookAppId,
      pricingEnabled: patch.pricingEnabled ?? current.pricingEnabled,
      headerLinks: patch.headerLinks ?? current.headerLinks,
      footerLinks: patch.footerLinks ?? current.footerLinks,
      footerText: patch.footerText ?? current.footerText,
      checkoutEnabled: patch.checkoutEnabled ?? current.checkoutEnabled,
      checkoutTitle: patch.checkoutTitle ?? current.checkoutTitle,
      checkoutSubtitle: patch.checkoutSubtitle ?? current.checkoutSubtitle,
      checkoutCurrency: patch.checkoutCurrency ?? current.checkoutCurrency,
      checkoutTaxPercent: patch.checkoutTaxPercent ?? current.checkoutTaxPercent,
      checkoutNotice: patch.checkoutNotice ?? current.checkoutNotice,
      checkoutCustomFields: patch.checkoutCustomFields ?? current.checkoutCustomFields,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

function mapPricingPlanDoc(id: string, d: Record<string, unknown>): PricingPlan {
  const features = Array.isArray(d.features)
    ? d.features.map((f) => String(f || '').trim()).filter(Boolean).slice(0, 20)
    : [];
  return {
    id: String(d.id || id),
    name: String(d.name || 'Plan'),
    tagline: String(d.tagline || ''),
    monthlyPrice: Number.isFinite(Number(d.monthlyPrice)) ? Math.max(0, Number(d.monthlyPrice)) : 0,
    yearlyMonthlyPrice: Number.isFinite(Number(d.yearlyMonthlyPrice))
      ? Math.max(0, Number(d.yearlyMonthlyPrice))
      : 0,
    highlighted: Boolean(d.highlighted),
    badge: String(d.badge || ''),
    autoBadgeId: d.autoBadgeId ? String(d.autoBadgeId) : '',
    ctaLabel: String(d.ctaLabel || 'Choose Plan'),
    features,
    sortOrder: Number.isFinite(Number(d.sortOrder)) ? Math.max(0, Math.floor(Number(d.sortOrder))) : 0,
    updatedBy: String(d.updatedBy || 'system'),
    createdAtMs: toMillis(d.createdAt),
    updatedAtMs: toMillis(d.updatedAt),
  };
}

export function subscribePricingPlans(onData: (plans: PricingPlan[]) => void): () => void {
  const path = 'pricingPlans';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const list = snapshot.docs
        .map((d) => mapPricingPlanDoc(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAtMs - b.createdAtMs);
      onData(list);
    },
    () => {
      onData([]);
    }
  );
}

export async function savePricingPlanAdmin(
  adminUid: string,
  input: PricingPlanInput
): Promise<string> {
  const cleanId = (
    input.id ||
    input.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') ||
    generateSafeId('plan')
  )
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .slice(0, 64);

  const path = `pricingPlans/${cleanId}`;
  const cleanFeatures = (input.features || [])
    .map((f) => String(f || '').trim().slice(0, 140))
    .filter(Boolean)
    .slice(0, 20);
  const cleanAutoBadgeId = (input.autoBadgeId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);

  const payload = {
    id: cleanId,
    name: (input.name.trim() || 'Plan').slice(0, 80),
    tagline: input.tagline.trim().slice(0, 200),
    monthlyPrice: Math.max(0, Number(input.monthlyPrice) || 0),
    yearlyMonthlyPrice: Math.max(0, Number(input.yearlyMonthlyPrice) || 0),
    highlighted: Boolean(input.highlighted),
    badge: input.badge.trim().slice(0, 40),
    autoBadgeId: cleanAutoBadgeId,
    ctaLabel: (input.ctaLabel.trim() || 'Select Plan').slice(0, 50),
    features: cleanFeatures,
    sortOrder: Math.max(0, Math.floor(Number(input.sortOrder) || 0)),
    updatedBy: adminUid,
  };

  try {
    const ref = doc(db, path);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    }
    return cleanId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deletePricingPlanAdmin(planId: string): Promise<void> {
  const path = `pricingPlans/${planId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function seedDefaultPricingPlansAdmin(adminUid: string): Promise<void> {
  for (const plan of DEFAULT_PRICING_PLANS) {
    const ref = doc(db, `pricingPlans/${plan.id}`);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await savePricingPlanAdmin(adminUid, {
        id: plan.id,
        name: plan.name,
        tagline: plan.tagline,
        monthlyPrice: plan.monthlyPrice,
        yearlyMonthlyPrice: plan.yearlyMonthlyPrice,
        highlighted: plan.highlighted,
        badge: plan.badge,
        autoBadgeId: plan.autoBadgeId,
        ctaLabel: plan.ctaLabel,
        features: plan.features,
        sortOrder: plan.sortOrder,
      });
    }
  }
}

const VALID_BADGE_COLORS: UserBadgeColor[] = ['blue', 'emerald', 'amber', 'violet', 'rose', 'slate'];

function mapUserBadgeDoc(id: string, d: Record<string, unknown>): UserBadge {
  const rawColor = String(d.color || 'blue') as UserBadgeColor;
  const color: UserBadgeColor = VALID_BADGE_COLORS.includes(rawColor) ? rawColor : 'blue';
  return {
    id: String(d.id || id),
    name: String(d.name || 'Badge'),
    description: String(d.description || ''),
    color,
    icon: String(d.icon || 'award'),
    updatedBy: String(d.updatedBy || 'system'),
    createdAtMs: toMillis(d.createdAt),
    updatedAtMs: toMillis(d.updatedAt),
  };
}

export function subscribeUserBadges(onData: (badges: UserBadge[]) => void): () => void {
  const path = 'badges';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const list = snapshot.docs
        .map((d) => mapUserBadgeDoc(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => a.name.localeCompare(b.name));
      onData(list);
    },
    () => {
      onData([]);
    }
  );
}

export async function saveUserBadgeAdmin(
  adminUid: string,
  input: UserBadgeInput
): Promise<string> {
  const cleanId = (
    input.id ||
    input.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') ||
    generateSafeId('bdg')
  )
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .slice(0, 64);

  const color: UserBadgeColor = VALID_BADGE_COLORS.includes(input.color) ? input.color : 'blue';
  const path = `badges/${cleanId}`;
  const payload = {
    id: cleanId,
    name: (input.name.trim() || 'Member Badge').slice(0, 40),
    description: input.description.trim().slice(0, 160),
    color,
    icon: (input.icon.trim() || 'award').slice(0, 32),
    updatedBy: adminUid,
  };

  try {
    const ref = doc(db, path);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    }
    return cleanId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteUserBadgeAdmin(badgeId: string): Promise<void> {
  const path = `badges/${badgeId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}


// ---------------------------------------------------------------------------
// Homepage content (admin editable) + uploaded site media
// ---------------------------------------------------------------------------

const HOMEPAGE_DOC_PATH = 'homepage/content';
const SITE_MEDIA_COLLECTION = 'siteMedia';
const MAX_HOMEPAGE_JSON_BYTES = 480_000;
const MAX_SITE_MEDIA_DATA_URL_BYTES = 900_000;

export function subscribeHomepageContent(onData: (content: HomepageContent) => void): () => void {
  return onSnapshot(
    doc(db, 'homepage', 'content'),
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(DEFAULT_HOMEPAGE_CONTENT);
        return;
      }
      const raw = snapshot.data()?.content;
      try {
        onData(sanitizeHomepageContent(JSON.parse(String(raw || '{}'))));
      } catch {
        onData(DEFAULT_HOMEPAGE_CONTENT);
      }
    },
    () => {
      onData(DEFAULT_HOMEPAGE_CONTENT);
    }
  );
}

export async function saveHomepageContentAdmin(
  adminUid: string,
  content: HomepageContent
): Promise<void> {
  const clean = sanitizeHomepageContent(content);
  const json = JSON.stringify(clean);
  if (json.length > MAX_HOMEPAGE_JSON_BYTES) {
    throw new Error(
      'Homepage content is too large to save. Remove some images or shorten the text and try again.'
    );
  }

  try {
    const ref = doc(db, 'homepage', 'content');
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        id: 'content',
        content: json,
        updatedBy: adminUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        content: json,
        updatedBy: adminUid,
        updatedAt: serverTimestamp(),
      });
    }
    authorizedFetch('/api/site-settings/invalidate', { method: 'POST' }).catch(() => {});
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, HOMEPAGE_DOC_PATH);
  }
}

export async function uploadSiteMediaDataUrl(
  adminUid: string,
  dataUrl: string,
  mime?: string
): Promise<{ id: string; src: string }> {
  if (!dataUrl.startsWith('data:image/')) {
    throw new Error('Only image files can be uploaded here.');
  }
  if (dataUrl.length > MAX_SITE_MEDIA_DATA_URL_BYTES) {
    throw new Error('This image is too large. Please choose a smaller image.');
  }

  const id = generateSafeId('media');
  const path = `${SITE_MEDIA_COLLECTION}/${id}`;
  try {
    await setDoc(doc(db, SITE_MEDIA_COLLECTION, id), {
      id,
      dataUrl,
      mime: (mime || dataUrlToMime(dataUrl)).slice(0, 80),
      updatedBy: adminUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id, src: `media:${id}` };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteSiteMediaAdmin(mediaId: string): Promise<void> {
  const cleanId = (mediaId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  if (!cleanId) return;
  const path = `${SITE_MEDIA_COLLECTION}/${cleanId}`;
  try {
    await deleteDoc(doc(db, SITE_MEDIA_COLLECTION, cleanId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

/** Loads public uploaded images by id. Missing ids are omitted. */
export async function fetchSiteMediaDataUrls(
  ids: string[]
): Promise<Record<string, string>> {
  const unique = Array.from(
    new Set(ids.map((id) => (id || '').replace(/[^a-zA-Z0-9_-]/g, '')).filter(Boolean))
  ).slice(0, 60);

  const entries = await Promise.all(
    unique.map(async (id) => {
      try {
        const snap = await getDoc(doc(db, SITE_MEDIA_COLLECTION, id));
        if (!snap.exists()) return null;
        const dataUrl = String(snap.data()?.dataUrl || '');
        return dataUrl.startsWith('data:image/') ? ([id, dataUrl] as const) : null;
      } catch {
        return null;
      }
    })
  );

  const out: Record<string, string> = {};
  for (const entry of entries) {
    if (entry) out[entry[0]] = entry[1];
  }
  return out;
}
