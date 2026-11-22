import React, { useState } from 'react';
import { ArrowLeft, ArrowUpRight, FileText, ImageOff } from 'lucide-react';
import type { SitePage } from '../types/video';
import { getEmbeddableVideoInfo, sanitizeHttpUrl } from '../lib/pageDefaults';

interface SitePageViewProps {
  page: SitePage;
  onBack: () => void;
  isAdmin?: boolean;
  onEditPage?: (page: SitePage) => void;
}

const PageImageBlock: React.FC<{ url: string; caption?: string }> = ({ url, caption }) => {
  const [failed, setFailed] = useState(false);
  const safeUrl = sanitizeHttpUrl(url);

  if (!safeUrl || failed) {
    return (
      <figure className="my-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-8 flex flex-col items-center justify-center text-slate-400">
        <ImageOff className="w-6 h-6 mb-2" />
        <span className="text-xs">{caption || 'Image unavailable'}</span>
      </figure>
    );
  }

  return (
    <figure className="my-4 space-y-2">
      <img
        src={safeUrl}
        alt={caption || 'Page illustration'}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="w-full max-h-[480px] object-cover rounded-xl border border-slate-200 dark:border-slate-800"
      />
      {caption && (
        <figcaption className="text-xs text-slate-500 dark:text-slate-400">{caption}</figcaption>
      )}
    </figure>
  );
};

export const SitePageView: React.FC<SitePageViewProps> = ({
  page,
  onBack,
  isAdmin,
  onEditPage,
}) => {
  return (
    <article className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Workspace
        </button>

        {isAdmin && onEditPage && (
          <button
            type="button"
            onClick={() => onEditPage(page)}
            className="px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/60 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-colors"
          >
            Edit Page in Admin
          </button>
        )}
      </div>

      <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-6 sm:p-10 space-y-6">
        <header className="space-y-2 pb-6 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <FileText className="w-3.5 h-3.5" />
            <span className="capitalize">{page.pageType} Page</span>
            <span aria-hidden="true">·</span>
            <span>/{page.slug}</span>
            <span aria-hidden="true">·</span>
            <span>Updated {new Date(page.updatedAtMs).toLocaleDateString()}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {page.title}
          </h1>
          {page.subtitle && (
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              {page.subtitle}
            </p>
          )}
        </header>

        <div className="space-y-4">
          {page.blocks.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No content blocks have been added to this page yet.
            </p>
          ) : (
            page.blocks.map((block) => {
              if (block.type === 'heading') {
                return (
                  <h2
                    key={block.id}
                    className="pt-3 text-lg font-semibold text-slate-900 dark:text-slate-100"
                  >
                    {block.heading || block.content}
                  </h2>
                );
              }
              if (block.type === 'image') {
                return (
                  <PageImageBlock
                    key={block.id}
                    url={block.mediaUrl || ''}
                    caption={block.caption}
                  />
                );
              }
              if (block.type === 'video') {
                const videoInfo = getEmbeddableVideoInfo(block.mediaUrl || '');
                if (!videoInfo.src) return null;
                return (
                  <figure key={block.id} className="my-4 space-y-2">
                    {videoInfo.kind === 'youtube' || videoInfo.kind === 'vimeo' ? (
                      <div className="w-full aspect-video rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black">
                        <iframe
                          src={videoInfo.src}
                          title={block.caption || page.title}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          className="w-full h-full border-0"
                        />
                      </div>
                    ) : videoInfo.kind === 'direct' ? (
                      <div className="w-full aspect-video rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black">
                        <video src={videoInfo.src} controls className="w-full h-full" />
                      </div>
                    ) : (
                      <a
                        href={videoInfo.src}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Watch referenced video
                        <ArrowUpRight className="w-4 h-4" />
                      </a>
                    )}
                    {block.caption && (
                      <figcaption className="text-xs text-slate-500 dark:text-slate-400">
                        {block.caption}
                      </figcaption>
                    )}
                  </figure>
                );
              }
              return (
                <p
                  key={block.id}
                  className="text-sm sm:text-[15px] text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap"
                >
                  {block.content}
                </p>
              );
            })
          )}
        </div>
      </div>
    </article>
  );
};
