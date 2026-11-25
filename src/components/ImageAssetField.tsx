import React, { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2, Upload } from 'lucide-react';
import type { ImageCompressOptions } from '../lib/imageUtils';
import { fileToCompressedDataUrl } from '../lib/imageUtils';
import { uploadSiteMediaDataUrl } from '../lib/adminStore';
import { mediaIdFromRef } from '../lib/homepageDefaults';
import { rememberSiteMedia, useResolvedSiteMedia } from '../lib/siteMedia';

export interface ImageAssetFieldProps {
  adminUid: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  hint?: string;
  allowUrl?: boolean;
  preview?: 'wide' | 'square' | 'icon';
  compress?: ImageCompressOptions;
  disabled?: boolean;
}

const previewClass: Record<NonNullable<ImageAssetFieldProps['preview']>, string> = {
  wide: 'h-20 w-full max-w-[220px] object-contain rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-950',
  square:
    'h-20 w-20 object-contain rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-950',
  icon: 'h-10 w-10 object-contain rounded border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-800 dark:bg-slate-950',
};

/**
 * Admin image picker that accepts either a public https:// URL or a device
 * upload. Uploads are compressed, stored in Firestore (`siteMedia`) and
 * referenced with a compact `media:<id>` string.
 */
export function ImageAssetField({
  adminUid,
  label,
  value,
  onChange,
  hint,
  allowUrl = true,
  preview = 'wide',
  compress,
  disabled = false,
}: ImageAssetFieldProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolved = useResolvedSiteMedia(value);
  const mediaId = mediaIdFromRef(value);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const compressed = await fileToCompressedDataUrl(file, compress);
      const uploaded = await uploadSiteMediaDataUrl(adminUid, compressed.dataUrl, compressed.mime);
      rememberSiteMedia(uploaded.id, compressed.dataUrl);
      onChange(uploaded.src);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to upload this image.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">{label}</label>
        {value ? (
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => onChange('')}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-red-600 disabled:opacity-50 dark:text-slate-400"
          >
            <Trash2 className="h-3 w-3" aria-hidden="true" />
            Remove
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          {allowUrl ? (
            <input
              type="text"
              value={value}
              disabled={disabled || uploading}
              onChange={(e) => onChange(e.target.value)}
              placeholder="https://yourdomain.com/image.png"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {value ? (
                <span className="font-mono">{mediaId ? `media:${mediaId}` : value}</span>
              ) : (
                'No image selected yet.'
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0] || null)}
            />
            <button
              type="button"
              disabled={disabled || uploading}
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {uploading ? 'Uploading…' : 'Upload from device'}
            </button>
            {mediaId ? (
              <span className="text-[11px] text-slate-400">Stored in site media library</span>
            ) : null}
          </div>
          {hint ? <p className="text-[11px] leading-relaxed text-slate-500">{hint}</p> : null}
          {error ? <p className="text-[11px] font-medium text-red-600">{error}</p> : null}
        </div>

        <div className="shrink-0">
          {resolved ? (
            <img
              src={resolved}
              alt={`${label} preview`}
              referrerPolicy="no-referrer"
              className={previewClass[preview]}
            />
          ) : (
            <div
              className={`${previewClass[preview]} flex items-center justify-center text-slate-300`}
              aria-hidden="true"
            >
              <ImagePlus className="h-5 w-5" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
