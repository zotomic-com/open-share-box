import React, { useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import type { InvoiceBillingCycle, PricingPlan, UserBadge } from '../types/video';
import { DEFAULT_PRICING_PLANS } from '../lib/adminStore';
import { BadgePill } from './BadgePill';

interface PricingPlansProps {
  siteName: string;
  plans: PricingPlan[];
  allBadges?: UserBadge[];
  activePlanId?: string;
  checkoutEnabled: boolean;
  isSignedIn: boolean;
  onBack: () => void;
  onOpenAuth: () => void;
  onSelectPlanForCheckout: (plan: PricingPlan, cycle: InvoiceBillingCycle) => void;
}

export const PricingPlans: React.FC<PricingPlansProps> = ({
  siteName,
  plans,
  allBadges = [],
  activePlanId,
  checkoutEnabled,
  isSignedIn,
  onBack,
  onOpenAuth,
  onSelectPlanForCheckout,
}) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');
  const [selectedPlanNotice, setSelectedPlanNotice] = useState<string | null>(null);

  const displayedPlans = (plans.length > 0 ? plans : DEFAULT_PRICING_PLANS)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          Back to Library
        </button>

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
            Yearly (Save ~20%)
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Plans for {siteName}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
          Save videos, screenshots, and web links in one searchable inbox with private on-device
          media storage and instant cloud link sync.
        </p>
      </div>

      {selectedPlanNotice && (
        <div
          role="status"
          className="p-4 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/30 text-xs text-blue-900 dark:text-blue-200 flex items-center justify-between gap-4"
        >
          <span>{selectedPlanNotice}</span>
          <button
            type="button"
            onClick={() => setSelectedPlanNotice(null)}
            className="font-semibold underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {displayedPlans.map((tier) => {
          const price =
            billingCycle === 'yearly' ? tier.yearlyMonthlyPrice : tier.monthlyPrice;
          const isFreeTier = tier.monthlyPrice === 0 && tier.yearlyMonthlyPrice === 0;
          const isCurrentPlan = Boolean(activePlanId && activePlanId === tier.id);
          const autoBadge = tier.autoBadgeId
            ? allBadges.find((b) => b.id === tier.autoBadgeId)
            : undefined;

          return (
            <div
              key={tier.id}
              className={`rounded-xl border p-6 flex flex-col justify-between space-y-6 bg-white dark:bg-slate-900 ${
                tier.highlighted
                  ? 'border-blue-600 dark:border-blue-500 ring-1 ring-blue-600/20'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {tier.name}
                    </h2>
                    {tier.tagline && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                        {tier.tagline}
                      </p>
                    )}
                  </div>
                  {tier.badge && (
                    <span className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-blue-600 text-white shrink-0">
                      {tier.badge}
                    </span>
                  )}
                </div>

                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    ${price}
                  </span>
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    / month{billingCycle === 'yearly' && price > 0 ? ' billed yearly' : ''}
                  </span>
                </div>

                {autoBadge && (
                  <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                    <span>Includes badge:</span>
                    <BadgePill badge={autoBadge} size="sm" />
                  </div>
                )}

                <ul className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  {tier.features.map((feat, idx) => (
                    <li
                      key={`${tier.id}_feat_${idx}`}
                      className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300"
                    >
                      <Check
                        className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (isFreeTier && !isSignedIn) {
                      onOpenAuth();
                      return;
                    }
                    if (checkoutEnabled) {
                      onSelectPlanForCheckout(tier, billingCycle);
                      return;
                    }
                    setSelectedPlanNotice(
                      `You selected ${tier.name} ($${price}/mo). Checkout is currently disabled by site administrators.`
                    );
                  }}
                  className={`w-full py-2.5 px-4 text-xs font-medium rounded-lg transition-colors ${
                    tier.highlighted
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {isCurrentPlan
                    ? 'Current Active Plan'
                    : isFreeTier && isSignedIn
                      ? 'Activate Starter Free'
                      : tier.ctaLabel}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
