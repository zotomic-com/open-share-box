import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import type {
  BillingInvoice,
  InvoiceBillingCycle,
  InvoiceCustomFieldEntry,
  InvoiceStatus,
  NotificationAudience,
  NotificationSeverity,
  PaymentGateway,
  PaymentGatewayInput,
  PaymentGatewayType,
  PricingPlan,
  SiteNotification,
  SiteNotificationInput,
  UserBadgeInput,
} from '../types/video';
import {
  DEFAULT_PRICING_PLANS,
  savePricingPlanAdmin,
  saveUserBadgeAdmin,
  seedDefaultPricingPlansAdmin,
} from './adminStore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { ensureUserProfile, toMillis } from './libraryStore';
import { generateSafeId } from './videoUtils';

export const DEFAULT_PLAN_BADGES: Array<UserBadgeInput & { id: string; planId: string }> = [
  {
    id: 'badge-starter',
    planId: 'starter',
    name: 'Starter Member',
    description: 'Automatically assigned when Starter Free plan is active.',
    color: 'slate',
    icon: 'check',
  },
  {
    id: 'badge-pro',
    planId: 'pro',
    name: 'Pro Member',
    description: 'Automatically assigned when Pro Library plan is active.',
    color: 'blue',
    icon: 'star',
  },
  {
    id: 'badge-team',
    planId: 'team',
    name: 'Power Member',
    description: 'Automatically assigned when Power / Team plan is active.',
    color: 'violet',
    icon: 'crown',
  },
];

export const DEFAULT_PAYMENT_GATEWAYS: Array<PaymentGatewayInput & { id: string }> = [
  {
    id: 'stripe',
    name: 'Stripe (Card)',
    gatewayType: 'stripe',
    enabled: true,
    accountLabel: 'Card Payment Reference',
    accountValue: 'Credit / Debit Card Checkout',
    instructions:
      'Complete your card payment via Stripe and enter the Stripe payment receipt or reference code below.',
    badgeText: 'Card',
    sortOrder: 0,
  },
  {
    id: 'bank',
    name: 'Bank Transfer',
    gatewayType: 'bank',
    enabled: true,
    accountLabel: 'Bank Account / IBAN',
    accountValue: 'Configure bank name, account number & SWIFT/Routing in Admin Billing',
    instructions:
      'Include your Invoice Number in the bank transfer memo and submit your bank transaction reference.',
    badgeText: 'Bank',
    sortOrder: 1,
  },
  {
    id: 'bkash',
    name: 'bKash',
    gatewayType: 'bkash',
    enabled: true,
    accountLabel: 'bKash Merchant / Personal',
    accountValue: '01XXXXXXXXX (Set number in Admin)',
    instructions:
      'Open bKash app -> Send Money / Payment to the number above with Invoice Ref, then enter your TrxID.',
    badgeText: 'bKash',
    sortOrder: 2,
  },
  {
    id: 'nagad',
    name: 'Nagad',
    gatewayType: 'nagad',
    enabled: true,
    accountLabel: 'Nagad Account Number',
    accountValue: '01XXXXXXXXX (Set number in Admin)',
    instructions:
      'Send total amount via Nagad app to the number above, then submit your Nagad Transaction ID.',
    badgeText: 'Nagad',
    sortOrder: 3,
  },
  {
    id: 'crypto',
    name: 'Crypto (USDT / USDC)',
    gatewayType: 'crypto',
    enabled: false,
    accountLabel: 'USDT Wallet (TRC20 / ERC20)',
    accountValue: 'Set wallet address in Admin Billing',
    instructions:
      'Send the exact total in USDT/USDC and paste the blockchain transaction hash (TXID) below.',
    badgeText: 'Crypto',
    sortOrder: 4,
  },
];

function roundCurrency(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export function formatMoney(amount: number, currency = 'USD'): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const code = (currency || 'USD').trim().toUpperCase();
  if (code === 'BDT' || code === '৳') return `৳${safeAmount.toFixed(2)}`;
  if (code === 'EUR' || code === '€') return `€${safeAmount.toFixed(2)}`;
  if (code === 'GBP' || code === '£') return `£${safeAmount.toFixed(2)}`;
  if (code === 'USD' || code === '$') return `$${safeAmount.toFixed(2)}`;
  return `${code} ${safeAmount.toFixed(2)}`;
}

export function computePlanTotals(
  plan: PricingPlan,
  billingCycle: InvoiceBillingCycle,
  taxPercent: number
): { subtotal: number; taxAmount: number; totalAmount: number } {
  const base =
    billingCycle === 'yearly'
      ? roundCurrency(plan.yearlyMonthlyPrice * 12)
      : roundCurrency(plan.monthlyPrice);
  const safeTaxPct = Math.min(100, Math.max(0, Number(taxPercent) || 0));
  const taxAmount = roundCurrency(base * (safeTaxPct / 100));
  const totalAmount = roundCurrency(base + taxAmount);
  return { subtotal: base, taxAmount, totalAmount };
}

export function generateInvoiceNumber(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `INV-${y}${m}${day}-${suffix}`;
}

// ============================================================
// 3 PLAN BADGES & AUTO-ASSIGNMENT SETUP
// ============================================================

export async function seedPlanBadgesAndMappingAdmin(adminUid: string): Promise<void> {
  await seedDefaultPricingPlansAdmin(adminUid);

  for (const b of DEFAULT_PLAN_BADGES) {
    const ref = doc(db, `badges/${b.id}`);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await saveUserBadgeAdmin(adminUid, {
        id: b.id,
        name: b.name,
        description: b.description,
        color: b.color,
        icon: b.icon,
      });
    }
  }

  for (const plan of DEFAULT_PRICING_PLANS) {
    const ref = doc(db, `pricingPlans/${plan.id}`);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() as Record<string, unknown>;
      if (!data.autoBadgeId && plan.autoBadgeId) {
        await savePricingPlanAdmin(adminUid, {
          id: plan.id,
          name: String(data.name || plan.name),
          tagline: String(data.tagline || plan.tagline),
          monthlyPrice: Number(data.monthlyPrice ?? plan.monthlyPrice),
          yearlyMonthlyPrice: Number(data.yearlyMonthlyPrice ?? plan.yearlyMonthlyPrice),
          highlighted: Boolean(data.highlighted),
          badge: String(data.badge || plan.badge),
          autoBadgeId: plan.autoBadgeId,
          ctaLabel: String(data.ctaLabel || plan.ctaLabel),
          features: Array.isArray(data.features) ? data.features.map(String) : plan.features,
          sortOrder: Number(data.sortOrder ?? plan.sortOrder),
        });
      }
    }
  }
}

export async function syncUserPlanAndBadgeAdmin(
  adminUid: string,
  userId: string,
  params: {
    planId: string;
    planStatus: 'active' | 'due' | 'expired' | 'none';
    expiresAtMs: number;
    assignAutoBadge?: boolean;
  }
): Promise<void> {
  const userPath = `users/${userId}`;
  try {
    const userRef = doc(db, userPath);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;

    const userData = userSnap.data() as Record<string, unknown>;
    const existingBadges: string[] = Array.isArray(userData.badgeIds)
      ? userData.badgeIds.map(String)
      : [];

    // Resolve all plan-linked badge IDs so activating a new plan replaces old tier badges cleanly
    const plansSnap = await getDocs(collection(db, 'pricingPlans'));
    const planBadgePool = new Set<string>(
      DEFAULT_PLAN_BADGES.map((b) => b.id)
    );
    let targetAutoBadgeId =
      DEFAULT_PLAN_BADGES.find((b) => b.planId === params.planId)?.id || '';

    for (const pDoc of plansSnap.docs) {
      const pd = pDoc.data() as Record<string, unknown>;
      const autoId = pd.autoBadgeId ? String(pd.autoBadgeId).trim() : '';
      if (autoId) {
        planBadgePool.add(autoId);
      }
      if (pDoc.id === params.planId && autoId) {
        targetAutoBadgeId = autoId;
      }
    }

    let nextBadgeIds = existingBadges;
    if (params.assignAutoBadge && params.planStatus === 'active' && targetAutoBadgeId) {
      // Ensure the badge definition exists before linking
      const badgeDoc = await getDoc(doc(db, `badges/${targetAutoBadgeId}`));
      if (badgeDoc.exists()) {
        const nonPlanBadges = existingBadges.filter((bid) => !planBadgePool.has(bid));
        nextBadgeIds = Array.from(new Set([...nonPlanBadges, targetAutoBadgeId])).slice(0, 10);
      }
    }

    await updateDoc(userRef, {
      activePlanId: params.planId.slice(0, 128),
      planStatus: params.planStatus,
      planExpiresAtMs: Math.max(0, Math.floor(params.expiresAtMs || 0)),
      badgeIds: nextBadgeIds,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `${userPath} (by ${adminUid})`);
  }
}

// ============================================================
// PAYMENT GATEWAYS
// ============================================================

function mapGatewayDoc(id: string, d: Record<string, unknown>): PaymentGateway {
  const rawType = String(d.gatewayType || 'custom');
  const gatewayType: PaymentGatewayType =
    rawType === 'stripe' ||
    rawType === 'bank' ||
    rawType === 'bkash' ||
    rawType === 'nagad' ||
    rawType === 'crypto'
      ? rawType
      : 'custom';
  return {
    id: String(d.id || id),
    name: String(d.name || 'Payment Method'),
    gatewayType,
    enabled: Boolean(d.enabled),
    accountLabel: String(d.accountLabel || ''),
    accountValue: String(d.accountValue || ''),
    instructions: String(d.instructions || ''),
    badgeText: String(d.badgeText || ''),
    sortOrder: Number.isFinite(Number(d.sortOrder))
      ? Math.max(0, Math.floor(Number(d.sortOrder)))
      : 0,
    updatedBy: String(d.updatedBy || 'system'),
    createdAtMs: toMillis(d.createdAt),
    updatedAtMs: toMillis(d.updatedAt),
  };
}

export function subscribePaymentGateways(
  onData: (gateways: PaymentGateway[]) => void
): () => void {
  const path = 'paymentGateways';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const list = snapshot.docs
        .map((d) => mapGatewayDoc(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      onData(list);
    },
    () => {
      onData([]);
    }
  );
}

export async function savePaymentGatewayAdmin(
  adminUid: string,
  input: PaymentGatewayInput
): Promise<string> {
  const cleanId = (
    input.id ||
    input.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') ||
    generateSafeId('gw')
  )
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .slice(0, 64);

  const path = `paymentGateways/${cleanId}`;
  const payload = {
    id: cleanId,
    name: (input.name.trim() || 'Payment Gateway').slice(0, 80),
    gatewayType: input.gatewayType,
    enabled: Boolean(input.enabled),
    accountLabel: input.accountLabel.trim().slice(0, 80),
    accountValue: input.accountValue.trim().slice(0, 300),
    instructions: input.instructions.trim().slice(0, 1000),
    badgeText: input.badgeText.trim().slice(0, 40),
    sortOrder: Math.max(0, Math.floor(Number(input.sortOrder) || 0)),
    updatedBy: adminUid,
  };

  try {
    const ref = doc(db, path);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    }
    return cleanId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deletePaymentGatewayAdmin(gatewayId: string): Promise<void> {
  const path = `paymentGateways/${gatewayId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function seedDefaultPaymentGatewaysAdmin(adminUid: string): Promise<void> {
  for (const gw of DEFAULT_PAYMENT_GATEWAYS) {
    const ref = doc(db, `paymentGateways/${gw.id}`);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await savePaymentGatewayAdmin(adminUid, gw);
    }
  }
}

// ============================================================
// NOTIFICATIONS (SEPARATED USER & ADMIN FEEDS)
// ============================================================

function mapNotificationDoc(id: string, d: Record<string, unknown>): SiteNotification {
  const rawAud = String(d.audience || 'user');
  const audience: NotificationAudience =
    rawAud === 'admin' || rawAud === 'all' ? rawAud : 'user';
  const rawType = String(d.type || 'info');
  const type: NotificationSeverity =
    rawType === 'success' || rawType === 'warning' || rawType === 'billing' ? rawType : 'info';
  return {
    id: String(d.id || id),
    audience,
    targetUid: String(d.targetUid || ''),
    title: String(d.title || 'Notification'),
    message: String(d.message || ''),
    type,
    linkLabel: d.linkLabel ? String(d.linkLabel) : '',
    linkTarget: d.linkTarget ? String(d.linkTarget) : '',
    isActive: typeof d.isActive === 'boolean' ? d.isActive : true,
    updatedBy: String(d.updatedBy || 'system'),
    createdAtMs: toMillis(d.createdAt),
    updatedAtMs: toMillis(d.updatedAt),
  };
}

export function subscribeAllNotificationsAdmin(
  onData: (items: SiteNotification[]) => void
): () => void {
  const path = 'notifications';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const list = snapshot.docs
        .map((d) => mapNotificationDoc(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export function subscribeUserNotifications(
  userId: string,
  onData: (items: SiteNotification[]) => void
): () => void {
  const path = 'notifications';
  let broadcastList: SiteNotification[] = [];
  let personalList: SiteNotification[] = [];

  const emit = () => {
    const merged = new Map<string, SiteNotification>();
    for (const item of [...broadcastList, ...personalList]) {
      if (item.isActive && (item.audience === 'user' || item.audience === 'all')) {
        merged.set(item.id, item);
      }
    }
    onData(Array.from(merged.values()).sort((a, b) => b.createdAtMs - a.createdAtMs));
  };

  const qBroadcast = query(
    collection(db, path),
    where('isActive', '==', true),
    where('audience', 'in', ['user', 'all']),
    where('targetUid', '==', '')
  );

  const qPersonal = query(
    collection(db, path),
    where('isActive', '==', true),
    where('audience', 'in', ['user', 'all']),
    where('targetUid', '==', userId)
  );

  const unsubA = onSnapshot(
    qBroadcast,
    (snap) => {
      broadcastList = snap.docs.map((d) => mapNotificationDoc(d.id, d.data() as Record<string, unknown>));
      emit();
    },
    () => {
      broadcastList = [];
      emit();
    }
  );

  const unsubB = onSnapshot(
    qPersonal,
    (snap) => {
      personalList = snap.docs.map((d) => mapNotificationDoc(d.id, d.data() as Record<string, unknown>));
      emit();
    },
    () => {
      personalList = [];
      emit();
    }
  );

  return () => {
    unsubA();
    unsubB();
  };
}

export function subscribeNotificationReads(
  userId: string,
  onData: (readIds: Set<string>) => void
): () => void {
  const path = `users/${userId}/notificationReads`;
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const ids = new Set<string>(snapshot.docs.map((d) => d.id));
      onData(ids);
    },
    () => {
      onData(new Set());
    }
  );
}

export async function markNotificationRead(userId: string, notificationId: string): Promise<void> {
  const cleanNotifId = notificationId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 128);
  const path = `users/${userId}/notificationReads/${cleanNotifId}`;
  try {
    await setDoc(doc(db, path), {
      id: cleanNotifId,
      readAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal if synthetic invoice alert or offline
  }
}

export async function saveNotificationAdmin(
  adminUid: string,
  input: SiteNotificationInput
): Promise<string> {
  const notifId = (input.id || generateSafeId('ntf'))
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .slice(0, 128);
  const path = `notifications/${notifId}`;
  const payload = {
    id: notifId,
    audience: input.audience,
    targetUid: input.targetUid.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128),
    title: (input.title.trim() || 'Announcement').slice(0, 140),
    message: (input.message.trim() || 'Details unavailable.').slice(0, 1000),
    type: input.type,
    linkLabel: (input.linkLabel || '').trim().slice(0, 60),
    linkTarget: (input.linkTarget || '').trim().slice(0, 500),
    isActive: Boolean(input.isActive),
    updatedBy: adminUid,
  };

  try {
    const ref = doc(db, path);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    }
    return notifId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteNotificationAdmin(notifId: string): Promise<void> {
  const path = `notifications/${notifId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// ============================================================
// INVOICES & USER BILL MANAGEMENT
// ============================================================

function mapInvoiceDoc(id: string, d: Record<string, unknown>): BillingInvoice {
  const rawCycle = String(d.billingCycle || 'monthly');
  const billingCycle: InvoiceBillingCycle =
    rawCycle === 'yearly' || rawCycle === 'one-time' ? rawCycle : 'monthly';
  const rawStatus = String(d.status || 'due');
  const status: InvoiceStatus =
    rawStatus === 'paid' ||
    rawStatus === 'pending' ||
    rawStatus === 'expired' ||
    rawStatus === 'cancelled'
      ? rawStatus
      : 'due';
  const customFields: InvoiceCustomFieldEntry[] = Array.isArray(d.customFields)
    ? d.customFields.slice(0, 15).map((item) => {
        const obj = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
        return {
          label: String(obj.label || ''),
          value: String(obj.value || ''),
        };
      })
    : [];

  return {
    id: String(d.id || id),
    invoiceNumber: String(d.invoiceNumber || id),
    userId: String(d.userId || ''),
    userName: String(d.userName || ''),
    userEmail: String(d.userEmail || ''),
    planId: String(d.planId || ''),
    planName: String(d.planName || 'Plan'),
    billingCycle,
    subtotal: Number(d.subtotal) || 0,
    taxAmount: Number(d.taxAmount) || 0,
    totalAmount: Number(d.totalAmount) || 0,
    currency: String(d.currency || 'USD'),
    gatewayId: String(d.gatewayId || ''),
    gatewayName: String(d.gatewayName || ''),
    transactionRef: String(d.transactionRef || ''),
    payerAccount: String(d.payerAccount || ''),
    customFields,
    status,
    notes: String(d.notes || ''),
    dueAtMs: typeof d.dueAtMs === 'number' ? d.dueAtMs : 0,
    paidAtMs: typeof d.paidAtMs === 'number' ? d.paidAtMs : 0,
    expiresAtMs: typeof d.expiresAtMs === 'number' ? d.expiresAtMs : 0,
    updatedBy: String(d.updatedBy || ''),
    createdAtMs: toMillis(d.createdAt),
    updatedAtMs: toMillis(d.updatedAt),
  };
}

export function subscribeAllInvoicesAdmin(
  onData: (invoices: BillingInvoice[]) => void
): () => void {
  const path = 'invoices';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const list = snapshot.docs
        .map((d) => mapInvoiceDoc(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export function subscribeUserInvoices(
  userId: string,
  onData: (invoices: BillingInvoice[]) => void
): () => void {
  const path = 'invoices';
  const q = query(collection(db, path), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs
        .map((d) => mapInvoiceDoc(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export async function createCheckoutInvoiceUser(
  user: User,
  params: {
    plan: PricingPlan;
    billingCycle: InvoiceBillingCycle;
    currency: string;
    taxPercent: number;
    gateway?: PaymentGateway | null;
    transactionRef: string;
    payerAccount: string;
    customFields: InvoiceCustomFieldEntry[];
    submitMode: 'submit-payment' | 'generate-due';
    existingBadges?: string[];
  }
): Promise<BillingInvoice> {
  await ensureUserProfile(user);

  const invoiceId = generateSafeId('inv');
  const invoiceNumber = generateInvoiceNumber();
  const { subtotal, taxAmount, totalAmount } = computePlanTotals(
    params.plan,
    params.billingCycle,
    params.taxPercent
  );
  const isStarterFree = totalAmount === 0 && params.plan.id === 'starter';
  const now = Date.now();
  const status: InvoiceStatus = isStarterFree
    ? 'paid'
    : params.submitMode === 'generate-due'
      ? 'due'
      : 'pending';
  const dueAtMs = isStarterFree ? 0 : now + 7 * 86400_000;
  const paidAtMs = isStarterFree ? now : 0;

  const cleanCustomFields = params.customFields
    .slice(0, 15)
    .map((f) => ({
      label: f.label.trim().slice(0, 100),
      value: f.value.trim().slice(0, 300),
    }))
    .filter((f) => f.label);

  const path = `invoices/${invoiceId}`;
  const docPayload = {
    id: invoiceId,
    invoiceNumber,
    userId: user.uid,
    userName: (user.displayName || user.email?.split('@')[0] || 'User').slice(0, 120),
    userEmail: (user.email || '').slice(0, 254),
    planId: params.plan.id.slice(0, 128),
    planName: params.plan.name.slice(0, 120),
    billingCycle: params.billingCycle,
    subtotal,
    taxAmount,
    totalAmount,
    currency: (params.currency || 'USD').slice(0, 12),
    gatewayId: params.gateway?.id?.slice(0, 128) || '',
    gatewayName: params.gateway?.name?.slice(0, 80) || '',
    transactionRef: params.transactionRef.trim().slice(0, 160),
    payerAccount: params.payerAccount.trim().slice(0, 160),
    customFields: cleanCustomFields,
    status,
    notes: isStarterFree ? 'Free Starter tier activated.' : '',
    dueAtMs,
    paidAtMs,
    expiresAtMs: 0,
    updatedBy: user.uid,
  };

  try {
    await setDoc(doc(db, path), {
      ...docPayload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (isStarterFree) {
      const badgeCheck = await getDoc(doc(db, 'badges/badge-starter'));
      const canAssignStarterBadge =
        badgeCheck.exists() && (!params.existingBadges || params.existingBadges.length === 0);
      await updateDoc(doc(db, `users/${user.uid}`), {
        activePlanId: 'starter',
        planStatus: 'active',
        planExpiresAtMs: 0,
        badgeIds: canAssignStarterBadge ? ['badge-starter'] : params.existingBadges || [],
        updatedAt: serverTimestamp(),
      });
    }

    return {
      ...docPayload,
      createdAtMs: now,
      updatedAtMs: now,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function submitDueInvoicePaymentUser(
  user: User,
  invoiceId: string,
  params: {
    gateway: PaymentGateway;
    transactionRef: string;
    payerAccount: string;
    customFields: InvoiceCustomFieldEntry[];
  }
): Promise<void> {
  const path = `invoices/${invoiceId}`;
  try {
    await updateDoc(doc(db, path), {
      gatewayId: params.gateway.id.slice(0, 128),
      gatewayName: params.gateway.name.slice(0, 80),
      transactionRef: params.transactionRef.trim().slice(0, 160),
      payerAccount: params.payerAccount.trim().slice(0, 160),
      customFields: params.customFields.slice(0, 15).map((f) => ({
        label: f.label.trim().slice(0, 100),
        value: f.value.trim().slice(0, 300),
      })),
      status: 'pending',
      updatedBy: user.uid,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function adminCreateInvoice(
  adminUid: string,
  input: {
    userId: string;
    userName: string;
    userEmail: string;
    planId: string;
    planName: string;
    billingCycle: InvoiceBillingCycle;
    subtotal: number;
    taxAmount: number;
    currency: string;
    gatewayId: string;
    gatewayName: string;
    transactionRef: string;
    payerAccount: string;
    status: InvoiceStatus;
    notes: string;
    dueDays?: number;
  }
): Promise<string> {
  const invoiceId = generateSafeId('inv');
  const path = `invoices/${invoiceId}`;
  const now = Date.now();
  const subtotal = roundCurrency(Math.max(0, input.subtotal));
  const taxAmount = roundCurrency(Math.max(0, input.taxAmount));
  const totalAmount = roundCurrency(subtotal + taxAmount);
  const dueAtMs = now + Math.max(0, input.dueDays ?? 7) * 86400_000;
  const paidAtMs = input.status === 'paid' ? now : 0;
  const expiresAtMs =
    input.status === 'paid' && totalAmount > 0
      ? now + (input.billingCycle === 'yearly' ? 365 : 30) * 86400_000
      : 0;

  try {
    await setDoc(doc(db, path), {
      id: invoiceId,
      invoiceNumber: generateInvoiceNumber(),
      userId: input.userId.slice(0, 128),
      userName: input.userName.slice(0, 120),
      userEmail: input.userEmail.slice(0, 254),
      planId: input.planId.slice(0, 128),
      planName: input.planName.slice(0, 120),
      billingCycle: input.billingCycle,
      subtotal,
      taxAmount,
      totalAmount,
      currency: (input.currency || 'USD').slice(0, 12),
      gatewayId: input.gatewayId.slice(0, 128),
      gatewayName: input.gatewayName.slice(0, 80),
      transactionRef: input.transactionRef.slice(0, 160),
      payerAccount: input.payerAccount.slice(0, 160),
      customFields: [],
      status: input.status,
      notes: input.notes.slice(0, 1000),
      dueAtMs,
      paidAtMs,
      expiresAtMs,
      updatedBy: adminUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (input.status === 'paid') {
      await syncUserPlanAndBadgeAdmin(adminUid, input.userId, {
        planId: input.planId,
        planStatus: 'active',
        expiresAtMs,
        assignAutoBadge: true,
      });
    } else if (input.status === 'due' || input.status === 'expired') {
      await syncUserPlanAndBadgeAdmin(adminUid, input.userId, {
        planId: input.planId,
        planStatus: input.status,
        expiresAtMs: 0,
        assignAutoBadge: false,
      });
    }
    return invoiceId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function adminUpdateInvoiceStatus(
  adminUid: string,
  invoice: BillingInvoice,
  newStatus: InvoiceStatus,
  notes?: string
): Promise<void> {
  const path = `invoices/${invoice.id}`;
  const now = Date.now();
  const paidAtMs = newStatus === 'paid' ? invoice.paidAtMs || now : invoice.paidAtMs;
  const expiresAtMs =
    newStatus === 'paid'
      ? invoice.expiresAtMs ||
        (invoice.totalAmount > 0
          ? now + (invoice.billingCycle === 'yearly' ? 365 : 30) * 86400_000
          : 0)
      : invoice.expiresAtMs;

  try {
    await updateDoc(doc(db, path), {
      status: newStatus,
      paidAtMs,
      expiresAtMs,
      ...(typeof notes === 'string' ? { notes: notes.slice(0, 1000) } : {}),
      updatedBy: adminUid,
      updatedAt: serverTimestamp(),
    });

    if (newStatus === 'paid') {
      await syncUserPlanAndBadgeAdmin(adminUid, invoice.userId, {
        planId: invoice.planId,
        planStatus: 'active',
        expiresAtMs,
        assignAutoBadge: true,
      });
      await saveNotificationAdmin(adminUid, {
        audience: 'user',
        targetUid: invoice.userId,
        title: `Plan Activated: ${invoice.planName}`,
        message: `Invoice ${invoice.invoiceNumber} has been marked Paid. Your ${invoice.planName} plan and membership badge are now active.`,
        type: 'success',
        linkLabel: 'View Dashboard',
        linkTarget: 'view:user-dashboard',
        isActive: true,
      });
    } else if (newStatus === 'due' || newStatus === 'expired') {
      await syncUserPlanAndBadgeAdmin(adminUid, invoice.userId, {
        planId: invoice.planId,
        planStatus: newStatus,
        expiresAtMs: newStatus === 'expired' ? now : invoice.expiresAtMs,
        assignAutoBadge: false,
      });
      await saveNotificationAdmin(adminUid, {
        audience: 'user',
        targetUid: invoice.userId,
        title:
          newStatus === 'expired'
            ? `Subscription Expired (${invoice.planName})`
            : `Payment Due: ${invoice.invoiceNumber}`,
        message:
          newStatus === 'expired'
            ? `Your ${invoice.planName} plan (${invoice.invoiceNumber}) has expired. Renew at checkout to keep your tier benefits.`
            : `Invoice ${invoice.invoiceNumber} (${formatMoney(invoice.totalAmount, invoice.currency)}) is currently due.`,
        type: 'warning',
        linkLabel: 'Open Billing',
        linkTarget: 'view:user-dashboard',
        isActive: true,
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function adminDeleteInvoice(invoiceId: string): Promise<void> {
  const path = `invoices/${invoiceId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}
