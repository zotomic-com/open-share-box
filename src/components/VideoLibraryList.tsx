import React, { useState } from 'react';
import {
  ArrowUpRight,
  Bookmark,
  Check,
  Link2,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import type { AnalyzedVideo, InboxItemType, VideoCollection, VideoPlatform } from '../types/video';
import { sanitizeHttpUrl } from '../lib/pageDefaults';
import { formatRelativeDate, getItemType, PLATFORM_LABELS } from '../lib/videoUtils';
import { VideoThumbnail } from './VideoThumbnail';

interface VideoLibraryListProps {
  videos: AnalyzedVideo[];
  collections: VideoCollection[];
  localObjectUrls?: Record<string, string>;
  searchQuery: string;
  selectedItemType?: InboxItemType | 'all';
  selectedPlatform: VideoPlatform | 'all';
  selectedTag: string | null;
  selectedVideoId: string | null;
  onSelectVideo: (videoId: string, jumpToSeconds?: number) => void;
  onSelectTag: (tag: string | null) => void;
  onToggleFavorite: (video: AnalyzedVideo) => void;
  onDeleteVideo: (videoId: string) => void;
  onOpenSubmit: () => void;
}

export const VideoLibraryList: React.FC<VideoLibraryListProps> = ({
  videos,
  collections,
  localObjectUrls = {},
  searchQuery,
  selectedItemType = 'all',
  selectedPlatform,
  selectedTag,
  selectedVideoId,
  onSelectVideo,
  onSelectTag,
  onToggleFavorite,
  onDeleteVideo,
  onOpenSubmit,
}) => {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const collectionMap = new Map(collections.map((c) => [c.id, c.name]));
  const queryLower = searchQuery.trim().toLowerCase();

  if (videos.length === 0) {
    const isFiltered = Boolean(
      queryLower || selectedItemType !== 'all' || selectedPlatform !== 'all' || selectedTag
    );
    return (
      <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-10 text-center space-y-4">
        <div className="mx-auto w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
          <Search className="w-5 h-5" />
        </div>
        <div className="space-y-1.5 max-w-md mx-auto">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {isFiltered ? 'No matching items found' : 'Your Universal Share Inbox is empty'}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            {isFiltered
              ? 'Try clearing the search query, type filter, platform filter, or tag filter to see your saved items.'
              : 'Share or paste a video link, screenshot, or product/website URL to extract timestamped segments, retrieved links, OCR text, and searchable tags.'}
          </p>
        </div>
        {!isFiltered && (
          <button
            type="button"
            onClick={onOpenSubmit}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Save First Item
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800 overflow-hidden">
      {videos.map((video) => {
        const isSelected = video.id === selectedVideoId;
        const collectionName = video.collectionId ? collectionMap.get(video.collectionId) : undefined;
        const resolvedType = getItemType(video);
        const resolvedThumb =
          (resolvedType === 'screenshot' &&
            (localObjectUrls[video.id] ||
              (video.localMediaId ? localObjectUrls[video.localMediaId] : ''))) ||
          video.thumbnailUrl;
        const isLocalMedia = Boolean(
          video.localMediaId ||
            video.platform === 'upload' ||
            video.platform === 'screenshot' ||
            video.platform === 'pdf' ||
            video.url.startsWith('local://') ||
            video.url.startsWith('upload://')
        );
        const linkCount = video.links?.length || 0;

        const matchingSegments = queryLower
          ? video.segments
              .filter(
                (seg) =>
                  seg.title.toLowerCase().includes(queryLower) ||
                  seg.summary.toLowerCase().includes(queryLower) ||
                  (seg.keyQuote && seg.keyQuote.toLowerCase().includes(queryLower))
              )
              .slice(0, 3)
          : [];

        const matchingLinks = queryLower
          ? (video.links || [])
              .filter(
                (lnk) =>
                  lnk.label.toLowerCase().includes(queryLower) ||
                  lnk.url.toLowerCase().includes(queryLower) ||
                  (lnk.context && lnk.context.toLowerCase().includes(queryLower))
              )
              .slice(0, 2)
          : [];

        const matchingTranscript =
          queryLower && matchingSegments.length === 0 && matchingLinks.length === 0
            ? video.transcript.filter((t) => t.text.toLowerCase().includes(queryLower)).slice(0, 2)
            : [];

        const isConfirmingDelete = pendingDeleteId === video.id;

        return (
          <article
            key={video.id}
            className={`p-4 sm:p-5 transition-colors ${
              isSelected
                ? 'bg-blue-50/60 dark:bg-blue-950/25'
                : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
            }`}
          >
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <button
                type="button"
                onClick={() => onSelectVideo(video.id)}
                className="w-full sm:w-44 shrink-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-lg"
              >
                <VideoThumbnail
                  src={resolvedThumb}
                  title={video.title}
                  platform={video.platform}
                  itemType={resolvedType}
                  durationLabel={video.durationLabel}
                  isLocalMedia={isLocalMedia}
                />
              </button>

              <div className="flex-1 min-w-0 space-y-2 w-full">
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onSelectVideo(video.id)}
                    className="text-left group focus:outline-none min-w-0"
                  >
                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
                      {video.title}
                    </h3>
                  </button>

                  {/* Actions: Favorite + Delete icon alongside Favorite + Open Link */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(video)}
                      title={video.isFavorite ? 'Remove favorite' : 'Favorite item'}
                      aria-label={video.isFavorite ? 'Remove favorite' : 'Favorite item'}
                      className={`p-1.5 rounded-lg transition-colors ${
                        video.isFavorite
                          ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                          : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Star className={`w-4 h-4 ${video.isFavorite ? 'fill-current' : ''}`} />
                    </button>

                    {!isConfirmingDelete ? (
                      <button
                        type="button"
                        onClick={() => setPendingDeleteId(video.id)}
                        title={isLocalMedia ? 'Delete uploaded item & local file' : 'Delete item'}
                        aria-label={isLocalMedia ? 'Delete uploaded item' : 'Delete item'}
                        className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setPendingDeleteId(null);
                            onDeleteVideo(video.id);
                          }}
                          title="Confirm delete"
                          aria-label="Confirm delete"
                          className="p-1.5 text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDeleteId(null)}
                          title="Cancel delete"
                          aria-label="Cancel delete"
                          className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {sanitizeHttpUrl(video.url) && (
                      <a
                        href={sanitizeHttpUrl(video.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open original link"
                        aria-label="Open original link"
                        className="p-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                      >
                        <ArrowUpRight className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Unboxed typographic metadata */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {PLATFORM_LABELS[video.platform]}
                  </span>
                  {video.saveReason && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-medium text-blue-600 dark:text-blue-400">
                        Why: {video.saveReason}
                      </span>
                    </>
                  )}
                  {video.creator && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="truncate max-w-[180px]">{video.creator}</span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">
                    {video.segments.length}{' '}
                    {resolvedType === 'screenshot' || resolvedType === 'document'
                      ? 'sections'
                      : resolvedType === 'ai-chat'
                        ? 'turns'
                        : resolvedType === 'link'
                          ? 'highlights'
                          : 'segments'}
                  </span>
                  {linkCount > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1 tabular-nums text-emerald-700 dark:text-emerald-400">
                        <Link2 className="w-3 h-3" />
                        {linkCount} {linkCount === 1 ? 'link' : 'links'}
                      </span>
                    </>
                  )}
                  {collectionName && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300">
                        <Bookmark className="w-3 h-3" />
                        {collectionName}
                      </span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <span>{formatRelativeDate(video.createdAtMs)}</span>
                </div>

                {video.notes && (
                  <p className="text-xs text-slate-700 dark:text-slate-200 bg-slate-100/80 dark:bg-slate-800/60 px-2.5 py-1.5 rounded-md line-clamp-1">
                    Note: {video.notes}
                  </p>
                )}

                <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                  {video.summary}
                </p>

                {/* Cross-platform search timestamp / link hits */}
                {matchingSegments.length > 0 && (
                  <div className="pt-1 space-y-1">
                    {matchingSegments.map((seg) => (
                      <button
                        key={`${video.id}_${seg.timestamp}_${seg.title}`}
                        type="button"
                        onClick={() => onSelectVideo(video.id, seg.seconds)}
                        className="w-full text-left flex items-baseline gap-2.5 px-2.5 py-1.5 rounded-lg bg-slate-100/80 dark:bg-slate-800/70 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                      >
                        <span className="font-mono text-xs font-medium text-blue-600 dark:text-blue-400 tabular-nums shrink-0">
                          {seg.timestamp}
                        </span>
                        <span className="text-xs text-slate-700 dark:text-slate-200 truncate">
                          {seg.title} — {seg.summary}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {matchingLinks.length > 0 && (
                  <div className="pt-1 space-y-1">
                    {matchingLinks.map((lnk, idx) => {
                      const safeHref = sanitizeHttpUrl(lnk.url);
                      if (!safeHref) return null;
                      return (
                        <a
                          key={`${video.id}_lnk_${idx}`}
                          href={safeHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full text-left flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 hover:bg-emerald-100/80 dark:hover:bg-emerald-950/50 transition-colors"
                        >
                          <span className="flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300 truncate">
                            <Link2 className="w-3.5 h-3.5 shrink-0" />
                            <span className="font-medium truncate">{lnk.label}</span>
                            <span className="opacity-70 truncate">{lnk.url}</span>
                          </span>
                          <ArrowUpRight className="w-3.5 h-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" />
                        </a>
                      );
                    })}
                  </div>
                )}

                {matchingTranscript.length > 0 && (
                  <div className="pt-1 space-y-1">
                    {matchingTranscript.map((line, idx) => (
                      <button
                        key={`${video.id}_tr_${idx}`}
                        type="button"
                        onClick={() => onSelectVideo(video.id, line.seconds)}
                        className="w-full text-left flex items-baseline gap-2.5 px-2.5 py-1.5 rounded-lg bg-slate-100/80 dark:bg-slate-800/70 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                      >
                        <span className="font-mono text-xs font-medium text-blue-600 dark:text-blue-400 tabular-nums shrink-0">
                          {line.timestamp}
                        </span>
                        <span className="text-xs text-slate-700 dark:text-slate-200 truncate">
                          {line.text}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Interactive unboxed tag filter links */}
                {video.tags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
                    {video.tags.slice(0, 7).map((tag) => {
                      const isActive = selectedTag === tag;
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => onSelectTag(isActive ? null : tag)}
                          className={`text-xs transition-colors whitespace-nowrap ${
                            isActive
                              ? 'font-semibold text-blue-600 dark:text-blue-400 underline underline-offset-4'
                              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                          }`}
                        >
                          #{tag}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
};
