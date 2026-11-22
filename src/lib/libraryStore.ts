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
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import type {
  AnalyzedVideo,
  AnalyzeVideoResponse,
  ExtractedLink,
  UserPrivateRecord,
  UserProfileRecord,
  VideoCollection,
} from '../types/video';
import { db, handleFirestoreError, OperationType } from './firebase';
import { generateSafeId, getItemType } from './videoUtils';

const LOCAL_VIDEOS_KEY = 'clipindex_guest_videos_v1';
const LOCAL_COLLECTIONS_KEY = 'clipindex_guest_collections_v1';

export function toMillis(val: unknown): number {
  if (val instanceof Timestamp) return val.toMillis();
  if (typeof val === 'number') return val;
  return Date.now();
}

export function sanitizeLinksArray(rawLinks: ExtractedLink[] | undefined): ExtractedLink[] {
  if (!Array.isArray(rawLinks)) return [];
  const seen = new Set<string>();
  const clean: ExtractedLink[] = [];
  for (const item of rawLinks) {
    if (!item || typeof item.url !== 'string') continue;
    const trimmedUrl = item.url.trim();
    if (!/^https?:\/\//i.test(trimmedUrl)) continue;
    const normalizedKey = trimmedUrl.toLowerCase();
    if (seen.has(normalizedKey)) continue;
    seen.add(normalizedKey);
    const kind =
      item.kind === 'product' ||
      item.kind === 'service' ||
      item.kind === 'resource' ||
      item.kind === 'social'
        ? item.kind
        : 'other';
    clean.push({
      url: trimmedUrl.slice(0, 1000),
      label: String(item.label || trimmedUrl).trim().slice(0, 140),
      kind,
      ...(item.context ? { context: String(item.context).trim().slice(0, 260) } : {}),
    });
    if (clean.length >= 30) break;
  }
  return clean;
}

function sanitizeVideoForFirestore(
  ownerId: string,
  videoId: string,
  payload: AnalyzeVideoResponse,
  collectionId = '',
  options?: { saveReason?: string; notes?: string; localMediaId?: string }
) {
  const safeLocalId = options?.localMediaId ? options.localMediaId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128) : '';
  const rawUrl = (payload.url || '').trim();
  const safeUrl =
    rawUrl && !/^data:/i.test(rawUrl)
      ? rawUrl.slice(0, 2048)
      : safeLocalId
        ? `local://device/${safeLocalId}`
        : 'https://example.com';
  const rawThumb = (payload.thumbnailUrl || '').trim();
  const safeThumb = rawThumb && !/^data:/i.test(rawThumb) ? rawThumb.slice(0, 2048) : '';

  return {
    id: videoId.slice(0, 128),
    ownerId: ownerId.slice(0, 128),
    itemType: getItemType({ itemType: payload.itemType, platform: payload.platform }),
    url: safeUrl,
    platform: payload.platform || 'other',
    title: (payload.title || 'Untitled Item').slice(0, 300),
    creator: (payload.creator || 'Creator').slice(0, 150),
    thumbnailUrl: safeThumb,
    durationLabel: (payload.durationLabel || '—').slice(0, 32),
    category: (payload.category || 'General').slice(0, 80),
    collectionId: collectionId ? collectionId.slice(0, 128) : '',
    isFavorite: false,
    ...(options?.saveReason ? { saveReason: options.saveReason.trim().slice(0, 80) } : {}),
    ...(safeLocalId ? { localMediaId: safeLocalId } : {}),
    summary: (payload.summary || 'Summary unavailable.').slice(0, 5000),
    tldrBullets: (payload.tldrBullets || []).map((b) => String(b).slice(0, 500)).slice(0, 10),
    tags: (payload.tags || []).map((t) => String(t).slice(0, 50)).slice(0, 15),
    segments: (payload.segments || []).slice(0, 60).map((s) => ({
      timestamp: String(s.timestamp || '00:00').slice(0, 20),
      seconds: Math.max(0, Math.floor(Number(s.seconds) || 0)),
      title: String(s.title || 'Segment').slice(0, 140),
      summary: String(s.summary || '').slice(0, 600),
      ...(s.keyQuote ? { keyQuote: String(s.keyQuote).slice(0, 280) } : {}),
    })),
    transcript: (payload.transcript || []).slice(0, 200).map((t) => ({
      timestamp: String(t.timestamp || '00:00').slice(0, 20),
      seconds: Math.max(0, Math.floor(Number(t.seconds) || 0)),
      speaker: String(t.speaker || 'Speaker').slice(0, 60),
      text: String(t.text || '').slice(0, 800),
    })),
    links: sanitizeLinksArray(payload.links),
    notes: (options?.notes || '').slice(0, 10000),
  };
}

export async function ensureUserProfile(user: User): Promise<void> {
  if (!user.emailVerified) return;

  const userRef = doc(db, 'users', user.uid);
  const privateRef = doc(db, 'users', user.uid, 'private', 'info');
  const path = `users/${user.uid}`;

  try {
    const snap = await getDoc(userRef);
    const displayName = (user.displayName || user.email?.split('@')[0] || 'Creator').slice(0, 120);
    const photoURL = user.photoURL ? user.photoURL.slice(0, 1000) : undefined;

    if (!snap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        displayName,
        ...(photoURL ? { photoURL } : {}),
        role: 'user',
        status: 'active',
        bio: '',
        organization: '',
        location: '',
        videoCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, {
        displayName,
        ...(photoURL ? { photoURL } : {}),
        updatedAt: serverTimestamp(),
      });
    }

    const privateSnap = await getDoc(privateRef);
    if (!privateSnap.exists()) {
      await setDoc(privateRef, {
        uid: user.uid,
        email: (user.email || '').slice(0, 254),
        phone: '',
        address: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (user.email && !privateSnap.data()?.email) {
      await updateDoc(privateRef, {
        email: user.email.slice(0, 254),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export function subscribeOwnUserProfile(
  userId: string,
  onData: (profile: UserProfileRecord | null) => void
): () => void {
  const path = `users/${userId}`;
  return onSnapshot(
    doc(db, path),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const d = snap.data();
      const rawPlanStatus = String(d.planStatus || 'none');
      const planStatus =
        rawPlanStatus === 'active' || rawPlanStatus === 'due' || rawPlanStatus === 'expired'
          ? rawPlanStatus
          : 'none';
      onData({
        uid: String(d.uid || snap.id),
        displayName: String(d.displayName || 'Creator'),
        photoURL: d.photoURL ? String(d.photoURL) : undefined,
        role: d.role === 'admin' ? 'admin' : 'user',
        status: d.status === 'suspended' || d.status === 'pending' ? d.status : 'active',
        bio: String(d.bio || ''),
        organization: String(d.organization || ''),
        location: String(d.location || ''),
        videoCount: typeof d.videoCount === 'number' ? d.videoCount : 0,
        badgeIds: Array.isArray(d.badgeIds) ? d.badgeIds.map(String).slice(0, 10) : [],
        activePlanId: d.activePlanId ? String(d.activePlanId) : '',
        planStatus,
        planExpiresAtMs: typeof d.planExpiresAtMs === 'number' ? d.planExpiresAtMs : 0,
        createdAtMs: toMillis(d.createdAt),
        updatedAtMs: toMillis(d.updatedAt),
      });
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, path);
    }
  );
}

export function subscribeOwnPrivateInfo(
  userId: string,
  onData: (info: UserPrivateRecord | null) => void
): () => void {
  const path = `users/${userId}/private/info`;
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
        email: String(d.email || ''),
        phone: String(d.phone || ''),
        address: String(d.address || ''),
        adminNotes: String(d.adminNotes || ''),
        createdAtMs: toMillis(d.createdAt),
        updatedAtMs: toMillis(d.updatedAt),
      });
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, path);
    }
  );
}

export async function updateOwnUserDashboardProfile(
  userId: string,
  profileUpdates: {
    displayName: string;
    bio: string;
    organization: string;
    location: string;
  },
  privateUpdates: {
    email: string;
    phone: string;
    address: string;
  }
): Promise<void> {
  const userPath = `users/${userId}`;
  const privatePath = `users/${userId}/private/info`;
  try {
    await updateDoc(doc(db, userPath), {
      displayName: profileUpdates.displayName.trim().slice(0, 120) || 'Creator',
      bio: profileUpdates.bio.trim().slice(0, 500),
      organization: profileUpdates.organization.trim().slice(0, 120),
      location: profileUpdates.location.trim().slice(0, 120),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, userPath);
  }

  try {
    const privateRef = doc(db, privatePath);
    const snap = await getDoc(privateRef);
    if (!snap.exists()) {
      await setDoc(privateRef, {
        uid: userId,
        email: privateUpdates.email.trim().slice(0, 254),
        phone: privateUpdates.phone.trim().slice(0, 40),
        address: privateUpdates.address.trim().slice(0, 300),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(privateRef, {
        email: privateUpdates.email.trim().slice(0, 254),
        phone: privateUpdates.phone.trim().slice(0, 40),
        address: privateUpdates.address.trim().slice(0, 300),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, privatePath);
  }
}

export function subscribeUserVideos(
  userId: string,
  onData: (videos: AnalyzedVideo[]) => void
): () => void {
  const path = `users/${userId}/videos`;
  const q = query(collection(db, path), where('ownerId', '==', userId));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: AnalyzedVideo[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          return {
            id: String(data.id || d.id),
            ownerId: String(data.ownerId || userId),
            itemType: getItemType({
              itemType: data.itemType,
              platform: data.platform || 'other',
            }),
            url: String(data.url || ''),
            platform: data.platform || 'other',
            title: String(data.title || 'Untitled'),
            creator: String(data.creator || ''),
            thumbnailUrl: String(data.thumbnailUrl || ''),
            durationLabel: String(data.durationLabel || '—'),
            category: String(data.category || 'General'),
            collectionId: String(data.collectionId || ''),
            isFavorite: Boolean(data.isFavorite),
            saveReason: data.saveReason ? String(data.saveReason) : '',
            localMediaId: data.localMediaId ? String(data.localMediaId) : '',
            summary: String(data.summary || ''),
            tldrBullets: Array.isArray(data.tldrBullets) ? data.tldrBullets : [],
            tags: Array.isArray(data.tags) ? data.tags : [],
            segments: Array.isArray(data.segments) ? data.segments : [],
            transcript: Array.isArray(data.transcript) ? data.transcript : [],
            links: Array.isArray(data.links) ? data.links : [],
            notes: String(data.notes || ''),
            createdAtMs: toMillis(data.createdAt),
            updatedAtMs: toMillis(data.updatedAt),
          };
        })
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(items);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export function subscribeUserCollections(
  userId: string,
  onData: (collections: VideoCollection[]) => void
): () => void {
  const path = `users/${userId}/collections`;
  const q = query(collection(db, path), where('ownerId', '==', userId));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: VideoCollection[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          return {
            id: String(data.id || d.id),
            ownerId: String(data.ownerId || userId),
            name: String(data.name || 'Collection'),
            description: String(data.description || ''),
            createdAtMs: toMillis(data.createdAt),
            updatedAtMs: toMillis(data.updatedAt),
          };
        })
        .sort((a, b) => a.createdAtMs - b.createdAtMs);
      onData(items);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export async function createFirestoreVideo(
  user: User,
  payload: AnalyzeVideoResponse,
  collectionId = '',
  options?: { saveReason?: string; notes?: string; localMediaId?: string }
): Promise<string> {
  await ensureUserProfile(user);
  const videoId = generateSafeId('vid');
  const path = `users/${user.uid}/videos/${videoId}`;
  const docData = sanitizeVideoForFirestore(user.uid, videoId, payload, collectionId, options);

  try {
    await setDoc(doc(db, path), {
      ...docData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return videoId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function toggleFirestoreFavorite(
  userId: string,
  videoId: string,
  isFavorite: boolean
): Promise<void> {
  const path = `users/${userId}/videos/${videoId}`;
  try {
    await updateDoc(doc(db, path), {
      isFavorite,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updateFirestoreVideoCollection(
  userId: string,
  videoId: string,
  collectionId: string
): Promise<void> {
  const path = `users/${userId}/videos/${videoId}`;
  try {
    await updateDoc(doc(db, path), {
      collectionId: collectionId ? collectionId.slice(0, 128) : '',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updateFirestoreVideoTags(
  userId: string,
  videoId: string,
  tags: string[]
): Promise<void> {
  const path = `users/${userId}/videos/${videoId}`;
  try {
    await updateDoc(doc(db, path), {
      tags: tags.map((t) => t.trim().toLowerCase().slice(0, 50)).filter(Boolean).slice(0, 15),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updateFirestoreVideoNotes(
  userId: string,
  videoId: string,
  notes: string,
  saveReason?: string
): Promise<void> {
  const path = `users/${userId}/videos/${videoId}`;
  try {
    await updateDoc(doc(db, path), {
      notes: notes.slice(0, 10000),
      ...(typeof saveReason === 'string' ? { saveReason: saveReason.trim().slice(0, 80) } : {}),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updateFirestoreVideoSaveReason(
  userId: string,
  videoId: string,
  saveReason: string
): Promise<void> {
  const path = `users/${userId}/videos/${videoId}`;
  try {
    await updateDoc(doc(db, path), {
      saveReason: saveReason.trim().slice(0, 80),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updateFirestoreVideoLinks(
  userId: string,
  videoId: string,
  links: ExtractedLink[]
): Promise<void> {
  const path = `users/${userId}/videos/${videoId}`;
  try {
    await updateDoc(doc(db, path), {
      links: sanitizeLinksArray(links),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteFirestoreVideo(userId: string, videoId: string): Promise<void> {
  const path = `users/${userId}/videos/${videoId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function createFirestoreCollection(
  user: User,
  name: string,
  description = ''
): Promise<string> {
  await ensureUserProfile(user);
  const collectionId = generateSafeId('col');
  const path = `users/${user.uid}/collections/${collectionId}`;
  try {
    await setDoc(doc(db, path), {
      id: collectionId,
      ownerId: user.uid,
      name: name.trim().slice(0, 80),
      description: description.trim().slice(0, 300),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return collectionId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteFirestoreCollection(userId: string, collectionId: string): Promise<void> {
  const path = `users/${userId}/collections/${collectionId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function loadGuestVideos(): AnalyzedVideo[] {
  try {
    const raw = localStorage.getItem(LOCAL_VIDEOS_KEY);
    return raw ? (JSON.parse(raw) as AnalyzedVideo[]) : [];
  } catch {
    return [];
  }
}

export function saveGuestVideos(videos: AnalyzedVideo[]): void {
  try {
    localStorage.setItem(LOCAL_VIDEOS_KEY, JSON.stringify(videos));
  } catch {
    // Ignore quota errors
  }
}

export function loadGuestCollections(): VideoCollection[] {
  try {
    const raw = localStorage.getItem(LOCAL_COLLECTIONS_KEY);
    return raw ? (JSON.parse(raw) as VideoCollection[]) : [];
  } catch {
    return [];
  }
}

export function saveGuestCollections(cols: VideoCollection[]): void {
  try {
    localStorage.setItem(LOCAL_COLLECTIONS_KEY, JSON.stringify(cols));
  } catch {
    // Ignore quota errors
  }
}
