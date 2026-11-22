import React, { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  FileText,
  Landmark,
  Loader2,
  ShieldCheck,
  Smartphone,
  Wallet,
} from 'lucide-react';
import type {
  BillingInvoice,
  InvoiceBillingCycle,
  PaymentGateway,
  PricingPlan,
  SiteSettings,
  UserProfileRecord,
} from '../types/video';
import { DEFAULT_PRICING_PLANS } from '../lib/adminStore';
import {
  computePlanTotals,
  createCheckoutInvoiceUser,
  DEFAULT_PAYMENT_GATEWAYS,
  formatMoney,
  submitDueInvoicePaymentUser,
} from '../lib/billingStore';

interface CheckoutPageProps {
  user: User | null;
  profile: UserProfileRecord | null;
  siteSettings: SiteSettings;
  plans: PricingPlan[];
  gateways: PaymentGateway[];
  initialPlanId?: string;
  initialCycle?: InvoiceBillingCycle;
  existingDueInvoice?: BillingInvoice | null;
  onBackToPricing: () => void;
  onOpenAuth: () => void;
  onViewInvoice: (invoice: BillingInvoice) => void;
  onCheckoutDone: () => void;
}

export const CheckoutPage: React.FC<CheckoutPageProps> = ({
  user,
  profile,
  siteSettings,
  plans,
  gateways,
  initialPlanId,
  initialCycle = 'yearly',
  existingDueInvoice = null,
  onBackToPricing,
  onOpenAuth,
  onViewInvoice,
  onCheckoutDone,
}) => {
  const availablePlans = useMemo(() => {
    const list = plans.length > 0 ? plans : DEFAULT_PRICING_PLANS;
    return list.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  }, [plans]);

  const activeGateways = useMemo(() => {
    const source = gateways.length > 0 ? gateways : (DEFAULT_PAYMENT_GATEWAYS as PaymentGateway[]);
    return source
      .filter((g) => g.enabled)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [gateways]);

  const [selectedPlanId, setSelectedPlanId] = useState<string>(
    existingDueInvoice?.planId || initialPlanId || availablePlans[1]?.id || availablePlans[0]?.id || 'pro'
  );
  const [billingCycle, setBillingCycle] = useState<InvoiceBillingCycle>(
    existingDueInvoice?.billingCycle || initialCycle
  );
  const [selectedGatewayId, setSelectedGatewayId] = useState<string>(
    existingDueInvoice?.gatewayId || activeGateways[0]?.id || ''
  );
  const [transactionRef, setTransactionRef] = useState(existingDueInvoice?.transactionRef || '');
  const [payerAccount, setPayerAccount] = useState(existingDueInvoice?.payerAccount || '');
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdInvoice, setCreatedInvoice] = useState<BillingInvoice | null>(null);

  useEffect(() => {
    if (initialPlanId && !existingDueInvoice) {
      setSelectedPlanId(initialPlanId);
    }
  }, [initialPlanId, existingDueInvoice]);

  useEffect(() => {
    if (activeGateways.length > 0 && !activeGateways.some((g) => g.id === selectedGatewayId)) {
      setSelectedGatewayId(activeGateways[0].id);
    }
  }, [activeGateways, selectedGatewayId]);

  const selectedPlan = useMemo(
    () =>
      availablePlans.find((p) => p.id === selectedPlanId) ||
      availablePlans[0] ||
      DEFAULT_PRICING_PLANS[1],
    [availablePlans, selectedPlanId]
  );

  const selectedGateway = useMemo(
    () => activeGateways.find((g) => g.id === selectedGatewayId) || null,
    [activeGateways, selectedGatewayId]
  );

  const totals = useMemo(() => {
    if (existingDueInvoice) {
      return {
        subtotal: existingDueInvoice.subtotal,
        taxAmount: existingDueInvoice.taxAmount,
        totalAmount: existingDueInvoice.totalAmount,
      };
    }
    return computePlanTotals(selectedPlan, billingCycle, siteSettings.checkoutTaxPercent);
  }, [existingDueInvoice, selectedPlan, billingCycle, siteSettings.checkoutTaxPercent]);

  const currency = existingDueInvoice?.currency || siteSettings.checkoutCurrency || 'USD';
  const visibleCustomFields = siteSettings.checkoutCustomFields.filter((f) => f.visible);
  const isStarterFree = !existingDueInvoice && totals.totalAmount === 0 && selectedPlan.id === 'starter';

  const renderGatewayIcon = (type: PaymentGateway['gatewayType']) => {
    if (type === 'bank') return <Landmark className="w-4 h-4 text-slate-600 dark:text-slate-300" />;
    if (type === 'bkash' || type === 'nagad') {
      return <Smartphone className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
    }
    if (type === 'crypto') return <Wallet className="w-4 h-4 text-violet-600 dark:text-violet-400" />;
    return <CreditCard className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
  };

  const handleCopyAccount = (id: string, value: string) => {
    if (!value) return;
    void navigator.clipboard?.writeText(value);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleSubmit = async (submitMode: 'submit-payment' | 'generate-due') => {
    setErrorMessage(null);
    if (!user) {
      onOpenAuth();
      return;
    }
    if (!user.emailVerified) {
      setErrorMessage('Please verify your email address first before submitting checkout.');
      return;
    }
    if (!isStarterFree && activeGateways.length === 0) {
      setErrorMessage('No payment gateways are currently active. Contact site admin.');
      return;
    }
    if (!isStarterFree && submitMode === 'submit-payment' && !transactionRef.trim()) {
      setErrorMessage(
        'Please enter your Transaction ID / Payment Reference, or choose "Generate Due Invoice (Pay Later)".'
      );
      return;
    }

    for (const cf of visibleCustomFields) {
      if (cf.required && !(customValues[cf.id] || '').trim()) {
        setErrorMessage(`Please fill in required field: ${cf.label}`);
        return;
      }
    }

    const customEntries = visibleCustomFields
      .map((cf) => ({ label: cf.label, value: (customValues[cf.id] || '').trim() }))
      .filter((e) => e.value);

    setIsSubmitting(true);
    try {
      if (existingDueInvoice) {
        if (!selectedGateway) {
          setErrorMessage('Select a payment method first.');
          setIsSubmitting(false);
          return;
        }
        await submitDueInvoicePaymentUser(user, existingDueInvoice.id, {
          gateway: selectedGateway,
          transactionRef: transactionRef.trim(),
          payerAccount: payerAccount.trim(),
          customFields: customEntries,
        });
        const updatedInv: BillingInvoice = {
          ...existingDueInvoice,
          gatewayId: selectedGateway.id,
          gatewayName: selectedGateway.name,
          transactionRef: transactionRef.trim(),
          payerAccount: payerAccount.trim(),
          customFields: customEntries,
          status: 'pending',
          updatedAtMs: Date.now(),
        };
        setCreatedInvoice(updatedInv);
        onViewInvoice(updatedInv);
      } else {
        const inv = await createCheckoutInvoiceUser(user, {
          plan: selectedPlan,
          billingCycle,
          currency,
          taxPercent: siteSettings.checkoutTaxPercent,
          gateway: selectedGateway,
          transactionRef: transactionRef.trim(),
          payerAccount: payerAccount.trim(),
          customFields: customEntries,
          submitMode,
          existingBadges: profile?.badgeIds || [],
        });
        setCreatedInvoice(inv);
        onViewInvoice(inv);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to process checkout.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (createdInvoice) {
    return (
      <div className="max-w-2xl mx-auto border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-6 sm:p-8 space-y-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {createdInvoice.status === 'paid'
                ? 'Plan Activated!'
                : createdInvoice.status === 'due'
                  ? 'Due Invoice Generated'
                  : 'Payment Submitted for Verification'}
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Invoice <span className="font-mono font-semibold">{createdInvoice.invoiceNumber}</span>{' '}
              for <strong>{createdInvoice.planName}</strong> has been recorded.
            </p>
          </div>
        </div>

        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Status</span>
            <span className="font-semibold capitalize text-slate-900 dark:text-slate-100">
              {createdInvoice.status}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Total Amount</span>
            <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
              {formatMoney(createdInvoice.totalAmount, createdInvoice.currency)}
            </span>
          </div>
          {createdInvoice.gatewayName && (
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Method</span>
              <span className="text-slate-900 dark:text-slate-100">{createdInvoice.gatewayName}</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onViewInvoice(createdInvoice)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
          >
            <FileText className="w-3.5 h-3.5" />
            View &amp; Print Invoice
          </button>
          <button
            type="button"
            onClick={onCheckoutDone}
            className="px-4 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg"
          >
            Go to Account Billing
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBackToPricing}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Plans
        </button>

        {!existingDueInvoice && (
          <div className="inline-flex items-center p-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                billingCycle === 'monthly'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('yearly')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                billingCycle === 'yearly'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Yearly
            </button>
          </div>
        )}
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {existingDueInvoice
            ? `Pay Due Invoice · ${existingDueInvoice.invoiceNumber}`
            : siteSettings.checkoutTitle || 'Complete Your Checkout'}
        </h1>
        {siteSettings.checkoutSubtitle && (
          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl">
            {siteSettings.checkoutSubtitle}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left column: Plan + Payment Gateway + Details */}
        <div className="lg:col-span-8 space-y-6">
          {!existingDueInvoice && (
            <section className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-5 space-y-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                1. Selected Plan
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {availablePlans.map((p) => {
                  const pCost =
                    billingCycle === 'yearly'
                      ? p.yearlyMonthlyPrice * 12
                      : p.monthlyPrice;
                  const active = p.id === selectedPlan.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPlanId(p.id)}
                      className={`p-3.5 text-left rounded-lg border transition-colors ${
                        active
                          ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/25'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {p.name}
                      </p>
                      <p className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
                        {formatMoney(pCost, currency)}
                        <span className="text-[11px] font-normal text-slate-500">
                          /{billingCycle === 'yearly' ? 'yr' : 'mo'}
                        </span>
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {!isStarterFree && (
            <section className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {existingDueInvoice ? '1. Choose Payment Gateway' : '2. Choose Payment Gateway'}
              </h2>

              {activeGateways.length === 0 ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  No payment gateways are currently active. Ask an administrator to enable Stripe, Bank, bKash, Nagad, or Crypto in Admin Billing.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {activeGateways.map((gw) => {
                    const active = gw.id === selectedGateway?.id;
                    return (
                      <button
                        key={gw.id}
                        type="button"
                        onClick={() => setSelectedGatewayId(gw.id)}
                        className={`p-3.5 text-left rounded-lg border flex items-start gap-3 transition-colors ${
                          active
                            ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/25'
                            : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="mt-0.5">{renderGatewayIcon(gw.gatewayType)}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                              {gw.name}
                            </span>
                            {gw.badgeText && (
                              <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                                {gw.badgeText}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {gw.accountLabel || gw.gatewayType}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedGateway && (
                <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 space-y-2.5 text-xs">
                  {selectedGateway.accountValue && (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">
                          {selectedGateway.accountLabel || 'Account / Address'}:{' '}
                        </span>
                        <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 break-all">
                          {selectedGateway.accountValue}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyAccount(selectedGateway.id, selectedGateway.accountValue)
                        }
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        {copiedId === selectedGateway.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                  )}
                  {selectedGateway.instructions && (
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                      {selectedGateway.instructions}
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Transaction ID / Payment Reference
                  </label>
                  <input
                    type="text"
                    maxLength={160}
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    placeholder="e.g. TRX984210 or Stripe Receipt ID"
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Sender Account / Wallet / Card Last 4
                  </label>
                  <input
                    type="text"
                    maxLength={160}
                    value={payerAccount}
                    onChange={(e) => setPayerAccount(e.target.value)}
                    placeholder="e.g. 017XXXXXXXX or Bank Account Name"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>
            </section>
          )}

          {visibleCustomFields.length > 0 && (
            <section className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Billing Information
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {visibleCustomFields.map((cf) => (
                  <div key={cf.id} className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      {cf.label}
                      {cf.required && <span className="text-red-600 ml-0.5">*</span>}
                    </label>
                    <input
                      type="text"
                      maxLength={300}
                      required={cf.required}
                      value={customValues[cf.id] || ''}
                      onChange={(e) =>
                        setCustomValues({ ...customValues, [cf.id]: e.target.value })
                      }
                      placeholder={cf.placeholder}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Right column: Order Summary */}
        <aside className="lg:col-span-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-5 space-y-4 sticky top-20">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Order Summary
          </h2>

          <div className="space-y-2 text-xs border-b border-slate-200 dark:border-slate-800 pb-4">
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-400">Plan</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {existingDueInvoice?.planName || selectedPlan.name}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-400">Billing Cycle</span>
              <span className="capitalize text-slate-900 dark:text-slate-100">
                {billingCycle}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-400">Subtotal</span>
              <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {formatMoney(totals.subtotal, currency)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-400">
                Tax ({siteSettings.checkoutTaxPercent}%)
              </span>
              <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {formatMoney(totals.taxAmount, currency)}
              </span>
            </div>
          </div>

          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Total</span>
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {formatMoney(totals.totalAmount, currency)}
            </span>
          </div>

          {siteSettings.checkoutNotice && (
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
              {siteSettings.checkoutNotice}
            </div>
          )}

          {errorMessage && (
            <p className="text-xs text-red-600 dark:text-red-400">{errorMessage}</p>
          )}

          <div className="space-y-2.5 pt-1">
            {!user ? (
              <button
                type="button"
                onClick={onOpenAuth}
                className="w-full py-2.5 px-4 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                Sign In to Complete Checkout
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => void handleSubmit('submit-payment')}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg"
                >
                  {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {isStarterFree
                    ? 'Activate Free Plan'
                    : 'Submit Payment & Generate Invoice'}
                </button>
                {!isStarterFree && !existingDueInvoice && (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => void handleSubmit('generate-due')}
                    className="w-full py-2 px-4 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg"
                  >
                    Generate Due Invoice (Pay Later)
                  </button>
                )}
              </>
            )}
          </div>

          <p className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 pt-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            Membership badges auto-assign once payment is verified.
          </p>
        </aside>
      </div>
    </div>
  );
};
