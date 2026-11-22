import React, { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowDown,
  ArrowUp,
  Award,
  Bell,
  CheckCircle2,
  Cpu,
  CreditCard,
  Edit3,
  Eye,
  FileText,
  Globe,
  Image as ImageIcon,
  Loader2,
  Lock,
  Navigation,
  Plus,
  Puzzle,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Type as TypeIcon,
  Users,
  Video as VideoIcon,
  X,
} from 'lucide-react';
import type {
  AiBrainDepth,
  AnalyzedVideo,
  BillingInvoice,
  FeatureModuleConfig,
  FullUserRecord,
  PageBlock,
  PageBlockType,
  PageType,
  PaymentGateway,
  PricingPlan,
  SiteNotification,
  SitePage,
  SiteSettings,
  UserBadge,
  UserBadgeColor,
  UserProfileRecord,
  UserRole,
  UserStatus,
} from '../types/video';
import {
  adminCreateUser,
  adminDeleteUser,
  adminUpdateUser,
  DEFAULT_SITE_SETTINGS,
  deletePricingPlanAdmin,
  deleteSitePageAdmin,
  deleteUserBadgeAdmin,
  extractGoogleVerificationToken,
  fetchUserFullDetailsAdmin,
  normalizeGoogleHtmlFilename,
  savePricingPlanAdmin,
  saveSitePageAdmin,
  saveSiteSettingsAdmin,
  saveUserBadgeAdmin,
  seedDefaultLegalPagesAdmin,
  seedDefaultPricingPlansAdmin,
  subscribeAllPagesAdmin,
  subscribeAllUsersAdmin,
  subscribePricingPlans,
  subscribeSiteSettings,
  subscribeUserBadges,
} from '../lib/adminStore';
import type { AdminUserFormPayload, SiteSettingsInput } from '../lib/adminStore';
import {
  seedPlanBadgesAndMappingAdmin,
  subscribeAllInvoicesAdmin,
  subscribeAllNotificationsAdmin,
  subscribePaymentGateways,
} from '../lib/billingStore';
import { subscribeFeatureModules } from '../lib/featureStore';
import { apiUrl } from '../lib/apiClient';
import { getEmbeddableVideoInfo, sanitizeHttpUrl } from '../lib/pageDefaults';
import { generateSafeId, PLATFORM_LABELS } from '../lib/videoUtils';
import { AdminBillingPanel } from './AdminBillingPanel';
import { AdminModulesPanel } from './AdminModulesPanel';
import {
  AdminNavigationManager,
  AdminNotificationsManager,
} from './AdminNavNotificationsPanel';
import { BadgePill } from './BadgePill';
import { InvoiceModal } from './InvoiceModal';

export type AdminTab =
  | 'users'
  | 'billing'
  | 'notifications'
  | 'navigation'
  | 'modules'
  | 'badges'
  | 'pricing'
  | 'pages'
  | 'settings';

interface AdminDashboardProps {
  currentUser: User;
  initialTab?: AdminTab;
  onClearInitialTab?: () => void;
  initialEditingPage?: SitePage | null;
  onClearInitialEditingPage?: () => void;
  onBackToLibrary: () => void;
  onPreviewPage: (page: SitePage) => void;
}

const emptyUserForm: AdminUserFormPayload = {
  displayName: '',
  email: '',
  phone: '',
  address: '',
  organization: '',
  location: '',
  bio: '',
  role: 'user',
  status: 'active',
  adminNotes: '',
  badgeIds: [],
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currentUser,
  initialTab,
  onClearInitialTab,
  initialEditingPage,
  onClearInitialEditingPage,
  onBackToLibrary,
  onPreviewPage,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>(
    initialTab ? initialTab : initialEditingPage ? 'pages' : 'users'
  );

  // Users state
  const [users, setUsers] = useState<UserProfileRecord[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | UserStatus>('all');

  const [userFormMode, setUserFormMode] = useState<'create' | 'edit' | null>(null);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [userForm, setUserForm] = useState<AdminUserFormPayload>(emptyUserForm);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [userFormError, setUserFormError] = useState<string | null>(null);

  const [viewingUserDetails, setViewingUserDetails] = useState<{
    record: FullUserRecord;
    videos: AnalyzedVideo[];
  } | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [confirmDeleteUid, setConfirmDeleteUid] = useState<string | null>(null);

  // Pages CMS state
  const [pages, setPages] = useState<SitePage[]>([]);
  const [editingPage, setEditingPage] = useState<{
    id?: string;
    slug: string;
    title: string;
    subtitle: string;
    pageType: PageType;
    isPublished: boolean;
    blocks: PageBlock[];
  } | null>(null);
  const [isSavingPage, setIsSavingPage] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [confirmDeletePageId, setConfirmDeletePageId] = useState<string | null>(null);

  // Badges state
  const [badges, setBadges] = useState<UserBadge[]>([]);
  const [editingBadge, setEditingBadge] = useState<{
    id?: string;
    name: string;
    description: string;
    color: UserBadgeColor;
    icon: string;
  } | null>(null);
  const [isSavingBadge, setIsSavingBadge] = useState(false);
  const [badgeError, setBadgeError] = useState<string | null>(null);
  const [confirmDeleteBadgeId, setConfirmDeleteBadgeId] = useState<string | null>(null);
  const [isSeedingPlanBadges, setIsSeedingPlanBadges] = useState(false);
  const [planBadgeSeedMsg, setPlanBadgeSeedMsg] = useState<string | null>(null);

  // Billing, Payment Gateways, Notifications & Full Site Settings state
  const [fullSiteSettings, setFullSiteSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const [gateways, setGateways] = useState<PaymentGateway[]>([]);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [notifications, setNotifications] = useState<SiteNotification[]>([]);
  const [featureModules, setFeatureModules] = useState<FeatureModuleConfig[]>([]);
  const [modulesSeededInDb, setModulesSeededInDb] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<BillingInvoice | null>(null);

  // Pricing Plans state
  const [pricingPlans, setPricingPlans] = useState<PricingPlan[]>([]);
  const [editingPlan, setEditingPlan] = useState<{
    id?: string;
    name: string;
    tagline: string;
    monthlyPrice: string;
    yearlyMonthlyPrice: string;
    highlighted: boolean;
    badge: string;
    autoBadgeId: string;
    ctaLabel: string;
    featuresText: string;
    sortOrder: string;
  } | null>(null);
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [confirmDeletePlanId, setConfirmDeletePlanId] = useState<string | null>(null);

  // Site Settings & AI Brain state
  const [siteSettingsForm, setSiteSettingsForm] = useState<SiteSettingsInput>({
    siteName: DEFAULT_SITE_SETTINGS.siteName,
    tagline: DEFAULT_SITE_SETTINGS.tagline,
    logoUrl: DEFAULT_SITE_SETTINGS.logoUrl,
    faviconUrl: DEFAULT_SITE_SETTINGS.faviconUrl,
    metaTitle: DEFAULT_SITE_SETTINGS.metaTitle,
    metaDescription: DEFAULT_SITE_SETTINGS.metaDescription,
    ogImageUrl: DEFAULT_SITE_SETTINGS.ogImageUrl,
    canonicalUrl: DEFAULT_SITE_SETTINGS.canonicalUrl,
    googleSiteVerification: DEFAULT_SITE_SETTINGS.googleSiteVerification,
    googleHtmlFileName: DEFAULT_SITE_SETTINGS.googleHtmlFileName,
    googleHtmlFileContent: DEFAULT_SITE_SETTINGS.googleHtmlFileContent,
    aiDefaultDepth: DEFAULT_SITE_SETTINGS.aiDefaultDepth,
    aiDefaultLanguage: DEFAULT_SITE_SETTINGS.aiDefaultLanguage,
    aiCustomInstruction: DEFAULT_SITE_SETTINGS.aiCustomInstruction,
    socialLoginEnabled: DEFAULT_SITE_SETTINGS.socialLoginEnabled,
    googleLoginEnabled: DEFAULT_SITE_SETTINGS.googleLoginEnabled,
    facebookLoginEnabled: DEFAULT_SITE_SETTINGS.facebookLoginEnabled,
    facebookAppId: DEFAULT_SITE_SETTINGS.facebookAppId,
    pricingEnabled: DEFAULT_SITE_SETTINGS.pricingEnabled,
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [aiRuntimeStatus, setAiRuntimeStatus] = useState<{
    checked: boolean;
    geminiConfigured: boolean;
    model: string;
  }>({ checked: false, geminiConfigured: false, model: 'gemini-4-hydrogen' });

  useEffect(() => {
    const unsubUsers = subscribeAllUsersAdmin(setUsers);
    const unsubPages = subscribeAllPagesAdmin(setPages);
    const unsubBadges = subscribeUserBadges(setBadges);
    const unsubPlans = subscribePricingPlans(setPricingPlans);
    const unsubGateways = subscribePaymentGateways(setGateways);
    const unsubInvoices = subscribeAllInvoicesAdmin(setInvoices);
    const unsubNotifications = subscribeAllNotificationsAdmin(setNotifications);
    const unsubModules = subscribeFeatureModules((list, seeded) => {
      setFeatureModules(list);
      setModulesSeededInDb(seeded);
    });
    const unsubSettings = subscribeSiteSettings((s: SiteSettings) => {
      setFullSiteSettings(s);
      setSiteSettingsForm({
        siteName: s.siteName,
        tagline: s.tagline,
        logoUrl: s.logoUrl,
        faviconUrl: s.faviconUrl,
        metaTitle: s.metaTitle,
        metaDescription: s.metaDescription,
        ogImageUrl: s.ogImageUrl,
        canonicalUrl: s.canonicalUrl,
        googleSiteVerification: s.googleSiteVerification,
        googleHtmlFileName: s.googleHtmlFileName,
        googleHtmlFileContent: s.googleHtmlFileContent,
        aiDefaultDepth: s.aiDefaultDepth,
        aiDefaultLanguage: s.aiDefaultLanguage,
        aiCustomInstruction: s.aiCustomInstruction,
        socialLoginEnabled: s.socialLoginEnabled,
        googleLoginEnabled: s.googleLoginEnabled,
        facebookLoginEnabled: s.facebookLoginEnabled,
        facebookAppId: s.facebookAppId,
        pricingEnabled: s.pricingEnabled,
      });
    });

    fetch(apiUrl('/api/health'))
      .then((r) => r.json())
      .then((d: { geminiConfigured?: boolean; model?: string }) => {
        setAiRuntimeStatus({
          checked: true,
          geminiConfigured: Boolean(d.geminiConfigured),
          model: d.model || 'gemini-4-hydrogen',
        });
      })
      .catch(() => {
        setAiRuntimeStatus({
          checked: true,
          geminiConfigured: false,
          model: 'gemini-4-hydrogen',
        });
      });

    return () => {
      unsubUsers();
      unsubPages();
      unsubBadges();
      unsubPlans();
      unsubGateways();
      unsubInvoices();
      unsubNotifications();
      unsubModules();
      unsubSettings();
    };
  }, []);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
      onClearInitialTab?.();
    }
  }, [initialTab, onClearInitialTab]);

  useEffect(() => {
    if (initialEditingPage) {
      setActiveTab('pages');
      setEditingPage({
        id: initialEditingPage.id,
        slug: initialEditingPage.slug,
        title: initialEditingPage.title,
        subtitle: initialEditingPage.subtitle,
        pageType: initialEditingPage.pageType,
        isPublished: initialEditingPage.isPublished,
        blocks: initialEditingPage.blocks,
      });
      onClearInitialEditingPage?.();
    }
  }, [initialEditingPage, onClearInitialEditingPage]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      if (!q) return true;
      return (
        u.displayName.toLowerCase().includes(q) ||
        u.uid.toLowerCase().includes(q) ||
        u.organization.toLowerCase().includes(q) ||
        u.location.toLowerCase().includes(q)
      );
    });
  }, [users, userSearch, roleFilter, statusFilter]);

  const handleOpenCreateUser = () => {
    setUserForm(emptyUserForm);
    setEditingUid(null);
    setUserFormError(null);
    setUserFormMode('create');
  };

  const handleOpenEditUser = async (uid: string) => {
    setUserFormError(null);
    setIsLoadingDetails(true);
    try {
      const { record } = await fetchUserFullDetailsAdmin(uid);
      if (!record) return;
      setUserForm({
        displayName: record.profile.displayName,
        email: record.privateInfo?.email || '',
        phone: record.privateInfo?.phone || '',
        address: record.privateInfo?.address || '',
        organization: record.profile.organization,
        location: record.profile.location,
        bio: record.profile.bio,
        role: record.profile.role,
        status: record.profile.status,
        adminNotes: record.privateInfo?.adminNotes || '',
        badgeIds: record.profile.badgeIds || [],
      });
      setEditingUid(uid);
      setUserFormMode('edit');
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleViewFullUser = async (uid: string) => {
    setIsLoadingDetails(true);
    try {
      const result = await fetchUserFullDetailsAdmin(uid);
      if (result.record) {
        setViewingUserDetails({ record: result.record, videos: result.videos });
      }
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleSubmitUserForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserFormError(null);
    if (!userForm.displayName.trim()) {
      setUserFormError('Display name is required.');
      return;
    }

    setIsSavingUser(true);
    try {
      if (userFormMode === 'create') {
        await adminCreateUser(currentUser.uid, userForm);
      } else if (userFormMode === 'edit' && editingUid) {
        await adminUpdateUser(currentUser.uid, editingUid, userForm);
      }
      setUserFormMode(null);
      setEditingUid(null);
    } catch (err) {
      setUserFormError(err instanceof Error ? err.message : 'Unable to save user record.');
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleDeleteUser = async (uid: string) => {
    await adminDeleteUser(uid);
    setConfirmDeleteUid(null);
    if (viewingUserDetails?.record.profile.uid === uid) {
      setViewingUserDetails(null);
    }
  };

  const handleStartNewPage = () => {
    setPageError(null);
    setEditingPage({
      slug: '',
      title: '',
      subtitle: '',
      pageType: 'custom',
      isPublished: true,
      blocks: [
        {
          id: generateSafeId('blk'),
          type: 'heading',
          heading: 'Section Title',
        },
        {
          id: generateSafeId('blk'),
          type: 'text',
          content: '',
        },
      ],
    });
  };

  const handleAddBlock = (type: PageBlockType) => {
    if (!editingPage) return;
    const newBlock: PageBlock = {
      id: generateSafeId('blk'),
      type,
      ...(type === 'heading' ? { heading: '' } : {}),
      ...(type === 'text' ? { content: '' } : {}),
      ...(type === 'image' || type === 'video' ? { mediaUrl: '', caption: '' } : {}),
    };
    setEditingPage({
      ...editingPage,
      blocks: [...editingPage.blocks, newBlock],
    });
  };

  const handleUpdateBlock = (index: number, patch: Partial<PageBlock>) => {
    if (!editingPage) return;
    const next = editingPage.blocks.map((b, i) => (i === index ? { ...b, ...patch } : b));
    setEditingPage({ ...editingPage, blocks: next });
  };

  const handleMoveBlock = (index: number, direction: -1 | 1) => {
    if (!editingPage) return;
    const target = index + direction;
    if (target < 0 || target >= editingPage.blocks.length) return;
    const next = [...editingPage.blocks];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setEditingPage({ ...editingPage, blocks: next });
  };

  const handleRemoveBlock = (index: number) => {
    if (!editingPage) return;
    setEditingPage({
      ...editingPage,
      blocks: editingPage.blocks.filter((_, i) => i !== index),
    });
  };

  const handleSavePage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPage) return;
    setPageError(null);

    if (!editingPage.title.trim()) {
      setPageError('Page title is required.');
      return;
    }
    const computedSlug = (editingPage.slug || editingPage.title)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!computedSlug) {
      setPageError('Enter a valid URL slug (letters, numbers, hyphens).');
      return;
    }

    for (const blk of editingPage.blocks) {
      if ((blk.type === 'image' || blk.type === 'video') && blk.mediaUrl?.trim()) {
        if (!sanitizeHttpUrl(blk.mediaUrl)) {
          setPageError(`Invalid media URL in block "${blk.type}". Use an https:// or http:// URL.`);
          return;
        }
      }
    }

    setIsSavingPage(true);
    try {
      await saveSitePageAdmin(currentUser.uid, {
        ...editingPage,
        slug: computedSlug,
      });
      setEditingPage(null);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Unable to save page.');
    } finally {
      setIsSavingPage(false);
    }
  };

  const handleSaveSiteSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsMessage(null);

    if (!siteSettingsForm.siteName.trim()) {
      setSettingsMessage({ type: 'error', text: 'Site name is required.' });
      return;
    }

    for (const [label, val] of [
      ['Logo URL', siteSettingsForm.logoUrl],
      ['Favicon URL', siteSettingsForm.faviconUrl],
      ['OpenGraph Image URL', siteSettingsForm.ogImageUrl],
      ['Canonical URL', siteSettingsForm.canonicalUrl],
    ] as const) {
      if (val.trim() && !sanitizeHttpUrl(val)) {
        setSettingsMessage({
          type: 'error',
          text: `${label} must be a valid https:// or http:// URL.`,
        });
        return;
      }
    }

    if (
      siteSettingsForm.googleHtmlFileName.trim() &&
      !normalizeGoogleHtmlFilename(siteSettingsForm.googleHtmlFileName)
    ) {
      setSettingsMessage({
        type: 'error',
        text: 'Google verification filename must match the format googleXXXXXXXX.html.',
      });
      return;
    }

    setIsSavingSettings(true);
    try {
      await saveSiteSettingsAdmin(currentUser.uid, siteSettingsForm);
      setSettingsMessage({
        type: 'success',
        text: 'Site branding, SEO metadata, Google Search Console verification, and AI settings saved.',
      });
    } catch (err) {
      setSettingsMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to save site settings.',
      });
    } finally {
      setIsSavingSettings(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Admin Console
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Manage user accounts, CMS pages, site branding, Search Console verification, and AI behavior defaults.
          </p>
        </div>

        <button
          type="button"
          onClick={onBackToLibrary}
          className="px-3.5 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
        >
          Back to Library
        </button>
      </div>

      {/* Tab Switcher */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800/80 rounded-lg w-fit max-w-full">
        <button
          type="button"
          onClick={() => setActiveTab('users')}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === 'users'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Users className="w-3.5 h-3.5" aria-hidden="true" />
          Users ({users.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('billing')}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === 'billing'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Receipt className="w-3.5 h-3.5" aria-hidden="true" />
          Billing &amp; Revenue ({invoices.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('notifications')}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === 'notifications'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Bell className="w-3.5 h-3.5" aria-hidden="true" />
          Notifications ({notifications.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('navigation')}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === 'navigation'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Navigation className="w-3.5 h-3.5" aria-hidden="true" />
          Header &amp; Footer
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('modules')}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === 'modules'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Puzzle className="w-3.5 h-3.5" aria-hidden="true" />
          Features &amp; Connectors ({featureModules.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('badges')}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === 'badges'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Award className="w-3.5 h-3.5" aria-hidden="true" />
          Badges ({badges.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('pricing')}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === 'pricing'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" aria-hidden="true" />
          Pricing Plans ({pricingPlans.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('pages')}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === 'pages'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <FileText className="w-3.5 h-3.5" aria-hidden="true" />
          Pages &amp; Legal ({pages.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === 'settings'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Settings className="w-3.5 h-3.5" aria-hidden="true" />
          Site &amp; AI Settings
        </button>
      </div>

      {/* BILLING, GATEWAYS & CHECKOUT SETTINGS TAB */}
      {activeTab === 'billing' && (
        <AdminBillingPanel
          adminUid={currentUser.uid}
          users={users}
          plans={pricingPlans}
          siteSettings={fullSiteSettings}
          gateways={gateways}
          invoices={invoices}
          onViewInvoice={(inv) => setPreviewInvoice(inv)}
        />
      )}

      {/* SEPARATED ADMIN & USER NOTIFICATIONS TAB */}
      {activeTab === 'notifications' && (
        <AdminNotificationsManager
          adminUid={currentUser.uid}
          users={users}
          notifications={notifications}
        />
      )}

      {/* HEADER & FOOTER NAVIGATION TAB */}
      {activeTab === 'navigation' && (
        <AdminNavigationManager
          adminUid={currentUser.uid}
          siteSettings={fullSiteSettings}
          pages={pages}
        />
      )}

      {/* FEATURES & CONNECTORS TAB */}
      {activeTab === 'modules' && (
        <AdminModulesPanel
          adminUid={currentUser.uid}
          modules={featureModules}
          isSeededInDb={modulesSeededInDb}
        />
      )}

      {/* USERS TAB */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search name, UID, organization..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                />
              </div>

              <select
                aria-label="Filter by role"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as 'all' | UserRole)}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
              >
                <option value="all">All Roles</option>
                <option value="admin">Admin</option>
                <option value="user">User</option>
              </select>

              <select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | UserStatus)}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleOpenCreateUser}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Add User
            </button>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Joined</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-8 text-center text-xs text-slate-500 dark:text-slate-400"
                    >
                      No users match your filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr
                      key={u.uid}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="min-w-0 space-y-1">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                            {u.displayName}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate max-w-[200px]">
                            {u.organization || u.uid}
                          </p>
                          {u.activePlanId && (
                            <p className="text-[11px] text-blue-700 dark:text-blue-400 font-medium capitalize">
                              Plan: {u.activePlanId} ({u.planStatus || 'active'})
                            </p>
                          )}
                          {u.badgeIds.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {u.badgeIds
                                .map((bid) => badges.find((b) => b.id === bid))
                                .filter((b): b is UserBadge => Boolean(b))
                                .map((b) => (
                                  <BadgePill key={b.id} badge={b} size="sm" />
                                ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs font-medium">
                        <span
                          className={
                            u.role === 'admin'
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-slate-600 dark:text-slate-300'
                          }
                        >
                          {u.role === 'admin' ? 'Admin' : 'User'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs font-medium capitalize">
                        <span
                          className={
                            u.status === 'active'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : u.status === 'suspended'
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-amber-600 dark:text-amber-400'
                          }
                        >
                          {u.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                        {u.location || '—'}
                      </td>
                      <td className="py-3 px-4 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {new Date(u.createdAtMs).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void handleViewFullUser(u.uid)}
                            title="View full details"
                            className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 rounded-md"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleOpenEditUser(u.uid)}
                            title="Edit user"
                            className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-md"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {confirmDeleteUid === u.uid ? (
                            <div className="inline-flex items-center gap-1 ml-1">
                              <button
                                type="button"
                                onClick={() => void handleDeleteUser(u.uid)}
                                className="px-2 py-1 text-[11px] font-medium text-white bg-red-600 hover:bg-red-700 rounded"
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteUid(null)}
                                className="px-2 py-1 text-[11px] text-slate-600 dark:text-slate-300"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteUid(u.uid)}
                              title="Delete user"
                              className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-md"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* BADGES TAB */}
      {activeTab === 'badges' && (
        <div className="space-y-4">
          {!editingBadge ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Create, edit, or delete user badges, or seed the 3 automatic plan badges linked to Starter, Pro, and Power pricing tiers.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isSeedingPlanBadges}
                    onClick={async () => {
                      setIsSeedingPlanBadges(true);
                      setPlanBadgeSeedMsg(null);
                      try {
                        await seedPlanBadgesAndMappingAdmin(currentUser.uid);
                        setPlanBadgeSeedMsg(
                          'Created 3 plan badges (Starter Member, Pro Member, Power Member) and linked them to pricing plans.'
                        );
                      } catch (err) {
                        setPlanBadgeSeedMsg(
                          err instanceof Error ? err.message : 'Failed to create plan badges.'
                        );
                      } finally {
                        setIsSeedingPlanBadges(false);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
                  >
                    {isSeedingPlanBadges ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    )}
                    Create 3 Plan Badges &amp; Link Plans
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBadgeError(null);
                      setEditingBadge({
                        name: '',
                        description: '',
                        color: 'blue',
                        icon: 'award',
                      });
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    Add Badge
                  </button>
                </div>
              </div>

              {planBadgeSeedMsg && (
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  {planBadgeSeedMsg}
                </p>
              )}

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
                {badges.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-600 dark:text-slate-300">
                    No badges created yet. Click &ldquo;Create 3 Plan Badges &amp; Link Plans&rdquo; or &ldquo;Add Badge&rdquo; to begin.
                  </div>
                ) : (
                  badges.map((b) => {
                    const linkedPlan = pricingPlans.find((p) => p.autoBadgeId === b.id);
                    return (
                    <div
                      key={b.id}
                      className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <BadgePill badge={b} />
                          {linkedPlan && (
                            <span className="text-[11px] font-medium text-blue-700 dark:text-blue-400">
                              Auto-assigned on &ldquo;{linkedPlan.name}&rdquo;
                            </span>
                          )}
                        </div>
                        {b.description && (
                          <p className="text-xs text-slate-600 dark:text-slate-400">
                            {b.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setBadgeError(null);
                            setEditingBadge({
                              id: b.id,
                              name: b.name,
                              description: b.description,
                              color: b.color,
                              icon: b.icon,
                            });
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        {confirmDeleteBadgeId === b.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                void deleteUserBadgeAdmin(b.id);
                                setConfirmDeleteBadgeId(null);
                              }}
                              className="px-2.5 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteBadgeId(null)}
                              className="px-2 py-1.5 text-xs text-slate-600 dark:text-slate-300"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteBadgeId(b.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg"
                            title="Delete badge"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBadgeError(null);
                if (!editingBadge.name.trim()) {
                  setBadgeError('Badge name is required.');
                  return;
                }
                setIsSavingBadge(true);
                try {
                  await saveUserBadgeAdmin(currentUser.uid, editingBadge);
                  setEditingBadge(null);
                } catch (err) {
                  setBadgeError(err instanceof Error ? err.message : 'Unable to save badge.');
                } finally {
                  setIsSavingBadge(false);
                }
              }}
              className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-6 space-y-5"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {editingBadge.id ? `Edit Badge: ${editingBadge.name}` : 'Create User Badge'}
                </h2>
                <button
                  type="button"
                  onClick={() => setEditingBadge(null)}
                  className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                >
                  Cancel
                </button>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                <span className="text-xs text-slate-600 dark:text-slate-400">Preview:</span>
                <BadgePill
                  badge={{
                    name: editingBadge.name || 'Badge Name',
                    description: editingBadge.description,
                    color: editingBadge.color,
                    icon: editingBadge.icon,
                  }}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Badge Name
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    required
                    value={editingBadge.name}
                    onChange={(e) => setEditingBadge({ ...editingBadge, name: e.target.value })}
                    placeholder="e.g. Verified Creator"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Icon Style
                  </label>
                  <select
                    value={editingBadge.icon}
                    onChange={(e) => setEditingBadge({ ...editingBadge, icon: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  >
                    <option value="award">Award Medal</option>
                    <option value="shield">Verified Shield</option>
                    <option value="star">Star</option>
                    <option value="zap">Lightning Zap</option>
                    <option value="crown">Crown</option>
                    <option value="check">Checkmark</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Badge Color
                  </label>
                  <select
                    value={editingBadge.color}
                    onChange={(e) =>
                      setEditingBadge({
                        ...editingBadge,
                        color: e.target.value as UserBadgeColor,
                      })
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  >
                    <option value="blue">Blue</option>
                    <option value="emerald">Emerald</option>
                    <option value="amber">Amber</option>
                    <option value="violet">Violet</option>
                    <option value="rose">Rose</option>
                    <option value="slate">Slate</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Description (optional)
                  </label>
                  <input
                    type="text"
                    maxLength={160}
                    value={editingBadge.description}
                    onChange={(e) =>
                      setEditingBadge({ ...editingBadge, description: e.target.value })
                    }
                    placeholder="Awarded to founding members"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              {badgeError && <p className="text-xs text-red-600 dark:text-red-400">{badgeError}</p>}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingBadge(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingBadge}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg"
                >
                  {isSavingBadge ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Save Badge
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* PRICING PLANS TAB */}
      {activeTab === 'pricing' && (
        <div className="space-y-4">
          {!editingPlan ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Add, edit, or delete public pricing plans. Public pricing visibility can be toggled under Site &amp; AI Settings.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void seedDefaultPricingPlansAdmin(currentUser.uid)}
                    className="px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
                  >
                    Initialize Default Plans
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPlanError(null);
                      setEditingPlan({
                        name: '',
                        tagline: '',
                        monthlyPrice: '9',
                        yearlyMonthlyPrice: '7',
                        highlighted: false,
                        badge: '',
                        autoBadgeId: '',
                        ctaLabel: 'Choose Plan',
                        featuresText: '',
                        sortOrder: String(pricingPlans.length),
                      });
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    Add Plan
                  </button>
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
                {pricingPlans.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-600 dark:text-slate-300">
                    No custom plans stored in Firestore yet. Click &ldquo;Initialize Default Plans&rdquo; to edit Starter/Pro/Power tiers, or click &ldquo;Add Plan&rdquo;.
                  </div>
                ) : (
                  pricingPlans.map((plan) => {
                    const autoBadge = plan.autoBadgeId
                      ? badges.find((b) => b.id === plan.autoBadgeId)
                      : undefined;
                    return (
                    <div
                      key={plan.id}
                      className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {plan.name}
                          </h3>
                          {plan.highlighted && (
                            <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-blue-600 text-white">
                              {plan.badge || 'Highlighted'}
                            </span>
                          )}
                          <span className="text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300">
                            ${plan.monthlyPrice}/mo · ${plan.yearlyMonthlyPrice}/mo yearly
                          </span>
                          {autoBadge ? (
                            <BadgePill badge={autoBadge} size="sm" />
                          ) : plan.autoBadgeId ? (
                            <span className="text-[11px] font-mono text-amber-600 dark:text-amber-400">
                              Auto badge: {plan.autoBadgeId} (seed in Badges tab)
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          {plan.tagline || `${plan.features.length} features`} · Order #{plan.sortOrder}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setPlanError(null);
                            setEditingPlan({
                              id: plan.id,
                              name: plan.name,
                              tagline: plan.tagline,
                              monthlyPrice: String(plan.monthlyPrice),
                              yearlyMonthlyPrice: String(plan.yearlyMonthlyPrice),
                              highlighted: plan.highlighted,
                              badge: plan.badge,
                              autoBadgeId: plan.autoBadgeId || '',
                              ctaLabel: plan.ctaLabel,
                              featuresText: plan.features.join('\n'),
                              sortOrder: String(plan.sortOrder),
                            });
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        {confirmDeletePlanId === plan.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                void deletePricingPlanAdmin(plan.id);
                                setConfirmDeletePlanId(null);
                              }}
                              className="px-2.5 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeletePlanId(null)}
                              className="px-2 py-1.5 text-xs text-slate-600 dark:text-slate-300"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeletePlanId(plan.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg"
                            title="Delete plan"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setPlanError(null);
                if (!editingPlan.name.trim()) {
                  setPlanError('Plan name is required.');
                  return;
                }
                const mPrice = Number(editingPlan.monthlyPrice);
                const yPrice = Number(editingPlan.yearlyMonthlyPrice);
                if (Number.isNaN(mPrice) || mPrice < 0 || Number.isNaN(yPrice) || yPrice < 0) {
                  setPlanError('Prices must be valid non-negative numbers.');
                  return;
                }
                const features = editingPlan.featuresText
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean);

                setIsSavingPlan(true);
                try {
                  await savePricingPlanAdmin(currentUser.uid, {
                    id: editingPlan.id,
                    name: editingPlan.name,
                    tagline: editingPlan.tagline,
                    monthlyPrice: mPrice,
                    yearlyMonthlyPrice: yPrice,
                    highlighted: editingPlan.highlighted,
                    badge: editingPlan.badge,
                    autoBadgeId: editingPlan.autoBadgeId,
                    ctaLabel: editingPlan.ctaLabel,
                    features,
                    sortOrder: Math.max(0, Math.floor(Number(editingPlan.sortOrder) || 0)),
                  });
                  setEditingPlan(null);
                } catch (err) {
                  setPlanError(err instanceof Error ? err.message : 'Unable to save plan.');
                } finally {
                  setIsSavingPlan(false);
                }
              }}
              className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-6 space-y-5"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {editingPlan.id ? `Edit Plan: ${editingPlan.name}` : 'Create Pricing Plan'}
                </h2>
                <button
                  type="button"
                  onClick={() => setEditingPlan(null)}
                  className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Plan Name
                  </label>
                  <input
                    type="text"
                    maxLength={80}
                    required
                    value={editingPlan.name}
                    onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })}
                    placeholder="Pro Library"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Button Label (CTA)
                  </label>
                  <input
                    type="text"
                    maxLength={50}
                    required
                    value={editingPlan.ctaLabel}
                    onChange={(e) => setEditingPlan({ ...editingPlan, ctaLabel: e.target.value })}
                    placeholder="Choose Pro"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Monthly Price (USD)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={editingPlan.monthlyPrice}
                    onChange={(e) =>
                      setEditingPlan({ ...editingPlan, monthlyPrice: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Yearly Monthly Equivalent Price (USD)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={editingPlan.yearlyMonthlyPrice}
                    onChange={(e) =>
                      setEditingPlan({ ...editingPlan, yearlyMonthlyPrice: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Highlight Badge (optional)
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    value={editingPlan.badge}
                    onChange={(e) => setEditingPlan({ ...editingPlan, badge: e.target.value })}
                    placeholder="Best Value"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Display Sort Order
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editingPlan.sortOrder}
                    onChange={(e) => setEditingPlan({ ...editingPlan, sortOrder: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Auto-Assign Badge on Plan Activation
                  </label>
                  <select
                    value={editingPlan.autoBadgeId}
                    onChange={(e) =>
                      setEditingPlan({ ...editingPlan, autoBadgeId: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  >
                    <option value="">None (do not auto-assign a badge)</option>
                    {badges.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.id})
                      </option>
                    ))}
                    {!badges.some((b) => b.id === 'badge-starter') && (
                      <option value="badge-starter">Starter Member (badge-starter)</option>
                    )}
                    {!badges.some((b) => b.id === 'badge-pro') && (
                      <option value="badge-pro">Pro Member (badge-pro)</option>
                    )}
                    {!badges.some((b) => b.id === 'badge-team') && (
                      <option value="badge-team">Power Member (badge-team)</option>
                    )}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Tagline
                </label>
                <input
                  type="text"
                  maxLength={200}
                  value={editingPlan.tagline}
                  onChange={(e) => setEditingPlan({ ...editingPlan, tagline: e.target.value })}
                  placeholder="Recommended for heavy researchers & creators."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>

              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingPlan.highlighted}
                  onChange={(e) =>
                    setEditingPlan({ ...editingPlan, highlighted: e.target.checked })
                  }
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                Highlight this plan on the Pricing page
              </label>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Plan Features (one per line)
                </label>
                <textarea
                  rows={5}
                  value={editingPlan.featuresText}
                  onChange={(e) =>
                    setEditingPlan({ ...editingPlan, featuresText: e.target.value })
                  }
                  placeholder={'500 AI analyses per month\nUnlimited Collections & custom tags\nFull Markdown exports'}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>

              {planError && <p className="text-xs text-red-600 dark:text-red-400">{planError}</p>}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingPlan(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingPlan}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg"
                >
                  {isSavingPlan ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Save Plan
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* PAGES & LEGAL CMS TAB */}
      {activeTab === 'pages' && (
        <div className="space-y-4">
          {!editingPage ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Manage Terms of Service, Privacy Policy, and custom pages with text, image, and video blocks.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void seedDefaultLegalPagesAdmin(currentUser.uid)}
                    className="px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
                  >
                    Initialize Legal Defaults
                  </button>
                  <button
                    type="button"
                    onClick={handleStartNewPage}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Page
                  </button>
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
                {pages.length === 0 ? (
                  <div className="p-8 text-center space-y-3">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      No custom pages stored in Firestore yet. Click &ldquo;Initialize Legal Defaults&rdquo; to create editable Terms of Service and Privacy Policy pages, or add a new page.
                    </p>
                  </div>
                ) : (
                  pages.map((p) => (
                    <div
                      key={p.id}
                      className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {p.title}
                          </h3>
                          <span
                            className={`text-xs font-medium ${
                              p.isPublished
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {p.isPublished ? 'Published' : 'Draft'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-mono">/{p.slug}</span>
                          <span aria-hidden="true">·</span>
                          <span className="capitalize">{p.pageType}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">{p.blocks.length} content blocks</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onPreviewPage(p)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setEditingPage({
                              id: p.id,
                              slug: p.slug,
                              title: p.title,
                              subtitle: p.subtitle,
                              pageType: p.pageType,
                              isPublished: p.isPublished,
                              blocks: p.blocks,
                            })
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        {confirmDeletePageId === p.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                void deleteSitePageAdmin(p.id);
                                setConfirmDeletePageId(null);
                              }}
                              className="px-2.5 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeletePageId(null)}
                              className="px-2 py-1.5 text-xs text-slate-600 dark:text-slate-300"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeletePageId(p.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg"
                            title="Delete page"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <form
              onSubmit={(e) => void handleSavePage(e)}
              className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-6 space-y-5"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {editingPage.id ? `Edit Page: ${editingPage.title}` : 'Create New Page'}
                </h2>
                <button
                  type="button"
                  onClick={() => setEditingPage(null)}
                  className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Page Title
                  </label>
                  <input
                    type="text"
                    value={editingPage.title}
                    onChange={(e) => setEditingPage({ ...editingPage, title: e.target.value })}
                    placeholder="e.g. Terms of Service"
                    required
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    URL Slug
                  </label>
                  <input
                    type="text"
                    value={editingPage.slug}
                    onChange={(e) => setEditingPage({ ...editingPage, slug: e.target.value })}
                    placeholder="terms-of-service"
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Page Type
                  </label>
                  <select
                    value={editingPage.pageType}
                    onChange={(e) =>
                      setEditingPage({ ...editingPage, pageType: e.target.value as PageType })
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  >
                    <option value="legal">Legal (Terms / Privacy)</option>
                    <option value="guide">Guide / Help</option>
                    <option value="custom">Custom Page</option>
                  </select>
                </div>

                <div className="flex items-end pb-2">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingPage.isPublished}
                      onChange={(e) =>
                        setEditingPage({ ...editingPage, isPublished: e.target.checked })
                      }
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                    />
                    Published (visible to all users)
                  </label>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Subtitle / Summary (optional)
                </label>
                <input
                  type="text"
                  value={editingPage.subtitle}
                  onChange={(e) => setEditingPage({ ...editingPage, subtitle: e.target.value })}
                  placeholder="Short description displayed under the page heading"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>

              {/* Content Blocks Builder */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Page Content Blocks ({editingPage.blocks.length})
                  </h3>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleAddBlock('heading')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <TypeIcon className="w-3.5 h-3.5" />
                      + Heading
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddBlock('text')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      + Text
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddBlock('image')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      + Image
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddBlock('video')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <VideoIcon className="w-3.5 h-3.5" />
                      + Video
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {editingPage.blocks.map((blk, idx) => (
                    <div
                      key={blk.id}
                      className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Block {idx + 1} · {blk.type}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleMoveBlock(idx, -1)}
                            disabled={idx === 0}
                            className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 disabled:opacity-30"
                            title="Move up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveBlock(idx, 1)}
                            disabled={idx === editingPage.blocks.length - 1}
                            className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 disabled:opacity-30"
                            title="Move down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveBlock(idx)}
                            className="p-1 text-slate-400 hover:text-red-600"
                            title="Remove block"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {blk.type === 'heading' && (
                        <input
                          type="text"
                          value={blk.heading || ''}
                          onChange={(e) => handleUpdateBlock(idx, { heading: e.target.value })}
                          placeholder="Section heading..."
                          className="w-full px-3 py-2 text-sm font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                        />
                      )}

                      {blk.type === 'text' && (
                        <textarea
                          rows={4}
                          value={blk.content || ''}
                          onChange={(e) => handleUpdateBlock(idx, { content: e.target.value })}
                          placeholder="Write paragraph text..."
                          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                        />
                      )}

                      {(blk.type === 'image' || blk.type === 'video') && (
                        <div className="space-y-2.5">
                          <input
                            type="url"
                            value={blk.mediaUrl || ''}
                            onChange={(e) => handleUpdateBlock(idx, { mediaUrl: e.target.value })}
                            placeholder={
                              blk.type === 'image'
                                ? 'https://example.com/banner.jpg'
                                : 'https://www.youtube.com/watch?v=... or https://example.com/clip.mp4'
                            }
                            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                          />
                          <input
                            type="text"
                            value={blk.caption || ''}
                            onChange={(e) => handleUpdateBlock(idx, { caption: e.target.value })}
                            placeholder="Optional caption or alt text..."
                            className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                          />
                          {blk.type === 'image' && sanitizeHttpUrl(blk.mediaUrl) && (
                            <img
                              src={sanitizeHttpUrl(blk.mediaUrl)}
                              alt={blk.caption || 'Preview'}
                              referrerPolicy="no-referrer"
                              className="max-h-40 rounded-lg border border-slate-200 dark:border-slate-800 object-cover"
                            />
                          )}
                          {blk.type === 'video' &&
                            sanitizeHttpUrl(blk.mediaUrl) &&
                            (() => {
                              const info = getEmbeddableVideoInfo(blk.mediaUrl || '');
                              if (info.kind === 'youtube' || info.kind === 'vimeo') {
                                return (
                                  <div className="max-w-sm aspect-video rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-black">
                                    <iframe
                                      src={info.src}
                                      title="Video block preview"
                                      className="w-full h-full border-0"
                                    />
                                  </div>
                                );
                              }
                              return null;
                            })()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {pageError && <p className="text-xs text-red-600 dark:text-red-400">{pageError}</p>}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingPage(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingPage}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg"
                >
                  {isSavingPage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Save Page
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* SITE, SEO, GOOGLE SEARCH CONSOLE & AI BRAIN SETTINGS TAB */}
      {activeTab === 'settings' && (
        <form onSubmit={(e) => void handleSaveSiteSettings(e)} className="space-y-6">
          {/* 1. Brand Identity */}
          <section className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-6 space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Brand Identity, Logo &amp; Favicon
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Customize your workspace name, header logo, and browser tab favicon across all pages.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Site Name
                </label>
                <input
                  type="text"
                  maxLength={80}
                  required
                  value={siteSettingsForm.siteName}
                  onChange={(e) =>
                    setSiteSettingsForm({ ...siteSettingsForm, siteName: e.target.value })
                  }
                  placeholder="ClipIndex"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Site Tagline
                </label>
                <input
                  type="text"
                  maxLength={160}
                  value={siteSettingsForm.tagline}
                  onChange={(e) =>
                    setSiteSettingsForm({ ...siteSettingsForm, tagline: e.target.value })
                  }
                  placeholder="Video Timestamps, Summaries & Searchable Library"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Logo Image URL (https://)
                </label>
                <input
                  type="url"
                  maxLength={1000}
                  value={siteSettingsForm.logoUrl}
                  onChange={(e) =>
                    setSiteSettingsForm({ ...siteSettingsForm, logoUrl: e.target.value })
                  }
                  placeholder="https://yourdomain.com/logo.png"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
                {sanitizeHttpUrl(siteSettingsForm.logoUrl) && (
                  <div className="flex items-center gap-2 pt-1">
                    <img
                      src={sanitizeHttpUrl(siteSettingsForm.logoUrl)}
                      alt="Logo preview"
                      referrerPolicy="no-referrer"
                      className="h-7 max-w-[140px] object-contain rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-0.5"
                    />
                    <span className="text-[11px] text-slate-500">Header logo preview</span>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Favicon URL (https://)
                </label>
                <input
                  type="url"
                  maxLength={1000}
                  value={siteSettingsForm.faviconUrl}
                  onChange={(e) =>
                    setSiteSettingsForm({ ...siteSettingsForm, faviconUrl: e.target.value })
                  }
                  placeholder="https://yourdomain.com/favicon.png"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
                {sanitizeHttpUrl(siteSettingsForm.faviconUrl) && (
                  <div className="flex items-center gap-2 pt-1">
                    <img
                      src={sanitizeHttpUrl(siteSettingsForm.faviconUrl)}
                      alt="Favicon preview"
                      referrerPolicy="no-referrer"
                      className="w-5 h-5 object-contain rounded border border-slate-200 dark:border-slate-800"
                    />
                    <span className="text-[11px] text-slate-500">Browser tab icon preview</span>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* 2. SEO & Social Metadata */}
          <section className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-6 space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <Search className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  SEO &amp; Social Share Metadata
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Controls search engine titles, OpenGraph share cards, canonical domain, and XML sitemap URLs.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Meta Title (recommended 30–60 chars)
                  </label>
                  <span className="text-[11px] font-mono tabular-nums text-slate-400">
                    {siteSettingsForm.metaTitle.length}/120
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={120}
                  value={siteSettingsForm.metaTitle}
                  onChange={(e) =>
                    setSiteSettingsForm({ ...siteSettingsForm, metaTitle: e.target.value })
                  }
                  placeholder="ClipIndex — Video Timestamps, Summaries & Searchable Library"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Meta Description (recommended 120–160 chars)
                  </label>
                  <span className="text-[11px] font-mono tabular-nums text-slate-400">
                    {siteSettingsForm.metaDescription.length}/320
                  </span>
                </div>
                <textarea
                  rows={2}
                  maxLength={320}
                  value={siteSettingsForm.metaDescription}
                  onChange={(e) =>
                    setSiteSettingsForm({ ...siteSettingsForm, metaDescription: e.target.value })
                  }
                  placeholder="Extract timestamped segments, AI summaries, transcripts, and searchable tags..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    OpenGraph Social Share Image URL
                  </label>
                  <input
                    type="url"
                    maxLength={1000}
                    value={siteSettingsForm.ogImageUrl}
                    onChange={(e) =>
                      setSiteSettingsForm({ ...siteSettingsForm, ogImageUrl: e.target.value })
                    }
                    placeholder="https://yourdomain.com/og-preview.png"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Canonical Domain URL
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setSiteSettingsForm({
                          ...siteSettingsForm,
                          canonicalUrl: window.location.origin,
                        })
                      }
                      className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Use current origin
                    </button>
                  </div>
                  <input
                    type="url"
                    maxLength={500}
                    value={siteSettingsForm.canonicalUrl}
                    onChange={(e) =>
                      setSiteSettingsForm({ ...siteSettingsForm, canonicalUrl: e.target.value })
                    }
                    placeholder="https://yourdomain.com"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* 3. Google Search Console & Domain Verification */}
          <section className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Google Search Console &amp; Domain Verification
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Verify ownership in Google Search Console using either the HTML meta tag or HTML file method. Both are served directly by the server for Googlebot crawlers.
                  </p>
                </div>
              </div>
              <a
                href="https://search.google.com/search-console"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
              >
                Open Search Console &rarr;
              </a>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Method A: HTML Tag Verification Token (paste token or full &lt;meta&gt; tag)
                </label>
                <input
                  type="text"
                  maxLength={300}
                  value={siteSettingsForm.googleSiteVerification}
                  onChange={(e) =>
                    setSiteSettingsForm({
                      ...siteSettingsForm,
                      googleSiteVerification: extractGoogleVerificationToken(e.target.value),
                    })
                  }
                  placeholder='<meta name="google-site-verification" content="abc123..." /> or abc123...'
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
                {siteSettingsForm.googleSiteVerification && (
                  <p className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 break-all">
                    Active tag: &lt;meta name=&quot;google-site-verification&quot; content=&quot;
                    {siteSettingsForm.googleSiteVerification}&quot; /&gt;
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800/70">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Method B: HTML Verification Filename (optional)
                  </label>
                  <input
                    type="text"
                    maxLength={80}
                    value={siteSettingsForm.googleHtmlFileName}
                    onChange={(e) =>
                      setSiteSettingsForm({
                        ...siteSettingsForm,
                        googleHtmlFileName: e.target.value.trim().replace(/^\/+/, ''),
                      })
                    }
                    placeholder="google1234567890abcdef.html"
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Verification File Content
                  </label>
                  <input
                    type="text"
                    maxLength={200}
                    value={siteSettingsForm.googleHtmlFileContent}
                    onChange={(e) =>
                      setSiteSettingsForm({
                        ...siteSettingsForm,
                        googleHtmlFileContent: e.target.value,
                      })
                    }
                    placeholder="google-site-verification: google1234567890abcdef.html"
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Automatic endpoints also active: <span className="font-mono">/robots.txt</span> and{' '}
                <span className="font-mono">/sitemap.xml</span>.
              </p>
            </div>
          </section>

          {/* 4. AI Brain Runtime & Behavior Defaults (No API Key Inputs) */}
          <section className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    AI Brain Configuration
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Configure default Gemini reasoning depth, output language, and extraction guidance for all users.
                  </p>
                </div>
              </div>

              <div className="text-xs font-medium">
                {aiRuntimeStatus.checked ? (
                  aiRuntimeStatus.geminiConfigured ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Server Key Active · {aiRuntimeStatus.model}
                    </span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">
                      Set GEMINI_API_KEY in AI Studio Settings &gt; Secrets
                    </span>
                  )
                ) : (
                  <span className="text-slate-400">Checking server runtime...</span>
                )}
              </div>
            </div>

            <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Your Gemini free-tier API key is read securely on the backend from{' '}
              <span className="font-mono font-semibold">GEMINI_API_KEY</span> in AI Studio{' '}
              <strong>Settings &gt; Secrets</strong> and routed through{' '}
              <span className="font-mono">/api/analyze-video</span> using{' '}
              <span className="font-mono">{aiRuntimeStatus.model}</span>, keeping your key protected from browser exposure.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Default Reasoning Depth
                </label>
                <select
                  value={siteSettingsForm.aiDefaultDepth}
                  onChange={(e) =>
                    setSiteSettingsForm({
                      ...siteSettingsForm,
                      aiDefaultDepth: e.target.value as AiBrainDepth,
                    })
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                >
                  <option value="fast">Fast (Low latency · ideal for Gemini free tier)</option>
                  <option value="balanced">Balanced (Deeper synthesis for long videos)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Default Output Language
                </label>
                <input
                  type="text"
                  maxLength={60}
                  value={siteSettingsForm.aiDefaultLanguage}
                  onChange={(e) =>
                    setSiteSettingsForm({
                      ...siteSettingsForm,
                      aiDefaultLanguage: e.target.value,
                    })
                  }
                  placeholder="English (or Auto-detect, Spanish, French...)"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Default Extraction Guidance (optional)
              </label>
              <textarea
                rows={3}
                maxLength={1000}
                value={siteSettingsForm.aiCustomInstruction}
                onChange={(e) =>
                  setSiteSettingsForm({
                    ...siteSettingsForm,
                    aiCustomInstruction: e.target.value,
                  })
                }
                placeholder="e.g., Prioritize actionable steps, tools mentioned, key statistics, and memorable quotes."
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
          </section>

          {/* 5. Authentication & Pricing Plan Controls */}
          <section className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-6 space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <Lock className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Manual Social Login &amp; Pricing Visibility
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Enable or disable Google and Facebook signup/login manually, configure your Facebook App ID, and control public Pricing page visibility.
                </p>
              </div>
            </div>

            <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl">
              <div className="p-4 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    Google Signup &amp; Login
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Show &ldquo;Continue with Google&rdquo; on the Sign In and Create Account modal.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={siteSettingsForm.googleLoginEnabled}
                  aria-label="Toggle Google social signup and login"
                  onClick={() =>
                    setSiteSettingsForm({
                      ...siteSettingsForm,
                      googleLoginEnabled: !siteSettingsForm.googleLoginEnabled,
                    })
                  }
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600/40 ${
                    siteSettingsForm.googleLoginEnabled
                      ? 'bg-blue-600'
                      : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                      siteSettingsForm.googleLoginEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      Facebook Signup &amp; Login
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Show &ldquo;Continue with Facebook&rdquo;. Requires enabling Facebook Sign-In in Firebase Console with your Meta App ID &amp; Secret.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={siteSettingsForm.facebookLoginEnabled}
                    aria-label="Toggle Facebook social signup and login"
                    onClick={() =>
                      setSiteSettingsForm({
                        ...siteSettingsForm,
                        facebookLoginEnabled: !siteSettingsForm.facebookLoginEnabled,
                      })
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600/40 ${
                      siteSettingsForm.facebookLoginEnabled
                        ? 'bg-blue-600'
                        : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                        siteSettingsForm.facebookLoginEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Facebook App ID (numeric Meta App ID for reference)
                  </label>
                  <input
                    type="text"
                    maxLength={64}
                    value={siteSettingsForm.facebookAppId}
                    onChange={(e) =>
                      setSiteSettingsForm({
                        ...siteSettingsForm,
                        facebookAppId: e.target.value.replace(/[^0-9]/g, ''),
                      })
                    }
                    placeholder="e.g. 123456789012345"
                    className="w-full sm:max-w-xs px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="p-4 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    Pricing Plan Page &amp; Navigation
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Show or hide the public Pricing Plans page in the header, sidebar, and footer.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={siteSettingsForm.pricingEnabled}
                  aria-label="Toggle Pricing Plan visibility"
                  onClick={() =>
                    setSiteSettingsForm({
                      ...siteSettingsForm,
                      pricingEnabled: !siteSettingsForm.pricingEnabled,
                    })
                  }
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600/40 ${
                    siteSettingsForm.pricingEnabled
                      ? 'bg-blue-600'
                      : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                      siteSettingsForm.pricingEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </section>

          {settingsMessage && (
            <p
              className={`text-xs font-medium ${
                settingsMessage.type === 'success'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {settingsMessage.text}
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSavingSettings}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors"
            >
              {isSavingSettings ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Save Site &amp; AI Settings
            </button>
          </div>
        </form>
      )}

      {/* ADD / EDIT USER MODAL */}
      {userFormMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {userFormMode === 'create' ? 'Add New User' : 'Edit User Account'}
              </h2>
              <button
                type="button"
                onClick={() => setUserFormMode(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => void handleSubmitUserForm(e)}
              className="p-6 space-y-4 max-h-[80vh] overflow-y-auto"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={userForm.displayName}
                    onChange={(e) => setUserForm({ ...userForm, displayName: e.target.value })}
                    required
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Email
                  </label>
                  <input
                    type="email"
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Role
                  </label>
                  <select
                    value={userForm.role}
                    onChange={(e) =>
                      setUserForm({ ...userForm, role: e.target.value as UserRole })
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Status
                  </label>
                  <select
                    value={userForm.status}
                    onChange={(e) =>
                      setUserForm({ ...userForm, status: e.target.value as UserStatus })
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="active">Active</option>
                    <option value="pending">Pending</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={userForm.phone}
                    onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Organization
                  </label>
                  <input
                    type="text"
                    value={userForm.organization}
                    onChange={(e) => setUserForm({ ...userForm, organization: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Location
                  </label>
                  <input
                    type="text"
                    value={userForm.location}
                    onChange={(e) => setUserForm({ ...userForm, location: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Address
                  </label>
                  <input
                    type="text"
                    value={userForm.address}
                    onChange={(e) => setUserForm({ ...userForm, address: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Assigned Badges
                </label>
                {badges.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No badges created yet. Add badges in the Badges tab first.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60">
                    {badges.map((b) => {
                      const active = userForm.badgeIds.includes(b.id);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => {
                            const next = active
                              ? userForm.badgeIds.filter((id) => id !== b.id)
                              : [...userForm.badgeIds, b.id].slice(0, 10);
                            setUserForm({ ...userForm, badgeIds: next });
                          }}
                          className={`rounded-md p-0.5 transition-all ${
                            active
                              ? 'ring-2 ring-blue-600 ring-offset-1 dark:ring-offset-slate-900'
                              : 'opacity-55 hover:opacity-100'
                          }`}
                        >
                          <BadgePill badge={b} size="sm" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Bio
                </label>
                <textarea
                  rows={2}
                  value={userForm.bio}
                  onChange={(e) => setUserForm({ ...userForm, bio: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Admin Notes (Internal)
                </label>
                <textarea
                  rows={2}
                  value={userForm.adminNotes}
                  onChange={(e) => setUserForm({ ...userForm, adminNotes: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              {userFormError && (
                <p className="text-xs text-red-600 dark:text-red-400">{userFormError}</p>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setUserFormMode(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingUser}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg"
                >
                  {isSavingUser ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {userFormMode === 'create' ? 'Create User' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW FULL USER DETAILS MODAL */}
      {(viewingUserDetails || isLoadingDetails) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Full User Record
              </h2>
              <button
                type="button"
                onClick={() => setViewingUserDetails(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isLoadingDetails || !viewingUserDetails ? (
              <div className="p-10 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              </div>
            ) : (
              <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                      {viewingUserDetails.record.profile.displayName}
                    </h3>
                    <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      UID: {viewingUserDetails.record.profile.uid}
                    </p>
                    {viewingUserDetails.record.profile.badgeIds.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {viewingUserDetails.record.profile.badgeIds
                          .map((bid) => badges.find((b) => b.id === bid))
                          .filter((b): b is UserBadge => Boolean(b))
                          .map((b) => (
                            <BadgePill key={b.id} badge={b} size="sm" />
                          ))}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const uid = viewingUserDetails.record.profile.uid;
                      setViewingUserDetails(null);
                      void handleOpenEditUser(uid);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit User
                  </button>
                </div>

                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs border-t border-slate-200 dark:border-slate-800 pt-4">
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Role</dt>
                    <dd className="font-medium text-slate-900 dark:text-slate-100 capitalize mt-0.5">
                      {viewingUserDetails.record.profile.role}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Status</dt>
                    <dd className="font-medium text-slate-900 dark:text-slate-100 capitalize mt-0.5">
                      {viewingUserDetails.record.profile.status}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Active Plan</dt>
                    <dd className="font-medium text-slate-900 dark:text-slate-100 capitalize mt-0.5">
                      {viewingUserDetails.record.profile.activePlanId || 'Starter Free'}{' '}
                      {viewingUserDetails.record.profile.planStatus
                        ? `(${viewingUserDetails.record.profile.planStatus})`
                        : ''}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Plan Renewal / Expiry</dt>
                    <dd className="font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                      {viewingUserDetails.record.profile.planExpiresAtMs
                        ? new Date(
                            viewingUserDetails.record.profile.planExpiresAtMs
                          ).toLocaleDateString()
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Email</dt>
                    <dd className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                      {viewingUserDetails.record.privateInfo?.email || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Phone</dt>
                    <dd className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                      {viewingUserDetails.record.privateInfo?.phone || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Organization</dt>
                    <dd className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                      {viewingUserDetails.record.profile.organization || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Location</dt>
                    <dd className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                      {viewingUserDetails.record.profile.location || '—'}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-slate-500 dark:text-slate-400">Address</dt>
                    <dd className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                      {viewingUserDetails.record.privateInfo?.address || '—'}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-slate-500 dark:text-slate-400">Bio</dt>
                    <dd className="text-slate-700 dark:text-slate-300 mt-0.5">
                      {viewingUserDetails.record.profile.bio || '—'}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-slate-500 dark:text-slate-400">Internal Admin Notes</dt>
                    <dd className="text-slate-700 dark:text-slate-300 mt-0.5">
                      {viewingUserDetails.record.privateInfo?.adminNotes || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Created</dt>
                    <dd className="font-mono tabular-nums text-slate-700 dark:text-slate-300 mt-0.5">
                      {new Date(viewingUserDetails.record.profile.createdAtMs).toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Last Updated</dt>
                    <dd className="font-mono tabular-nums text-slate-700 dark:text-slate-300 mt-0.5">
                      {new Date(viewingUserDetails.record.profile.updatedAtMs).toLocaleString()}
                    </dd>
                  </div>
                </dl>

                <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-2.5">
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Saved Videos ({viewingUserDetails.videos.length})
                  </h4>
                  {viewingUserDetails.videos.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      This user has not saved any videos yet.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                      {viewingUserDetails.videos.slice(0, 10).map((v) => (
                        <div key={v.id} className="p-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                              {v.title}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              {PLATFORM_LABELS[v.platform]} · {v.segments.length} segments
                            </p>
                          </div>
                          <span className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
                            {new Date(v.createdAtMs).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <InvoiceModal
        invoice={previewInvoice}
        siteName={fullSiteSettings.siteName}
        onClose={() => setPreviewInvoice(null)}
      />
    </div>
  );
};
