import React, { useEffect, useState } from 'react';
import { sendEmailVerification, sendPasswordResetEmail } from 'firebase/auth';
import type { User } from 'firebase/auth';
import {
  AlarmClock,
  Bell,
  Check,
  CreditCard,
  Eye,
  KeyRound,
  Loader2,
  Shield,
  User as UserIcon,
} from 'lucide-react';
import type {
  AnalyzedVideo,
  BillingInvoice,
  PricingPlan,
  SiteNotification,
  UserBadge,
  UserPrivateRecord,
  UserProfileRecord,
  VideoCollection,
} from '../types/video';
import { formatMoney } from '../lib/billingStore';
import { auth } from '../lib/firebase';
import { updateOwnUserDashboardProfile } from '../lib/libraryStore';
import { PLATFORM_LABELS } from '../lib/videoUtils';
import { BadgePill } from './BadgePill';

interface UserDashboardProps {
  user: User;
  profile: UserProfileRecord | null;
  privateInfo: UserPrivateRecord | null;
  allBadges: UserBadge[];
  plans: PricingPlan[];
  invoices: BillingInvoice[];
  userNotifications: SiteNotification[];
  checkoutEnabled: boolean;
  remindersCount?: number;
  whatsappConnected?: boolean;
  remindersFeatureEnabled?: boolean;
  videos: AnalyzedVideo[];
  collections: VideoCollection[];
  isAdmin: boolean;
  onOpenLibrary: () => void;
  onOpenAdmin: () => void;
  onOpenPricing: () => void;
  onOpenReminders?: () => void;
  onPayDueInvoice: (invoice: BillingInvoice) => void;
  onViewInvoice: (invoice: BillingInvoice) => void;
  onOpenLegalPage: (slug: string) => void;
}

export const UserDashboard: React.FC<UserDashboardProps> = ({
  user,
  profile,
  privateInfo,
  allBadges,
  plans,
  invoices,
  userNotifications,
  checkoutEnabled,
  remindersCount = 0,
  whatsappConnected = false,
  remindersFeatureEnabled = false,
  videos,
  collections,
  isAdmin,
  onOpenLibrary,
  onOpenAdmin,
  onOpenPricing,
  onOpenReminders,
  onPayDueInvoice,
  onViewInvoice,
  onOpenLegalPage,
}) => {
  const assignedBadges = (profile?.badgeIds || [])
    .map((id) => allBadges.find((b) => b.id === id))
    .filter((b): b is UserBadge => Boolean(b));
  const currentPlan = plans.find((p) => p.id === profile?.activePlanId);
  const [displayName, setDisplayName] = useState(
    profile?.displayName || user.displayName || ''
  );
  const [organization, setOrganization] = useState(profile?.organization || '');
  const [location, setLocation] = useState(profile?.location || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [email, setEmail] = useState(privateInfo?.email || user.email || '');
  const [phone, setPhone] = useState(privateInfo?.phone || '');
  const [address, setAddress] = useState(privateInfo?.address || '');

  const [isSaving, setIsSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [errorFeedback, setErrorFeedback] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(profile?.displayName || user.displayName || '');
    setOrganization(profile?.organization || '');
    setLocation(profile?.location || '');
    setBio(profile?.bio || '');
    setEmail(privateInfo?.email || user.email || '');
    setPhone(privateInfo?.phone || '');
    setAddress(privateInfo?.address || '');
  }, [profile, privateInfo, user]);

  const totalSegments = videos.reduce((acc, v) => acc + v.segments.length, 0);
  const totalFavorites = videos.filter((v) => v.isFavorite).length;

  const platformCounts = videos.reduce<Record<string, number>>((acc, v) => {
    acc[v.platform] = (acc[v.platform] || 0) + 1;
    return acc;
  }, {});

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveFeedback(null);
    setErrorFeedback(null);

    if (!user.emailVerified) {
      setErrorFeedback('Verify your email address first before updating cloud profile details.');
      return;
    }

    setIsSaving(true);
    try {
      await updateOwnUserDashboardProfile(
        user.uid,
        { displayName, bio, organization, location },
        { email, phone, address }
      );
      setSaveFeedback('Profile and contact information saved.');
      setTimeout(() => setSaveFeedback(null), 2500);
    } catch (err) {
      setErrorFeedback(err instanceof Error ? err.message : 'Failed to save profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendReset = async () => {
    if (!user.email) return;
    setErrorFeedback(null);
    setSaveFeedback(null);
    try {
      await sendPasswordResetEmail(auth, user.email);
      setSaveFeedback(`Password reset instructions sent to ${user.email}.`);
    } catch (err) {
      setErrorFeedback(err instanceof Error ? err.message : 'Unable to send reset email.');
    }
  };

  const handleVerifyEmail = async () => {
    setErrorFeedback(null);
    try {
      await sendEmailVerification(user);
      setSaveFeedback(`Verification email sent to ${user.email}.`);
    } catch (err) {
      setErrorFeedback(err instanceof Error ? err.message : 'Unable to send verification email.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Account Dashboard
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Manage your profile, contact details, security, and video library summary.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {remindersFeatureEnabled && onOpenReminders && (
            <button
              type="button"
              onClick={onOpenReminders}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
            >
              <AlarmClock className="w-3.5 h-3.5 text-blue-600" />
              Reminders ({remindersCount}){whatsappConnected ? ' · WhatsApp On' : ''}
            </button>
          )}
          <button
            type="button"
            onClick={onOpenLibrary}
            className="px-3.5 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
          >
            Back to Library
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={onOpenAdmin}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
            >
              <Shield className="w-3.5 h-3.5" />
              Admin Console
            </button>
          )}
        </div>
      </div>

      {/* KPI Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
        <div className="p-4 sm:p-5 space-y-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">Videos Indexed</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {videos.length}
          </p>
        </div>
        <div className="p-4 sm:p-5 space-y-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">Timestamp Segments</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {totalSegments}
          </p>
        </div>
        <div className="p-4 sm:p-5 space-y-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">Collections</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {collections.length}
          </p>
        </div>
        <div className="p-4 sm:p-5 space-y-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">Favorites</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {totalFavorites}
          </p>
        </div>
      </div>

      {profile?.status === 'suspended' && (
        <div className="p-4 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300">
          Your account status is currently marked as <strong>Suspended</strong> by an administrator.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Account Summary & Security */}
        <div className="lg:col-span-4 space-y-6">
          <section className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex items-center gap-3">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={displayName || 'User'}
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
                  <UserIcon className="w-5 h-5" />
                </div>
              )}
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {displayName || 'Creator'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {user.email}
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Role</span>
                <span className="font-medium text-slate-900 dark:text-slate-100 capitalize">
                  {isAdmin ? 'Admin' : profile?.role || 'User'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Account Status</span>
                <span className="font-medium text-emerald-700 dark:text-emerald-400 capitalize">
                  {profile?.status || 'Active'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Email Verification</span>
                <span
                  className={`font-medium ${
                    user.emailVerified
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {user.emailVerified ? 'Verified' : 'Pending'}
                </span>
              </div>
            </div>

            {assignedBadges.length > 0 && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Badges</p>
                <div className="flex flex-wrap gap-1.5">
                  {assignedBadges.map((b) => (
                    <BadgePill key={b.id} badge={b} size="sm" />
                  ))}
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              {!user.emailVerified && (
                <button
                  type="button"
                  onClick={() => void handleVerifyEmail()}
                  className="w-full py-2 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors"
                >
                  Resend Verification Email
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleSendReset()}
                className="w-full inline-flex items-center justify-center gap-2 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <KeyRound className="w-3.5 h-3.5" />
                Send Password Reset Email
              </button>
            </div>
          </section>

          {/* Platform Breakdown */}
          <section className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Library Breakdown
            </h2>
            {Object.keys(platformCounts).length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No videos saved yet.
              </p>
            ) : (
              <div className="space-y-2">
                {Object.entries(platformCounts).map(([plat, count]) => (
                  <div key={plat} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-300">
                      {PLATFORM_LABELS[plat as keyof typeof PLATFORM_LABELS] || plat}
                    </span>
                    <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
              <button
                type="button"
                onClick={() => onOpenLegalPage('terms-of-service')}
                className="hover:text-slate-900 dark:hover:text-slate-100 hover:underline"
              >
                Terms of Service
              </button>
              <button
                type="button"
                onClick={() => onOpenLegalPage('privacy-policy')}
                className="hover:text-slate-900 dark:hover:text-slate-100 hover:underline"
              >
                Privacy Policy
              </button>
            </div>
          </section>
        </div>

        {/* Right: Editable Profile & Private Contact Details */}
        <form
          onSubmit={(e) => void handleSaveProfile(e)}
          className="lg:col-span-8 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-6 space-y-5"
        >
          <div className="pb-3 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Profile & Contact Details
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Contact information is stored in an isolated private record accessible only to you and site administrators.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="prof-name"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Display Name
              </label>
              <input
                id="prof-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="prof-email"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Contact Email
              </label>
              <input
                id="prof-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="prof-org"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Organization / Team
              </label>
              <input
                id="prof-org"
                type="text"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="Studio or company"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="prof-phone"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Phone Number
              </label>
              <input
                id="prof-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="prof-location"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                City / Location
              </label>
              <input
                id="prof-location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="San Francisco, CA"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="prof-address"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Address
              </label>
              <input
                id="prof-address"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street, postal code"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="prof-bio"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Bio / Research Focus
            </label>
            <textarea
              id="prof-bio"
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="What topics or video formats do you index most often?"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
            />
          </div>

          {errorFeedback && (
            <p className="text-xs text-red-600 dark:text-red-400">{errorFeedback}</p>
          )}
          {saveFeedback && (
            <p className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" />
              {saveFeedback}
            </p>
          )}

          <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Save Profile Changes
            </button>
          </div>
        </form>
      </div>

      {/* Subscription, Billing & Invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-blue-600" />
              Subscription &amp; Plan
            </h2>
            <span
              className={`text-xs font-semibold capitalize ${
                profile?.planStatus === 'active'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : profile?.planStatus === 'due'
                    ? 'text-amber-600 dark:text-amber-400'
                    : profile?.planStatus === 'expired'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-slate-500'
              }`}
            >
              {profile?.planStatus && profile.planStatus !== 'none' ? profile.planStatus : 'Free'}
            </span>
          </div>

          <div className="space-y-1.5 text-xs">
            <p className="text-base font-bold text-slate-900 dark:text-slate-100">
              {currentPlan?.name || (profile?.activePlanId ? profile.activePlanId : 'Starter Free')}
            </p>
            {profile?.planExpiresAtMs ? (
              <p className="text-slate-500 dark:text-slate-400 tabular-nums">
                Expires on {new Date(profile.planExpiresAtMs).toLocaleDateString()}
              </p>
            ) : (
              <p className="text-slate-500 dark:text-slate-400">
                Upgrade anytime to unlock higher monthly AI quotas &amp; Pro Member badges.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenPricing}
            className="w-full py-2 px-3 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            {profile?.activePlanId && profile.activePlanId !== 'starter'
              ? 'Manage or Renew Plan'
              : 'View Plans & Upgrade'}
          </button>

          {userNotifications.length > 0 && (
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5 text-blue-600" />
                Recent Announcements
              </h3>
              <div className="space-y-2">
                {userNotifications.slice(0, 3).map((n) => (
                  <div
                    key={n.id}
                    className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-xs space-y-0.5"
                  >
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{n.title}</p>
                    <p className="text-slate-600 dark:text-slate-400">{n.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="lg:col-span-8 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Billing History &amp; Invoices
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                View receipts, check due dates, or submit payment references for pending bills.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4 font-medium">Invoice</th>
                  <th className="py-3 px-4 font-medium">Plan</th>
                  <th className="py-3 px-4 font-medium">Total</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 dark:text-slate-400">
                      No invoices or billing records yet.
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4">
                        <p className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {inv.invoiceNumber}
                        </p>
                        <p className="text-[11px] text-slate-500 tabular-nums">
                          {new Date(inv.createdAtMs).toLocaleDateString()}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900 dark:text-slate-100">
                          {inv.planName}
                        </p>
                        <p className="text-[11px] text-slate-500 capitalize">
                          {inv.billingCycle}
                          {inv.gatewayName ? ` · ${inv.gatewayName}` : ''}
                        </p>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                        {formatMoney(inv.totalAmount, inv.currency)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`font-semibold capitalize ${
                            inv.status === 'paid'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : inv.status === 'pending'
                                ? 'text-blue-600 dark:text-blue-400'
                                : inv.status === 'due'
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                        {(inv.status === 'due' || inv.status === 'expired') && checkoutEnabled && (
                          <button
                            type="button"
                            onClick={() => onPayDueInvoice(inv)}
                            className="px-2.5 py-1 text-[11px] font-medium text-white bg-blue-600 hover:bg-blue-700 rounded"
                          >
                            Pay Now
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onViewInvoice(inv)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Eye className="w-3 h-3" />
                          Invoice
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};
