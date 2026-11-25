import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  HomepageContent,
  HomepageIconKey,
  HomepageItem,
  HomepageSection,
  HomepageSectionKind,
} from '../types/video';
import {
  DEFAULT_HOMEPAGE_CONTENT,
  HOMEPAGE_ICON_OPTIONS,
  HOMEPAGE_SECTION_ANCHORS,
  sanitizeHomepageContent,
} from '../lib/homepageDefaults';
import { saveHomepageContentAdmin, subscribeHomepageContent } from '../lib/adminStore';
import { generateSafeId } from '../lib/videoUtils';
import { ImageAssetField } from './ImageAssetField';

interface AdminHomepagePanelProps {
  adminUid: string;
}

const SECTION_LABELS: Record<HomepageSectionKind, string> = {
  hero: 'Hero (top of page)',
  problem: 'The problem',
  steps: 'How it works',
  'content-types': 'What you can save',
  transformation: 'Before → after transformation',
  'search-demo': 'Search demo',
  'product-flow': 'Product flow / demo',
  features: 'Feature chips',
  privacy: 'Privacy',
  cta: 'Final call to action',
};

function cloneContent(content: HomepageContent): HomepageContent {
  return JSON.parse(JSON.stringify(content)) as HomepageContent;
}

function TagsEditor({
  tags,
  onChange,
  label = 'Tags / chips',
}: {
  tags: string[];
  onChange: (next: string[]) => void;
  label?: string;
}) {
  const [draft, setDraft] = useState('');

  const addTag = () => {
    const value = draft.trim().replace(/^#+/, '').slice(0, 60);
    if (!value || tags.includes(value)) {
      setDraft('');
      return;
    }
    onChange([...tags, value].slice(0, 20));
    setDraft('');
  };

  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              className="text-slate-400 hover:text-red-600"
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          maxLength={60}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder="Add a chip and press Enter"
          className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
        <button
          type="button"
          onClick={addTag}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  maxLength: number;
  multiline?: boolean;
}) {
  const sharedClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
          {label}
        </label>
        <span className="font-mono text-[10px] tabular-nums text-slate-400">
          {value.length}/{maxLength}
        </span>
      </div>
      {multiline ? (
        <textarea
          rows={3}
          maxLength={maxLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={sharedClass}
        />
      ) : (
        <input
          type="text"
          maxLength={maxLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={sharedClass}
        />
      )}
    </div>
  );
}

export const AdminHomepagePanel: React.FC<AdminHomepagePanelProps> = ({ adminUid }) => {
  const [draft, setDraft] = useState<HomepageContent>(() => cloneContent(DEFAULT_HOMEPAGE_CONTENT));
  const [expanded, setExpanded] = useState<HomepageSectionKind | null>('hero');
  const [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const dirtyRef = useRef(dirty);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    const unsub = subscribeHomepageContent((content) => {
      if (dirtyRef.current) return;
      setDraft(cloneContent(content));
      setLoaded(true);
    });
    return unsub;
  }, []);

  const totalItems = useMemo(
    () => draft.sections.reduce((sum, section) => sum + section.items.length, 0),
    [draft]
  );

  const markChanged = () => {
    setDirty(true);
    setMessage(null);
  };

  const updateSection = (sectionId: HomepageSectionKind, patch: Partial<HomepageSection>) => {
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId ? { ...section, ...patch } : section
      ),
    }));
    markChanged();
  };

  const updateItem = (
    sectionId: HomepageSectionKind,
    itemId: string,
    patch: Partial<HomepageItem>
  ) => {
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              items: section.items.map((item) =>
                item.id === itemId ? { ...item, ...patch } : item
              ),
            }
          : section
      ),
    }));
    markChanged();
  };

  const addItem = (sectionId: HomepageSectionKind) => {
    const newItem: HomepageItem = {
      id: generateSafeId('item'),
      title: 'New item',
      description: '',
      label: '',
      icon: 'sparkles',
      image: { src: '', alt: '' },
      tags: [],
    };
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId
          ? { ...section, items: [...section.items, newItem].slice(0, 20) }
          : section
      ),
    }));
    markChanged();
  };

  const removeItem = (sectionId: HomepageSectionKind, itemId: string) => {
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId
          ? { ...section, items: section.items.filter((item) => item.id !== itemId) }
          : section
      ),
    }));
    markChanged();
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await saveHomepageContentAdmin(adminUid, sanitizeHomepageContent(draft));
      setDraft((current) => sanitizeHomepageContent(current));
      setDirty(false);
      setMessage({ type: 'success', text: 'Homepage saved. The public page is updating now.' });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to save the homepage.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setDraft(cloneContent(DEFAULT_HOMEPAGE_CONTENT));
    setDirty(true);
    setConfirmReset(false);
    setMessage({
      type: 'success',
      text: 'Default homepage restored in the editor. Review it, then press Save homepage.',
    });
  };

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Public homepage editor
              </h2>
              <p className="max-w-2xl text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Every headline, paragraph, button label, list item, tag, and image on the public
                homepage. Guests see this page first; signed-in members see it when they open Home.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {dirty ? (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                Unsaved changes
              </span>
            ) : (
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                {loaded ? 'Saved' : 'Loading…'}
              </span>
            )}
            <button
              type="button"
              disabled={saving}
              onClick={() => setConfirmReset(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Reset defaults
            </button>
            <button
              type="button"
              disabled={saving || !dirty}
              onClick={() => void handleSave()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {saving ? 'Saving…' : 'Save homepage'}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500 dark:text-slate-400">
          <span>{draft.sections.filter((s) => s.enabled).length} sections visible</span>
          <span>·</span>
          <span>{totalItems} editable items</span>
          <span>·</span>
          <span>{draft.sections.reduce((n, s) => n + (s.image.src ? 1 : 0), 0)} section images</span>
        </div>

        {confirmReset ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            <span>Replace all homepage text and images with the built-in defaults?</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="rounded-lg border border-amber-300 px-3 py-1 font-medium dark:border-amber-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="rounded-lg bg-amber-600 px-3 py-1 font-medium text-white hover:bg-amber-700"
              >
                Reset editor
              </button>
            </div>
          </div>
        ) : null}

        {message ? (
          <p
            className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
              message.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200'
                : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200'
            }`}
          >
            {message.text}
          </p>
        ) : null}
      </section>

      <div className="space-y-3">
        {draft.sections.map((section) => {
          const open = expanded === section.id;
          return (
            <section
              key={section.id}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            >
              <button
                type="button"
                onClick={() => setExpanded(open ? null : section.id)}
                className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left"
                aria-expanded={open}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                      section.enabled
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                        : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                    }`}
                  >
                    {section.enabled ? (
                      <Eye className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <EyeOff className="h-3 w-3" aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {SECTION_LABELS[section.kind]}
                    </span>
                    <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                      #{HOMEPAGE_SECTION_ANCHORS[section.kind]} · {section.title || 'No title yet'} ·{' '}
                      {section.items.length} item{section.items.length === 1 ? '' : 's'}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span
                    role="switch"
                    aria-checked={section.enabled}
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateSection(section.id, { enabled: !section.enabled });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        updateSection(section.id, { enabled: !section.enabled });
                      }
                    }}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      section.enabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        section.enabled ? 'translate-x-[18px]' : 'translate-x-0.5'
                      }`}
                    />
                  </span>
                  {open ? (
                    <ChevronUp className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  )}
                </span>
              </button>

              {open ? (
                <div className="space-y-5 border-t border-slate-200 px-5 py-5 dark:border-slate-800">
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <TextField
                      label="Eyebrow / small label"
                      value={section.eyebrow}
                      onChange={(value) => updateSection(section.id, { eyebrow: value })}
                      maxLength={120}
                    />
                    <TextField
                      label="Badge (pill above the title)"
                      value={section.badge}
                      onChange={(value) => updateSection(section.id, { badge: value })}
                      maxLength={120}
                    />
                    <TextField
                      label="Title"
                      value={section.title}
                      onChange={(value) => updateSection(section.id, { title: value })}
                      maxLength={300}
                    />
                    <TextField
                      label="Accent / highlighted title line"
                      value={section.accent}
                      onChange={(value) => updateSection(section.id, { accent: value })}
                      maxLength={300}
                    />
                    <TextField
                      label="Description"
                      value={section.description}
                      onChange={(value) => updateSection(section.id, { description: value })}
                      maxLength={900}
                      multiline
                    />
                    <TextField
                      label="Note / supporting sentence"
                      value={section.note}
                      onChange={(value) => updateSection(section.id, { note: value })}
                      maxLength={400}
                      multiline
                    />
                    <TextField
                      label="Primary button label"
                      value={section.ctaLabel}
                      onChange={(value) => updateSection(section.id, { ctaLabel: value })}
                      maxLength={80}
                    />
                    <TextField
                      label="Secondary button label"
                      value={section.ctaSecondaryLabel}
                      onChange={(value) => updateSection(section.id, { ctaSecondaryLabel: value })}
                      maxLength={80}
                    />
                    <TextField
                      label="Secondary title (demo card / result title)"
                      value={section.secondaryTitle}
                      onChange={(value) => updateSection(section.id, { secondaryTitle: value })}
                      maxLength={200}
                    />
                    <TextField
                      label="Secondary text (query / card subtitle)"
                      value={section.secondaryText}
                      onChange={(value) => updateSection(section.id, { secondaryText: value })}
                      maxLength={600}
                    />
                    {section.kind === 'transformation' ? (
                      <>
                        <TextField
                          label="“Before” column label"
                          value={section.beforeLabel || ''}
                          onChange={(value) => updateSection(section.id, { beforeLabel: value })}
                          maxLength={60}
                        />
                        <TextField
                          label="“After” column label"
                          value={section.afterLabel || ''}
                          onChange={(value) => updateSection(section.id, { afterLabel: value })}
                          maxLength={60}
                        />
                      </>
                    ) : null}
                  </div>

                  <TagsEditor
                    tags={section.tags}
                    onChange={(tags) => updateSection(section.id, { tags })}
                    label="Section chips / tags"
                  />

                  <ImageAssetField
                    adminUid={adminUid}
                    label="Section image (optional)"
                    value={section.image.src}
                    onChange={(src) =>
                      updateSection(section.id, {
                        image: { src, alt: section.image.alt || section.title.slice(0, 160) },
                      })
                    }
                    hint="Displayed with this section. Leave empty to use the built-in illustrated preview (hero) or no image."
                    compress={{ maxWidth: 1400, maxHeight: 1400, quality: 0.84, maxBytes: 650_000 }}
                  />

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                      <div>
                        <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                          Section items ({section.items.length})
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Cards, steps, highlights, or chips shown inside this section.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => addItem(section.id)}
                        disabled={section.items.length >= 20}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        Add item
                      </button>
                    </div>

                    {section.items.length === 0 ? (
                      <p className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 px-3 py-3 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        <ImagePlus className="h-4 w-4" aria-hidden="true" />
                        No items in this section.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {section.items.map((item, index) => (
                          <div
                            key={item.id}
                            className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-950/40"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                Item {index + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeItem(section.id, item.id)}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-red-600"
                              >
                                <Trash2 className="h-3 w-3" aria-hidden="true" />
                                Delete
                              </button>
                            </div>

                            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <TextField
                                label="Label / number"
                                value={item.label}
                                onChange={(value) => updateItem(section.id, item.id, { label: value })}
                                maxLength={40}
                                placeholder="01"
                              />
                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                                  Icon
                                </label>
                                <select
                                  value={item.icon}
                                  onChange={(e) =>
                                    updateItem(section.id, item.id, {
                                      icon: e.target.value as HomepageIconKey,
                                    })
                                  }
                                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                >
                                  {HOMEPAGE_ICON_OPTIONS.map((opt) => (
                                    <option key={opt.key} value={opt.key}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <TextField
                                label="Title"
                                value={item.title}
                                onChange={(value) => updateItem(section.id, item.id, { title: value })}
                                maxLength={200}
                              />
                              <TextField
                                label="Description"
                                value={item.description}
                                onChange={(value) =>
                                  updateItem(section.id, item.id, { description: value })
                                }
                                maxLength={600}
                                multiline
                              />
                            </div>

                            <div className="mt-3">
                              <TagsEditor
                                tags={item.tags}
                                onChange={(tags) => updateItem(section.id, item.id, { tags })}
                                label="Item chips / sample rows"
                              />
                            </div>

                            <div className="mt-3">
                              <ImageAssetField
                                adminUid={adminUid}
                                label="Item image (optional)"
                                value={item.image.src}
                                onChange={(src) =>
                                  updateItem(section.id, item.id, {
                                    image: { src, alt: item.image.alt || item.title.slice(0, 160) },
                                  })
                                }
                                preview="square"
                                compress={{
                                  maxWidth: 900,
                                  maxHeight: 900,
                                  quality: 0.82,
                                  maxBytes: 400_000,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Changes are saved together. Use the section toggle to hide a section without deleting it.
        </p>
        <button
          type="button"
          disabled={saving || !dirty}
          onClick={() => void handleSave()}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="h-4 w-4" aria-hidden="true" />
          )}
          {saving ? 'Saving homepage…' : 'Save homepage'}
        </button>
      </div>
    </div>
  );
};
