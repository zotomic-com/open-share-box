import React, { useEffect, useState } from 'react';
import { CheckCircle2, Globe, Info, Loader2, Palette, Smartphone, Sparkles } from 'lucide-react';
import type { SiteSettings } from '../types/video';
import { updatePartialSiteSettingsAdmin } from '../lib/adminStore';
import { useResolvedSiteMedia } from '../lib/siteMedia';
import { ImageAssetField } from './ImageAssetField';

interface AdminBrandingPanelProps {
  adminUid: string;
  settings: SiteSettings;
}

interface BrandingForm {
  siteName: string;
  tagline: string;
  logoUrl: string;
  faviconUrl: string;
  appleTouchIconUrl: string;
  pwaIcon192Url: string;
  pwaIcon512Url: string;
  pwaMaskableIconUrl: string;
  ogImageUrl: string;
}

function toForm(settings: SiteSettings): BrandingForm {
  return {
    siteName: settings.siteName,
    tagline: settings.tagline,
    logoUrl: settings.logoUrl,
    faviconUrl: settings.faviconUrl,
    appleTouchIconUrl: settings.appleTouchIconUrl,
    pwaIcon192Url: settings.pwaIcon192Url,
    pwaIcon512Url: settings.pwaIcon512Url,
    pwaMaskableIconUrl: settings.pwaMaskableIconUrl,
    ogImageUrl: settings.ogImageUrl,
  };
}

export const AdminBrandingPanel: React.FC<AdminBrandingPanelProps> = ({
  adminUid,
  settings,
}) => {
  const [form, setForm] = useState<BrandingForm>(() => toForm(settings));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const resolvedLogo = useResolvedSiteMedia(form.logoUrl);
  const resolvedFavicon = useResolvedSiteMedia(form.faviconUrl);
  const resolvedOg = useResolvedSiteMedia(form.ogImageUrl);

  useEffect(() => {
    setForm(toForm(settings));
    // Reset only when the stored document changes, not on every keystroke echo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.updatedAtMs, settings.siteName]);

  const setField = <K extends keyof BrandingForm>(key: K, value: BrandingForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (!form.siteName.trim()) {
      setMessage({ type: 'error', text: 'Site name is required.' });
      return;
    }
    setSaving(true);
    try {
      await updatePartialSiteSettingsAdmin(adminUid, {
        siteName: form.siteName,
        tagline: form.tagline,
        logoUrl: form.logoUrl,
        faviconUrl: form.faviconUrl,
        appleTouchIconUrl: form.appleTouchIconUrl,
        pwaIcon192Url: form.pwaIcon192Url,
        pwaIcon512Url: form.pwaIcon512Url,
        pwaMaskableIconUrl: form.pwaMaskableIconUrl,
        ogImageUrl: form.ogImageUrl,
      });
      setMessage({ type: 'success', text: 'Brand assets saved. Visitors will see the update within a few seconds.' });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to save brand assets.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSave(e)} className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
          <Palette className="mt-0.5 h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              One place for every brand asset
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Logo, browser tab icon, Apple touch icon, installed app icons, and the social share
              image. Upload from your device or paste a public https:// link.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <ImageAssetField
            adminUid={adminUid}
            label="Header & footer logo"
            value={form.logoUrl}
            onChange={(value) => setField('logoUrl', value)}
            preview="wide"
            hint="Shown in the app header and on the public homepage. A wide PNG or SVG works best (about 4×1)."
            compress={{ maxWidth: 900, maxHeight: 300, quality: 0.9, maxBytes: 400_000 }}
          />
          <ImageAssetField
            adminUid={adminUid}
            label="Browser tab favicon"
            value={form.faviconUrl}
            onChange={(value) => setField('faviconUrl', value)}
            preview="icon"
            hint="Square icon, 32–64 px. Used as the favicon and as a fallback for the app icons below."
            compress={{ maxWidth: 128, maxHeight: 128, quality: 0.92, maxBytes: 90_000 }}
          />
          <ImageAssetField
            adminUid={adminUid}
            label="Apple touch icon (180×180)"
            value={form.appleTouchIconUrl}
            onChange={(value) => setField('appleTouchIconUrl', value)}
            preview="square"
            hint="Used when someone adds the site to their iPhone or iPad home screen."
            compress={{ maxWidth: 180, maxHeight: 180, quality: 0.92, maxBytes: 140_000 }}
          />
          <ImageAssetField
            adminUid={adminUid}
            label="Social share / Open Graph image"
            value={form.ogImageUrl}
            onChange={(value) => setField('ogImageUrl', value)}
            preview="wide"
            hint="Preview image shown when the site is shared on social media (recommended 1200×630)."
            compress={{ maxWidth: 1200, maxHeight: 630, quality: 0.86, maxBytes: 700_000 }}
          />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
          <Smartphone
            className="mt-0.5 h-4 w-4 text-blue-600 dark:text-blue-400"
            aria-hidden="true"
          />
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Installed app (PWA) icons
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Controls the icon used when the site is installed on a phone or desktop. Leave a field
              empty to fall back to the favicon or the bundled app icon.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
          <ImageAssetField
            adminUid={adminUid}
            label="App icon 192×192"
            value={form.pwaIcon192Url}
            onChange={(value) => setField('pwaIcon192Url', value)}
            preview="square"
            compress={{ maxWidth: 192, maxHeight: 192, quality: 0.92, maxBytes: 160_000 }}
          />
          <ImageAssetField
            adminUid={adminUid}
            label="App icon 512×512"
            value={form.pwaIcon512Url}
            onChange={(value) => setField('pwaIcon512Url', value)}
            preview="square"
            compress={{ maxWidth: 512, maxHeight: 512, quality: 0.92, maxBytes: 500_000 }}
          />
          <ImageAssetField
            adminUid={adminUid}
            label="Maskable icon 512×512"
            value={form.pwaMaskableIconUrl}
            onChange={(value) => setField('pwaMaskableIconUrl', value)}
            preview="square"
            hint="Keep the important artwork inside the middle 80% safe zone."
            compress={{ maxWidth: 512, maxHeight: 512, quality: 0.92, maxBytes: 500_000 }}
          />
        </div>

        <p className="mt-4 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2 text-[11px] leading-relaxed text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Changes apply to the live site after saving. Installed apps may keep the old icon until the
          app is reinstalled or its cache refreshes.
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
          <Globe className="mt-0.5 h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Brand name &amp; tagline
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Used on the homepage, header, footer, browser title, and install prompts.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Site / brand name
            </label>
            <input
              type="text"
              required
              maxLength={80}
              value={form.siteName}
              onChange={(e) => setField('siteName', e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Tagline
            </label>
            <input
              type="text"
              maxLength={160}
              value={form.tagline}
              onChange={(e) => setField('tagline', e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-950">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Header preview
          </p>
          <div className="mt-2 flex items-center gap-2.5">
            {resolvedLogo ? (
              <img
                src={resolvedLogo}
                alt=""
                referrerPolicy="no-referrer"
                className="h-7 max-w-[150px] object-contain"
              />
            ) : null}
            <span className="text-base font-bold text-slate-900 dark:text-slate-100">
              {form.siteName || 'Your brand'}
            </span>
            {resolvedFavicon ? (
              <img
                src={resolvedFavicon}
                alt=""
                referrerPolicy="no-referrer"
                className="ml-1 h-4 w-4 rounded"
              />
            ) : null}
            <span className="ml-auto text-xs text-slate-500">{form.tagline || 'Your tagline'}</span>
          </div>
          {resolvedOg ? (
            <div className="mt-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                Social share preview
              </p>
              <img
                src={resolvedOg}
                alt=""
                referrerPolicy="no-referrer"
                className="h-24 w-full max-w-[320px] rounded-lg border border-slate-200 object-cover dark:border-slate-800"
              />
            </div>
          ) : null}
        </div>
      </section>

      {message ? (
        <div
          className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-xs ${
            message.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )}
          {message.text}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Uploaded images are stored as compressed site media, so they work without a separate file
          host.
        </p>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {saving ? 'Saving brand assets…' : 'Save brand assets'}
        </button>
      </div>
    </form>
  );
};
