import React, { useState } from 'react';
import { CheckCircle2, Download, Smartphone, WifiOff, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface PWAInstallBarProps {
  siteName?: string;
}

export const PWAInstallBar: React.FC<PWAInstallBarProps> = ({ siteName = 'ClipIndex' }) => {
  const { isInstallable, isInstalled, isIOS, install, markInstalled } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [dismissedForSession, setDismissedForSession] = useState(false);

  // Automatically hide completely if this device already installed the app
  if (isInstalled || dismissedForSession) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setShowGuideModal(true);
  };

  return (
    <>
      <div
        role="region"
        aria-label="Install application"
        className="border-b border-slate-200 dark:border-slate-800 bg-blue-50/80 dark:bg-slate-900/90 px-4 lg:px-6 py-2"
      >
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Smartphone
              className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0"
              aria-hidden="true"
            />
            <p className="text-xs text-slate-700 dark:text-slate-200 truncate">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                Install {siteName}
              </span>{' '}
              for quick Share Sheet capture, offline library access, and one-tap screenshot saving.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleInstallClick()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              Install App
            </button>
            <button
              type="button"
              onClick={() => setDismissedForSession(true)}
              aria-label="Hide install bar for this session"
              className="p-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 rounded-md"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {showGuideModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3
                id="pwa-install-title"
                className="text-base font-semibold text-slate-900 dark:text-slate-100"
              >
                Install {siteName} on this device
              </h3>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-md"
                aria-label="Close install instructions"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <ol className="text-sm text-slate-700 dark:text-slate-300 space-y-2 list-decimal list-inside">
                <li>Tap the Share button in Safari&apos;s toolbar.</li>
                <li>Scroll down and tap Add to Home Screen.</li>
                <li>Launch {siteName} from your home screen for Share Sheet &amp; full-screen access.</li>
              </ol>
            ) : (
              <ol className="text-sm text-slate-700 dark:text-slate-300 space-y-2 list-decimal list-inside">
                <li>Open your browser menu (or look for the install icon in the address bar).</li>
                <li>Select &ldquo;Install {siteName}&rdquo; or &ldquo;Add to Home Screen&rdquo;.</li>
                <li>Once installed, open it directly as a standalone app.</li>
              </ol>
            )}

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="w-full py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Got it
              </button>
              <button
                type="button"
                onClick={() => {
                  markInstalled();
                  setShowGuideModal(false);
                }}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Already installed on this device (hide button)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>Offline Mode — Viewing cached library</span>
    </div>
  );
};
