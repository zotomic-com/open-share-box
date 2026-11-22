import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  Plus,
  Search,
  Settings,
  Trash2,
  X,
} from 'lucide-react';
import type {
  BillingInvoice,
  CheckoutFieldConfig,
  InvoiceBillingCycle,
  InvoiceStatus,
  PaymentGateway,
  PaymentGatewayType,
  PricingPlan,
  SiteSettings,
  UserProfileRecord,
} from '../types/video';
import { DEFAULT_PRICING_PLANS, updatePartialSiteSettingsAdmin } from '../lib/adminStore';
import {
  adminCreateInvoice,
  adminDeleteInvoice,
  adminUpdateInvoiceStatus,
  computePlanTotals,
  deletePaymentGatewayAdmin,
  formatMoney,
  savePaymentGatewayAdmin,
  seedDefaultPaymentGatewaysAdmin,
} from '../lib/billingStore';
import { generateSafeId } from '../lib/videoUtils';

interface AdminBillingPanelProps {
  adminUid: string;
  users: UserProfileRecord[];
  plans: PricingPlan[];
  siteSettings: SiteSettings;
  gateways: PaymentGateway[];
  invoices: BillingInvoice[];
  onViewInvoice: (invoice: BillingInvoice) => void;
}

export const AdminBillingPanel: React.FC<AdminBillingPanelProps> = ({
  adminUid,
  users,
  plans,
  siteSettings,
  gateways,
  invoices,
  onViewInvoice,
}) => {
  const [subTab, setSubTab] = useState<'invoices' | 'gateways' | 'checkout'>('invoices');

  // Invoices & Revenue filter state
  const [invSearch, setInvSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | InvoiceStatus>('all');
  const [busyInvoiceId, setBusyInvoiceId] = useState<string | null>(null);
  const [confirmDeleteInvId, setConfirmDeleteInvId] = useState<string | null>(null);

  // Create Bill Modal state
  const [isCreateBillOpen, setIsCreateBillOpen] = useState(false);
  const [billUserId, setBillUserId] = useState(users[0]?.uid || '');
  const [billPlanId, setBillPlanId] = useState(plans[1]?.id || plans[0]?.id || 'pro');
  const [billCycle, setBillCycle] = useState<InvoiceBillingCycle>('monthly');
  const [billGatewayId, setBillGatewayId] = useState(gateways[0]?.id || '');
  const [billStatus, setBillStatus] = useState<InvoiceStatus>('due');
  const [billSubtotal, setBillSubtotal] = useState('');
  const [billTax, setBillTax] = useState('');
  const [billNotes, setBillNotes] = useState('');
  const [billDueDays, setBillDueDays] = useState('7');
  const [isCreatingBill, setIsCreatingBill] = useState(false);

  // Payment Gateway form state
  const [editingGateway, setEditingGateway] = useState<{
    id?: string;
    name: string;
    gatewayType: PaymentGatewayType;
    enabled: boolean;
    accountLabel: string;
    accountValue: string;
    instructions: string;
    badgeText: string;
    sortOrder: string;
  } | null>(null);
  const [isSavingGateway, setIsSavingGateway] = useState(false);
  const [gatewayError, setGatewayError] = useState<string | null>(null);
  const [confirmDeleteGwId, setConfirmDeleteGwId] = useState<string | null>(null);

  // Checkout settings local form state
  const [checkoutEnabled, setCheckoutEnabled] = useState(siteSettings.checkoutEnabled);
  const [checkoutTitle, setCheckoutTitle] = useState(siteSettings.checkoutTitle);
  const [checkoutSubtitle, setCheckoutSubtitle] = useState(siteSettings.checkoutSubtitle);
  const [checkoutCurrency, setCheckoutCurrency] = useState(siteSettings.checkoutCurrency);
  const [checkoutTaxPercent, setCheckoutTaxPercent] = useState(
    String(siteSettings.checkoutTaxPercent)
  );
  const [checkoutNotice, setCheckoutNotice] = useState(siteSettings.checkoutNotice);
  const [customFields, setCustomFields] = useState<CheckoutFieldConfig[]>(
    siteSettings.checkoutCustomFields
  );
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldPlaceholder, setNewFieldPlaceholder] = useState('');
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [isSavingCheckout, setIsSavingCheckout] = useState(false);
  const [checkoutSavedMsg, setCheckoutSavedMsg] = useState<string | null>(null);

  const availablePlans = useMemo(
    () => (plans.length > 0 ? plans : DEFAULT_PRICING_PLANS),
    [plans]
  );

  // Revenue KPIs
  const metrics = useMemo(() => {
    let totalRevenue = 0;
    let paidCount = 0;
    let dueBalance = 0;
    let dueOrPendingCount = 0;
    let expiredCount = 0;

    for (const inv of invoices) {
      if (inv.status === 'paid') {
        totalRevenue += inv.totalAmount;
        paidCount += 1;
      } else if (inv.status === 'due' || inv.status === 'pending') {
        dueBalance += inv.totalAmount;
        dueOrPendingCount += 1;
      } else if (inv.status === 'expired') {
        expiredCount += 1;
      }
    }

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      paidCount,
      dueBalance: Math.round(dueBalance * 100) / 100,
      dueOrPendingCount,
      expiredCount,
    };
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    const q = invSearch.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
      if (!q) return true;
      return (
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.userName.toLowerCase().includes(q) ||
        inv.userEmail.toLowerCase().includes(q) ||
        inv.planName.toLowerCase().includes(q) ||
        inv.transactionRef.toLowerCase().includes(q)
      );
    });
  }, [invoices, invSearch, statusFilter]);

  const handleOpenCreateBill = () => {
    const firstUser = users[0]?.uid || '';
    const defaultPlan = availablePlans.find((p) => p.id === 'pro') || availablePlans[0];
    const calc = computePlanTotals(defaultPlan, 'monthly', siteSettings.checkoutTaxPercent);
    setBillUserId(firstUser);
    setBillPlanId(defaultPlan.id);
    setBillCycle('monthly');
    setBillGatewayId(gateways[0]?.id || '');
    setBillStatus('due');
    setBillSubtotal(String(calc.subtotal));
    setBillTax(String(calc.taxAmount));
    setBillNotes('');
    setBillDueDays('7');
    setIsCreateBillOpen(true);
  };

  const handleBillPlanOrCycleChange = (nextPlanId: string, nextCycle: InvoiceBillingCycle) => {
    setBillPlanId(nextPlanId);
    setBillCycle(nextCycle);
    const p = availablePlans.find((pl) => pl.id === nextPlanId);
    if (p) {
      const calc = computePlanTotals(p, nextCycle, siteSettings.checkoutTaxPercent);
      setBillSubtotal(String(calc.subtotal));
      setBillTax(String(calc.taxAmount));
    }
  };

  const handleSubmitCreateBill = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetUser = users.find((u) => u.uid === billUserId);
    const targetPlan = availablePlans.find((p) => p.id === billPlanId) || availablePlans[0];
    const targetGw = gateways.find((g) => g.id === billGatewayId);
    if (!targetUser || !targetPlan) return;

    setIsCreatingBill(true);
    try {
      await adminCreateInvoice(adminUid, {
        userId: targetUser.uid,
        userName: targetUser.displayName,
        userEmail: '',
        planId: targetPlan.id,
        planName: targetPlan.name,
        billingCycle: billCycle,
        subtotal: Math.max(0, Number(billSubtotal) || 0),
        taxAmount: Math.max(0, Number(billTax) || 0),
        currency: siteSettings.checkoutCurrency || 'USD',
        gatewayId: targetGw?.id || '',
        gatewayName: targetGw?.name || 'Manual / Admin',
        transactionRef: '',
        payerAccount: '',
        status: billStatus,
        notes: billNotes.trim(),
        dueDays: Math.max(0, Math.floor(Number(billDueDays) || 7)),
      });
      setIsCreateBillOpen(false);
    } finally {
      setIsCreatingBill(false);
    }
  };

  const handleInvoiceStatusAction = async (inv: BillingInvoice, nextStatus: InvoiceStatus) => {
    setBusyInvoiceId(inv.id);
    try {
      await adminUpdateInvoiceStatus(adminUid, inv, nextStatus);
    } finally {
      setBusyInvoiceId(null);
    }
  };

  const handleToggleGateway = async (gw: PaymentGateway) => {
    await savePaymentGatewayAdmin(adminUid, {
      id: gw.id,
      name: gw.name,
      gatewayType: gw.gatewayType,
      enabled: !gw.enabled,
      accountLabel: gw.accountLabel,
      accountValue: gw.accountValue,
      instructions: gw.instructions,
      badgeText: gw.badgeText,
      sortOrder: gw.sortOrder,
    });
  };

  const handleSaveCheckoutSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckoutSavedMsg(null);
    setIsSavingCheckout(true);
    try {
      await updatePartialSiteSettingsAdmin(adminUid, {
        checkoutEnabled,
        checkoutTitle,
        checkoutSubtitle,
        checkoutCurrency: checkoutCurrency.trim() || 'USD',
        checkoutTaxPercent: Math.min(100, Math.max(0, Number(checkoutTaxPercent) || 0)),
        checkoutNotice,
        checkoutCustomFields: customFields,
      });
      setCheckoutSavedMsg('Checkout configuration and custom fields saved.');
      setTimeout(() => setCheckoutSavedMsg(null), 2500);
    } finally {
      setIsSavingCheckout(false);
    }
  };

  const handleAddCustomField = () => {
    if (!newFieldLabel.trim()) return;
    setCustomFields([
      ...customFields,
      {
        id: generateSafeId('fld'),
        label: newFieldLabel.trim().slice(0, 100),
        placeholder: newFieldPlaceholder.trim().slice(0, 160),
        required: newFieldRequired,
        visible: true,
      },
    ]);
    setNewFieldLabel('');
    setNewFieldPlaceholder('');
    setNewFieldRequired(false);
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg">
          <button
            type="button"
            onClick={() => setSubTab('invoices')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              subTab === 'invoices'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Bills &amp; Revenue ({invoices.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('gateways')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              subTab === 'gateways'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            Payment Gateways ({gateways.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('checkout')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              subTab === 'checkout'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            Checkout Settings
          </button>
        </div>

        <button
          type="button"
          onClick={handleOpenCreateBill}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
        >
          <Plus className="w-3.5 h-3.5" />
          Generate User Bill / Invoice
        </button>
      </div>

      {/* INVOICES & REVENUE SUB-TAB */}
      {subTab === 'invoices' && (
        <div className="space-y-5">
          {/* Revenue KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
            <div className="p-4 sm:p-5 space-y-1">
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                Total Revenue
              </p>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {formatMoney(metrics.totalRevenue, siteSettings.checkoutCurrency)}
              </p>
            </div>
            <div className="p-4 sm:p-5 space-y-1">
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                Paid Invoices
              </p>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {metrics.paidCount}
              </p>
            </div>
            <div className="p-4 sm:p-5 space-y-1">
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                Due &amp; Pending ({metrics.dueOrPendingCount})
              </p>
              <p className="text-2xl font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400">
                {formatMoney(metrics.dueBalance, siteSettings.checkoutCurrency)}
              </p>
            </div>
            <div className="p-4 sm:p-5 space-y-1">
              <p className="text-xs text-slate-500 dark:text-slate-400">Expired Bills</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-red-600 dark:text-red-400">
                {metrics.expiredCount}
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={invSearch}
                onChange={(e) => setInvSearch(e.target.value)}
                placeholder="Search invoice #, user, plan, TrxID..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              />
            </div>

            <select
              aria-label="Filter invoices by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | InvoiceStatus)}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending Verification</option>
              <option value="due">Due</option>
              <option value="paid">Paid</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Invoice Table */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Invoice</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Plan &amp; Method</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500 dark:text-slate-400">
                      No invoices found matching the current filter.
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((inv) => {
                    const isBusy = busyInvoiceId === inv.id;
                    return (
                      <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4">
                          <p className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                            {inv.invoiceNumber}
                          </p>
                          <p className="text-[11px] text-slate-500 tabular-nums">
                            {new Date(inv.createdAtMs).toLocaleDateString()}
                          </p>
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-medium text-slate-900 dark:text-slate-100">
                            {inv.userName || 'User'}
                          </p>
                          <p className="text-[11px] text-slate-500 font-mono truncate max-w-[180px]">
                            {inv.userEmail || inv.userId}
                          </p>
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-medium text-slate-900 dark:text-slate-100">
                            {inv.planName} ({inv.billingCycle})
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {inv.gatewayName || '—'}
                            {inv.transactionRef ? ` · Ref: ${inv.transactionRef}` : ''}
                          </p>
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                          {formatMoney(inv.totalAmount, inv.currency)}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`font-semibold capitalize ${
                              inv.status === 'paid'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : inv.status === 'pending'
                                  ? 'text-blue-600 dark:text-blue-400'
                                  : inv.status === 'due'
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : inv.status === 'expired'
                                      ? 'text-red-600 dark:text-red-400'
                                      : 'text-slate-500'
                            }`}
                          >
                            {inv.status}
                          </span>
                          {inv.expiresAtMs > 0 && (
                            <p className="text-[11px] text-slate-500 tabular-nums">
                              Exp: {new Date(inv.expiresAtMs).toLocaleDateString()}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {inv.status !== 'paid' && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleInvoiceStatusAction(inv, 'paid')}
                                className="px-2.5 py-1 text-[11px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded"
                                title="Confirm payment, activate plan & auto-assign plan badge"
                              >
                                {isBusy ? '...' : 'Mark Paid & Activate'}
                              </button>
                            )}
                            {inv.status !== 'due' && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleInvoiceStatusAction(inv, 'due')}
                                className="px-2 py-1 text-[11px] font-medium border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                Due
                              </button>
                            )}
                            {inv.status !== 'expired' && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleInvoiceStatusAction(inv, 'expired')}
                                className="px-2 py-1 text-[11px] font-medium border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                Expire
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onViewInvoice(inv)}
                              title="View & Print Invoice"
                              className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 rounded"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {confirmDeleteInvId === inv.id ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    void adminDeleteInvoice(inv.id);
                                    setConfirmDeleteInvId(null);
                                  }}
                                  className="px-2 py-1 text-[11px] font-medium text-white bg-red-600 rounded"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteInvId(null)}
                                  className="px-1.5 py-1 text-[11px]"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteInvId(inv.id)}
                                title="Delete invoice"
                                className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PAYMENT GATEWAYS SUB-TAB */}
      {subTab === 'gateways' && (
        <div className="space-y-4">
          {!editingGateway ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Toggle Stripe, Bank Transfer, bKash, Nagad, Crypto, or custom gateways active/inactive. Keep private API secret keys in server environment variables only.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void seedDefaultPaymentGatewaysAdmin(adminUid)}
                    className="px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                  >
                    Initialize 5 Default Gateways
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setGatewayError(null);
                      setEditingGateway({
                        name: '',
                        gatewayType: 'custom',
                        enabled: true,
                        accountLabel: 'Account / Wallet',
                        accountValue: '',
                        instructions: '',
                        badgeText: '',
                        sortOrder: String(gateways.length),
                      });
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Gateway
                  </button>
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
                {gateways.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-600 dark:text-slate-400">
                    No gateways configured in Firestore yet. Click &ldquo;Initialize 5 Default Gateways&rdquo; to set up Stripe, Bank, bKash, Nagad, and Crypto.
                  </div>
                ) : (
                  gateways.map((gw) => (
                    <div
                      key={gw.id}
                      className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {gw.name}
                          </h3>
                          <span className="text-[11px] font-mono uppercase text-slate-500">
                            {gw.gatewayType}
                          </span>
                          <span
                            className={`text-xs font-medium ${
                              gw.enabled
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-slate-500'
                            }`}
                          >
                            {gw.enabled ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 truncate max-w-xl">
                          {gw.accountLabel ? `${gw.accountLabel}: ` : ''}
                          {gw.accountValue || gw.instructions || 'No instructions yet'}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={gw.enabled}
                          aria-label={`Toggle ${gw.name}`}
                          onClick={() => void handleToggleGateway(gw)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                            gw.enabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                              gw.enabled ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setGatewayError(null);
                            setEditingGateway({
                              id: gw.id,
                              name: gw.name,
                              gatewayType: gw.gatewayType,
                              enabled: gw.enabled,
                              accountLabel: gw.accountLabel,
                              accountValue: gw.accountValue,
                              instructions: gw.instructions,
                              badgeText: gw.badgeText,
                              sortOrder: String(gw.sortOrder),
                            });
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit
                        </button>

                        {confirmDeleteGwId === gw.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                void deletePaymentGatewayAdmin(gw.id);
                                setConfirmDeleteGwId(null);
                              }}
                              className="px-2.5 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteGwId(null)}
                              className="px-2 py-1.5 text-xs"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteGwId(gw.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg"
                            title="Delete gateway"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setGatewayError(null);
                if (!editingGateway.name.trim()) {
                  setGatewayError('Gateway name is required.');
                  return;
                }
                setIsSavingGateway(true);
                try {
                  await savePaymentGatewayAdmin(adminUid, {
                    id: editingGateway.id,
                    name: editingGateway.name,
                    gatewayType: editingGateway.gatewayType,
                    enabled: editingGateway.enabled,
                    accountLabel: editingGateway.accountLabel,
                    accountValue: editingGateway.accountValue,
                    instructions: editingGateway.instructions,
                    badgeText: editingGateway.badgeText,
                    sortOrder: Math.max(0, Math.floor(Number(editingGateway.sortOrder) || 0)),
                  });
                  setEditingGateway(null);
                } catch (err) {
                  setGatewayError(
                    err instanceof Error ? err.message : 'Unable to save payment gateway.'
                  );
                } finally {
                  setIsSavingGateway(false);
                }
              }}
              className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-6 space-y-4"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {editingGateway.id ? `Edit Gateway: ${editingGateway.name}` : 'Add Payment Gateway'}
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingGateway(null)}
                  className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-medium">Display Name</label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={editingGateway.name}
                    onChange={(e) =>
                      setEditingGateway({ ...editingGateway, name: e.target.value })
                    }
                    placeholder="bKash Merchant"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium">Gateway Type</label>
                  <select
                    value={editingGateway.gatewayType}
                    onChange={(e) =>
                      setEditingGateway({
                        ...editingGateway,
                        gatewayType: e.target.value as PaymentGatewayType,
                      })
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="stripe">Stripe</option>
                    <option value="bank">Bank Transfer</option>
                    <option value="bkash">bKash</option>
                    <option value="nagad">Nagad</option>
                    <option value="crypto">Crypto</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium">Account / Wallet Label</label>
                  <input
                    type="text"
                    maxLength={80}
                    value={editingGateway.accountLabel}
                    onChange={(e) =>
                      setEditingGateway({ ...editingGateway, accountLabel: e.target.value })
                    }
                    placeholder="e.g. Merchant Number or Wallet Address"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium">
                    Public Account Number / IBAN / Wallet
                  </label>
                  <input
                    type="text"
                    maxLength={300}
                    value={editingGateway.accountValue}
                    onChange={(e) =>
                      setEditingGateway({ ...editingGateway, accountValue: e.target.value })
                    }
                    placeholder="e.g. +8801XXXXXXXXX or TRC20 Address"
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium">Badge Text (optional)</label>
                  <input
                    type="text"
                    maxLength={40}
                    value={editingGateway.badgeText}
                    onChange={(e) =>
                      setEditingGateway({ ...editingGateway, badgeText: e.target.value })
                    }
                    placeholder="Instant / Mobile Wallet"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium">Sort Order</label>
                  <input
                    type="number"
                    min="0"
                    value={editingGateway.sortOrder}
                    onChange={(e) =>
                      setEditingGateway({ ...editingGateway, sortOrder: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium">Checkout Instructions</label>
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={editingGateway.instructions}
                  onChange={(e) =>
                    setEditingGateway({ ...editingGateway, instructions: e.target.value })
                  }
                  placeholder="Step-by-step payment instructions displayed to the user..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingGateway.enabled}
                  onChange={(e) =>
                    setEditingGateway({ ...editingGateway, enabled: e.target.checked })
                  }
                  className="rounded border-slate-300 text-blue-600"
                />
                Active (visible on Checkout page)
              </label>

              {gatewayError && <p className="text-xs text-red-600">{gatewayError}</p>}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingGateway(null)}
                  className="px-4 py-2 text-xs font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingGateway}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg"
                >
                  {isSavingGateway ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Save Gateway
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* CHECKOUT SETTINGS SUB-TAB */}
      {subTab === 'checkout' && (
        <form onSubmit={(e) => void handleSaveCheckoutSettings(e)} className="space-y-6">
          <section className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-6 space-y-5">
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Checkout Page Visibility &amp; Configuration
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Toggle checkout visibility, currency, tax rate, and custom checkout form fields.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={checkoutEnabled}
                aria-label="Show or hide Checkout page"
                onClick={() => setCheckoutEnabled((v) => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  checkoutEnabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    checkoutEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-xs font-medium">Checkout Heading</label>
                <input
                  type="text"
                  maxLength={120}
                  value={checkoutTitle}
                  onChange={(e) => setCheckoutTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium">Currency</label>
                  <input
                    type="text"
                    maxLength={12}
                    value={checkoutCurrency}
                    onChange={(e) => setCheckoutCurrency(e.target.value.toUpperCase())}
                    placeholder="USD or BDT"
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium">Tax (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={checkoutTaxPercent}
                    onChange={(e) => setCheckoutTaxPercent(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium">Checkout Subtitle</label>
              <input
                type="text"
                maxLength={300}
                value={checkoutSubtitle}
                onChange={(e) => setCheckoutSubtitle(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium">Checkout Notice / Payment Help</label>
              <textarea
                rows={2}
                maxLength={1000}
                value={checkoutNotice}
                onChange={(e) => setCheckoutNotice(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            {/* Custom Checkout Fields CRUD */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Custom Checkout Fields (Add, Edit, Delete, Show/Hide)
              </h3>

              <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                {customFields.length === 0 ? (
                  <p className="p-4 text-xs text-slate-500">No custom checkout fields added.</p>
                ) : (
                  customFields.map((cf, idx) => (
                    <div key={cf.id} className="p-3 flex flex-wrap items-center gap-2.5">
                      <input
                        type="text"
                        value={cf.label}
                        onChange={(e) => {
                          const next = [...customFields];
                          next[idx] = { ...cf, label: e.target.value };
                          setCustomFields(next);
                        }}
                        className="flex-1 min-w-[160px] px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                      <input
                        type="text"
                        value={cf.placeholder}
                        placeholder="Placeholder..."
                        onChange={(e) => {
                          const next = [...customFields];
                          next[idx] = { ...cf, placeholder: e.target.value };
                          setCustomFields(next);
                        }}
                        className="flex-1 min-w-[160px] px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                      <label className="inline-flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={cf.required}
                          onChange={(e) => {
                            const next = [...customFields];
                            next[idx] = { ...cf, required: e.target.checked };
                            setCustomFields(next);
                          }}
                        />
                        Req
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const next = [...customFields];
                          next[idx] = { ...cf, visible: !cf.visible };
                          setCustomFields(next);
                        }}
                        className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded"
                        title={cf.visible ? 'Hide field' : 'Show field'}
                      >
                        {cf.visible ? (
                          <Eye className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-slate-400" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setCustomFields(customFields.filter((f) => f.id !== cf.id))
                        }
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                        title="Delete field"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <input
                  type="text"
                  value={newFieldLabel}
                  onChange={(e) => setNewFieldLabel(e.target.value)}
                  placeholder="New field label (e.g. Tax ID)"
                  className="flex-1 min-w-[160px] px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <input
                  type="text"
                  value={newFieldPlaceholder}
                  onChange={(e) => setNewFieldPlaceholder(e.target.value)}
                  placeholder="Placeholder hint"
                  className="flex-1 min-w-[160px] px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <label className="inline-flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={newFieldRequired}
                    onChange={(e) => setNewFieldRequired(e.target.checked)}
                  />
                  Required
                </label>
                <button
                  type="button"
                  onClick={handleAddCustomField}
                  className="px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  + Add Field
                </button>
              </div>
            </div>

            {checkoutSavedMsg && (
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                {checkoutSavedMsg}
              </p>
            )}

            <div className="flex justify-end pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="submit"
                disabled={isSavingCheckout}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg"
              >
                {isSavingCheckout ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Save Checkout Settings
              </button>
            </div>
          </section>
        </form>
      )}

      {/* GENERATE USER BILL / INVOICE MODAL */}
      {isCreateBillOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Generate User Bill / Invoice
              </h2>
              <button
                type="button"
                onClick={() => setIsCreateBillOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => void handleSubmitCreateBill(e)}
              className="p-6 space-y-4 max-h-[80vh] overflow-y-auto text-xs"
            >
              <div className="space-y-1">
                <label className="block font-medium">User Account</label>
                <select
                  required
                  value={billUserId}
                  onChange={(e) => setBillUserId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {users.map((u) => (
                    <option key={u.uid} value={u.uid}>
                      {u.displayName} ({u.uid})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block font-medium">Plan</label>
                  <select
                    value={billPlanId}
                    onChange={(e) =>
                      handleBillPlanOrCycleChange(e.target.value, billCycle)
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    {availablePlans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block font-medium">Billing Cycle</label>
                  <select
                    value={billCycle}
                    onChange={(e) =>
                      handleBillPlanOrCycleChange(
                        billPlanId,
                        e.target.value as InvoiceBillingCycle
                      )
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                    <option value="one-time">One-time</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block font-medium">Subtotal</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={billSubtotal}
                    onChange={(e) => setBillSubtotal(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block font-medium">Tax</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={billTax}
                    onChange={(e) => setBillTax(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block font-medium">Due in (days)</label>
                  <input
                    type="number"
                    min="0"
                    value={billDueDays}
                    onChange={(e) => setBillDueDays(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block font-medium">Initial Status</label>
                  <select
                    value={billStatus}
                    onChange={(e) => setBillStatus(e.target.value as InvoiceStatus)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="due">Due</option>
                    <option value="pending">Pending Verification</option>
                    <option value="paid">Paid (Auto-Activate Plan + Badge)</option>
                    <option value="expired">Expired</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block font-medium">Gateway</label>
                  <select
                    value={billGatewayId}
                    onChange={(e) => setBillGatewayId(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="">Manual / Admin</option>
                    {gateways.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block font-medium">Invoice Note (optional)</label>
                <textarea
                  rows={2}
                  value={billNotes}
                  onChange={(e) => setBillNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateBillOpen(false)}
                  className="px-4 py-2 font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingBill}
                  className="inline-flex items-center gap-2 px-4 py-2 font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg"
                >
                  {isCreatingBill ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Create Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
