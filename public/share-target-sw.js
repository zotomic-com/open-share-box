/* Web Share Target (Level 2) handler for image/screenshot sharing.
 * Loaded by the Workbox-generated service worker via workbox.importScripts.
 */
const SHARE_CACHE = 'zotomic-share-target-v1';
const SHARE_KEY_PREFIX = '/__zotomic_shared/';
const MAX_FILE_BYTES = 50 * 1024 * 1024;

function safeSegment(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80) || 'file';
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'POST') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.origin !== self.location.origin || url.pathname !== '/share-target') return;

  event.respondWith(handleShareTarget(request));
});

async function handleShareTarget(request) {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  try {
    const formData = await request.formData();
    const title = String(formData.get('title') || '').slice(0, 500);
    const text = String(formData.get('text') || '').slice(0, 8000);
    const sharedUrl = String(formData.get('url') || '').slice(0, 4000);

    const incoming = formData.getAll('media');
    const files = [];
    const cache = await caches.open(SHARE_CACHE);

    for (let index = 0; index < incoming.length; index += 1) {
      const item = incoming[index];
      const isFile = typeof File !== 'undefined' && item instanceof File;
      if (!isFile || !item.size) continue;
      if (item.size > MAX_FILE_BYTES) continue;

      const type = item.type || 'application/octet-stream';
      const name = safeSegment(item.name || `shared-${index + 1}`);
      const key = `${SHARE_KEY_PREFIX}${id}/${index}-${name}`;

      await cache.put(
        new Request(key),
        new Response(item, {
          headers: {
            'Content-Type': type,
            'Content-Length': String(item.size),
          },
        })
      );

      files.push({ key, name: item.name || name, type, size: item.size });
    }

    await cache.put(
      new Request(`${SHARE_KEY_PREFIX}${id}/meta.json`),
      new Response(JSON.stringify({ id, title, text, url: sharedUrl, files }), {
        headers: { 'Content-Type': 'application/json' },
      })
    );

    return Response.redirect(`/share-target?shared=${encodeURIComponent(id)}`, 303);
  } catch (error) {
    console.error('[share-target] Failed to receive shared content', error);
    return Response.redirect('/share-target?share-error=1', 303);
  }
}
