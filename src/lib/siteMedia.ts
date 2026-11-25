import { useEffect, useState } from 'react';
import { fetchSiteMediaDataUrls } from './adminStore';
import { isMediaRef, mediaIdFromRef } from './homepageDefaults';

/**
 * In-memory cache for admin-uploaded site images (`media:<id>` refs stored in
 * Firestore as data URLs). Public visitors resolve images through the App-level
 * media map; admin editors use this smaller on-demand helper.
 */
const resolvedCache = new Map<string, string>();
const pendingCache = new Map<string, Promise<string>>();

export async function resolveSiteMediaRef(src: string): Promise<string> {
  if (!isMediaRef(src)) return src;
  const id = mediaIdFromRef(src);
  if (!id) return '';
  if (resolvedCache.has(id)) return resolvedCache.get(id) || '';

  let pending = pendingCache.get(id);
  if (!pending) {
    pending = fetchSiteMediaDataUrls([id])
      .then((map) => {
        const value = map[id] || '';
        if (value) resolvedCache.set(id, value);
        return value;
      })
      .catch(() => '');
    pendingCache.set(id, pending);
  }

  const value = await pending;
  if (!value) {
    pendingCache.delete(id);
  }
  return value;
}

export function clearSiteMediaCache(): void {
  resolvedCache.clear();
  pendingCache.clear();
}

export function rememberSiteMedia(mediaId: string, dataUrl: string): void {
  if (!mediaId || !dataUrl.startsWith('data:image/')) return;
  resolvedCache.set(mediaId, dataUrl);
  clearSiteMediaPending(mediaId);
}

function clearSiteMediaPending(mediaId: string): void {
  pendingCache.delete(mediaId);
}

export function useResolvedSiteMedia(src: string): string {
  const [resolved, setResolved] = useState<string>(() => (isMediaRef(src) ? '' : src));

  useEffect(() => {
    let alive = true;
    if (!src) {
      setResolved('');
      return () => {
        alive = false;
      };
    }
    if (!isMediaRef(src)) {
      setResolved(src);
      return () => {
        alive = false;
      };
    }
    setResolved(resolvedCache.get(mediaIdFromRef(src)) || '');
    void resolveSiteMediaRef(src).then((value) => {
      if (alive) setResolved(value);
    });
    return () => {
      alive = false;
    };
  }, [src]);

  return resolved;
}
