import React, { useState } from 'react';
import {
  CheckCircle2,
  Edit3,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Power,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type {
  FeatureModuleConfig,
  FeatureModuleInput,
  FeatureModuleKey,
} from '../types/video';
import {
  deleteFeatureModuleAdmin,
  saveFeatureModuleAdmin,
  seedDefaultFeatureModulesAdmin,
} from '../lib/featureStore';

interface AdminModulesPanelProps {
  adminUid: string;
  modules: FeatureModuleConfig[];
  isSeededInDb: boolean;
}

const MODULE_KEY_LABELS: Record<FeatureModuleKey, string> = {
  'text-pdf': 'Text & PDF Upload',
  'bookmark-share': 'Browser Bookmark Sharing',
  'llm-chat': 'LLM Chat History Share',
  reminders: 'User Reminders',
  whatsapp: 'WhatsApp Connector',
  custom: 'Custom Module',
};

export const AdminModulesPanel: React.FC<AdminModulesPanelProps> = ({
  adminUid,
  modules,
  isSeededInDb,
}) => {
  const [editing, setEditing] = useState<FeatureModuleInput | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSeedDefaults = async () => {
    setErrorMsg(null);
    setFeedback(null);
    setIsSeeding(true);
    try {
      await seedDefaultFeatureModulesAdmin(adminUid);
      setFeedback('Default 5 feature & connector modules saved to Firestore.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to seed modules.');
    } finally {
      setIsSeeding(false);
    }
  };

  const handleQuickToggle = async (
    mod: FeatureModuleConfig,
    field: 'isActive' | 'isVisible'
  ) => {
    setErrorMsg(null);
    try {
      await saveFeatureModuleAdmin(adminUid, {
        id: mod.id,
        key: mod.key,
        name: mod.name,
        description: mod.description,
        isActive: field === 'isActive' ? !mod.isActive : mod.isActive,
        isVisible: field === 'isVisible' ? !mod.isVisible : mod.isVisible,
        sortOrder: mod.sortOrder,
        badgeText: mod.badgeText,
        helperNote: mod.helperNote,
        maxSizeMb: mod.maxSizeMb,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to toggle module.');
    }
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setErrorMsg(null);
    if (!editing.name.trim()) {
      setErrorMsg('Module name is required.');
      return;
    }
    setIsSaving(true);
    try {
      await saveFeatureModuleAdmin(adminUid, editing);
      setEditing(null);
      setFeedback('Module configuration saved.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save module.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (moduleId: string) => {
    setErrorMsg(null);
    try {
      await deleteFeatureModuleAdmin(moduleId);
      setConfirmDeleteId(null);
      setFeedback('Module deleted.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to delete module.');
    }
  };

  const activeVisibleCount = modules.filter((m) => m.isActive && m.isVisible).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Features &amp; Connectors Manager
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Add, edit, delete, hide/show, and activate/deactivate Text/PDF upload, Bookmarks, LLM Chat Share, Reminders, and WhatsApp Connector.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isSeededInDb && (
            <button
              type="button"
              onClick={() => void handleSeedDefaults()}
              disabled={isSeeding}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
            >
              {isSeeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-blue-600" />}
              Sync 5 Default Modules
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              setEditing({
                key: 'custom',
                name: '',
                description: '',
                isActive: true,
                isVisible: true,
                sortOrder: modules.length + 1,
                badgeText: '',
                helperNote: '',
                maxSizeMb: 15,
              })
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Feature Module
          </button>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 divide-x divide-slate-200 dark:divide-slate-800">
        <div className="p-4 space-y-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">Configured Modules</p>
          <p className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {modules.length}
          </p>
        </div>
        <div className="p-4 space-y-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">Live for Users</p>
          <p className="text-xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
            {activeVisibleCount}
          </p>
        </div>
        <div className="p-4 space-y-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">Hidden or Inactive</p>
          <p className="text-xl font-bold font-mono tabular-nums text-slate-600 dark:text-slate-400">
            {modules.length - activeVisibleCount}
          </p>
        </div>
      </div>

      {feedback && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}
      {errorMsg && (
        <div className="px-3.5 py-2.5 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {editing && (
        <form
          onSubmit={(e) => void handleSaveForm(e)}
          className="border border-blue-200 dark:border-blue-900/60 rounded-xl bg-white dark:bg-slate-900 p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {editing.id ? `Edit Module: ${editing.name}` : 'Add New Feature / Connector Module'}
            </h3>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              aria-label="Close module form"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Module Name *
              </label>
              <input
                type="text"
                required
                maxLength={100}
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="e.g. Text & PDF Upload"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Capability Key
              </label>
              <select
                value={editing.key}
                onChange={(e) => setEditing({ ...editing, key: e.target.value as FeatureModuleKey })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              >
                {Object.entries(MODULE_KEY_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label} ({k})
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2 space-y-1">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Description
              </label>
              <textarea
                rows={2}
                maxLength={400}
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Badge Label (optional)
              </label>
              <input
                type="text"
                maxLength={40}
                value={editing.badgeText}
                onChange={(e) => setEditing({ ...editing, badgeText: e.target.value })}
                placeholder="e.g. PDF & Text"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Sort Order
                </label>
                <input
                  type="number"
                  min={0}
                  max={1000}
                  value={editing.sortOrder}
                  onChange={(e) => setEditing({ ...editing, sortOrder: Number(e.target.value) || 0 })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Max Size (MB)
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={editing.maxSizeMb}
                  onChange={(e) => setEditing({ ...editing, maxSizeMb: Number(e.target.value) || 15 })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="sm:col-span-2 space-y-1">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Helper Note Shown to Users
              </label>
              <input
                type="text"
                maxLength={500}
                value={editing.helperNote}
                onChange={(e) => setEditing({ ...editing, helperNote: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={editing.isActive}
                onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
                className="w-4 h-4 accent-blue-600"
              />
              Active (feature enabled)
            </label>

            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={editing.isVisible}
                onChange={(e) => setEditing({ ...editing, isVisible: e.target.checked })}
                className="w-4 h-4 accent-blue-600"
              />
              Visible (shown in navigation &amp; intake tabs)
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="px-3.5 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg"
            >
              {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save Module
            </button>
          </div>
        </form>
      )}

      {/* Module Rows */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800 overflow-hidden">
        {modules.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            No modules configured. Click &ldquo;Add Feature Module&rdquo; to create one.
          </div>
        ) : (
          modules.map((mod) => (
            <div
              key={mod.id}
              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {mod.name}
                  </span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {mod.key}
                  </span>
                  {mod.badgeText && (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300">
                      {mod.badgeText}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {mod.description}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleQuickToggle(mod, 'isActive')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                    mod.isActive
                      ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-500'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  {mod.isActive ? 'Active' : 'Inactive'}
                </button>

                <button
                  type="button"
                  onClick={() => void handleQuickToggle(mod, 'isVisible')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                    mod.isVisible
                      ? 'border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-500'
                  }`}
                >
                  {mod.isVisible ? (
                    <Eye className="w-3.5 h-3.5" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5" />
                  )}
                  {mod.isVisible ? 'Visible' : 'Hidden'}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setEditing({
                      id: mod.id,
                      key: mod.key,
                      name: mod.name,
                      description: mod.description,
                      isActive: mod.isActive,
                      isVisible: mod.isVisible,
                      sortOrder: mod.sortOrder,
                      badgeText: mod.badgeText,
                      helperNote: mod.helperNote,
                      maxSizeMb: mod.maxSizeMb,
                    })
                  }
                  aria-label={`Edit ${mod.name}`}
                  className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>

                {confirmDeleteId === mod.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void handleDelete(mod.id)}
                      className="px-2.5 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(mod.id)}
                    aria-label={`Delete ${mod.name}`}
                    className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
