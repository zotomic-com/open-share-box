import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import type {
  FeatureModuleConfig,
  FeatureModuleInput,
  FeatureModuleKey,
  ParsedBookmarkEntry,
  UserReminder,
  UserReminderInput,
  WhatsAppConfig,
  WhatsAppConfigInput,
} from '../types/video';
import { db, handleFirestoreError, OperationType } from './firebase';
import { ensureUserProfile, toMillis } from './libraryStore';
import { generateSafeId } from './videoUtils';

const GUEST_REMINDERS_KEY = 'clipindex_guest_reminders_v1';
const GUEST_WHATSAPP_KEY = 'clipindex_guest_whatsapp_v1';

export const DEFAULT_FEATURE_MODULES: FeatureModuleConfig[] = [
  {
    id: 'mod-text-pdf',
    key: 'text-pdf',
    name: 'Text & PDF Upload',
    description: 'Paste plain/markdown text or upload .pdf, .txt, .md, .csv, and .json documents for AI summarization and link extraction.',
    isActive: true,
    isVisible: true,
    sortOrder: 1,
    badgeText: 'PDF & Text',
    helperNote: 'PDF files stay cached on your local device while AI takeaways and extracted links sync cleanly.',
    maxSizeMb: 15,
    updatedBy: 'system',
    createdAtMs: 1700000000000,
    updatedAtMs: 1700000000000,
  },
  {
    id: 'mod-bookmark-share',
    key: 'bookmark-share',
    name: 'Browser Bookmark Sharing',
    description: 'Import Chrome, Edge, Firefox, or Safari bookmark exports (bookmarks.html) or share tabs via 1-click bookmarklet.',
    isActive: true,
    isVisible: true,
    sortOrder: 2,
    badgeText: 'Bookmarks',
    helperNote: 'Export your browser bookmarks as HTML and import selected folders directly into any group.',
    maxSizeMb: 10,
    updatedBy: 'system',
    createdAtMs: 1700000000000,
    updatedAtMs: 1700000000000,
  },
  {
    id: 'mod-llm-chat',
    key: 'llm-chat',
    name: 'LLM Chat History Share',
    description: 'Save & index conversations from Gemini, ChatGPT, Claude, Perplexity, and Grok via share link, copy-paste, or JSON/MD export.',
    isActive: true,
    isVisible: true,
    sortOrder: 3,
    badgeText: 'AI Chats',
    helperNote: 'Paste a public share URL (gemini.google.com/share, chatgpt.com/share, claude.ai/share) or raw chat transcript.',
    maxSizeMb: 15,
    updatedBy: 'system',
    createdAtMs: 1700000000000,
    updatedAtMs: 1700000000000,
  },
  {
    id: 'mod-reminders',
    key: 'reminders',
    name: 'User Reminders',
    description: 'Create, edit, complete, and delete personal reminders linked to saved videos, links, documents, or AI chats.',
    isActive: true,
    isVisible: true,
    sortOrder: 4,
    badgeText: 'Reminders',
    helperNote: 'Due reminders automatically surface in your Notification Bell and Reminders Workspace.',
    maxSizeMb: 1,
    updatedBy: 'system',
    createdAtMs: 1700000000000,
    updatedAtMs: 1700000000000,
  },
  {
    id: 'mod-whatsapp',
    key: 'whatsapp',
    name: 'WhatsApp Connector',
    description: 'Connect your WhatsApp phone number to send instant 1-click reminder alerts or Cloud API notifications.',
    isActive: true,
    isVisible: true,
    sortOrder: 5,
    badgeText: 'WhatsApp',
    helperNote: 'Works immediately with 1-click WhatsApp dispatch links or automatically via Meta Cloud API when configured.',
    maxSizeMb: 1,
    updatedBy: 'system',
    createdAtMs: 1700000000000,
    updatedAtMs: 1700000000000,
  },
];

function normalizeModuleKey(raw: unknown): FeatureModuleKey {
  const s = String(raw || '').trim();
  if (
    s === 'text-pdf' ||
    s === 'bookmark-share' ||
    s === 'llm-chat' ||
    s === 'reminders' ||
    s === 'whatsapp'
  ) {
    return s;
  }
  return 'custom';
}

export function subscribeFeatureModules(
  onData: (modules: FeatureModuleConfig[], isSeededInDb: boolean) => void
): () => void {
  const path = 'featureModules';
  return onSnapshot(
    collection(db, path),
    (snap) => {
      if (snap.empty) {
        onData(DEFAULT_FEATURE_MODULES, false);
        return;
      }
      const list: FeatureModuleConfig[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: String(data.id || d.id),
            key: normalizeModuleKey(data.key),
            name: String(data.name || 'Feature Module'),
            description: String(data.description || ''),
            isActive: data.isActive !== false,
            isVisible: data.isVisible !== false,
            sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : 99,
            badgeText: String(data.badgeText || ''),
            helperNote: String(data.helperNote || ''),
            maxSizeMb: typeof data.maxSizeMb === 'number' ? data.maxSizeMb : 15,
            updatedBy: String(data.updatedBy || 'system'),
            createdAtMs: toMillis(data.createdAt),
            updatedAtMs: toMillis(data.updatedAt),
          };
        })
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      onData(list, true);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export function getFeatureModule(
  modules: FeatureModuleConfig[],
  key: FeatureModuleKey
): FeatureModuleConfig | undefined {
  return modules.find((m) => m.key === key);
}

export function isFeatureModuleEnabled(
  modules: FeatureModuleConfig[],
  key: FeatureModuleKey
): boolean {
  const mod = getFeatureModule(modules, key);
  if (!mod) return false;
  return mod.isActive && mod.isVisible;
}

export async function seedDefaultFeatureModulesAdmin(adminUid: string): Promise<void> {
  for (const mod of DEFAULT_FEATURE_MODULES) {
    const path = `featureModules/${mod.id}`;
    const ref = doc(db, path);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          id: mod.id,
          key: mod.key,
          name: mod.name,
          description: mod.description,
          isActive: mod.isActive,
          isVisible: mod.isVisible,
          sortOrder: mod.sortOrder,
          badgeText: mod.badgeText,
          helperNote: mod.helperNote,
          maxSizeMb: mod.maxSizeMb,
          updatedBy: adminUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }
}

export async function saveFeatureModuleAdmin(
  adminUid: string,
  input: FeatureModuleInput
): Promise<string> {
  const moduleId = input.id?.trim() || generateSafeId('mod');
  const path = `featureModules/${moduleId}`;
  const ref = doc(db, path);
  const payload = {
    id: moduleId,
    key: normalizeModuleKey(input.key),
    name: input.name.trim().slice(0, 100) || 'Feature Module',
    description: input.description.trim().slice(0, 400),
    isActive: Boolean(input.isActive),
    isVisible: Boolean(input.isVisible),
    sortOrder: Math.max(0, Math.min(1000, Math.floor(Number(input.sortOrder) || 0))),
    badgeText: input.badgeText.trim().slice(0, 40),
    helperNote: input.helperNote.trim().slice(0, 500),
    maxSizeMb: Math.max(1, Math.min(100, Math.floor(Number(input.maxSizeMb) || 15))),
    updatedBy: adminUid,
    updatedAt: serverTimestamp(),
  };

  try {
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, payload);
    }
    return moduleId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteFeatureModuleAdmin(moduleId: string): Promise<void> {
  const path = `featureModules/${moduleId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// --- User Reminders ---
export function subscribeUserReminders(
  userId: string,
  onData: (reminders: UserReminder[]) => void
): () => void {
  const path = `users/${userId}/reminders`;
  const q = query(collection(db, path), where('ownerId', '==', userId));
  return onSnapshot(
    q,
    (snap) => {
      const items: UserReminder[] = snap.docs
        .map((d) => {
          const data = d.data();
          const rec = data.recurrence;
          const st = data.status;
          const ch = data.channel;
          return {
            id: String(data.id || d.id),
            ownerId: String(data.ownerId || userId),
            title: String(data.title || 'Reminder'),
            note: String(data.note || ''),
            videoId: data.videoId ? String(data.videoId) : '',
            videoTitle: data.videoTitle ? String(data.videoTitle) : '',
            dueAtMs: typeof data.dueAtMs === 'number' ? data.dueAtMs : Date.now(),
            recurrence:
              rec === 'daily' || rec === 'weekly' || rec === 'monthly' ? rec : 'none',
            status: st === 'completed' || st === 'dismissed' ? st : 'active',
            channel: ch === 'whatsapp' || ch === 'both' ? ch : 'in-app',
            lastSentAtMs: typeof data.lastSentAtMs === 'number' ? data.lastSentAtMs : 0,
            createdAtMs: toMillis(data.createdAt),
            updatedAtMs: toMillis(data.updatedAt),
          };
        })
        .sort((a, b) => a.dueAtMs - b.dueAtMs);
      onData(items);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export async function saveUserReminder(
  user: User,
  input: UserReminderInput
): Promise<string> {
  await ensureUserProfile(user);
  const reminderId = input.id?.trim() || generateSafeId('rem');
  const path = `users/${user.uid}/reminders/${reminderId}`;
  const ref = doc(db, path);
  const cleanVideoId = input.videoId ? input.videoId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128) : '';

  const fields = {
    title: input.title.trim().slice(0, 160) || 'Reminder',
    note: input.note.trim().slice(0, 600),
    videoId: cleanVideoId,
    videoTitle: (input.videoTitle || '').trim().slice(0, 300),
    dueAtMs: Math.max(0, Math.floor(Number(input.dueAtMs) || Date.now())),
    recurrence:
      input.recurrence === 'daily' ||
      input.recurrence === 'weekly' ||
      input.recurrence === 'monthly'
        ? input.recurrence
        : 'none',
    status:
      input.status === 'completed' || input.status === 'dismissed' ? input.status : 'active',
    channel:
      input.channel === 'whatsapp' || input.channel === 'both' ? input.channel : 'in-app',
    updatedAt: serverTimestamp(),
  };

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        id: reminderId,
        ownerId: user.uid,
        lastSentAtMs: 0,
        ...fields,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, fields);
    }
    return reminderId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function markUserReminderSent(
  userId: string,
  reminderId: string
): Promise<void> {
  const path = `users/${userId}/reminders/${reminderId}`;
  try {
    await updateDoc(doc(db, path), {
      lastSentAtMs: Date.now(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteUserReminder(
  userId: string,
  reminderId: string
): Promise<void> {
  const path = `users/${userId}/reminders/${reminderId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function loadGuestReminders(): UserReminder[] {
  try {
    const raw = localStorage.getItem(GUEST_REMINDERS_KEY);
    return raw ? (JSON.parse(raw) as UserReminder[]) : [];
  } catch {
    return [];
  }
}

export function saveGuestReminders(reminders: UserReminder[]): void {
  try {
    localStorage.setItem(GUEST_REMINDERS_KEY, JSON.stringify(reminders));
  } catch {
    // Ignore storage quota errors
  }
}

// --- Private WhatsApp Connector Config ---
export function subscribeOwnWhatsAppConfig(
  userId: string,
  onData: (cfg: WhatsAppConfig | null) => void
): () => void {
  const path = `users/${userId}/private/whatsapp`;
  return onSnapshot(
    doc(db, path),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const d = snap.data();
      onData({
        uid: String(d.uid || userId),
        enabled: Boolean(d.enabled),
        phoneNumber: String(d.phoneNumber || ''),
        displayLabel: String(d.displayLabel || ''),
        autoIncludeItemLink: d.autoIncludeItemLink !== false,
        deliveryMode: d.deliveryMode === 'cloud-api' ? 'cloud-api' : 'wa-link',
        lastTestedAtMs: typeof d.lastTestedAtMs === 'number' ? d.lastTestedAtMs : 0,
        createdAtMs: toMillis(d.createdAt),
        updatedAtMs: toMillis(d.updatedAt),
      });
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, path);
    }
  );
}

export async function saveOwnWhatsAppConfig(
  user: User,
  input: WhatsAppConfigInput,
  markTested = false
): Promise<void> {
  await ensureUserProfile(user);
  const path = `users/${user.uid}/private/whatsapp`;
  const ref = doc(db, path);
  const cleanPhone = input.phoneNumber.replace(/[^0-9+\-\s()]/g, '').trim().slice(0, 30);

  const fields = {
    enabled: Boolean(input.enabled),
    phoneNumber: cleanPhone,
    displayLabel: input.displayLabel.trim().slice(0, 80),
    autoIncludeItemLink: Boolean(input.autoIncludeItemLink),
    deliveryMode: input.deliveryMode === 'cloud-api' ? 'cloud-api' : 'wa-link',
    ...(markTested ? { lastTestedAtMs: Date.now() } : {}),
    updatedAt: serverTimestamp(),
  };

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        lastTestedAtMs: markTested ? Date.now() : 0,
        ...fields,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, fields);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export function loadGuestWhatsAppConfig(): WhatsAppConfig | null {
  try {
    const raw = localStorage.getItem(GUEST_WHATSAPP_KEY);
    return raw ? (JSON.parse(raw) as WhatsAppConfig) : null;
  } catch {
    return null;
  }
}

export function saveGuestWhatsAppConfig(cfg: WhatsAppConfig): void {
  try {
    localStorage.setItem(GUEST_WHATSAPP_KEY, JSON.stringify(cfg));
  } catch {
    // Ignore storage quota errors
  }
}

export function buildWhatsAppReminderLink(phoneNumber: string, message: string): string {
  const digits = (phoneNumber || '').replace(/[^0-9]/g, '');
  if (!digits) {
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

// --- Browser Bookmarks Netscape HTML Parser ---
export function parseNetscapeBookmarksHtml(html: string): ParsedBookmarkEntry[] {
  if (!html || typeof html !== 'string') return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const results: ParsedBookmarkEntry[] = [];
  const seenUrls = new Set<string>();

  const walkDl = (dlElement: Element, folderPath: string[]) => {
    const children = Array.from(dlElement.children);
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.tagName === 'DT') {
        const heading = child.querySelector(':scope > h3, :scope > H3');
        const nestedDl = child.querySelector(':scope > dl, :scope > DL');
        const anchor = child.querySelector(':scope > a, :scope > A');

        if (heading) {
          const folderName = (heading.textContent || 'Bookmarks').trim().slice(0, 80);
          const nextPath = folderName ? [...folderPath, folderName] : folderPath;
          if (nestedDl) {
            walkDl(nestedDl, nextPath);
          } else if (children[i + 1]?.tagName === 'DL') {
            walkDl(children[i + 1], nextPath);
          }
        } else if (anchor) {
          const href = (anchor.getAttribute('href') || '').trim();
          if (/^https?:\/\//i.test(href)) {
            const key = href.toLowerCase();
            if (!seenUrls.has(key)) {
              seenUrls.add(key);
              const addDateAttr = anchor.getAttribute('add_date');
              const addedSec = addDateAttr ? Number(addDateAttr) : 0;
              results.push({
                id: generateSafeId('bmk'),
                title: (anchor.textContent || href).trim().slice(0, 200),
                url: href.slice(0, 2000),
                folder: folderPath.join(' / ') || 'Bookmarks Bar',
                ...(addedSec > 0 && Number.isFinite(addedSec)
                  ? { addedAtMs: addedSec * 1000 }
                  : {}),
              });
            }
          }
        }
      } else if (child.tagName === 'DL') {
        walkDl(child, folderPath);
      }
      if (results.length >= 250) break;
    }
  };

  const rootDl = doc.querySelector('dl, DL');
  if (rootDl) {
    walkDl(rootDl, []);
  } else {
    const anchors = Array.from(doc.querySelectorAll('a[href]'));
    for (const a of anchors) {
      const href = (a.getAttribute('href') || '').trim();
      if (!/^https?:\/\//i.test(href)) continue;
      const key = href.toLowerCase();
      if (seenUrls.has(key)) continue;
      seenUrls.add(key);
      results.push({
        id: generateSafeId('bmk'),
        title: (a.textContent || href).trim().slice(0, 200),
        url: href.slice(0, 2000),
        folder: 'Imported Bookmarks',
      });
      if (results.length >= 250) break;
    }
  }

  return results;
}
