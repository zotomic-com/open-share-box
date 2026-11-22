import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  CheckCircle2,
  CreditCard,
  Info,
  Shield,
  X,
} from 'lucide-react';
import type { BillingInvoice, SiteNotification, UserReminder } from '../types/video';
import { formatMoney } from '../lib/billingStore';
import { sanitizeHttpUrl } from '../lib/pageDefaults';

interface NotificationBellPanelProps {
  isSignedIn: boolean;
  isAdmin: boolean;
  userNotifications: SiteNotification[];
  adminNotifications: SiteNotification[];
  adminInvoices: BillingInvoice[];
  userInvoices: BillingInvoice[];
  reminders?: UserReminder[];
  remindersEnabled?: boolean;
  readIds: Set<string>;
  onMarkRead: (notifId: string) => void;
  onNavigateTarget: (linkTarget: string) => void;
}

export const NotificationBellPanel: React.FC<NotificationBellPanelProps> = ({
  isSignedIn,
  isAdmin,
  userNotifications,
  adminNotifications,
  adminInvoices,
  userInvoices,
  reminders = [],
  remindersEnabled = true,
  readIds,
  onMarkRead,
  onNavigateTarget,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeFeed, setActiveFeed] = useState<'user' | 'admin'>(isAdmin ? 'admin' : 'user');
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isAdmin && activeFeed === 'admin') {
      setActiveFeed('user');
    }
  }, [isAdmin, activeFeed]);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isOpen]);

  // Live automated billing alerts appended to the appropriate feed (separate User vs Admin)
  const automatedUserAlerts: SiteNotification[] = useMemo(() => {
    if (!isSignedIn) return [];
    const out: SiteNotification[] = [];
    for (const inv of userInvoices) {
      if (inv.status === 'due' || inv.status === 'expired') {
        out.push({
          id: `auto_usr_${inv.id}_${inv.status}`,
          audience: 'user',
          targetUid: inv.userId,
          title:
            inv.status === 'expired'
              ? `Plan Expired · ${inv.planName}`
              : `Payment Due · ${inv.invoiceNumber}`,
          message:
            inv.status === 'expired'
              ? `Your subscription for ${inv.planName} has expired. Renew to restore benefits.`
              : `Balance ${formatMoney(inv.totalAmount, inv.currency)} is due for ${inv.planName}.`,
          type: 'billing',
          linkLabel: 'Open Billing',
          linkTarget: 'view:user-dashboard',
          isActive: true,
          updatedBy: 'system',
          createdAtMs: inv.updatedAtMs || inv.createdAtMs,
          updatedAtMs: inv.updatedAtMs,
        });
      }
    }
    return out;
  }, [isSignedIn, userInvoices]);

  const automatedAdminAlerts: SiteNotification[] = useMemo(() => {
    if (!isAdmin) return [];
    const out: SiteNotification[] = [];
    for (const inv of adminInvoices) {
      if (inv.status === 'pending' || inv.status === 'due' || inv.status === 'expired') {
        out.push({
          id: `auto_adm_${inv.id}_${inv.status}`,
          audience: 'admin',
          targetUid: '',
          title:
            inv.status === 'pending'
              ? `Payment Awaiting Review · ${inv.invoiceNumber}`
              : inv.status === 'expired'
                ? `Expired Invoice · ${inv.invoiceNumber}`
                : `Due Invoice · ${inv.invoiceNumber}`,
          message: `${inv.userName || inv.userEmail || inv.userId} · ${inv.planName} (${formatMoney(
            inv.totalAmount,
            inv.currency
          )})${inv.transactionRef ? ` · Ref: ${inv.transactionRef}` : ''}`,
          type: 'billing',
          linkLabel: 'Manage Billing',
          linkTarget: 'view:admin-billing',
          isActive: true,
          updatedBy: 'system',
          createdAtMs: inv.updatedAtMs || inv.createdAtMs,
          updatedAtMs: inv.updatedAtMs,
        });
      }
    }
    return out;
  }, [isAdmin, adminInvoices]);

  const automatedReminderAlerts: SiteNotification[] = useMemo(() => {
    if (!isSignedIn || !remindersEnabled) return [];
    const now = Date.now();
    return reminders
      .filter((r) => r.status === 'active' && r.dueAtMs <= now)
      .map((r) => ({
        id: `auto_rem_${r.id}_${r.dueAtMs}`,
        audience: 'user',
        targetUid: r.ownerId,
        title: `Reminder Due · ${r.title}`,
        message: [
          r.videoTitle ? `Item: ${r.videoTitle}` : '',
          r.note || `Scheduled for ${new Date(r.dueAtMs).toLocaleString()}`,
        ]
          .filter(Boolean)
          .join(' — '),
        type: 'warning',
        linkLabel: 'Open Reminders',
        linkTarget: 'view:reminders',
        isActive: true,
        updatedBy: 'system',
        createdAtMs: r.dueAtMs,
        updatedAtMs: r.updatedAtMs,
      }));
  }, [isSignedIn, remindersEnabled, reminders]);

  const combinedUserFeed = useMemo(
    () =>
      [...automatedReminderAlerts, ...automatedUserAlerts, ...userNotifications].sort(
        (a, b) => b.createdAtMs - a.createdAtMs
      ),
    [automatedReminderAlerts, automatedUserAlerts, userNotifications]
  );

  const combinedAdminFeed = useMemo(
    () =>
      [...automatedAdminAlerts, ...adminNotifications].sort(
        (a, b) => b.createdAtMs - a.createdAtMs
      ),
    [automatedAdminAlerts, adminNotifications]
  );

  const unreadUserCount = combinedUserFeed.filter((n) => !readIds.has(n.id)).length;
  const unreadAdminCount = isAdmin
    ? combinedAdminFeed.filter((n) => !readIds.has(n.id)).length
    : 0;
  const totalUnread = unreadUserCount + unreadAdminCount;

  const displayedList = activeFeed === 'admin' && isAdmin ? combinedAdminFeed : combinedUserFeed;

  if (!isSignedIn) return null;

  const renderSeverityIcon = (type: SiteNotification['type']) => {
    if (type === 'success') return <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />;
    if (type === 'warning') return <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />;
    if (type === 'billing') return <CreditCard className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />;
    return <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />;
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-label={`Notifications (${totalUnread} unread)`}
        className="relative p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
      >
        <Bell className="w-4 h-4" aria-hidden="true" />
        {totalUnread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
            {totalUnread > 9 ? '9+' : totalUnread}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Notifications
            </h2>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close notifications"
              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {isAdmin && (
            <div className="grid grid-cols-2 border-b border-slate-200 dark:border-slate-800 text-xs font-medium bg-slate-50 dark:bg-slate-950/60">
              <button
                type="button"
                onClick={() => setActiveFeed('admin')}
                className={`py-2 px-3 inline-flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                  activeFeed === 'admin'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-900'
                    : 'border-transparent text-slate-600 dark:text-slate-400'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                Admin ({unreadAdminCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveFeed('user')}
                className={`py-2 px-3 inline-flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                  activeFeed === 'user'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-900'
                    : 'border-transparent text-slate-600 dark:text-slate-400'
                }`}
              >
                <Bell className="w-3.5 h-3.5" />
                User ({unreadUserCount})
              </button>
            </div>
          )}

          <div className="max-h-96 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
            {displayedList.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No notifications in this inbox.
              </div>
            ) : (
              displayedList.map((n) => {
                const isRead = readIds.has(n.id);
                const safeExtUrl =
                  n.linkTarget && /^https?:\/\//i.test(n.linkTarget)
                    ? sanitizeHttpUrl(n.linkTarget)
                    : '';
                return (
                  <div
                    key={n.id}
                    className={`p-3.5 space-y-1.5 ${
                      isRead ? 'opacity-75' : 'bg-blue-50/40 dark:bg-blue-950/15'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {renderSeverityIcon(n.type)}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                            {n.title}
                          </p>
                          {!isRead && (
                            <button
                              type="button"
                              onClick={() => onMarkRead(n.id)}
                              title="Mark as read"
                              className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 shrink-0"
                            >
                              <CheckCheck className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          {n.message}
                        </p>
                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          <span className="text-[11px] font-mono tabular-nums text-slate-400">
                            {new Date(n.createdAtMs).toLocaleDateString()}
                          </span>
                          {n.linkTarget && (
                            safeExtUrl ? (
                              <a
                                href={safeExtUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => onMarkRead(n.id)}
                                className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                {n.linkLabel || 'Open link'}
                              </a>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  onMarkRead(n.id);
                                  onNavigateTarget(n.linkTarget || '');
                                  setIsOpen(false);
                                }}
                                className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                {n.linkLabel || 'View'}
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
