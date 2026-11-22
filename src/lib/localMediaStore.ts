import type { InboxItemType } from '../types/video';

const DB_NAME = 'clipindex_local_media_v1';
const DB_VERSION = 1;
const STORE_NAME = 'media';

export interface LocalMediaRecord {
  id: string;
  fileName: string;
  mimeType: string;
  itemType: InboxItemType;
  size: number;
  blob: Blob;
  createdAtMs: number;
}

function openMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this browser.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open local media storage.'));
  });
}

export async function saveLocalMedia(
  id: string,
  blob: Blob,
  meta: { fileName: string; mimeType: string; itemType: InboxItemType }
): Promise<void> {
  const db = await openMediaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const record: LocalMediaRecord = {
      id,
      fileName: meta.fileName,
      mimeType: meta.mimeType || blob.type || 'application/octet-stream',
      itemType: meta.itemType,
      size: blob.size,
      blob,
      createdAtMs: Date.now(),
    };
    store.put(record);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Failed to save file on local device storage.'));
    };
  });
}

export async function getLocalMedia(id: string): Promise<LocalMediaRecord | null> {
  if (!id) return null;
  try {
    const db = await openMediaDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => {
        db.close();
        resolve((req.result as LocalMediaRecord | undefined) || null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error || new Error('Failed to read local media.'));
      };
    });
  } catch {
    return null;
  }
}

export async function deleteLocalMedia(id: string): Promise<void> {
  if (!id) return;
  try {
    const db = await openMediaDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // Ignore cleanup failures
  }
}

export async function getLocalMediaStats(): Promise<{ count: number; totalBytes: number }> {
  try {
    const db = await openMediaDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => {
        db.close();
        const records = (req.result as LocalMediaRecord[]) || [];
        const totalBytes = records.reduce((acc, r) => acc + (r.size || 0), 0);
        resolve({ count: records.length, totalBytes });
      };
      req.onerror = () => {
        db.close();
        resolve({ count: 0, totalBytes: 0 });
      };
    });
  } catch {
    return { count: 0, totalBytes: 0 };
  }
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 MB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
