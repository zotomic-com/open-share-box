import React, { useState } from 'react';
import { Bookmark, Check, Copy, Share2, Smartphone, X } from 'lucide-react';

interface ShareSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookmarkSharingEnabled?: boolean;
  onOpenBookmarkImporter?: () => void;
  onTestShareUrl: (url: string, title: string) => void;
}

export const ShareSetupModal: React.FC<ShareSetupModalProps> = ({
  isOpen,
  onClose,
  bookmarkSharingEnabled = true,
  onOpenBookmarkImporter,
  onTestShareUrl,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const shareEndpoint = `${origin}/share-target?url=`;
  const bookmarkletCode = `javascript:(function(){window.location.href='${origin}/share-target?url='+encodeURIComponent(window.location.href)+'&title='+encodeURIComponent(document.title);})();`;

  const handleCopy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <Share2 className="w-4 h-4 text-blue-600" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Share Videos, AI Chats &amp; Bookmarks to ClipIndex
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[78vh] overflow-y-auto">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Smartphone className="w-4 h-4 text-blue-600" />
              <span>1. Mobile &amp; Desktop Share Sheet (PWA Web Share Target)</span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Install ClipIndex using the Install App button. Once installed, tapping{' '}
              <strong className="font-medium text-slate-900 dark:text-slate-100">Share</strong> on
              TikTok, YouTube, Instagram, Facebook, Gemini, ChatGPT, or Claude lists ClipIndex directly in your
              system share sheet and extracts structured summaries, links, and tags.
            </p>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-800 pt-5 space-y-2.5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              2. Direct Share Target URL (Shortcuts &amp; Automation)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Append any shared link to this URL (works in Apple Shortcuts, Raycast, or browser redirects):
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 text-xs bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-200 truncate">
                {shareEndpoint}https://...
              </code>
              <button
                type="button"
                onClick={() => void handleCopy('endpoint', shareEndpoint)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                {copiedId === 'endpoint' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedId === 'endpoint' ? 'Copied' : 'Copy URL'}
              </button>
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-800 pt-5 space-y-2.5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              3. One-Click Browser Bookmarklet &amp; Bookmark Importer
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Save this snippet as a browser bookmark. Click it on any page, video, or AI chat to send it straight into ClipIndex.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 text-xs bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-200 truncate">
                {bookmarkletCode}
              </code>
              <button
                type="button"
                onClick={() => void handleCopy('bookmarklet', bookmarkletCode)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                {copiedId === 'bookmarklet' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedId === 'bookmarklet' ? 'Copied' : 'Copy Code'}
              </button>
            </div>

            {bookmarkSharingEnabled && onOpenBookmarkImporter && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenBookmarkImporter();
                  }}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  Import Browser Bookmarks HTML File
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 dark:border-slate-800 pt-5 flex items-center justify-between gap-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Want to verify the share-target intake flow right now?
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                onTestShareUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Shared Sample Link');
              }}
              className="px-3.5 py-2 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/60 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Simulate Incoming Share
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
