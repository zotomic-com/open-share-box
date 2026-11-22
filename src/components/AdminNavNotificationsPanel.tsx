import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bell,
  Edit3,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Shield,
  Trash2,
} from 'lucide-react';
import type {
  NavLinkActionType,
  NavLinkItem,
  NotificationAudience,
  NotificationSeverity,
  SiteNotification,
  SitePage,
  SiteSettings,
  UserProfileRecord,
} from '../types/video';
import { updatePartialSiteSettingsAdmin } from '../lib/adminStore';
import { deleteNotificationAdmin, saveNotificationAdmin } from '../lib/billingStore';
import { generateSafeId } from '../lib/videoUtils';

interface AdminNavPanelProps {
  adminUid: string;
  siteSettings: SiteSettings;
  pages: SitePage[];
}

export const AdminNavigationManager: React.FC<AdminNavPanelProps> = ({
  adminUid,
  siteSettings,
  pages,
}) => {
  const [headerLinks, setHeaderLinks] = useState<NavLinkItem[]>(siteSettings.headerLinks);
  const [footerLinks, setFooterLinks] = useState<NavLinkItem[]>(siteSettings.footerLinks);
  const [footerText, setFooterText] = useState<string>(siteSettings.footerText || '');
  const [editingTarget, setEditingTarget] = useState<{
    section: 'header' | 'footer';
    item: NavLinkItem;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    setHeaderLinks(siteSettings.headerLinks);
    setFooterLinks(siteSettings.footerLinks);
    setFooterText(siteSettings.footerText || '');
  }, [siteSettings.headerLinks, siteSettings.footerLinks, siteSettings.footerText]);

  const persistNavigation = async (
    nextHeader: NavLinkItem[],
    nextFooter: NavLinkItem[],
    nextFooterText: string
  ) => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      await updatePartialSiteSettingsAdmin(adminUid, {
        headerLinks: nextHeader,
        footerLinks: nextFooter,
        footerText: nextFooterText,
      });
      setSaveMessage('Header and footer navigation saved.');
      setTimeout(() => setSaveMessage(null), 2200);
    } finally {
      setIsSaving(false);
    }
  };

  const moveItem = (
    section: 'header' | 'footer',
    index: number,
    delta: -1 | 1
  ) => {
    const list = section === 'header' ? [...headerLinks] : [...footerLinks];
    const targetIdx = index + delta;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    [list[index], list[targetIdx]] = [list[targetIdx], list[index]];
    const normalized = list.map((it, idx) => ({ ...it, sortOrder: idx }));
    if (section === 'header') {
      setHeaderLinks(normalized);
      void persistNavigation(normalized, footerLinks, footerText);
    } else {
      setFooterLinks(normalized);
      void persistNavigation(headerLinks, normalized, footerText);
    }
  };

  const toggleVisible = (section: 'header' | 'footer', id: string) => {
    if (section === 'header') {
      const next = headerLinks.map((it) =>
        it.id === id ? { ...it, visible: !it.visible } : it
      );
      setHeaderLinks(next);
      void persistNavigation(next, footerLinks, footerText);
    } else {
      const next = footerLinks.map((it) =>
        it.id === id ? { ...it, visible: !it.visible } : it
      );
      setFooterLinks(next);
      void persistNavigation(headerLinks, next, footerText);
    }
  };

  const deleteItem = (section: 'header' | 'footer', id: string) => {
    if (section === 'header') {
      const next = headerLinks.filter((it) => it.id !== id);
      setHeaderLinks(next);
      void persistNavigation(next, footerLinks, footerText);
    } else {
      const next = footerLinks.filter((it) => it.id !== id);
      setFooterLinks(next);
      void persistNavigation(headerLinks, next, footerText);
    }
  };

  const handleSaveEditedLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTarget) return;
    const { section, item } = editingTarget;
    if (!item.label.trim()) return;

    const cleanItem: NavLinkItem = {
      ...item,
      label: item.label.trim().slice(0, 60),
      target: item.target.trim(),
    };

    if (section === 'header') {
      const exists = headerLinks.some((h) => h.id === cleanItem.id);
      const next = exists
        ? headerLinks.map((h) => (h.id === cleanItem.id ? cleanItem : h))
        : [...headerLinks, { ...cleanItem, sortOrder: headerLinks.length }];
      setHeaderLinks(next);
      void persistNavigation(next, footerLinks, footerText);
    } else {
      const exists = footerLinks.some((f) => f.id === cleanItem.id);
      const next = exists
        ? footerLinks.map((f) => (f.id === cleanItem.id ? cleanItem : f))
        : [...footerLinks, { ...cleanItem, sortOrder: footerLinks.length }];
      setFooterLinks(next);
      void persistNavigation(headerLinks, next, footerText);
    }
    setEditingTarget(null);
  };

  const renderSectionList = (
    title: string,
    description: string,
    section: 'header' | 'footer',
    items: NavLinkItem[]
  ) => (
    <section className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        <button
          type="button"
          onClick={() =>
            setEditingTarget({
              section,
              item: {
                id: generateSafeId(section === 'header' ? 'nav' : 'ftr'),
                label: '',
                actionType: 'view',
                target: 'library',
                visible: true,
                sortOrder: items.length,
                openInNewTab: false,
              },
            })
          }
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
        >
          <Plus className="w-3.5 h-3.5" />
          Add {section === 'header' ? 'Header' : 'Footer'} Link
        </button>
      </div>

      <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
        {items.length === 0 ? (
          <p className="p-4 text-xs text-slate-500">No links configured yet.</p>
        ) : (
          items.map((item, idx) => (
            <div
              key={item.id}
              className="p-3 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {item.label}
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    {item.actionType}:{item.target}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => moveItem(section, idx, -1)}
                  className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 disabled:opacity-30"
                  title="Move up"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={idx === items.length - 1}
                  onClick={() => moveItem(section, idx, 1)}
                  className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 disabled:opacity-30"
                  title="Move down"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => toggleVisible(section, item.id)}
                  className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                  title={item.visible ? 'Hide link' : 'Show link'}
                >
                  {item.visible ? (
                    <Eye className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingTarget({ section, item })}
                  className="p-1.5 text-slate-500 hover:text-blue-600"
                  title="Edit link"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteItem(section, item.id)}
                  className="p-1.5 text-slate-400 hover:text-red-600"
                  title="Delete link"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );

  return (
    <div className="space-y-6">
      {editingTarget && (
        <form
          onSubmit={handleSaveEditedLink}
          className="border border-blue-200 dark:border-blue-900/60 rounded-xl bg-white dark:bg-slate-900 p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {editingTarget.section === 'header' ? 'Header Link Editor' : 'Footer Link Editor'}
            </h3>
            <button
              type="button"
              onClick={() => setEditingTarget(null)}
              className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="space-y-1">
              <label className="block font-medium">Label</label>
              <input
                type="text"
                required
                maxLength={60}
                value={editingTarget.item.label}
                onChange={(e) =>
                  setEditingTarget({
                    ...editingTarget,
                    item: { ...editingTarget.item, label: e.target.value },
                  })
                }
                placeholder="e.g. Pricing or Support"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div className="space-y-1">
              <label className="block font-medium">Action Type</label>
              <select
                value={editingTarget.item.actionType}
                onChange={(e) => {
                  const nextType = e.target.value as NavLinkActionType;
                  setEditingTarget({
                    ...editingTarget,
                    item: {
                      ...editingTarget.item,
                      actionType: nextType,
                      target:
                        nextType === 'view'
                          ? 'library'
                          : nextType === 'page'
                            ? pages[0]?.slug || 'terms-of-service'
                            : 'https://',
                    },
                  });
                }}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="view">App View</option>
                <option value="page">CMS / Legal Page</option>
                <option value="url">External URL</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block font-medium">Destination</label>
              {editingTarget.item.actionType === 'view' ? (
                <select
                  value={editingTarget.item.target}
                  onChange={(e) =>
                    setEditingTarget({
                      ...editingTarget,
                      item: { ...editingTarget.item, target: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="library">Library Inbox</option>
                  <option value="pricing">Pricing Plans</option>
                  <option value="checkout">Checkout Page</option>
                  <option value="user-dashboard">Account Dashboard</option>
                </select>
              ) : editingTarget.item.actionType === 'page' ? (
                <select
                  value={editingTarget.item.target}
                  onChange={(e) =>
                    setEditingTarget({
                      ...editingTarget,
                      item: { ...editingTarget.item, target: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="terms-of-service">terms-of-service</option>
                  <option value="privacy-policy">privacy-policy</option>
                  {pages
                    .filter(
                      (p) => p.slug !== 'terms-of-service' && p.slug !== 'privacy-policy'
                    )
                    .map((p) => (
                      <option key={p.id} value={p.slug}>
                        {p.title} ({p.slug})
                      </option>
                    ))}
                </select>
              ) : (
                <input
                  type="url"
                  required
                  value={editingTarget.item.target}
                  onChange={(e) =>
                    setEditingTarget({
                      ...editingTarget,
                      item: { ...editingTarget.item, target: e.target.value },
                    })
                  }
                  placeholder="https://zotomic.com"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-4 text-xs">
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={editingTarget.item.visible}
                  onChange={(e) =>
                    setEditingTarget({
                      ...editingTarget,
                      item: { ...editingTarget.item, visible: e.target.checked },
                    })
                  }
                />
                Visible
              </label>
              {editingTarget.item.actionType === 'url' && (
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={Boolean(editingTarget.item.openInNewTab)}
                    onChange={(e) =>
                      setEditingTarget({
                        ...editingTarget,
                        item: { ...editingTarget.item, openInNewTab: e.target.checked },
                      })
                    }
                  />
                  Open in new tab
                </label>
              )}
            </div>

            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
            >
              Save Link
            </button>
          </div>
        </form>
      )}

      {renderSectionList(
        'Header Navigation Links',
        'Links displayed in the top navigation bar across all pages.',
        'header',
        headerLinks
      )}

      {renderSectionList(
        'Footer Links',
        'Links displayed in the page footer (legal pages, external sites, or app sections).',
        'footer',
        footerLinks
      )}

      <section className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-5 space-y-3">
        <label className="block text-xs font-semibold text-slate-900 dark:text-slate-100">
          Custom Footer Copyright / Tagline Text
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            maxLength={300}
            value={footerText}
            onChange={(e) => setFooterText(e.target.value)}
            placeholder={`${siteSettings.siteName} · © ${new Date().getFullYear()} Zotomic`}
            className="flex-1 min-w-[240px] px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
          />
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void persistNavigation(headerLinks, footerLinks, footerText)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Save Footer Text
          </button>
        </div>
        {saveMessage && (
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            {saveMessage}
          </p>
        )}
      </section>
    </div>
  );
};

interface AdminNotificationsPanelProps {
  adminUid: string;
  users: UserProfileRecord[];
  notifications: SiteNotification[];
}

export const AdminNotificationsManager: React.FC<AdminNotificationsPanelProps> = ({
  adminUid,
  users,
  notifications,
}) => {
  const [audienceFilter, setAudienceFilter] = useState<'all-list' | NotificationAudience>('all-list');
  const [editing, setEditing] = useState<{
    id?: string;
    audience: NotificationAudience;
    targetUid: string;
    title: string;
    message: string;
    type: NotificationSeverity;
    linkLabel: string;
    linkTarget: string;
    isActive: boolean;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filtered = notifications.filter((n) =>
    audienceFilter === 'all-list' ? true : n.audience === audienceFilter
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setErrorMsg(null);
    if (!editing.title.trim() || !editing.message.trim()) {
      setErrorMsg('Title and message are required.');
      return;
    }
    setIsSaving(true);
    try {
      await saveNotificationAdmin(adminUid, editing);
      setEditing(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save notification.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {!editing ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg text-xs">
              {(
                [
                  { id: 'all-list', label: `All (${notifications.length})` },
                  {
                    id: 'user',
                    label: `User Feed (${notifications.filter((n) => n.audience === 'user').length})`,
                  },
                  {
                    id: 'admin',
                    label: `Admin Feed (${notifications.filter((n) => n.audience === 'admin').length})`,
                  },
                  {
                    id: 'all',
                    label: `Shared (${notifications.filter((n) => n.audience === 'all').length})`,
                  },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setAudienceFilter(t.id)}
                  className={`px-3 py-1.5 font-medium rounded-md transition-colors ${
                    audienceFilter === t.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                setErrorMsg(null);
                setEditing({
                  audience: 'user',
                  targetUid: '',
                  title: '',
                  message: '',
                  type: 'info',
                  linkLabel: '',
                  linkTarget: '',
                  isActive: true,
                });
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              Create Notification
            </button>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No notifications yet. Create separated notifications for Admin Alerts or User Announcements.
              </div>
            ) : (
              filtered.map((n) => (
                <div
                  key={n.id}
                  className="p-4 flex flex-wrap items-start justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {n.audience === 'admin' ? (
                        <Shield className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      ) : (
                        <Bell className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      )}
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {n.title}
                      </h3>
                      <span className="text-[11px] font-mono uppercase text-slate-500">
                        {n.audience}
                        {n.targetUid ? ` -> ${n.targetUid}` : ' (broadcast)'}
                      </span>
                      <span
                        className={`text-xs font-medium ${
                          n.isActive
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {n.isActive ? 'Active' : 'Hidden'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">{n.message}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        void saveNotificationAdmin(adminUid, {
                          id: n.id,
                          audience: n.audience,
                          targetUid: n.targetUid,
                          title: n.title,
                          message: n.message,
                          type: n.type,
                          linkLabel: n.linkLabel,
                          linkTarget: n.linkTarget,
                          isActive: !n.isActive,
                        })
                      }
                      className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                      title={n.isActive ? 'Hide notification' : 'Activate notification'}
                    >
                      {n.isActive ? (
                        <Eye className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMsg(null);
                        setEditing({
                          id: n.id,
                          audience: n.audience,
                          targetUid: n.targetUid,
                          title: n.title,
                          message: n.message,
                          type: n.type,
                          linkLabel: n.linkLabel || '',
                          linkTarget: n.linkTarget || '',
                          isActive: n.isActive,
                        });
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    {confirmDeleteId === n.id ? (
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            void deleteNotificationAdmin(n.id);
                            setConfirmDeleteId(null);
                          }}
                          className="px-2.5 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1.5 text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(n.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg"
                        title="Delete notification"
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
          onSubmit={(e) => void handleSave(e)}
          className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-6 space-y-4 text-xs"
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {editing.id ? 'Edit Notification' : 'Create Notification'}
            </h3>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="block font-medium">Audience Feed</label>
              <select
                value={editing.audience}
                onChange={(e) =>
                  setEditing({ ...editing, audience: e.target.value as NotificationAudience })
                }
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="user">User Notifications Only</option>
                <option value="admin">Admin Notifications Only</option>
                <option value="all">Both Admin &amp; User</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block font-medium">Severity / Type</label>
              <select
                value={editing.type}
                onChange={(e) =>
                  setEditing({ ...editing, type: e.target.value as NotificationSeverity })
                }
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="info">Info</option>
                <option value="success">Success</option>
                <option value="warning">Warning</option>
                <option value="billing">Billing Alert</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block font-medium">Target User (optional)</label>
              <select
                value={editing.targetUid}
                onChange={(e) => setEditing({ ...editing, targetUid: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="">All Users (Broadcast)</option>
                {users.map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {u.displayName} ({u.uid})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="block font-medium">Title</label>
            <input
              type="text"
              required
              maxLength={140}
              value={editing.title}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              placeholder="e.g. New Pro Feature Live or Payment Reminder"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>

          <div className="space-y-1">
            <label className="block font-medium">Message</label>
            <textarea
              rows={3}
              required
              maxLength={1000}
              value={editing.message}
              onChange={(e) => setEditing({ ...editing, message: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block font-medium">Action Label (optional)</label>
              <input
                type="text"
                maxLength={60}
                value={editing.linkLabel}
                onChange={(e) => setEditing({ ...editing, linkLabel: e.target.value })}
                placeholder="e.g. View Plans or Open Billing"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div className="space-y-1">
              <label className="block font-medium">
                Target (`view:pricing`, `view:user-dashboard`, or `https://...`)
              </label>
              <input
                type="text"
                maxLength={500}
                value={editing.linkTarget}
                onChange={(e) => setEditing({ ...editing, linkTarget: e.target.value })}
                placeholder="view:pricing"
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>

          <label className="inline-flex items-center gap-2 font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={editing.isActive}
              onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
              className="rounded border-slate-300 text-blue-600"
            />
            Active (immediately visible to target audience)
          </label>

          {errorMsg && <p className="text-red-600">{errorMsg}</p>}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="px-4 py-2 font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-4 py-2 font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Save Notification
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
