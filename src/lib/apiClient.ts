import { auth } from './firebase';

const rawBase = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');

export const API_BASE_URL = rawBase;

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return rawBase ? `${rawBase}${normalizedPath}` : normalizedPath;
}

export async function authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  try {
    const currentUser = auth.currentUser;
    if (currentUser) {
      const token = await currentUser.getIdToken();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    }
  } catch {
    // Proceed without Authorization header if token fetch fails
  }

  return fetch(apiUrl(path), {
    ...init,
    headers,
  });
}

export interface ClientUsageQuota {
  authenticated: boolean;
  tier: 'guest' | 'user' | 'admin';
  resetsAtIso: string;
  analyze: {
    usedToday: number;
    limitToday: number;
    remainingToday: number;
    rpmLimit: number;
  };
  ask: {
    usedToday: number;
    limitToday: number;
    remainingToday: number;
    rpmLimit: number;
  };
}

export async function fetchWhatsAppServerStatus(): Promise<{ cloudApiConfigured: boolean }> {
  try {
    const res = await fetch(apiUrl('/api/whatsapp/status'));
    if (!res.ok) return { cloudApiConfigured: false };
    return (await res.json()) as { cloudApiConfigured: boolean };
  } catch {
    return { cloudApiConfigured: false };
  }
}

export async function sendWhatsAppReminderRequest(payload: {
  phoneNumber: string;
  message: string;
  reminderTitle?: string;
}): Promise<{
  sent: boolean;
  cloudApiConfigured: boolean;
  fallbackUrl: string;
  error?: string;
}> {
  const res = await authorizedFetch('/api/whatsapp/send-reminder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as {
    sent?: boolean;
    cloudApiConfigured?: boolean;
    fallbackUrl?: string;
    error?: string;
  };
  return {
    sent: Boolean(data.sent),
    cloudApiConfigured: Boolean(data.cloudApiConfigured),
    fallbackUrl: data.fallbackUrl || '',
    error: !res.ok ? data.error || 'Unable to dispatch via WhatsApp Cloud API.' : undefined,
  };
}

