import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const INSTALLED_STORAGE_KEY = 'clipindex_pwa_installed';

function checkStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return checkStandaloneMode() || localStorage.getItem(INSTALLED_STORAGE_KEY) === '1';
    } catch {
      return checkStandaloneMode();
    }
  });
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const standalone = checkStandaloneMode();
    let storedInstalled = false;
    try {
      if (standalone) {
        localStorage.setItem(INSTALLED_STORAGE_KEY, '1');
      }
      storedInstalled = localStorage.getItem(INSTALLED_STORAGE_KEY) === '1';
    } catch {
      // Ignore storage restrictions
    }
    setIsInstalled(standalone || storedInstalled);

    const userAgent = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      // Chrome/Edge only fires beforeinstallprompt when the app is NOT currently installed
      try {
        localStorage.removeItem(INSTALLED_STORAGE_KEY);
      } catch {
        // Ignore
      }
      setIsInstalled(checkStandaloneMode());
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      try {
        localStorage.setItem(INSTALLED_STORAGE_KEY, '1');
      } catch {
        // Ignore
      }
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        handleAppInstalled();
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    mediaQuery.addEventListener('change', handleDisplayModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      mediaQuery.removeEventListener('change', handleDisplayModeChange);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      try {
        localStorage.setItem(INSTALLED_STORAGE_KEY, '1');
      } catch {
        // Ignore
      }
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  }, [deferredPrompt]);

  const markInstalled = useCallback(() => {
    try {
      localStorage.setItem(INSTALLED_STORAGE_KEY, '1');
    } catch {
      // Ignore
    }
    setIsInstalled(true);
    setDeferredPrompt(null);
  }, []);

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    install,
    markInstalled,
  };
}
