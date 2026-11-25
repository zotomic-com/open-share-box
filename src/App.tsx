import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import {
  AlarmClock,
  Bookmark,
  BookmarkCheck,
  Bot,
  Camera,
  CreditCard,
  FileText,
  Film,
  FolderPlus,
  Globe,
  HardDrive,
  Home,
  Image as ImageIcon,
  Layers,
  LayoutDashboard,
  Loader2,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  Share2,
  Shield,
  Star,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import type {
  AnalyzedVideo,
  AnalyzeVideoResponse,
  BillingInvoice,
  ExtractedLink,
  FeatureModuleConfig,
  HomepageContent,
  InboxItemType,
  InvoiceBillingCycle,
  NavLinkItem,
  ParsedBookmarkEntry,
  PaymentGateway,
  PricingPlan,
  SiteNotification,
  SitePage,
  SiteSettings,
  UserBadge,
  UserPrivateRecord,
  UserProfileRecord,
  UserReminder,
  UserReminderInput,
  VideoCollection,
  VideoPlatform,
  WhatsAppConfig,
  WhatsAppConfigInput,
} from './types/video';
import { auth } from './lib/firebase';
import { authorizedFetch, type ClientUsageQuota } from './lib/apiClient';
import {
  createFirestoreCollection,
  createFirestoreVideo,
  deleteFirestoreCollection,
  deleteFirestoreVideo,
  ensureUserProfile,
  loadGuestCollections,
  loadGuestVideos,
  saveGuestCollections,
  saveGuestVideos,
  subscribeOwnPrivateInfo,
  subscribeOwnUserProfile,
  subscribeUserCollections,
  subscribeUserVideos,
  toggleFirestoreFavorite,
  updateFirestoreVideoCollection,
  updateFirestoreVideoLinks,
  updateFirestoreVideoNotes,
  updateFirestoreVideoTags,
} from './lib/libraryStore';
import {
  deleteLocalMedia,
  formatBytes,
  getLocalMedia,
  getLocalMediaStats,
  saveLocalMedia,
} from './lib/localMediaStore';
import {
  checkUserIsAdmin,
  DEFAULT_SITE_SETTINGS,
  fetchSiteMediaDataUrls,
  subscribeHomepageContent,
  subscribePricingPlans,
  subscribePublishedPages,
  subscribeSiteSettings,
  subscribeUserBadges,
} from './lib/adminStore';
import {
  markNotificationRead,
  subscribeAllInvoicesAdmin,
  subscribeAllNotificationsAdmin,
  subscribeNotificationReads,
  subscribePaymentGateways,
  subscribeUserInvoices,
  subscribeUserNotifications,
} from './lib/billingStore';
import {
  DEFAULT_FEATURE_MODULES,
  deleteUserReminder,
  isFeatureModuleEnabled,
  loadGuestReminders,
  loadGuestWhatsAppConfig,
  markUserReminderSent,
  saveGuestReminders,
  saveGuestWhatsAppConfig,
  saveOwnWhatsAppConfig,
  saveUserReminder,
  subscribeFeatureModules,
  subscribeOwnWhatsAppConfig,
  subscribeUserReminders,
} from './lib/featureStore';
import { DEFAULT_SITE_PAGES, sanitizeHttpUrl } from './lib/pageDefaults';
import {
  collectHomepageMediaIds,
  DEFAULT_HOMEPAGE_CONTENT,
  mediaIdFromRef,
} from './lib/homepageDefaults';
import {
  extractUrlFromShareParams,
  generateSafeId,
  getItemType,
  PLATFORM_LABELS,
  SAVE_REASON_PRESETS,
} from './lib/videoUtils';
import { consumeSharedTarget } from './lib/sharedTarget';
import { AdminDashboard, type AdminTab } from './components/AdminDashboard';
import { AuthModal } from './components/AuthModal';
import { CheckoutPage } from './components/CheckoutPage';
import { HomePage } from './components/HomePage';
import { InvoiceModal } from './components/InvoiceModal';
import { NotificationBellPanel } from './components/NotificationBellPanel';
import { OfflineIndicator, PWAInstallBar } from './components/PWAControls';
import { PricingPlans } from './components/PricingPlans';
import { RemindersPanel } from './components/RemindersPanel';
import { ScrollToTop } from './components/ScrollToTop';
import { ShareSetupModal } from './components/ShareSetupModal';
import { SitePageView } from './components/SitePageView';
import { UserDashboard } from './components/UserDashboard';
import { VideoInspector } from './components/VideoInspector';
import { VideoLibraryList } from './components/VideoLibraryList';
import { type SubmitPanelMode, VideoSubmitPanel } from './components/VideoSubmitPanel';

type SidebarFilter =
  | { type: 'all' }
  | { type: 'favorites' }
  | { type: 'collection'; collectionId: string };

type ActiveView =
  | 'home'
  | 'library'
  | 'reminders'
  | 'user-dashboard'
  | 'admin'
  | 'page'
  | 'pricing'
  | 'checkout';

function mergeAndNormalizeTags(aiTags: string[] | undefined, customTags: string[] | undefined): string[] {
  const combined = [...(customTags || []), ...(aiTags || [])];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of combined) {
    const clean = String(raw || '').trim().replace(/^#+/, '').toLowerCase();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean.slice(0, 50));
    if (out.length >= 15) break;
  }
  return out;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read selected file.'));
    reader.readAsDataURL(file);
  });
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [ownProfile, setOwnProfile] = useState<UserProfileRecord | null>(null);
  const [ownPrivateInfo, setOwnPrivateInfo] = useState<UserPrivateRecord | null>(null);

  const [videos, setVideos] = useState<AnalyzedVideo[]>(() => loadGuestVideos());
  const [collections, setCollections] = useState<VideoCollection[]>(() => loadGuestCollections());
  const [publishedPages, setPublishedPages] = useState<SitePage[]>([]);
  const [pricingPlans, setPricingPlans] = useState<PricingPlan[]>([]);
  const [badges, setBadges] = useState<UserBadge[]>([]);
  const [gateways, setGateways] = useState<PaymentGateway[]>([]);
  const [userInvoices, setUserInvoices] = useState<BillingInvoice[]>([]);
  const [adminInvoices, setAdminInvoices] = useState<BillingInvoice[]>([]);
  const [userNotifications, setUserNotifications] = useState<SiteNotification[]>([]);
  const [allAdminNotifications, setAllAdminNotifications] = useState<SiteNotification[]>([]);
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(() => new Set());
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const [homepageContent, setHomepageContent] = useState<HomepageContent>(DEFAULT_HOMEPAGE_CONTENT);
  const [siteMediaUrls, setSiteMediaUrls] = useState<Record<string, string>>({});
  const [pendingHomeAnchor, setPendingHomeAnchor] = useState<string | null>(null);
  const initialRedirectUidRef = useRef<string | null>(null);
  const [featureModules, setFeatureModules] = useState<FeatureModuleConfig[]>(
    DEFAULT_FEATURE_MODULES
  );
  const [reminders, setReminders] = useState<UserReminder[]>(() => loadGuestReminders());
  const [whatsappConfig, setWhatsappConfig] = useState<WhatsAppConfig | null>(() =>
    loadGuestWhatsAppConfig()
  );
  const [logoLoadError, setLogoLoadError] = useState(false);
  const [uploadedObjectUrls, setUploadedObjectUrls] = useState<Record<string, string>>({});
  const [localStats, setLocalStats] = useState<{ count: number; totalBytes: number }>({
    count: 0,
    totalBytes: 0,
  });

  const [activeView, setActiveView] = useState<ActiveView>('home');
  const [activePageSlug, setActivePageSlug] = useState<string>('terms-of-service');
  const [adminInitialEditPage, setAdminInitialEditPage] = useState<SitePage | null>(null);
  const [adminInitialTab, setAdminInitialTab] = useState<AdminTab | undefined>(undefined);
  const [checkoutPlanId, setCheckoutPlanId] = useState<string | undefined>(undefined);
  const [checkoutCycle, setCheckoutCycle] = useState<InvoiceBillingCycle>('yearly');
  const [checkoutDueInvoice, setCheckoutDueInvoice] = useState<BillingInvoice | null>(null);
  const [activeInvoiceModal, setActiveInvoiceModal] = useState<BillingInvoice | null>(null);

  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>({ type: 'all' });
  const [selectedItemType, setSelectedItemType] = useState<InboxItemType | 'all'>('all');
  const [selectedPlatform, setSelectedPlatform] = useState<VideoPlatform | 'all'>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [pendingSeekSeconds, setPendingSeekSeconds] = useState<number | null>(null);

  const [quickLinkInput, setQuickLinkInput] = useState('');
  const [quickSaveReason, setQuickSaveReason] = useState('');
  const [quickNoteInput, setQuickNoteInput] = useState('');
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [submitInitialUrl, setSubmitInitialUrl] = useState('');
  const [submitInitialTitle, setSubmitInitialTitle] = useState('');
  const [submitInitialMode, setSubmitInitialMode] = useState<SubmitPanelMode>('link');
  const [submitInitialFile, setSubmitInitialFile] = useState<File | null>(null);
  const [isIncomingShare, setIsIncomingShare] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [usageQuota, setUsageQuota] = useState<ClientUsageQuota | null>(null);

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isShareSetupOpen, setIsShareSetupOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [isAddingCollection, setIsAddingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');

  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem('clipindex_theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [screenshotWatchEnabled, setScreenshotWatchEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('clipindex_screenshot_watch') === 'true';
  });
  const [clipboardWatchNotice, setClipboardWatchNotice] = useState<string | null>(null);
  const lastClipboardSigRef = useRef<string>('');

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem('clipindex_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('clipindex_theme', 'light');
    }
  }, [isDark]);

  // Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  // Signed-in members land in their library once per sign-in; after that the
  // Home icon can open the public homepage for everyone.
  useEffect(() => {
    if (!authReady || !user) return;
    if (initialRedirectUidRef.current === user.uid) return;
    initialRedirectUidRef.current = user.uid;
    if (activeView === 'home') {
      setActiveView('library');
    }
  }, [authReady, user, activeView]);

  // Admin role check
  useEffect(() => {
    let active = true;
    if (!user) {
      setIsAdmin(false);
      return;
    }
    void checkUserIsAdmin(user).then((adminStatus) => {
      if (active) setIsAdmin(adminStatus);
    });
    return () => {
      active = false;
    };
  }, [user, user?.emailVerified]);

  // Public published pages subscription (Terms of Service, Privacy Policy, custom pages)
  useEffect(() => {
    const unsub = subscribePublishedPages(setPublishedPages);
    return unsub;
  }, []);

  // Public site settings, pricing plans, badges, and payment gateway subscriptions
  useEffect(() => {
    const unsubSettings = subscribeSiteSettings((next) => {
      setLogoLoadError(false);
      setSiteSettings(next);
    });
    const unsubPlans = subscribePricingPlans(setPricingPlans);
    const unsubBadges = subscribeUserBadges(setBadges);
    const unsubGateways = subscribePaymentGateways(setGateways);
    const unsubModules = subscribeFeatureModules((list) => setFeatureModules(list));
    return () => {
      unsubSettings();
      unsubPlans();
      unsubBadges();
      unsubGateways();
      unsubModules();
    };
  }, []);

  // Public homepage content (admin editable)
  useEffect(() => {
    const unsub = subscribeHomepageContent((next) => setHomepageContent(next));
    return unsub;
  }, []);

  // Resolve admin-uploaded `media:<id>` images used by the homepage and brand assets
  const homepageMediaKey = useMemo(() => {
    const ids = new Set<string>(collectHomepageMediaIds(homepageContent));
    for (const src of [
      siteSettings.logoUrl,
      siteSettings.faviconUrl,
      siteSettings.appleTouchIconUrl,
      siteSettings.pwaIcon192Url,
      siteSettings.pwaIcon512Url,
      siteSettings.pwaMaskableIconUrl,
      siteSettings.ogImageUrl,
    ]) {
      const id = mediaIdFromRef(src);
      if (id) ids.add(id);
    }
    return Array.from(ids).sort().join(',');
  }, [homepageContent, siteSettings]);

  useEffect(() => {
    if (!homepageMediaKey) return;
    let active = true;
    const ids = homepageMediaKey.split(',').filter(Boolean);
    void fetchSiteMediaDataUrls(ids)
      .then((map) => {
        if (!active) return;
        setSiteMediaUrls((prev) => ({ ...prev, ...map }));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [homepageMediaKey]);

  const resolveMediaSrc = useCallback(
    (src: string): string => {
      if (!src) return '';
      const mediaId = mediaIdFromRef(src);
      if (!mediaId) return src;
      return siteMediaUrls[mediaId] || '';
    },
    [siteMediaUrls]
  );

  const headerLogoUrl = useMemo(
    () => resolveMediaSrc(siteSettings.logoUrl),
    [resolveMediaSrc, siteSettings.logoUrl]
  );

  useEffect(() => {
    setLogoLoadError(false);
  }, [headerLogoUrl]);

  const openLibrary = useCallback(() => {
    setAnalyzeError(null);
    setIsIncomingShare(false);
    setSidebarFilter({ type: 'all' });
    setSelectedVideoId(null);
    setActiveView('library');
  }, []);

  // Scroll to a homepage anchor after navigating from another app view
  useEffect(() => {
    if (activeView !== 'home' || !pendingHomeAnchor) return;
    const anchor = pendingHomeAnchor;
    const timer = window.setTimeout(() => {
      document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setPendingHomeAnchor(null);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [activeView, pendingHomeAnchor]);


  const textPdfEnabled = isFeatureModuleEnabled(featureModules, 'text-pdf');
  const bookmarkShareEnabled = isFeatureModuleEnabled(featureModules, 'bookmark-share');
  const llmChatEnabled = isFeatureModuleEnabled(featureModules, 'llm-chat');
  const remindersEnabled = isFeatureModuleEnabled(featureModules, 'reminders');
  const whatsappEnabled = isFeatureModuleEnabled(featureModules, 'whatsapp');

  useEffect(() => {
    if (activeView === 'pricing' && !siteSettings.pricingEnabled) {
      setActiveView('library');
    }
    if (activeView === 'checkout' && !siteSettings.checkoutEnabled) {
      setActiveView(siteSettings.pricingEnabled ? 'pricing' : 'library');
    }
    if (activeView === 'reminders' && !remindersEnabled && !whatsappEnabled) {
      setActiveView('library');
    }
  }, [
    activeView,
    siteSettings.pricingEnabled,
    siteSettings.checkoutEnabled,
    remindersEnabled,
    whatsappEnabled,
  ]);

  // Synchronize document head metadata, favicon, verification meta tag, and Schema.org JSON-LD
  useEffect(() => {
    const titleText = siteSettings.metaTitle || `${siteSettings.siteName} — ${siteSettings.tagline}`;
    document.title = titleText;

    const upsertMeta = (attrName: 'name' | 'property', attrVal: string, content: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(`meta[${attrName}="${attrVal}"]`);
      if (!content) {
        if (el) el.remove();
        return;
      }
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attrName, attrVal);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    const upsertLink = (relVal: string, href: string) => {
      let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${relVal}"]`);
      if (!href) {
        if (el) el.remove();
        return;
      }
      if (!el) {
        el = document.createElement('link');
        el.setAttribute('rel', relVal);
        document.head.appendChild(el);
      }
      el.setAttribute('href', href);
    };

    upsertMeta('name', 'description', siteSettings.metaDescription);
    upsertMeta('property', 'og:title', titleText);
    upsertMeta('property', 'og:description', siteSettings.metaDescription);
    upsertMeta('property', 'og:site_name', siteSettings.siteName);
    upsertMeta('name', 'twitter:title', titleText);
    upsertMeta('name', 'twitter:description', siteSettings.metaDescription);
    upsertMeta('name', 'apple-mobile-web-app-title', siteSettings.siteName);
    upsertMeta('name', 'google-site-verification', siteSettings.googleSiteVerification);

    const safeOgImg =
      resolveMediaSrc(siteSettings.ogImageUrl) || sanitizeHttpUrl(siteSettings.ogImageUrl);
    upsertMeta('property', 'og:image', safeOgImg);
    upsertMeta('name', 'twitter:image', safeOgImg);

    const safeCanonical = sanitizeHttpUrl(siteSettings.canonicalUrl) || window.location.origin;
    upsertLink('canonical', safeCanonical);

    const safeFavicon =
      resolveMediaSrc(siteSettings.faviconUrl) || sanitizeHttpUrl(siteSettings.faviconUrl);
    const safeAppleTouch =
      resolveMediaSrc(siteSettings.appleTouchIconUrl) || safeFavicon;
    upsertLink('icon', safeFavicon || '/icon.svg');
    upsertLink('apple-touch-icon', safeAppleTouch || '/apple-touch-icon.png');

    let ldScript = document.head.querySelector<HTMLScriptElement>('#clipindex-jsonld');
    if (!ldScript) {
      ldScript = document.createElement('script');
      ldScript.id = 'clipindex-jsonld';
      ldScript.type = 'application/ld+json';
      document.head.appendChild(ldScript);
    }
    ldScript.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: siteSettings.siteName,
      description: siteSettings.metaDescription,
      url: safeCanonical,
      applicationCategory: 'MultimediaApplication',
      operatingSystem: 'Any',
    });
  }, [siteSettings, resolveMediaSrc]);

  // Firestore real-time subscriptions when signed in and verified; localStorage when guest
  useEffect(() => {
    if (!authReady) return;
    if (!user || !user.emailVerified) {
      setOwnProfile(null);
      setOwnPrivateInfo(null);
      setVideos(loadGuestVideos());
      setCollections(loadGuestCollections());
      setReminders(loadGuestReminders());
      setWhatsappConfig(loadGuestWhatsAppConfig());
      return;
    }

    void ensureUserProfile(user).catch(() => {});

    // Migrate any guest items created before sign-in into the user's cloud library once
    const guestVideos = loadGuestVideos();
    if (guestVideos.length > 0) {
      const migrate = async () => {
        for (const gv of guestVideos) {
          await createFirestoreVideo(
            user,
            {
              itemType: gv.itemType,
              url: gv.url,
              platform: gv.platform,
              title: gv.title,
              creator: gv.creator,
              thumbnailUrl: gv.thumbnailUrl,
              durationLabel: gv.durationLabel,
              category: gv.category,
              summary: gv.summary,
              tldrBullets: gv.tldrBullets,
              tags: gv.tags,
              segments: gv.segments,
              transcript: gv.transcript,
              links: gv.links || [],
              metadataSource: 'migrated',
            },
            '',
            {
              saveReason: gv.saveReason,
              notes: gv.notes,
              localMediaId: gv.localMediaId,
            }
          );
        }
        saveGuestVideos([]);
      };
      void migrate().catch(() => {});
    }

    const unsubProfile = subscribeOwnUserProfile(user.uid, setOwnProfile);
    const unsubPrivate = subscribeOwnPrivateInfo(user.uid, setOwnPrivateInfo);
    const unsubVideos = subscribeUserVideos(user.uid, setVideos);
    const unsubCollections = subscribeUserCollections(user.uid, setCollections);
    const unsubUserNotifs = subscribeUserNotifications(user.uid, setUserNotifications);
    const unsubUserInvoices = subscribeUserInvoices(user.uid, setUserInvoices);
    const unsubReads = subscribeNotificationReads(user.uid, setReadNotificationIds);
    const unsubReminders = subscribeUserReminders(user.uid, setReminders);
    const unsubWhatsApp = subscribeOwnWhatsAppConfig(user.uid, setWhatsappConfig);

    return () => {
      unsubProfile();
      unsubPrivate();
      unsubVideos();
      unsubCollections();
      unsubUserNotifs();
      unsubUserInvoices();
      unsubReads();
      unsubReminders();
      unsubWhatsApp();
    };
  }, [authReady, user, user?.emailVerified]);

  // Reset user notifications/invoices when logged out or unverified
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) {
      setUserNotifications([]);
      setUserInvoices([]);
      setReadNotificationIds(new Set());
    }
  }, [authReady, user, user?.emailVerified]);

  // Admin invoices & admin notifications subscriptions
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified || !isAdmin) {
      setAdminInvoices([]);
      setAllAdminNotifications([]);
      return;
    }
    const unsubAdminInvoices = subscribeAllInvoicesAdmin(setAdminInvoices);
    const unsubAdminNotifs = subscribeAllNotificationsAdmin(setAllAdminNotifications);
    return () => {
      unsubAdminInvoices();
      unsubAdminNotifs();
    };
  }, [authReady, user, user?.emailVerified, isAdmin]);

  const adminNotifications = useMemo(
    () =>
      allAdminNotifications.filter(
        (n) => n.isActive && (n.audience === 'admin' || n.audience === 'all')
      ),
    [allAdminNotifications]
  );

  const visibleHeaderLinks = useMemo(
    () =>
      siteSettings.headerLinks
        .filter((l) => {
          if (!l.visible) return false;
          if (l.actionType === 'view' && l.target === 'pricing' && !siteSettings.pricingEnabled) {
            return false;
          }
          if (l.actionType === 'view' && l.target === 'checkout' && !siteSettings.checkoutEnabled) {
            return false;
          }
          return true;
        })
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [siteSettings.headerLinks, siteSettings.pricingEnabled, siteSettings.checkoutEnabled]
  );

  const visibleFooterLinks = useMemo(
    () =>
      siteSettings.footerLinks
        .filter((l) => {
          if (!l.visible) return false;
          if (l.actionType === 'view' && l.target === 'pricing' && !siteSettings.pricingEnabled) {
            return false;
          }
          if (l.actionType === 'view' && l.target === 'checkout' && !siteSettings.checkoutEnabled) {
            return false;
          }
          return true;
        })
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [siteSettings.footerLinks, siteSettings.pricingEnabled, siteSettings.checkoutEnabled]
  );

  // Merge Firestore published pages with built-in legal page defaults
  const displayPages = useMemo(() => {
    const map = new Map<string, SitePage>();
    for (const def of DEFAULT_SITE_PAGES) {
      map.set(def.slug, def);
    }
    for (const p of publishedPages) {
      map.set(p.slug, p);
    }
    return Array.from(map.values());
  }, [publishedPages]);

  const activeSitePage = useMemo(
    () =>
      displayPages.find((p) => p.slug === activePageSlug || p.id === activePageSlug) ||
      DEFAULT_SITE_PAGES[0],
    [displayPages, activePageSlug]
  );

  const openPageBySlug = (slug: string) => {
    setActivePageSlug(slug);
    setActiveView('page');
    setSelectedVideoId(null);
    setMobileMenuOpen(false);
  };

  const handleNavLinkClick = (link: NavLinkItem) => {
    if (link.actionType === 'page') {
      openPageBySlug(link.target);
      return;
    }
    if (link.actionType === 'anchor') {
      const anchor = link.target.trim();
      if (!anchor) return;
      if (activeView === 'home') {
        document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        setPendingHomeAnchor(anchor);
        setActiveView('home');
      }
      setSelectedVideoId(null);
      setMobileMenuOpen(false);
      return;
    }
    if (link.actionType === 'view') {
      if (link.target === 'home') {
        setActiveView('home');
        setSelectedVideoId(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (link.target === 'pricing') {
        if (!siteSettings.pricingEnabled) return;
        setActiveView('pricing');
        setSelectedVideoId(null);
      } else if (link.target === 'checkout') {
        if (!siteSettings.checkoutEnabled) return;
        setCheckoutDueInvoice(null);
        setActiveView('checkout');
        setSelectedVideoId(null);
      } else if (link.target === 'user-dashboard') {
        if (!user) {
          setIsAuthModalOpen(true);
        } else {
          setActiveView('user-dashboard');
          setSelectedVideoId(null);
        }
      } else if (link.target === 'admin') {
        if (!user) {
          setIsAuthModalOpen(true);
        } else if (isAdmin) {
          setActiveView('admin');
          setSelectedVideoId(null);
        }
      } else if (link.target === 'reminders') {
        if (!remindersEnabled && !whatsappEnabled) return;
        setActiveView('reminders');
        setSelectedVideoId(null);
      } else {
        setActiveView('library');
        setSidebarFilter({ type: 'all' });
        setSelectedVideoId(null);
      }
      setMobileMenuOpen(false);
    }
  };

  const handleNotificationTarget = (target: string) => {
    const trimmed = (target || '').trim();
    if (!trimmed) return;
    if (trimmed === 'view:admin-billing') {
      if (isAdmin) {
        setAdminInitialTab('billing');
        setActiveView('admin');
        setSelectedVideoId(null);
      }
      return;
    }
    if (trimmed === 'view:admin') {
      if (isAdmin) {
        setActiveView('admin');
        setSelectedVideoId(null);
      }
      return;
    }
    if (trimmed === 'view:user-dashboard') {
      if (user) {
        setActiveView('user-dashboard');
        setSelectedVideoId(null);
      } else {
        setIsAuthModalOpen(true);
      }
      return;
    }
    if (trimmed === 'view:reminders') {
      if (remindersEnabled || whatsappEnabled) {
        setActiveView('reminders');
        setSelectedVideoId(null);
      }
      return;
    }
    if (trimmed === 'view:pricing') {
      if (siteSettings.pricingEnabled) {
        setActiveView('pricing');
        setSelectedVideoId(null);
      }
      return;
    }
    if (trimmed === 'view:checkout') {
      if (siteSettings.checkoutEnabled) {
        setActiveView('checkout');
        setSelectedVideoId(null);
      }
      return;
    }
    if (trimmed === 'view:library') {
      setActiveView('library');
      setSelectedVideoId(null);
      return;
    }
    if (trimmed.startsWith('page:')) {
      openPageBySlug(trimmed.slice(5));
      return;
    }
    const safeUrl = sanitizeHttpUrl(trimmed);
    if (safeUrl) {
      window.location.assign(safeUrl);
    }
  };

  // Hydrate local device screenshots & refresh IndexedDB usage stats
  useEffect(() => {
    let active = true;
    void getLocalMediaStats().then((stats) => {
      if (active) setLocalStats(stats);
    });

    const missingScreenshots = videos.filter(
      (v) =>
        getItemType(v) === 'screenshot' &&
        v.localMediaId &&
        !uploadedObjectUrls[v.id] &&
        !uploadedObjectUrls[v.localMediaId]
    );
    if (missingScreenshots.length === 0) return;

    void Promise.all(
      missingScreenshots.slice(0, 30).map(async (v) => {
        const key = v.localMediaId!;
        const rec = await getLocalMedia(key);
        if (rec?.blob) {
          return { key, url: URL.createObjectURL(rec.blob) };
        }
        return null;
      })
    ).then((loaded) => {
      if (!active) return;
      const updates: Record<string, string> = {};
      for (const item of loaded) {
        if (item) updates[item.key] = item.url;
      }
      if (Object.keys(updates).length > 0) {
        setUploadedObjectUrls((prev) => ({ ...prev, ...updates }));
      }
    });

    return () => {
      active = false;
    };
  }, [videos, uploadedObjectUrls]);

  // Persist Screenshot Watch preference
  useEffect(() => {
    localStorage.setItem('clipindex_screenshot_watch', String(screenshotWatchEnabled));
    if (!screenshotWatchEnabled) {
      setClipboardWatchNotice(null);
    }
  }, [screenshotWatchEnabled]);

  const checkClipboardForScreenshot = useCallback(
    async (interactive = false) => {
      if (isSubmitOpen || activeView !== 'library') return;
      if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
        if (interactive) {
          setClipboardWatchNotice(
            'Clipboard auto-read is unavailable in this browser. Press Ctrl+V anytime to prompt Save + Tag + Group.'
          );
        }
        return;
      }

      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imageType = item.types.find((t) => t.startsWith('image/'));
          if (!imageType) continue;
          const blob = await item.getType(imageType);
          if (!blob || blob.size === 0) continue;

          const headSlice = await blob.slice(0, 256).text();
          const sig = `${blob.size}:${imageType}:${headSlice}`;
          if (sig === lastClipboardSigRef.current) {
            return;
          }
          lastClipboardSigRef.current = sig;

          const ext = imageType.split('/')[1] || 'png';
          const capturedFile = new File([blob], `screenshot_${Date.now()}.${ext}`, {
            type: imageType,
          });
          setClipboardWatchNotice(null);
          setAnalyzeError(null);
          setIsIncomingShare(true);
          setSubmitInitialMode('screenshot');
          setSubmitInitialFile(capturedFile);
          setIsSubmitOpen(true);
          return;
        }
      } catch {
        if (interactive) {
          setClipboardWatchNotice(
            'Allow clipboard permission when prompted, or press Ctrl+V after taking a screenshot.'
          );
        }
      }
    },
    [isSubmitOpen, activeView]
  );

  // Screenshot Auto-Prompt when returning to tab or pressing PrintScreen (with Watch enabled)
  useEffect(() => {
    if (!screenshotWatchEnabled || isSubmitOpen || activeView !== 'library') return;

    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        void checkClipboardForScreenshot(false);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') {
        setTimeout(() => {
          void checkClipboardForScreenshot(false);
        }, 250);
      }
    };

    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [screenshotWatchEnabled, isSubmitOpen, activeView, checkClipboardForScreenshot]);

  // Global Ctrl+V screenshot paste when on library view
  useEffect(() => {
    if (isSubmitOpen || activeView !== 'library') return;
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            const ext = item.type.split('/')[1] || 'png';
            const pastedFile = new File([blob], `screenshot_${Date.now()}.${ext}`, {
              type: item.type,
            });
            setAnalyzeError(null);
            setIsIncomingShare(true);
            setSubmitInitialMode('screenshot');
            setSubmitInitialFile(pastedFile);
            setIsSubmitOpen(true);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [isSubmitOpen, activeView]);

  const refreshUsageQuota = () => {
    void authorizedFetch('/api/usage')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ClientUsageQuota | null) => {
        if (data && data.analyze) setUsageQuota(data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!authReady) return;
    refreshUsageQuota();
  }, [authReady, user?.uid, user?.emailVerified]);

  const handleAnalyzeUrl = async (params: {
    rawInput: string;
    title?: string;
    customFocus?: string;
    saveReason?: string;
    notes?: string;
    customTags?: string[];
    collectionId?: string;
    modeHint?: 'auto' | 'video' | 'link' | 'ai-chat' | 'document';
  }) => {
    setAnalyzeError(null);
    setIsAnalyzing(true);
    try {
      const res = await authorizedFetch('/api/analyze-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawShareText: params.rawInput,
          title: params.title,
          customFocus: params.customFocus,
          saveReason: params.saveReason,
          userNote: params.notes,
          modeHint: params.modeHint || 'auto',
          aiSettings: {
            depth: siteSettings.aiDefaultDepth,
            language: siteSettings.aiDefaultLanguage,
            customInstruction: siteSettings.aiCustomInstruction,
          },
        }),
      });
      const data = (await res.json()) as AnalyzeVideoResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze shared link.');
      }

      const mergedTags = mergeAndNormalizeTags(data.tags, params.customTags);
      const normalizedData: AnalyzeVideoResponse = {
        ...data,
        tags: mergedTags,
      };

      const targetCollectionId =
        params.collectionId ||
        (sidebarFilter.type === 'collection' ? sidebarFilter.collectionId : '');

      let createdId: string;
      if (user && user.emailVerified) {
        createdId = await createFirestoreVideo(user, normalizedData, targetCollectionId, {
          saveReason: params.saveReason,
          notes: params.notes,
        });
      } else {
        createdId = generateSafeId('vid');
        const now = Date.now();
        const guestVideo: AnalyzedVideo = {
          id: createdId,
          ownerId: 'guest',
          itemType: getItemType({ itemType: normalizedData.itemType, platform: normalizedData.platform }),
          url: normalizedData.url,
          platform: normalizedData.platform,
          title: normalizedData.title,
          creator: normalizedData.creator,
          thumbnailUrl: normalizedData.thumbnailUrl,
          durationLabel: normalizedData.durationLabel,
          category: normalizedData.category,
          collectionId: targetCollectionId,
          isFavorite: false,
          saveReason: params.saveReason?.trim() || '',
          summary: normalizedData.summary,
          tldrBullets: normalizedData.tldrBullets,
          tags: normalizedData.tags,
          segments: normalizedData.segments,
          transcript: normalizedData.transcript,
          links: normalizedData.links || [],
          notes: params.notes?.trim() || '',
          createdAtMs: now,
          updatedAtMs: now,
        };
        const updated = [guestVideo, ...videos];
        setVideos(updated);
        saveGuestVideos(updated);
      }

      setQuickLinkInput('');
      setQuickSaveReason('');
      setQuickNoteInput('');
      setIsSubmitOpen(false);
      setIsIncomingShare(false);
      setSubmitInitialUrl('');
      setSubmitInitialTitle('');
      setSubmitInitialFile(null);
      setActiveView('library');
      setSelectedVideoId(createdId);
      setPendingSeekSeconds(null);
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Unable to analyze item.');
    } finally {
      setIsAnalyzing(false);
      refreshUsageQuota();
    }
  };

  const handleAnalyzeFile = async (params: {
    file: File;
    title?: string;
    customFocus?: string;
    saveReason?: string;
    notes?: string;
    customTags?: string[];
    collectionId?: string;
  }) => {
    setAnalyzeError(null);
    setIsAnalyzing(true);
    try {
      const base64 = await fileToBase64(params.file);
      const isImage = params.file.type.startsWith('image/');
      const isPdf =
        params.file.type === 'application/pdf' || params.file.name.toLowerCase().endsWith('.pdf');
      const resolvedMime =
        params.file.type || (isImage ? 'image/png' : isPdf ? 'application/pdf' : 'video/mp4');
      const localMediaId = generateSafeId('med');

      const res = await authorizedFetch('/api/analyze-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: params.title,
          customFocus: params.customFocus,
          saveReason: params.saveReason,
          userNote: params.notes,
          modeHint: isPdf ? 'document' : undefined,
          fileData: {
            mimeType: resolvedMime,
            base64,
            fileName: params.file.name,
          },
          aiSettings: {
            depth: siteSettings.aiDefaultDepth,
            language: siteSettings.aiDefaultLanguage,
            customInstruction: siteSettings.aiCustomInstruction,
          },
        }),
      });
      const data = (await res.json()) as AnalyzeVideoResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze uploaded media.');
      }

      // Store binary media strictly on user's local device (IndexedDB), never in Firestore
      const resolvedItemType: InboxItemType = isImage
        ? 'screenshot'
        : isPdf
          ? 'document'
          : 'video';
      await saveLocalMedia(localMediaId, params.file, {
        fileName: params.file.name,
        mimeType: resolvedMime,
        itemType: resolvedItemType,
      });
      const previewUrl = URL.createObjectURL(params.file);
      const localRefUrl = `local://device/${localMediaId}`;
      const mergedTags = mergeAndNormalizeTags(data.tags, params.customTags);
      const normalizedData: AnalyzeVideoResponse = {
        ...data,
        tags: mergedTags,
        itemType: resolvedItemType,
        platform: isPdf ? 'pdf' : data.platform,
        url: localRefUrl,
      };

      const targetCollectionId =
        params.collectionId ||
        (sidebarFilter.type === 'collection' ? sidebarFilter.collectionId : '');

      let createdId: string;
      if (user && user.emailVerified) {
        createdId = await createFirestoreVideo(user, normalizedData, targetCollectionId, {
          saveReason: params.saveReason,
          notes: params.notes,
          localMediaId,
        });
      } else {
        createdId = generateSafeId('vid');
        const now = Date.now();
        const guestVideo: AnalyzedVideo = {
          id: createdId,
          ownerId: 'guest',
          itemType: resolvedItemType,
          url: localRefUrl,
          platform: normalizedData.platform,
          title: normalizedData.title,
          creator: normalizedData.creator,
          thumbnailUrl: '',
          durationLabel: normalizedData.durationLabel,
          category: normalizedData.category,
          collectionId: targetCollectionId,
          isFavorite: false,
          saveReason: params.saveReason?.trim() || '',
          localMediaId,
          summary: normalizedData.summary,
          tldrBullets: normalizedData.tldrBullets,
          tags: normalizedData.tags,
          segments: normalizedData.segments,
          transcript: normalizedData.transcript,
          links: normalizedData.links || [],
          notes: params.notes?.trim() || '',
          createdAtMs: now,
          updatedAtMs: now,
        };
        const updated = [guestVideo, ...videos];
        setVideos(updated);
        saveGuestVideos(updated);
      }

      setUploadedObjectUrls((prev) => ({
        ...prev,
        [createdId]: previewUrl,
        [localMediaId]: previewUrl,
      }));
      void getLocalMediaStats().then(setLocalStats);
      setIsSubmitOpen(false);
      setIsIncomingShare(false);
      setSubmitInitialFile(null);
      setActiveView('library');
      setSelectedVideoId(createdId);
      setPendingSeekSeconds(null);
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Unable to analyze uploaded media.');
    } finally {
      setIsAnalyzing(false);
      refreshUsageQuota();
    }
  };

  const handleAnalyzeText = async (params: {
    content: string;
    fileName?: string;
    sourceKind: 'text' | 'llm-chat';
    llmProvider?: string;
    title?: string;
    customFocus?: string;
    saveReason?: string;
    notes?: string;
    customTags?: string[];
    collectionId?: string;
  }) => {
    setAnalyzeError(null);
    setIsAnalyzing(true);
    try {
      const res = await authorizedFetch('/api/analyze-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: params.title,
          customFocus: params.customFocus,
          saveReason: params.saveReason,
          userNote: params.notes,
          modeHint: params.sourceKind === 'llm-chat' ? 'ai-chat' : 'document',
          textData: {
            content: params.content,
            fileName: params.fileName,
            sourceKind: params.sourceKind,
            llmProvider: params.llmProvider,
          },
          aiSettings: {
            depth: siteSettings.aiDefaultDepth,
            language: siteSettings.aiDefaultLanguage,
            customInstruction: siteSettings.aiCustomInstruction,
          },
        }),
      });
      const data = (await res.json()) as AnalyzeVideoResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze text or AI chat.');
      }

      const resolvedType: InboxItemType =
        params.sourceKind === 'llm-chat' ? 'ai-chat' : 'document';
      const mergedTags = mergeAndNormalizeTags(data.tags, params.customTags);
      const normalizedData: AnalyzeVideoResponse = {
        ...data,
        itemType: resolvedType,
        tags: mergedTags,
      };
      const targetCollectionId =
        params.collectionId ||
        (sidebarFilter.type === 'collection' ? sidebarFilter.collectionId : '');

      let createdId: string;
      if (user && user.emailVerified) {
        createdId = await createFirestoreVideo(user, normalizedData, targetCollectionId, {
          saveReason: params.saveReason,
          notes: params.notes,
        });
      } else {
        createdId = generateSafeId('vid');
        const now = Date.now();
        const guestItem: AnalyzedVideo = {
          id: createdId,
          ownerId: 'guest',
          itemType: resolvedType,
          url: normalizedData.url,
          platform: normalizedData.platform,
          title: normalizedData.title,
          creator: normalizedData.creator,
          thumbnailUrl: normalizedData.thumbnailUrl || '',
          durationLabel: normalizedData.durationLabel,
          category: normalizedData.category,
          collectionId: targetCollectionId,
          isFavorite: false,
          saveReason: params.saveReason?.trim() || '',
          summary: normalizedData.summary,
          tldrBullets: normalizedData.tldrBullets,
          tags: normalizedData.tags,
          segments: normalizedData.segments,
          transcript: normalizedData.transcript,
          links: normalizedData.links || [],
          notes: params.notes?.trim() || '',
          createdAtMs: now,
          updatedAtMs: now,
        };
        const updated = [guestItem, ...videos];
        setVideos(updated);
        saveGuestVideos(updated);
      }

      setIsSubmitOpen(false);
      setIsIncomingShare(false);
      setActiveView('library');
      setSelectedVideoId(createdId);
      setPendingSeekSeconds(null);
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Unable to analyze pasted content.');
    } finally {
      setIsAnalyzing(false);
      refreshUsageQuota();
    }
  };

  const handleImportBookmarks = async (params: {
    entries: ParsedBookmarkEntry[];
    saveReason?: string;
    notes?: string;
    customTags?: string[];
    collectionId?: string;
  }) => {
    setAnalyzeError(null);
    setIsAnalyzing(true);
    try {
      const targetCollectionId =
        params.collectionId ||
        (sidebarFilter.type === 'collection' ? sidebarFilter.collectionId : '');
      const guestBatch: AnalyzedVideo[] = [];

      const detectPlatformFromUrl = (rawUrl: string): VideoPlatform => {
        const lower = rawUrl.toLowerCase();
        if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
        if (lower.includes('tiktok.com')) return 'tiktok';
        if (lower.includes('instagram.com')) return 'instagram';
        if (lower.includes('facebook.com') || lower.includes('fb.watch')) return 'facebook';
        if (lower.includes('chatgpt.com') || lower.includes('chat.openai.com')) return 'chatgpt';
        if (lower.includes('gemini.google.com') || lower.includes('g.co/gemini')) return 'gemini';
        if (lower.includes('claude.ai')) return 'claude';
        return 'web';
      };

      for (const entry of params.entries.slice(0, 50)) {
        const plat = detectPlatformFromUrl(entry.url);
        const itemType: InboxItemType =
          plat === 'chatgpt' || plat === 'gemini' || plat === 'claude'
            ? 'ai-chat'
            : plat === 'youtube' || plat === 'tiktok' || plat === 'instagram' || plat === 'facebook'
              ? 'video'
              : 'link';
        const folderTag = entry.folder
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
        const tags = mergeAndNormalizeTags(
          ['bookmark', ...(folderTag ? [folderTag] : [])],
          params.customTags
        );
        let hostname = 'Web Bookmark';
        try {
          hostname = new URL(entry.url).hostname.replace(/^www\./, '');
        } catch {
          // ignore
        }
        const payload: AnalyzeVideoResponse = {
          itemType,
          url: entry.url,
          platform: plat,
          title: entry.title.slice(0, 180) || entry.url,
          creator: hostname,
          thumbnailUrl: '',
          durationLabel: 'Bookmark',
          category: entry.folder || 'Bookmarks',
          summary: `Imported browser bookmark (${entry.folder || 'Bookmarks'}): ${entry.title}`,
          tldrBullets: [
            `Bookmarked URL: ${entry.url}`,
            `Folder: ${entry.folder || 'Bookmarks'}`,
          ],
          tags,
          segments: [],
          transcript: [],
          links: [{ url: entry.url, label: entry.title || hostname, kind: 'resource' }],
          metadataSource: 'bookmark-import',
        };

        if (user && user.emailVerified) {
          await createFirestoreVideo(user, payload, targetCollectionId, {
            saveReason: params.saveReason || 'Browser bookmark import',
            notes: params.notes,
          });
        } else {
          const now = Date.now();
          guestBatch.push({
            id: generateSafeId('vid'),
            ownerId: 'guest',
            itemType: payload.itemType,
            url: payload.url,
            platform: payload.platform,
            title: payload.title,
            creator: payload.creator,
            thumbnailUrl: '',
            durationLabel: payload.durationLabel,
            category: payload.category,
            collectionId: targetCollectionId,
            isFavorite: false,
            saveReason: params.saveReason?.trim() || 'Browser bookmark import',
            summary: payload.summary,
            tldrBullets: payload.tldrBullets,
            tags: payload.tags,
            segments: [],
            transcript: [],
            links: payload.links || [],
            notes: params.notes?.trim() || '',
            createdAtMs: now,
            updatedAtMs: now,
          });
        }
      }

      if (guestBatch.length > 0) {
        const updated = [...guestBatch, ...videos];
        setVideos(updated);
        saveGuestVideos(updated);
      }

      setIsSubmitOpen(false);
      setIsIncomingShare(false);
      setActiveView('library');
      setSelectedVideoId(null);
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Unable to import browser bookmarks.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveReminder = async (input: UserReminderInput) => {
    if (user && user.emailVerified) {
      await saveUserReminder(user, input);
      return;
    }
    const now = Date.now();
    const id = input.id || generateSafeId('rem');
    const existing = reminders.find((r) => r.id === id);
    const nextItem: UserReminder = {
      id,
      ownerId: 'guest',
      title: input.title,
      note: input.note,
      videoId: input.videoId,
      videoTitle: input.videoTitle,
      dueAtMs: input.dueAtMs,
      recurrence: input.recurrence,
      status: input.status,
      channel: input.channel,
      lastSentAtMs: existing?.lastSentAtMs || 0,
      createdAtMs: existing?.createdAtMs || now,
      updatedAtMs: now,
    };
    const updated = existing
      ? reminders.map((r) => (r.id === id ? nextItem : r))
      : [nextItem, ...reminders];
    updated.sort((a, b) => a.dueAtMs - b.dueAtMs);
    setReminders(updated);
    saveGuestReminders(updated);
  };

  const handleDeleteReminder = async (reminderId: string) => {
    if (user && user.emailVerified) {
      await deleteUserReminder(user.uid, reminderId);
      return;
    }
    const updated = reminders.filter((r) => r.id !== reminderId);
    setReminders(updated);
    saveGuestReminders(updated);
  };

  const handleMarkReminderSent = async (reminderId: string) => {
    if (user && user.emailVerified) {
      await markUserReminderSent(user.uid, reminderId);
      return;
    }
    const now = Date.now();
    const updated = reminders.map((r) =>
      r.id === reminderId ? { ...r, lastSentAtMs: now, updatedAtMs: now } : r
    );
    setReminders(updated);
    saveGuestReminders(updated);
  };

  const handleSaveWhatsAppConfig = async (
    input: WhatsAppConfigInput,
    markTested = false
  ) => {
    if (user && user.emailVerified) {
      await saveOwnWhatsAppConfig(user, input, markTested);
      return;
    }
    const now = Date.now();
    const nextConfig: WhatsAppConfig = {
      uid: 'guest',
      enabled: input.enabled,
      phoneNumber: input.phoneNumber,
      displayLabel: input.displayLabel,
      autoIncludeItemLink: input.autoIncludeItemLink,
      deliveryMode: input.deliveryMode,
      lastTestedAtMs: markTested ? now : whatsappConfig?.lastTestedAtMs || 0,
      createdAtMs: whatsappConfig?.createdAtMs || now,
      updatedAtMs: now,
    };
    setWhatsappConfig(nextConfig);
    saveGuestWhatsAppConfig(nextConfig);
  };

  // Handle Web Share Target intake (files via /share-target?shared=... or links via ?url=...&text=...)
  // Opens the pre-filled save modal so the user can add "Why I saved this" and tags.
  useEffect(() => {
    if (!authReady) return;
    const params = new URLSearchParams(window.location.search);
    const isShareRoute = window.location.pathname === '/share-target';
    const sharedId = params.get('shared');
    const shareError = params.get('share-error');

    if (sharedId) {
      window.history.replaceState({}, document.title, '/');
      setAnalyzeError(null);
      setIsSubmitOpen(false);
      setActiveView('library');
      void (async () => {
        const shared = await consumeSharedTarget(sharedId);
        if (!shared) {
          setAnalyzeError('We could not read the shared item. Please try sharing it again.');
          return;
        }
        setIsIncomingShare(true);
        if (shared.file) {
          setSubmitInitialMode('screenshot');
          setSubmitInitialFile(shared.file);
          setSubmitInitialUrl(shared.url);
          setSubmitInitialTitle(shared.title || shared.file.name);
          setIsSubmitOpen(true);
          return;
        }
        const incomingValue = shared.url || shared.text;
        if (incomingValue) {
          setSubmitInitialMode('link');
          setSubmitInitialUrl(incomingValue);
          setSubmitInitialTitle(shared.title);
          setIsSubmitOpen(true);
        }
      })();
      return;
    }

    if (shareError) {
      window.history.replaceState({}, document.title, '/');
      setActiveView('library');
      setAnalyzeError('We could not read the shared item. Please try sharing it again.');
      return;
    }

    if (isShareRoute || params.has('url') || params.has('text')) {
      const { url, title, text } = extractUrlFromShareParams(params);
      window.history.replaceState({}, document.title, '/');
      const incomingValue = url || text;
      if (incomingValue) {
        setAnalyzeError(null);
        setSubmitInitialMode('link');
        setSubmitInitialUrl(incomingValue);
        setSubmitInitialTitle(title);
        setIsIncomingShare(true);
        setIsSubmitOpen(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setSelectedVideoId(null);
      setActiveView('home');
    } catch (err) {
      console.error('Sign out failed:', err);
    }
  };

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCollectionName.trim();
    if (!trimmed) return;

    if (user && user.emailVerified) {
      const newId = await createFirestoreCollection(user, trimmed);
      setSidebarFilter({ type: 'collection', collectionId: newId });
    } else {
      const now = Date.now();
      const col: VideoCollection = {
        id: generateSafeId('col'),
        ownerId: 'guest',
        name: trimmed.slice(0, 80),
        description: '',
        createdAtMs: now,
        updatedAtMs: now,
      };
      const updated = [...collections, col];
      setCollections(updated);
      saveGuestCollections(updated);
      setSidebarFilter({ type: 'collection', collectionId: col.id });
    }
    setActiveView('library');
    setNewCollectionName('');
    setIsAddingCollection(false);
  };

  const handleDeleteCollection = async (collectionId: string) => {
    if (user && user.emailVerified) {
      await deleteFirestoreCollection(user.uid, collectionId);
    } else {
      const updatedCols = collections.filter((c) => c.id !== collectionId);
      setCollections(updatedCols);
      saveGuestCollections(updatedCols);
      const updatedVids = videos.map((v) =>
        v.collectionId === collectionId ? { ...v, collectionId: '' } : v
      );
      setVideos(updatedVids);
      saveGuestVideos(updatedVids);
    }
    if (sidebarFilter.type === 'collection' && sidebarFilter.collectionId === collectionId) {
      setSidebarFilter({ type: 'all' });
    }
  };

  const handleToggleFavorite = async (video: AnalyzedVideo) => {
    const nextFav = !video.isFavorite;
    if (user && user.emailVerified) {
      await toggleFirestoreFavorite(user.uid, video.id, nextFav);
    } else {
      const updated = videos.map((v) =>
        v.id === video.id ? { ...v, isFavorite: nextFav, updatedAtMs: Date.now() } : v
      );
      setVideos(updated);
      saveGuestVideos(updated);
    }
  };

  const handleChangeCollection = async (videoId: string, collectionId: string) => {
    if (user && user.emailVerified) {
      await updateFirestoreVideoCollection(user.uid, videoId, collectionId);
    } else {
      const updated = videos.map((v) =>
        v.id === videoId ? { ...v, collectionId, updatedAtMs: Date.now() } : v
      );
      setVideos(updated);
      saveGuestVideos(updated);
    }
  };

  const handleUpdateTags = async (videoId: string, tags: string[]) => {
    if (user && user.emailVerified) {
      await updateFirestoreVideoTags(user.uid, videoId, tags);
    } else {
      const updated = videos.map((v) =>
        v.id === videoId ? { ...v, tags, updatedAtMs: Date.now() } : v
      );
      setVideos(updated);
      saveGuestVideos(updated);
    }
  };

  const handleUpdateNotes = async (videoId: string, notes: string, saveReason?: string) => {
    if (user && user.emailVerified) {
      await updateFirestoreVideoNotes(user.uid, videoId, notes, saveReason);
    } else {
      const updated = videos.map((v) =>
        v.id === videoId
          ? {
              ...v,
              notes,
              ...(typeof saveReason === 'string' ? { saveReason } : {}),
              updatedAtMs: Date.now(),
            }
          : v
      );
      setVideos(updated);
      saveGuestVideos(updated);
    }
  };

  const handleUpdateLinks = async (videoId: string, links: ExtractedLink[]) => {
    if (user && user.emailVerified) {
      await updateFirestoreVideoLinks(user.uid, videoId, links);
    } else {
      const updated = videos.map((v) =>
        v.id === videoId ? { ...v, links, updatedAtMs: Date.now() } : v
      );
      setVideos(updated);
      saveGuestVideos(updated);
    }
  };

  const handleDeleteVideo = async (videoId: string) => {
    const target = videos.find((v) => v.id === videoId);
    if (user && user.emailVerified) {
      await deleteFirestoreVideo(user.uid, videoId);
    } else {
      const updated = videos.filter((v) => v.id !== videoId);
      setVideos(updated);
      saveGuestVideos(updated);
    }
    await deleteLocalMedia(target?.localMediaId || videoId);
    void getLocalMediaStats().then(setLocalStats);
    if (selectedVideoId === videoId) {
      setSelectedVideoId(null);
    }
  };

  const topTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of videos) {
      for (const tag of v.tags) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 14);
  }, [videos]);

  const filteredVideos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return videos.filter((v) => {
      if (sidebarFilter.type === 'favorites' && !v.isFavorite) return false;
      if (sidebarFilter.type === 'collection' && v.collectionId !== sidebarFilter.collectionId) {
        return false;
      }
      if (selectedItemType !== 'all' && getItemType(v) !== selectedItemType) return false;
      if (selectedPlatform !== 'all' && v.platform !== selectedPlatform) return false;
      if (selectedTag && !v.tags.includes(selectedTag)) return false;
      if (!q) return true;

      const inBasic =
        v.title.toLowerCase().includes(q) ||
        v.creator.toLowerCase().includes(q) ||
        v.summary.toLowerCase().includes(q) ||
        v.category.toLowerCase().includes(q) ||
        (v.saveReason && v.saveReason.toLowerCase().includes(q)) ||
        v.tags.some((t) => t.includes(q)) ||
        v.notes.toLowerCase().includes(q);
      if (inBasic) return true;

      const inLinks = (v.links || []).some(
        (lnk) =>
          lnk.label.toLowerCase().includes(q) ||
          lnk.url.toLowerCase().includes(q) ||
          (lnk.context && lnk.context.toLowerCase().includes(q))
      );
      if (inLinks) return true;

      const inSegments = v.segments.some(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.summary.toLowerCase().includes(q) ||
          (s.keyQuote && s.keyQuote.toLowerCase().includes(q))
      );
      if (inSegments) return true;

      return v.transcript.some((t) => t.text.toLowerCase().includes(q));
    });
  }, [videos, sidebarFilter, selectedItemType, selectedPlatform, selectedTag, searchQuery]);

  const selectedVideo = useMemo(
    () => videos.find((v) => v.id === selectedVideoId) || null,
    [videos, selectedVideoId]
  );

  const platformTabs: Array<{ id: VideoPlatform | 'all'; label: string }> = [
    { id: 'all', label: 'All Platforms' },
    { id: 'youtube', label: 'YouTube' },
    { id: 'tiktok', label: 'TikTok' },
    { id: 'instagram', label: 'Instagram' },
    { id: 'facebook', label: 'Facebook' },
    { id: 'web', label: 'Web Links' },
    ...(textPdfEnabled || videos.some((v) => getItemType(v) === 'document')
      ? ([
          { id: 'pdf', label: 'PDFs' },
          { id: 'document', label: 'Text Notes' },
        ] as Array<{ id: VideoPlatform; label: string }>)
      : []),
    ...(llmChatEnabled || videos.some((v) => getItemType(v) === 'ai-chat')
      ? ([
          { id: 'chatgpt', label: 'ChatGPT' },
          { id: 'gemini', label: 'Gemini' },
          { id: 'claude', label: 'Claude' },
          { id: 'llm', label: 'Other AI' },
        ] as Array<{ id: VideoPlatform; label: string }>)
      : []),
    { id: 'screenshot', label: 'Screenshots' },
    { id: 'upload', label: 'Local Clips' },
  ];

  const activeCollectionName =
    sidebarFilter.type === 'collection'
      ? collections.find((c) => c.id === sidebarFilter.collectionId)?.name
      : null;

  const sidebarContent = (
    <div className="flex flex-col h-full justify-between p-4 space-y-6">
      <div className="space-y-6 overflow-y-auto pr-1">
        {/* Universal Share Inbox Views */}
        <div className="space-y-1">
          <p className="px-2.5 text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
            Universal Share Inbox
          </p>
          <button
            type="button"
            onClick={() => {
              setActiveView('library');
              setSidebarFilter({ type: 'all' });
              setSelectedItemType('all');
              setSelectedVideoId(null);
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between px-2.5 py-2 text-sm rounded-lg transition-colors ${
              activeView === 'library' && sidebarFilter.type === 'all' && selectedItemType === 'all'
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Layers className="w-4 h-4" />
              All Saved Items
            </span>
            <span className="text-xs font-mono tabular-nums opacity-75">{videos.length}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveView('library');
              setSidebarFilter({ type: 'all' });
              setSelectedItemType('video');
              setSelectedVideoId(null);
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 text-sm rounded-lg transition-colors ${
              activeView === 'library' && sidebarFilter.type === 'all' && selectedItemType === 'video'
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Film className="w-4 h-4" />
              Videos
            </span>
            <span className="text-xs font-mono tabular-nums opacity-75">
              {videos.filter((v) => getItemType(v) === 'video').length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveView('library');
              setSidebarFilter({ type: 'all' });
              setSelectedItemType('screenshot');
              setSelectedVideoId(null);
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 text-sm rounded-lg transition-colors ${
              activeView === 'library' && sidebarFilter.type === 'all' && selectedItemType === 'screenshot'
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <ImageIcon className="w-4 h-4" />
              Screenshots
            </span>
            <span className="text-xs font-mono tabular-nums opacity-75">
              {videos.filter((v) => getItemType(v) === 'screenshot').length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveView('library');
              setSidebarFilter({ type: 'all' });
              setSelectedItemType('link');
              setSelectedVideoId(null);
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 text-sm rounded-lg transition-colors ${
              activeView === 'library' && sidebarFilter.type === 'all' && selectedItemType === 'link'
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Globe className="w-4 h-4" />
              Web &amp; Product Links
            </span>
            <span className="text-xs font-mono tabular-nums opacity-75">
              {videos.filter((v) => getItemType(v) === 'link').length}
            </span>
          </button>

          {(textPdfEnabled || videos.some((v) => getItemType(v) === 'document')) && (
            <button
              type="button"
              onClick={() => {
                setActiveView('library');
                setSidebarFilter({ type: 'all' });
                setSelectedItemType('document');
                setSelectedVideoId(null);
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 text-sm rounded-lg transition-colors ${
                activeView === 'library' && sidebarFilter.type === 'all' && selectedItemType === 'document'
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <FileText className="w-4 h-4" />
                Documents &amp; PDFs
              </span>
              <span className="text-xs font-mono tabular-nums opacity-75">
                {videos.filter((v) => getItemType(v) === 'document').length}
              </span>
            </button>
          )}

          {(llmChatEnabled || videos.some((v) => getItemType(v) === 'ai-chat')) && (
            <button
              type="button"
              onClick={() => {
                setActiveView('library');
                setSidebarFilter({ type: 'all' });
                setSelectedItemType('ai-chat');
                setSelectedVideoId(null);
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 text-sm rounded-lg transition-colors ${
                activeView === 'library' && sidebarFilter.type === 'all' && selectedItemType === 'ai-chat'
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Bot className="w-4 h-4" />
                AI Chat History
              </span>
              <span className="text-xs font-mono tabular-nums opacity-75">
                {videos.filter((v) => getItemType(v) === 'ai-chat').length}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setActiveView('library');
              setSidebarFilter({ type: 'favorites' });
              setSelectedItemType('all');
              setSelectedVideoId(null);
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between px-2.5 py-2 text-sm rounded-lg transition-colors ${
              activeView === 'library' && sidebarFilter.type === 'favorites'
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Star className="w-4 h-4" />
              Favorites
            </span>
            <span className="text-xs font-mono tabular-nums opacity-75">
              {videos.filter((v) => v.isFavorite).length}
            </span>
          </button>

          {(remindersEnabled || whatsappEnabled) && (
            <button
              type="button"
              onClick={() => {
                setActiveView('reminders');
                setSelectedVideoId(null);
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center justify-between px-2.5 py-2 text-sm rounded-lg transition-colors ${
                activeView === 'reminders'
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <AlarmClock className="w-4 h-4" />
                Reminders &amp; WhatsApp
              </span>
              <span className="text-xs font-mono tabular-nums opacity-75">
                {reminders.filter((r) => r.status === 'active').length}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setIsShareSetupOpen(true);
              setMobileMenuOpen(false);
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 rounded-lg transition-colors"
          >
            <Share2 className="w-4 h-4" />
            Share Sheet Setup
          </button>

          {siteSettings.pricingEnabled && (
            <button
              type="button"
              onClick={() => {
                setActiveView('pricing');
                setSelectedVideoId(null);
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-sm rounded-lg transition-colors ${
                activeView === 'pricing'
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              Pricing Plans
            </button>
          )}

          {localStats.count > 0 && (
            <div className="px-2.5 pt-1.5 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <HardDrive className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                Device cache: {localStats.count} {localStats.count === 1 ? 'file' : 'files'} ({formatBytes(localStats.totalBytes)})
              </span>
            </div>
          )}
        </div>

        {/* Workspace Dashboards */}
        {user && (
          <div className="space-y-1 pt-4 border-t border-slate-200 dark:border-slate-800">
            <p className="px-2.5 text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
              Workspace
            </p>
            <button
              type="button"
              onClick={() => {
                setActiveView('user-dashboard');
                setSelectedVideoId(null);
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-sm rounded-lg transition-colors ${
                activeView === 'user-dashboard'
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              User Dashboard
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setActiveView('admin');
                  setSelectedVideoId(null);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-sm rounded-lg transition-colors ${
                  activeView === 'admin'
                    ? 'bg-blue-600 text-white font-medium'
                    : 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30'
                }`}
              >
                <Shield className="w-4 h-4" />
                Admin Console
              </button>
            )}
          </div>
        )}

        {/* Collections */}
        <div className="space-y-1.5 pt-4 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between px-2.5">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Collections</p>
            <button
              type="button"
              onClick={() => setIsAddingCollection((v) => !v)}
              className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded"
              title="New collection"
              aria-label="New collection"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
          </div>

          {isAddingCollection && (
            <form onSubmit={(e) => void handleCreateCollection(e)} className="px-2 py-1 space-y-2">
              <input
                type="text"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                placeholder="Collection name..."
                autoFocus
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
              />
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsAddingCollection(false)}
                  className="px-2 py-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-2.5 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md"
                >
                  Create
                </button>
              </div>
            </form>
          )}

          {collections.length === 0 ? (
            <p className="px-2.5 py-1 text-xs text-slate-400 dark:text-slate-500">
              No collections yet
            </p>
          ) : (
            collections.map((col) => {
              const isSelected =
                activeView === 'library' &&
                sidebarFilter.type === 'collection' &&
                sidebarFilter.collectionId === col.id;
              const count = videos.filter((v) => v.collectionId === col.id).length;
              return (
                <div key={col.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveView('library');
                      setSidebarFilter({ type: 'collection', collectionId: col.id });
                      setSelectedVideoId(null);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex-1 flex items-center justify-between px-2.5 py-1.5 text-sm rounded-lg transition-colors min-w-0 ${
                      isSelected
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Bookmark className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{col.name}</span>
                    </span>
                    <span className="text-xs font-mono tabular-nums opacity-70 ml-2">{count}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteCollection(col.id)}
                    title="Delete collection"
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-600 transition-opacity"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Searchable Tags Index */}
        {topTags.length > 0 && (
          <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between px-2.5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Searchable Tags
              </p>
              {selectedTag && (
                <button
                  type="button"
                  onClick={() => setSelectedTag(null)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="px-2.5 flex flex-wrap gap-x-3 gap-y-1.5">
              {topTags.map(([tag, count]) => {
                const active = selectedTag === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      setActiveView('library');
                      setSelectedTag(active ? null : tag);
                      setSelectedVideoId(null);
                      setMobileMenuOpen(false);
                    }}
                    className={`text-xs transition-colors whitespace-nowrap ${
                      active
                        ? 'font-semibold text-blue-600 dark:text-blue-400 underline underline-offset-4'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    #{tag}{' '}
                    <span className="font-mono tabular-nums text-[11px] opacity-60">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Legal & Published Pages */}
        <div className="space-y-1 pt-4 border-t border-slate-200 dark:border-slate-800">
          <p className="px-2.5 text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
            Information
          </p>
          {displayPages.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => openPageBySlug(p.slug)}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg transition-colors text-left ${
                activeView === 'page' && activeSitePage.slug === p.slug
                  ? 'bg-slate-100 dark:bg-slate-800 font-medium text-slate-900 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
              }`}
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{p.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Account & Cloud Sync Footer */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
        {user ? (
          <div className="flex items-center justify-between gap-2 px-1">
            <button
              type="button"
              onClick={() => {
                setActiveView('user-dashboard');
                setSelectedVideoId(null);
                setMobileMenuOpen(false);
              }}
              className="flex items-center gap-2.5 min-w-0 text-left group"
            >
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={ownProfile?.displayName || user.displayName || 'Account'}
                  referrerPolicy="no-referrer"
                  className="w-7 h-7 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                  {(ownProfile?.displayName || user.displayName || user.email || 'U')
                    .slice(0, 1)
                    .toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                  {ownProfile?.displayName || user.displayName || 'Account'}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {user.emailVerified
                    ? isAdmin
                      ? 'Admin · Cloud synced'
                      : 'Cloud synced'
                    : 'Verify email to sync'}
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              title="Sign out"
              aria-label="Sign out"
              className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-snug px-1">
              Sign in or create an account to sync your library across devices.
            </p>
            <button
              type="button"
              onClick={() => setIsAuthModalOpen(true)}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
              Sign In / Sign Up
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const authModalNode = (
    <AuthModal
      isOpen={isAuthModalOpen}
      onClose={() => setIsAuthModalOpen(false)}
      currentUser={user}
      socialLoginEnabled={siteSettings.socialLoginEnabled}
      googleLoginEnabled={siteSettings.googleLoginEnabled}
      facebookLoginEnabled={siteSettings.facebookLoginEnabled}
      facebookAppId={siteSettings.facebookAppId}
      onOpenLegalPage={openPageBySlug}
      onUserVerified={() => {
        if (auth.currentUser) {
          void ensureUserProfile(auth.currentUser);
          void checkUserIsAdmin(auth.currentUser).then(setIsAdmin);
        }
      }}
    />
  );

  if (activeView === 'home') {
    return (
      <>
        <HomePage
          content={homepageContent}
          settings={siteSettings}
          isDark={isDark}
          isSignedIn={Boolean(user)}
          resolveImage={resolveMediaSrc}
          onToggleTheme={() => setIsDark((dark) => !dark)}
          onStart={openLibrary}
          onSignIn={() => setIsAuthModalOpen(true)}
          onOpenPage={openPageBySlug}
          onOpenLibrary={openLibrary}
          onHome={() => {
            setActiveView('home');
            setSelectedVideoId(null);
          }}
          onNavLink={handleNavLinkClick}
        />
        <ScrollToTop />
        {authModalNode}
        <OfflineIndicator />
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:rounded-lg focus:bg-blue-600 focus:text-white focus:text-xs focus:font-medium"
      >
        Skip to main content
      </a>

      {/* Top Bar */}
      <header className="sticky top-0 z-30 h-14 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-4 lg:px-6 flex items-center justify-between gap-6">
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="lg:hidden p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveView('library');
              setSelectedVideoId(null);
              setSidebarFilter({ type: 'all' });
            }}
            className="inline-flex items-center gap-2.5 text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
          >
            {headerLogoUrl && !logoLoadError ? (
              <img
                src={headerLogoUrl}
                alt={siteSettings.siteName}
                referrerPolicy="no-referrer"
                onError={() => setLogoLoadError(true)}
                className="h-7 max-w-[140px] object-contain"
              />
            ) : null}
            <span>{siteSettings.siteName}</span>
          </button>
        </div>

        {/* Cross-platform global search */}
        <div className="flex-1 max-w-xl hidden sm:block">
          <div className="relative">
            <Search
              className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search saved videos, screenshots, links, and tags"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setActiveView('library');
                if (selectedVideoId) setSelectedVideoId(null);
              }}
              placeholder="Search videos, screenshots, links, why-saved notes, and tags..."
              className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {visibleHeaderLinks.map((link) => {
            if (link.actionType === 'url') {
              const safeHref = sanitizeHttpUrl(link.target);
              if (!safeHref) return null;
              return (
                <a
                  key={link.id}
                  href={safeHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                >
                  {link.label}
                </a>
              );
            }
            const isCurrent =
              (link.actionType === 'view' && activeView === link.target && !selectedVideoId) ||
              (link.actionType === 'page' &&
                activeView === 'page' &&
                activeSitePage.slug === link.target);
            return (
              <button
                key={link.id}
                type="button"
                onClick={() => handleNavLinkClick(link)}
                className={`hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  isCurrent
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/70 dark:bg-blue-950/30'
                    : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {link.label}
              </button>
            );
          })}

          {!user ? (
            <button
              type="button"
              onClick={() => setIsAuthModalOpen(true)}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Sign In
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setActiveView('user-dashboard');
                setSelectedVideoId(null);
              }}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Dashboard
            </button>
          )}

          <NotificationBellPanel
            isSignedIn={Boolean(user && user.emailVerified)}
            isAdmin={isAdmin}
            userNotifications={userNotifications}
            adminNotifications={adminNotifications}
            adminInvoices={adminInvoices}
            userInvoices={userInvoices}
            reminders={reminders}
            remindersEnabled={remindersEnabled}
            readIds={readNotificationIds}
            onMarkRead={(notifId) => {
              if (user && user.emailVerified) {
                void markNotificationRead(user.uid, notifId);
              }
            }}
            onNavigateTarget={handleNotificationTarget}
          />

          <button
            type="button"
            onClick={() => {
              setActiveView('home');
              setSelectedVideoId(null);
              setSidebarFilter({ type: 'all' });
              setMobileMenuOpen(false);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            aria-label="Open homepage"
            title="Homepage"
            className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <Home className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => setIsDark((d) => !d)}
            aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            {isDark ? (
              <Sun className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setAnalyzeError(null);
              setIsIncomingShare(false);
              setSubmitInitialMode('link');
              setSubmitInitialUrl('');
              setSubmitInitialTitle('');
              setSubmitInitialFile(null);
              setIsSubmitOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            Save Item
          </button>
        </div>
      </header>

      {/* PWA Install Bar under Header Nav (shown across all pages, auto-hidden once installed on this device) */}
      <PWAInstallBar siteName={siteSettings.siteName} />

      {/* Main Workspace Shell */}
      <div className="flex-1 flex max-w-[1440px] w-full mx-auto">
        {/* Desktop Sidebar */}
        <aside
          aria-label="Primary navigation"
          className="hidden lg:block w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
        >
          <div className="sticky top-14 h-[calc(100vh-3.5rem)]">{sidebarContent}</div>
        </aside>

        {/* Mobile Drawer Sidebar */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <div
              className="fixed inset-0 bg-black/40"
              onClick={() => setMobileMenuOpen(false)}
            />
            <aside
              aria-label="Mobile navigation"
              className="relative w-72 max-w-[85vw] bg-white dark:bg-slate-900 h-full border-r border-slate-200 dark:border-slate-800 flex flex-col"
            >
              <div className="flex items-center justify-between px-4 h-14 border-b border-slate-200 dark:border-slate-800">
                <span className="inline-flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                  {headerLogoUrl && !logoLoadError ? (
                    <img
                      src={headerLogoUrl}
                      alt={siteSettings.siteName}
                      referrerPolicy="no-referrer"
                      className="h-6 max-w-[110px] object-contain shrink-0"
                    />
                  ) : null}
                  <span className="truncate">{siteSettings.siteName}</span>
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Open homepage"
                    title="Homepage"
                    onClick={() => {
                      setActiveView('home');
                      setSelectedVideoId(null);
                      setMobileMenuOpen(false);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                  >
                    <Home className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Close navigation menu"
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">{sidebarContent}</div>
            </aside>
          </div>
        )}

        {/* Main Content Viewport */}
        <main
          id="main-content"
          className="flex-1 min-w-0 flex flex-col justify-between p-4 sm:p-6 lg:p-8 space-y-8"
        >
          <div className="space-y-6">
            {user && !user.emailVerified && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200">
                <span>
                  Your email address <strong>{user.email}</strong> is not verified yet. Verify it to activate cloud library sync and profile saving.
                </span>
                <button
                  type="button"
                  onClick={() => setIsAuthModalOpen(true)}
                  className="px-3 py-1.5 font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors whitespace-nowrap"
                >
                  Verify Email
                </button>
              </div>
            )}

            {/* Mobile search input */}
            <div className="sm:hidden relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setActiveView('library');
                  if (selectedVideoId) setSelectedVideoId(null);
                }}
                placeholder="Search videos, timestamps, tags..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
              />
            </div>

            {activeView === 'user-dashboard' && user ? (
              <UserDashboard
                user={user}
                profile={ownProfile}
                privateInfo={ownPrivateInfo}
                allBadges={badges}
                plans={pricingPlans}
                invoices={userInvoices}
                userNotifications={userNotifications}
                checkoutEnabled={siteSettings.checkoutEnabled}
                remindersCount={reminders.filter((r) => r.status === 'active').length}
                whatsappConnected={Boolean(whatsappConfig?.enabled && whatsappConfig?.phoneNumber)}
                remindersFeatureEnabled={remindersEnabled || whatsappEnabled}
                videos={videos}
                collections={collections}
                isAdmin={isAdmin}
                onOpenLibrary={() => setActiveView('library')}
                onOpenAdmin={() => setActiveView('admin')}
                onOpenPricing={() => {
                  setActiveView('pricing');
                  setSelectedVideoId(null);
                }}
                onOpenReminders={() => {
                  setActiveView('reminders');
                  setSelectedVideoId(null);
                }}
                onPayDueInvoice={(inv) => {
                  setCheckoutDueInvoice(inv);
                  setCheckoutPlanId(inv.planId);
                  setCheckoutCycle(inv.billingCycle);
                  setActiveView('checkout');
                  setSelectedVideoId(null);
                }}
                onViewInvoice={(inv) => setActiveInvoiceModal(inv)}
                onOpenLegalPage={openPageBySlug}
              />
            ) : activeView === 'reminders' && (remindersEnabled || whatsappEnabled) ? (
              <RemindersPanel
                siteName={siteSettings.siteName}
                user={user}
                remindersEnabled={remindersEnabled}
                whatsappEnabled={whatsappEnabled}
                videos={videos}
                reminders={reminders}
                whatsappConfig={whatsappConfig}
                onSaveReminder={handleSaveReminder}
                onDeleteReminder={handleDeleteReminder}
                onMarkReminderSent={handleMarkReminderSent}
                onSaveWhatsAppConfig={handleSaveWhatsAppConfig}
                onOpenAuth={() => setIsAuthModalOpen(true)}
                onOpenSavedItem={(videoId) => {
                  setSelectedVideoId(videoId);
                  setActiveView('library');
                }}
                onBackToLibrary={() => setActiveView('library')}
              />
            ) : activeView === 'admin' && user && isAdmin ? (
              <AdminDashboard
                currentUser={user}
                initialTab={adminInitialTab}
                onClearInitialTab={() => setAdminInitialTab(undefined)}
                initialEditingPage={adminInitialEditPage}
                onClearInitialEditingPage={() => setAdminInitialEditPage(null)}
                onBackToLibrary={() => setActiveView('library')}
                onPreviewPage={(page) => {
                  setActivePageSlug(page.slug);
                  setActiveView('page');
                }}
              />
            ) : activeView === 'pricing' && siteSettings.pricingEnabled ? (
              <PricingPlans
                siteName={siteSettings.siteName}
                plans={pricingPlans}
                allBadges={badges}
                activePlanId={ownProfile?.activePlanId}
                checkoutEnabled={siteSettings.checkoutEnabled}
                isSignedIn={Boolean(user)}
                onBack={() => setActiveView('library')}
                onOpenAuth={() => setIsAuthModalOpen(true)}
                onSelectPlanForCheckout={(plan, cycle) => {
                  setCheckoutDueInvoice(null);
                  setCheckoutPlanId(plan.id);
                  setCheckoutCycle(cycle);
                  setActiveView('checkout');
                  setSelectedVideoId(null);
                }}
              />
            ) : activeView === 'checkout' && siteSettings.checkoutEnabled ? (
              <CheckoutPage
                user={user}
                profile={ownProfile}
                siteSettings={siteSettings}
                plans={pricingPlans}
                gateways={gateways}
                initialPlanId={checkoutPlanId}
                initialCycle={checkoutCycle}
                existingDueInvoice={checkoutDueInvoice}
                onBackToPricing={() => {
                  setCheckoutDueInvoice(null);
                  setActiveView(siteSettings.pricingEnabled ? 'pricing' : 'library');
                }}
                onOpenAuth={() => setIsAuthModalOpen(true)}
                onViewInvoice={(inv) => setActiveInvoiceModal(inv)}
                onCheckoutDone={() => {
                  setCheckoutDueInvoice(null);
                  setActiveView(user ? 'user-dashboard' : 'library');
                }}
              />
            ) : activeView === 'page' ? (
              <SitePageView
                page={activeSitePage}
                onBack={() => setActiveView(user ? 'library' : 'home')}
                isAdmin={isAdmin}
                onEditPage={(page) => {
                  setAdminInitialEditPage(page);
                  setActiveView('admin');
                }}
              />
            ) : selectedVideo ? (
              <VideoInspector
                video={selectedVideo}
                collections={collections}
                initialSeekSeconds={pendingSeekSeconds}
                uploadedPreviewUrl={
                  uploadedObjectUrls[selectedVideo.id] ||
                  (selectedVideo.localMediaId ? uploadedObjectUrls[selectedVideo.localMediaId] : undefined)
                }
                onBack={() => {
                  setSelectedVideoId(null);
                  setPendingSeekSeconds(null);
                }}
                onToggleFavorite={(v) => void handleToggleFavorite(v)}
                onChangeCollection={(vid, colId) => void handleChangeCollection(vid, colId)}
                onUpdateTags={(vid, tags) => void handleUpdateTags(vid, tags)}
                onUpdateNotes={(vid, notes, saveReason) =>
                  void handleUpdateNotes(vid, notes, saveReason)
                }
                onUpdateLinks={(vid, links) => void handleUpdateLinks(vid, links)}
                onDeleteVideo={(vid) => void handleDeleteVideo(vid)}
                onSelectTagFilter={(tag) => {
                  setSelectedTag(tag);
                  setSelectedVideoId(null);
                }}
              />
            ) : (
              <div className="space-y-6">
                {/* Universal Share Intake Bar */}
                <section className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                        {activeCollectionName
                          ? activeCollectionName
                          : sidebarFilter.type === 'favorites'
                            ? 'Favorite Items'
                            : selectedItemType === 'screenshot'
                              ? 'Saved Screenshots'
                              : selectedItemType === 'link'
                                ? 'Web & Product Links'
                                : selectedItemType === 'document'
                                  ? 'Documents, Notes & PDFs'
                                  : selectedItemType === 'ai-chat'
                                    ? 'Saved AI Chat History'
                                    : selectedItemType === 'video'
                                      ? 'Saved Videos'
                                      : 'Universal Share Inbox'}
                      </h1>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Save videos, screenshots (<kbd className="px-1 py-0.5 text-[10px] border border-slate-300 dark:border-slate-700 rounded">Ctrl+V</kbd>), web links
                        {textPdfEnabled ? ', text & PDFs' : ''}
                        {llmChatEnabled ? ', AI chats' : ''}
                        {bookmarkShareEnabled ? ', or browser bookmarks' : ''}. Local uploads stay on your device.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const next = !screenshotWatchEnabled;
                          setScreenshotWatchEnabled(next);
                          if (next) {
                            void checkClipboardForScreenshot(true);
                          }
                        }}
                        title="When active, returning to this tab or pressing PrintScreen after taking a screenshot automatically opens Save + Tag + Group."
                        className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors whitespace-nowrap ${
                          screenshotWatchEnabled
                            ? 'border-emerald-500/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Camera className="w-3.5 h-3.5" />
                        Screenshot Watch: {screenshotWatchEnabled ? 'On' : 'Off'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAnalyzeError(null);
                          setIsIncomingShare(false);
                          setSubmitInitialMode('screenshot');
                          setSubmitInitialFile(null);
                          setIsSubmitOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                      >
                        <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                        Screenshot
                      </button>
                      {textPdfEnabled && (
                        <button
                          type="button"
                          onClick={() => {
                            setAnalyzeError(null);
                            setIsIncomingShare(false);
                            setSubmitInitialMode('text-pdf');
                            setSubmitInitialFile(null);
                            setIsSubmitOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                        >
                          <FileText className="w-3.5 h-3.5 text-blue-600" />
                          Text / PDF
                        </button>
                      )}
                      {llmChatEnabled && (
                        <button
                          type="button"
                          onClick={() => {
                            setAnalyzeError(null);
                            setIsIncomingShare(false);
                            setSubmitInitialMode('llm-chat');
                            setSubmitInitialFile(null);
                            setIsSubmitOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                        >
                          <Bot className="w-3.5 h-3.5 text-blue-600" />
                          AI Chat
                        </button>
                      )}
                      {bookmarkShareEnabled && (
                        <button
                          type="button"
                          onClick={() => {
                            setAnalyzeError(null);
                            setIsIncomingShare(false);
                            setSubmitInitialMode('bookmarks');
                            setSubmitInitialFile(null);
                            setIsSubmitOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                        >
                          <BookmarkCheck className="w-3.5 h-3.5 text-blue-600" />
                          Bookmarks
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsShareSetupOpen(true)}
                        className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                      >
                        Share Setup
                      </button>
                    </div>
                  </div>
                  {clipboardWatchNotice && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">
                      {clipboardWatchNotice}
                    </p>
                  )}

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!quickLinkInput.trim() || isAnalyzing) return;
                      void handleAnalyzeUrl({
                        rawInput: quickLinkInput.trim(),
                        saveReason: quickSaveReason || undefined,
                        notes: quickNoteInput.trim() || undefined,
                      });
                    }}
                    className="space-y-2.5"
                  >
                    <div className="flex flex-col sm:flex-row gap-2.5">
                      <input
                        type="text"
                        value={quickLinkInput}
                        onChange={(e) => setQuickLinkInput(e.target.value)}
                        placeholder="Paste video URL (YouTube, TikTok, IG, FB) or any website / product link..."
                        disabled={isAnalyzing}
                        className="flex-1 px-3.5 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                      />
                      <select
                        aria-label="Why I saved this"
                        value={quickSaveReason}
                        onChange={(e) => setQuickSaveReason(e.target.value)}
                        disabled={isAnalyzing}
                        className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200"
                      >
                        <option value="">Why I saved this (optional)</option>
                        {SAVE_REASON_PRESETS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        disabled={isAnalyzing || !quickLinkInput.trim()}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                      >
                        {isAnalyzing ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          'Save & Index'
                        )}
                      </button>
                    </div>
                    {(quickLinkInput.trim() || quickSaveReason || quickNoteInput) && (
                      <input
                        type="text"
                        maxLength={400}
                        value={quickNoteInput}
                        onChange={(e) => setQuickNoteInput(e.target.value)}
                        placeholder="Quick note: why are you saving this? (e.g. 'check price later' or 'tool mentioned for zotomic')"
                        disabled={isAnalyzing}
                        className="w-full px-3.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                      />
                    )}
                  </form>

                  {analyzeError && !isSubmitOpen && (
                    <p className="text-xs text-red-600 dark:text-red-400">{analyzeError}</p>
                  )}
                </section>

                {/* Platform Segmented Controls & Active Filter Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800/80 rounded-lg overflow-x-auto max-w-full">
                    {platformTabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setSelectedPlatform(tab.id)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                          selectedPlatform === tab.id
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <span className="tabular-nums">
                      {filteredVideos.length} {filteredVideos.length === 1 ? 'item' : 'items'}
                      {selectedItemType !== 'all' ? ` · ${selectedItemType}` : ''}
                      {selectedPlatform !== 'all' ? ` · ${PLATFORM_LABELS[selectedPlatform]}` : ''}
                      {selectedTag ? ` · #${selectedTag}` : ''}
                    </span>
                    {(selectedItemType !== 'all' ||
                      selectedPlatform !== 'all' ||
                      selectedTag ||
                      searchQuery.trim()) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedItemType('all');
                          setSelectedPlatform('all');
                          setSelectedTag(null);
                          setSearchQuery('');
                        }}
                        className="text-blue-600 dark:text-blue-400 hover:underline font-medium whitespace-nowrap"
                      >
                        Reset filters
                      </button>
                    )}
                  </div>
                </div>

                {/* Library Feed */}
                <VideoLibraryList
                  videos={filteredVideos}
                  collections={collections}
                  localObjectUrls={uploadedObjectUrls}
                  searchQuery={searchQuery}
                  selectedItemType={selectedItemType}
                  selectedPlatform={selectedPlatform}
                  selectedTag={selectedTag}
                  selectedVideoId={selectedVideoId}
                  onSelectVideo={(id, jumpSec) => {
                    setSelectedVideoId(id);
                    setPendingSeekSeconds(typeof jumpSec === 'number' ? jumpSec : null);
                  }}
                  onSelectTag={(tag) => setSelectedTag(tag)}
                  onToggleFavorite={(v) => void handleToggleFavorite(v)}
                  onDeleteVideo={(vid) => void handleDeleteVideo(vid)}
                  onOpenSubmit={() => {
                    setAnalyzeError(null);
                    setIsIncomingShare(false);
                    setSubmitInitialMode('link');
                    setIsSubmitOpen(true);
                  }}
                />
              </div>
            )}
          </div>

          {/* Clean Dynamic Footer */}
          <footer className="pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
            <span>
              {siteSettings.footerText?.trim() ||
                `${siteSettings.siteName}${siteSettings.tagline ? ` · ${siteSettings.tagline}` : ''}`}
            </span>
            <div className="flex flex-wrap items-center gap-4">
              {visibleFooterLinks.map((link) => {
                if (link.actionType === 'url') {
                  const safeHref = sanitizeHttpUrl(link.target);
                  if (!safeHref) return null;
                  return (
                    <a
                      key={link.id}
                      href={safeHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-slate-900 dark:hover:text-slate-100 hover:underline"
                    >
                      {link.label}
                    </a>
                  );
                }
                return (
                  <button
                    key={link.id}
                    type="button"
                    onClick={() => handleNavLinkClick(link)}
                    className="hover:text-slate-900 dark:hover:text-slate-100 hover:underline"
                  >
                    {link.label}
                  </button>
                );
              })}
            </div>
          </footer>
        </main>
      </div>

      <VideoSubmitPanel
        isOpen={isSubmitOpen}
        onClose={() => {
          if (!isAnalyzing) {
            setIsSubmitOpen(false);
            setIsIncomingShare(false);
          }
        }}
        collections={collections}
        featureModules={featureModules}
        initialUrl={submitInitialUrl}
        initialTitle={submitInitialTitle}
        initialMode={submitInitialMode}
        initialFile={submitInitialFile}
        isIncomingShare={isIncomingShare}
        isSubmitting={isAnalyzing}
        errorMessage={analyzeError}
        usageQuota={usageQuota}
        onSubmitUrl={handleAnalyzeUrl}
        onSubmitFile={handleAnalyzeFile}
        onSubmitText={handleAnalyzeText}
        onSubmitBookmarks={handleImportBookmarks}
      />

      <ShareSetupModal
        isOpen={isShareSetupOpen}
        onClose={() => setIsShareSetupOpen(false)}
        bookmarkSharingEnabled={bookmarkShareEnabled}
        onOpenBookmarkImporter={() => {
          setAnalyzeError(null);
          setIsIncomingShare(false);
          setSubmitInitialMode('bookmarks');
          setIsSubmitOpen(true);
        }}
        onTestShareUrl={(url, title) => {
          setAnalyzeError(null);
          setSubmitInitialMode('link');
          setSubmitInitialUrl(url);
          setSubmitInitialTitle(title);
          setIsIncomingShare(true);
          setIsSubmitOpen(true);
        }}
      />

      {authModalNode}

      <InvoiceModal
        invoice={activeInvoiceModal}
        siteName={siteSettings.siteName}
        onClose={() => setActiveInvoiceModal(null)}
      />

      <OfflineIndicator />
      <ScrollToTop className="z-50" />
    </div>
  );
}
