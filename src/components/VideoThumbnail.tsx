import React, { useState } from 'react';
import { Bot, FileText, Film, Globe, Image as ImageIcon } from 'lucide-react';
import type { InboxItemType, VideoPlatform } from '../types/video';
import { getItemType, PLATFORM_LABELS } from '../lib/videoUtils';

interface VideoThumbnailProps {
  src?: string;
  title: string;
  platform: VideoPlatform;
  itemType?: InboxItemType;
  durationLabel?: string;
  isLocalMedia?: boolean;
  className?: string;
}

export const VideoThumbnail: React.FC<VideoThumbnailProps> = ({
  src,
  title,
  platform,
  itemType,
  durationLabel,
  isLocalMedia,
  className = 'w-full aspect-video',
}) => {
  const [hasError, setHasError] = useState(false);

  const showFallback = !src || hasError;
  const resolvedType = getItemType({ itemType, platform });

  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 select-none ${className}`}
    >
      {showFallback ? (
        <div className="w-full h-full flex flex-col items-center justify-center p-3 bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200/70 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 text-slate-500 dark:text-slate-400">
          {resolvedType === 'screenshot' ? (
            <ImageIcon className="w-6 h-6 mb-1.5 opacity-75" />
          ) : resolvedType === 'document' ? (
            <FileText className="w-6 h-6 mb-1.5 opacity-75 text-blue-600 dark:text-blue-400" />
          ) : resolvedType === 'ai-chat' ? (
            <Bot className="w-6 h-6 mb-1.5 opacity-75 text-violet-600 dark:text-violet-400" />
          ) : resolvedType === 'link' ? (
            <Globe className="w-6 h-6 mb-1.5 opacity-75" />
          ) : (
            <Film className="w-6 h-6 mb-1.5 opacity-75" />
          )}
          <span className="text-[11px] font-medium tracking-tight text-center line-clamp-1">
            {PLATFORM_LABELS[platform]}
          </span>
        </div>
      ) : (
        <img
          src={src}
          alt={title}
          width={320}
          height={180}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setHasError(true)}
          className="w-full h-full object-cover"
        />
      )}
      {isLocalMedia && (
        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 text-[10px] font-medium bg-slate-950/80 text-white rounded">
          On Device
        </span>
      )}
      {durationLabel && durationLabel !== '—' && (
        <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 text-[11px] font-mono tabular-nums font-medium bg-slate-950/85 text-white rounded">
          {durationLabel}
        </span>
      )}
    </div>
  );
};
