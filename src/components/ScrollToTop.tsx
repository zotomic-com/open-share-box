import React, { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

interface ScrollToTopProps {
  /** Extra class names for placement overrides. */
  className?: string;
}

/**
 * Floating "back to top" control shared by the homepage and the app shell.
 * It stays out of the way until the reader has scrolled a little.
 */
export function ScrollToTop({ className = '' }: ScrollToTopProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 420);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Scroll back to top"
      className={`fixed bottom-5 right-5 z-40 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--hp-border)] bg-[var(--hp-panel)] text-[var(--hp-muted)] shadow-lg transition-all duration-200 hover:border-[var(--hp-accent)] hover:text-[var(--hp-accent-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
      } ${className}`}
    >
      <ArrowUp className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
