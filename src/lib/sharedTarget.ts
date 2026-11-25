const SHARE_CACHE = 'zotomic-share-target-v1';
const SHARE_KEY_PREFIX = '/__zotomic_shared/';

interface SharedTargetMeta {
  id: string;
  title?: string;
  text?: string;
  url?: string;
  files?: Array<{ key: string; name?: string; type?: string; size?: number }>;
}

export interface SharedTargetPayload {
  title: string;
  text: string;
  url: string;
  file: File | null;
}

function mimeToExtension(mime: string): string {
  const subtype = (mime.split('/')[1] || 'png').split('+')[0].replace(/[^a-zA-Z0-9]/g, '');
  if (subtype === 'jpeg') return 'jpg';
  if (subtype === 'svg') return 'svg';
  return subtype || 'png';
}

/**
 * Reads a Web Share Target payload that was stored by the service worker and
 * removes it from the cache so it is only consumed once.
 */
export async function consumeSharedTarget(id: string): Promise<SharedTargetPayload | null> {
  if (!id || typeof caches === 'undefined') return null;

  try {
    const cache = await caches.open(SHARE_CACHE);
    const metaResponse = await cache.match(`${SHARE_KEY_PREFIX}${id}/meta.json`);
    if (!metaResponse) return null;

    const meta = (await metaResponse.json()) as SharedTargetMeta;
    const first = meta.files?.[0];
    let file: File | null = null;

    if (first) {
      const fileResponse = await cache.match(first.key);
      if (fileResponse) {
        const blob = await fileResponse.blob();
        const type = first.type || blob.type || 'image/png';
        const fallbackName = `shared-image-${Date.now()}.${mimeToExtension(type)}`;
        file = new File([blob], first.name || fallbackName, { type });
      }
    }

    const keys = await cache.keys();
    await Promise.all(
      keys
        .filter((request) => {
          try {
            return new URL(request.url).pathname.startsWith(`${SHARE_KEY_PREFIX}${id}/`);
          } catch {
            return false;
          }
        })
        .map((request) => cache.delete(request))
    );

    return {
      title: meta.title || '',
      text: meta.text || '',
      url: meta.url || '',
      file,
    };
  } catch (error) {
    console.error('[share-target] Failed to read shared content', error);
    return null;
  }
}
