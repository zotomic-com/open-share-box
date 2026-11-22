import React, { useEffect, useMemo, useState } from 'react';
import {
  AlarmClock,
  ArrowUpRight,
  Bell,
  Check,
  CheckCircle2,
  Edit3,
  Loader2,
  MessageCircle,
  Plus,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type {
  AnalyzedVideo,
  ReminderChannel,
  ReminderRecurrence,
  UserReminder,
  UserReminderInput,
  WhatsAppConfig,
  WhatsAppConfigInput,
} from '../types/video';
import {
  fetchWhatsAppServerStatus,
  sendWhatsAppReminderRequest,
} from '../lib/apiClient';
import { buildWhatsAppReminderLink } from '../lib/featureStore';

interface RemindersPanelProps {
  siteName: string;
  user: User | null;
  remindersEnabled: boolean;
  whatsappEnabled: boolean;
  videos: AnalyzedVideo[];
  reminders: UserReminder[];
  whatsappConfig: WhatsAppConfig | null;
  onSaveReminder: (input: UserReminderInput) => Promise<void>;
  onDeleteReminder: (reminderId: string) => Promise<void>;
  onMarkReminderSent: (reminderId: string) => Promise<void>;
  onSaveWhatsAppConfig: (input: WhatsAppConfigInput, markTested?: boolean) => Promise<void>;
  onOpenAuth: () => void;
  onOpenSavedItem: (videoId: string) => void;
  onBackToLibrary: () => void;
}

function toDatetimeLocalValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const RemindersPanel: React.FC<RemindersPanelProps> = ({
  siteName,
  user,
  remindersEnabled,
  whatsappEnabled,
  videos,
  reminders,
  whatsappConfig,
  onSaveReminder,
  onDeleteReminder,
  onMarkReminderSent,
  onSaveWhatsAppConfig,
  onOpenAuth,
  onOpenSavedItem,
  onBackToLibrary,
}) => {
  const [filterTab, setFilterTab] = useState<'active' | 'overdue' | 'completed' | 'all'>('active');
  const [searchQuery, setSearchQuery] = useState('');

  // Reminder create/edit form
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [titleInput, setTitleInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [videoIdInput, setVideoIdInput] = useState('');
  const [dueLocalInput, setDueLocalInput] = useState(() =>
    toDatetimeLocalValue(Date.now() + 3600_000)
  );
  const [recurrenceInput, setRecurrenceInput] = useState<ReminderRecurrence>('none');
  const [channelInput, setChannelInput] = useState<ReminderChannel>('in-app');
  const [isSavingRem, setIsSavingRem] = useState(false);
  const [remError, setRemError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // WhatsApp Connector state
  const [waEnabled, setWaEnabled] = useState(whatsappConfig?.enabled ?? false);
  const [waPhone, setWaPhone] = useState(whatsappConfig?.phoneNumber || '');
  const [waLabel, setWaLabel] = useState(whatsappConfig?.displayLabel || 'My WhatsApp');
  const [waIncludeLink, setWaIncludeLink] = useState(whatsappConfig?.autoIncludeItemLink ?? true);
  const [waMode, setWaMode] = useState<'wa-link' | 'cloud-api'>(
    whatsappConfig?.deliveryMode || 'wa-link'
  );
  const [cloudApiConfigured, setCloudApiConfigured] = useState(false);
  const [isSavingWa, setIsSavingWa] = useState(false);
  const [waFeedback, setWaFeedback] = useState<string | null>(null);
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null);

  useEffect(() => {
    if (whatsappConfig) {
      setWaEnabled(whatsappConfig.enabled);
      setWaPhone(whatsappConfig.phoneNumber);
      setWaLabel(whatsappConfig.displayLabel || 'My WhatsApp');
      setWaIncludeLink(whatsappConfig.autoIncludeItemLink);
      setWaMode(whatsappConfig.deliveryMode);
    }
  }, [whatsappConfig]);

  useEffect(() => {
    if (!whatsappEnabled) return;
    void fetchWhatsAppServerStatus().then((s) => {
      setCloudApiConfigured(s.cloudApiConfigured);
    });
  }, [whatsappEnabled]);

  const now = Date.now();
  const activeCount = reminders.filter((r) => r.status === 'active').length;
  const overdueCount = reminders.filter((r) => r.status === 'active' && r.dueAtMs <= now).length;
  const completedCount = reminders.filter((r) => r.status === 'completed').length;

  const filteredReminders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return reminders.filter((r) => {
      if (filterTab === 'active' && r.status !== 'active') return false;
      if (filterTab === 'overdue' && (r.status !== 'active' || r.dueAtMs > now)) return false;
      if (filterTab === 'completed' && r.status !== 'completed') return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        r.note.toLowerCase().includes(q) ||
        (r.videoTitle || '').toLowerCase().includes(q)
      );
    });
  }, [reminders, filterTab, searchQuery, now]);

  const openCreateForm = () => {
    setEditingId(undefined);
    setTitleInput('');
    setNoteInput('');
    setVideoIdInput('');
    setDueLocalInput(toDatetimeLocalValue(Date.now() + 3600_000));
    setRecurrenceInput('none');
    setChannelInput(whatsappEnabled && waEnabled && waPhone ? 'both' : 'in-app');
    setRemError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (r: UserReminder) => {
    setEditingId(r.id);
    setTitleInput(r.title);
    setNoteInput(r.note);
    setVideoIdInput(r.videoId || '');
    setDueLocalInput(toDatetimeLocalValue(r.dueAtMs));
    setRecurrenceInput(r.recurrence);
    setChannelInput(r.channel);
    setRemError(null);
    setIsFormOpen(true);
  };

  const handleSubmitReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    setRemError(null);
    if (!titleInput.trim()) {
      setRemError('Reminder title is required.');
      return;
    }
    const parsedDue = new Date(dueLocalInput).getTime();
    if (!Number.isFinite(parsedDue) || parsedDue <= 0) {
      setRemError('Choose a valid date and time.');
      return;
    }
    const linkedVideo = videos.find((v) => v.id === videoIdInput);
    setIsSavingRem(true);
    try {
      await onSaveReminder({
        id: editingId,
        title: titleInput.trim(),
        note: noteInput.trim(),
        videoId: linkedVideo?.id || '',
        videoTitle: linkedVideo?.title || '',
        dueAtMs: parsedDue,
        recurrence: recurrenceInput,
        status: 'active',
        channel: channelInput,
      });
      setIsFormOpen(false);
    } catch (err) {
      setRemError(err instanceof Error ? err.message : 'Unable to save reminder.');
    } finally {
      setIsSavingRem(false);
    }
  };

  const handleToggleComplete = async (r: UserReminder) => {
    const nextStatus = r.status === 'completed' ? 'active' : 'completed';
    await onSaveReminder({
      id: r.id,
      title: r.title,
      note: r.note,
      videoId: r.videoId,
      videoTitle: r.videoTitle,
      dueAtMs: r.dueAtMs,
      recurrence: r.recurrence,
      status: nextStatus,
      channel: r.channel,
    });
  };

  const buildReminderMessage = (r: UserReminder): string => {
    const linked = r.videoId ? videos.find((v) => v.id === r.videoId) : undefined;
    const itemUrl =
      linked && waIncludeLink && /^https?:\/\//i.test(linked.url) ? `\nLink: ${linked.url}` : '';
    return [
      `[${siteName} Reminder] ${r.title}`,
      r.note ? `Note: ${r.note}` : '',
      r.videoTitle ? `Saved Item: ${r.videoTitle}` : '',
      itemUrl.trim(),
      `Due: ${new Date(r.dueAtMs).toLocaleString()}`,
    ]
      .filter(Boolean)
      .join('\n');
  };

  const handleSendWhatsAppCloudApi = async (r: UserReminder) => {
    if (!waPhone.trim()) {
      setWaFeedback('Enter and save your WhatsApp phone number in the WhatsApp Connector card first.');
      return;
    }
    setSendingReminderId(r.id);
    setWaFeedback(null);
    try {
      const msg = buildReminderMessage(r);
      const res = await sendWhatsAppReminderRequest({
        phoneNumber: waPhone,
        message: msg,
        reminderTitle: r.title,
      });
      if (res.sent) {
        await onMarkReminderSent(r.id);
        setWaFeedback(`WhatsApp reminder sent via Cloud API to ${waPhone}.`);
      } else {
        setWaFeedback(
          res.error ||
            'Cloud API is not configured on this server yet — use the 1-Click Send WhatsApp link alongside each reminder.'
        );
      }
    } catch (err) {
      setWaFeedback(err instanceof Error ? err.message : 'Failed to dispatch WhatsApp reminder.');
    } finally {
      setSendingReminderId(null);
    }
  };

  const handleSaveWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    setWaFeedback(null);
    const digits = waPhone.replace(/[^0-9]/g, '');
    if (waEnabled && (digits.length < 7 || digits.length > 15)) {
      setWaFeedback('Enter a valid WhatsApp phone number with country code (e.g. +15551234567).');
      return;
    }
    setIsSavingWa(true);
    try {
      await onSaveWhatsAppConfig(
        {
          enabled: waEnabled,
          phoneNumber: waPhone.trim(),
          displayLabel: waLabel.trim() || 'My WhatsApp',
          autoIncludeItemLink: waIncludeLink,
          deliveryMode: waMode,
        },
        false
      );
      setWaFeedback('WhatsApp connector settings saved.');
      setTimeout(() => setWaFeedback(null), 2600);
    } catch (err) {
      setWaFeedback(err instanceof Error ? err.message : 'Unable to save WhatsApp settings.');
    } finally {
      setIsSavingWa(false);
    }
  };

  const waTestMessage = `Hello from ${siteName}! Your WhatsApp reminder connector is ready.`;
  const waTestHref = buildWhatsAppReminderLink(waPhone, waTestMessage);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Reminders &amp; WhatsApp Connector
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Schedule personal follow-up reminders on saved items and dispatch alerts to your connected WhatsApp.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBackToLibrary}
            className="px-3.5 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
          >
            Back to Library
          </button>
          {remindersEnabled && (
            <button
              type="button"
              onClick={openCreateForm}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              New Reminder
            </button>
          )}
        </div>
      </div>

      {!user && (
        <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
          <span>
            You are viewing guest device storage. Sign in to sync reminders and your WhatsApp connector across devices.
          </span>
          <button
            type="button"
            onClick={onOpenAuth}
            className="px-3 py-1.5 font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg whitespace-nowrap"
          >
            Sign In / Sync
          </button>
        </div>
      )}

      {/* KPI Strip */}
      {remindersEnabled && (
        <div className="grid grid-cols-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 divide-x divide-slate-200 dark:divide-slate-800">
          <div className="p-4 space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">Active Reminders</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {activeCount}
            </p>
          </div>
          <div className="p-4 space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">Due Now / Overdue</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
              {overdueCount}
            </p>
          </div>
          <div className="p-4 space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">Completed</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              {completedCount}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left/Main: User Reminders List */}
        {remindersEnabled ? (
          <div className={`${whatsappEnabled ? 'lg:col-span-7' : 'lg:col-span-12'} space-y-4`}>
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800/80 rounded-lg">
                {(
                  [
                    { id: 'active', label: `Active (${activeCount})` },
                    { id: 'overdue', label: `Due (${overdueCount})` },
                    { id: 'completed', label: `Done (${completedCount})` },
                    { id: 'all', label: `All (${reminders.length})` },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setFilterTab(t.id)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      filterTab === t.id
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter reminders..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            {isFormOpen && (
              <form
                onSubmit={(e) => void handleSubmitReminder(e)}
                className="border border-blue-200 dark:border-blue-900/60 rounded-xl bg-white dark:bg-slate-900 p-5 space-y-3.5"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {editingId ? 'Edit Reminder' : 'Create New Reminder'}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    aria-label="Close form"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Reminder Title *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={160}
                      value={titleInput}
                      onChange={(e) => setTitleInput(e.target.value)}
                      placeholder="e.g. Review zotomic pricing PDF or follow up on video tools"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Date &amp; Time *
                    </label>
                    <input
                      type="datetime-local"
                      required
                      value={dueLocalInput}
                      onChange={(e) => setDueLocalInput(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Repeat
                    </label>
                    <select
                      value={recurrenceInput}
                      onChange={(e) => setRecurrenceInput(e.target.value as ReminderRecurrence)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    >
                      <option value="none">One-time</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Link to Saved Item (optional)
                    </label>
                    <select
                      value={videoIdInput}
                      onChange={(e) => setVideoIdInput(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    >
                      <option value="">None (Standalone reminder)</option>
                      {videos.slice(0, 60).map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.title.slice(0, 70)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Alert Channel
                    </label>
                    <select
                      value={channelInput}
                      onChange={(e) => setChannelInput(e.target.value as ReminderChannel)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    >
                      <option value="in-app">In-App Notification Bell</option>
                      {whatsappEnabled && <option value="whatsapp">WhatsApp</option>}
                      {whatsappEnabled && <option value="both">Both (In-App + WhatsApp)</option>}
                    </select>
                  </div>

                  <div className="sm:col-span-2 space-y-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Notes (optional)
                    </label>
                    <textarea
                      rows={2}
                      maxLength={600}
                      value={noteInput}
                      onChange={(e) => setNoteInput(e.target.value)}
                      placeholder="Additional context or action checklist..."
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>

                {remError && <p className="text-xs text-red-600 dark:text-red-400">{remError}</p>}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="px-3.5 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingRem}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg"
                  >
                    {isSavingRem && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {editingId ? 'Save Changes' : 'Create Reminder'}
                  </button>
                </div>
              </form>
            )}

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800 overflow-hidden">
              {filteredReminders.length === 0 ? (
                <div className="p-10 text-center space-y-3">
                  <AlarmClock className="w-7 h-7 text-slate-400 mx-auto" />
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    No reminders in this view
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Create a reminder to revisit saved videos, PDFs, bookmarks, or AI chats on schedule.
                  </p>
                  <button
                    type="button"
                    onClick={openCreateForm}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Reminder
                  </button>
                </div>
              ) : (
                filteredReminders.map((r) => {
                  const isOverdue = r.status === 'active' && r.dueAtMs <= now;
                  const waHref = buildWhatsAppReminderLink(waPhone, buildReminderMessage(r));
                  return (
                    <div key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={() => void handleToggleComplete(r)}
                          title={r.status === 'completed' ? 'Mark active' : 'Mark completed'}
                          aria-label={r.status === 'completed' ? 'Mark active' : 'Mark completed'}
                          className={`mt-0.5 p-1 rounded-full border transition-colors shrink-0 ${
                            r.status === 'completed'
                              ? 'border-emerald-600 bg-emerald-600 text-white'
                              : 'border-slate-300 dark:border-slate-600 text-transparent hover:border-blue-600'
                          }`}
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p
                              className={`text-sm font-semibold ${
                                r.status === 'completed'
                                  ? 'line-through text-slate-400'
                                  : 'text-slate-900 dark:text-slate-100'
                              }`}
                            >
                              {r.title}
                            </p>
                            {isOverdue && (
                              <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                                Due Now
                              </span>
                            )}
                            {r.recurrence !== 'none' && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 capitalize">
                                {r.recurrence}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-mono tabular-nums">
                              {new Date(r.dueAtMs).toLocaleString()}
                            </span>
                            <span>·</span>
                            <span className="capitalize">{r.channel.replace('-', ' ')}</span>
                            {r.videoTitle && r.videoId && (
                              <>
                                <span>·</span>
                                <button
                                  type="button"
                                  onClick={() => onOpenSavedItem(r.videoId!)}
                                  className="text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[200px]"
                                >
                                  {r.videoTitle}
                                </button>
                              </>
                            )}
                          </div>

                          {r.note && (
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                              {r.note}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-start">
                        {whatsappEnabled && (r.channel === 'whatsapp' || r.channel === 'both' || waEnabled) && (
                          <>
                            <a
                              href={waHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => void onMarkReminderSent(r.id)}
                              title="Send via 1-Click WhatsApp"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition-colors whitespace-nowrap"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              WhatsApp
                              <ArrowUpRight className="w-3 h-3" />
                            </a>
                            {cloudApiConfigured && user && (
                              <button
                                type="button"
                                onClick={() => void handleSendWhatsAppCloudApi(r)}
                                disabled={sendingReminderId === r.id}
                                title="Send automatically via WhatsApp Cloud API"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 whitespace-nowrap"
                              >
                                {sendingReminderId === r.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Send className="w-3 h-3" />
                                )}
                                API Send
                              </button>
                            )}
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => openEditForm(r)}
                          aria-label="Edit reminder"
                          title="Edit reminder"
                          className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        {confirmDeleteId === r.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDeleteId(null);
                                void onDeleteReminder(r.id);
                              }}
                              className="px-2 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded"
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(r.id)}
                            aria-label="Delete reminder"
                            title="Delete reminder"
                            className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : null}

        {/* Right: WhatsApp Connector Card */}
        {whatsappEnabled && (
          <section className={`${remindersEnabled ? 'lg:col-span-5' : 'lg:col-span-12'} border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-5 space-y-4`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                  <MessageCircle className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    WhatsApp Connector
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {waEnabled && waPhone
                      ? `Connected: ${waPhone}`
                      : 'Connect your WhatsApp number for 1-click reminder alerts'}
                  </p>
                </div>
              </div>
              <span
                className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                  waEnabled && waPhone
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {waEnabled && waPhone ? 'Active' : 'Not Connected'}
              </span>
            </div>

            <form onSubmit={(e) => void handleSaveWhatsApp(e)} className="space-y-3.5">
              <label className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 cursor-pointer">
                <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                  Enable WhatsApp Reminder Delivery
                </span>
                <input
                  type="checkbox"
                  checked={waEnabled}
                  onChange={(e) => setWaEnabled(e.target.checked)}
                  className="w-4 h-4 accent-emerald-600"
                />
              </label>

              <div className="space-y-1">
                <label
                  htmlFor="wa-phone-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  WhatsApp Number (with country code)
                </label>
                <input
                  id="wa-phone-input"
                  type="tel"
                  value={waPhone}
                  onChange={(e) => setWaPhone(e.target.value)}
                  placeholder="+15551234567 or +88017..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="wa-label-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Device Label
                </label>
                <input
                  id="wa-label-input"
                  type="text"
                  maxLength={80}
                  value={waLabel}
                  onChange={(e) => setWaLabel(e.target.value)}
                  placeholder="My Personal WhatsApp"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="wa-mode-select"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Dispatch Mode
                </label>
                <select
                  id="wa-mode-select"
                  value={waMode}
                  onChange={(e) => setWaMode(e.target.value as 'wa-link' | 'cloud-api')}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                >
                  <option value="wa-link">Instant 1-Click WhatsApp Dispatch (wa.me)</option>
                  <option value="cloud-api">
                    Meta WhatsApp Cloud API {cloudApiConfigured ? '(Server Ready)' : '(Needs Server Env Vars)'}
                  </option>
                </select>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={waIncludeLink}
                  onChange={(e) => setWaIncludeLink(e.target.checked)}
                  className="w-3.5 h-3.5 accent-blue-600"
                />
                Include linked video/page URL in WhatsApp message
              </label>

              {waFeedback && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{waFeedback}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <a
                  href={waTestHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <Bell className="w-3.5 h-3.5 text-emerald-600" />
                  Test in WhatsApp
                  <ArrowUpRight className="w-3 h-3" />
                </a>

                <button
                  type="submit"
                  disabled={isSavingWa}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors"
                >
                  {isSavingWa && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save Connector
                </button>
              </div>
            </form>
          </section>
        )}
      </div>
    </div>
  );
};
