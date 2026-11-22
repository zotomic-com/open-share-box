import React from 'react';
import { Download, Printer, X } from 'lucide-react';
import type { BillingInvoice } from '../types/video';
import { formatMoney } from '../lib/billingStore';

interface InvoiceModalProps {
  invoice: BillingInvoice | null;
  siteName: string;
  onClose: () => void;
}

const STATUS_LABELS: Record<BillingInvoice['status'], { label: string; className: string }> = {
  paid: {
    label: 'Paid',
    className: 'text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30',
  },
  pending: {
    label: 'Pending Verification',
    className: 'text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/30',
  },
  due: {
    label: 'Due',
    className: 'text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30',
  },
  expired: {
    label: 'Expired',
    className: 'text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800',
  },
};

export const InvoiceModal: React.FC<InvoiceModalProps> = ({ invoice, siteName, onClose }) => {
  if (!invoice) return null;

  const badge = STATUS_LABELS[invoice.status];

  const handleDownloadTxt = () => {
    const lines = [
      `${siteName} — OFFICIAL INVOICE`,
      `Invoice Number: ${invoice.invoiceNumber}`,
      `Status: ${badge.label}`,
      `Issued: ${new Date(invoice.createdAtMs).toLocaleString()}`,
      invoice.dueAtMs ? `Due Date: ${new Date(invoice.dueAtMs).toLocaleDateString()}` : '',
      invoice.paidAtMs ? `Paid Date: ${new Date(invoice.paidAtMs).toLocaleDateString()}` : '',
      invoice.expiresAtMs ? `Plan Expiry: ${new Date(invoice.expiresAtMs).toLocaleDateString()}` : '',
      '',
      'BILL TO:',
      `Name: ${invoice.userName || 'Member'}`,
      `Email: ${invoice.userEmail || '—'}`,
      `User ID: ${invoice.userId}`,
      '',
      'LINE ITEMS:',
      `Plan: ${invoice.planName} (${invoice.billingCycle})`,
      `Subtotal: ${formatMoney(invoice.subtotal, invoice.currency)}`,
      `Tax: ${formatMoney(invoice.taxAmount, invoice.currency)}`,
      `Total: ${formatMoney(invoice.totalAmount, invoice.currency)}`,
      '',
      'PAYMENT DETAILS:',
      `Gateway: ${invoice.gatewayName || '—'}`,
      `Transaction Ref: ${invoice.transactionRef || '—'}`,
      `Payer Account: ${invoice.payerAccount || '—'}`,
      ...(invoice.customFields || []).map((f) => `${f.label}: ${f.value}`),
      invoice.notes ? `\nNotes: ${invoice.notes}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const blob = new Blob([lines], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoice.invoiceNumber}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Invoice ${invoice.invoiceNumber}`}
    >
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 print:hidden">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 font-mono">
              {invoice.invoiceNumber}
            </h2>
            <span className={`px-2 py-0.5 text-xs font-medium rounded-md border ${badge.className}`}>
              {badge.label}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadTxt}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
            >
              <Printer className="w-3.5 h-3.5" />
              Print / PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close invoice preview"
              className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-6 max-h-[82vh] overflow-y-auto">
          <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
            <div>
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{siteName}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Billing Invoice &amp; Payment Receipt
              </p>
            </div>
            <div className="text-left sm:text-right space-y-1 text-xs">
              <p className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                {invoice.invoiceNumber}
              </p>
              <p className="text-slate-500 dark:text-slate-400 tabular-nums">
                Issued: {new Date(invoice.createdAtMs).toLocaleDateString()}
              </p>
              {invoice.dueAtMs > 0 && invoice.status !== 'paid' && (
                <p className="text-amber-700 dark:text-amber-400 tabular-nums">
                  Due: {new Date(invoice.dueAtMs).toLocaleDateString()}
                </p>
              )}
              {invoice.paidAtMs > 0 && (
                <p className="text-emerald-700 dark:text-emerald-400 tabular-nums">
                  Paid: {new Date(invoice.paidAtMs).toLocaleDateString()}
                </p>
              )}
              {invoice.expiresAtMs > 0 && (
                <p className="text-slate-600 dark:text-slate-300 tabular-nums">
                  Expires: {new Date(invoice.expiresAtMs).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
            <div className="space-y-1">
              <p className="font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Billed To
              </p>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {invoice.userName || 'Member'}
              </p>
              {invoice.userEmail && (
                <p className="text-slate-600 dark:text-slate-300">{invoice.userEmail}</p>
              )}
              <p className="font-mono text-slate-500 dark:text-slate-400">UID: {invoice.userId}</p>
            </div>

            <div className="space-y-1">
              <p className="font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Payment Method
              </p>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {invoice.gatewayName || 'Not yet selected'}
              </p>
              {invoice.transactionRef && (
                <p className="font-mono text-slate-600 dark:text-slate-300">
                  Ref: {invoice.transactionRef}
                </p>
              )}
              {invoice.payerAccount && (
                <p className="text-slate-600 dark:text-slate-300">
                  Payer: {invoice.payerAccount}
                </p>
              )}
            </div>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4 font-medium">Description</th>
                  <th className="py-2.5 px-4 font-medium">Cycle</th>
                  <th className="py-2.5 px-4 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                <tr>
                  <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                    {invoice.planName}
                  </td>
                  <td className="py-3 px-4 capitalize text-slate-600 dark:text-slate-300">
                    {invoice.billingCycle}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {formatMoney(invoice.subtotal, invoice.currency)}
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-4 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Subtotal</span>
                <span className="font-mono tabular-nums">
                  {formatMoney(invoice.subtotal, invoice.currency)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Tax</span>
                <span className="font-mono tabular-nums">
                  {formatMoney(invoice.taxAmount, invoice.currency)}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-900 dark:text-slate-100">
                <span>Total</span>
                <span className="font-mono tabular-nums">
                  {formatMoney(invoice.totalAmount, invoice.currency)}
                </span>
              </div>
            </div>
          </div>

          {invoice.customFields.length > 0 && (
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-1.5 text-xs">
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                Additional Checkout Details
              </p>
              {invoice.customFields.map((cf, idx) => (
                <div key={`${cf.label}_${idx}`} className="flex justify-between gap-4">
                  <span className="text-slate-500 dark:text-slate-400">{cf.label}</span>
                  <span className="text-slate-900 dark:text-slate-100 font-medium text-right">
                    {cf.value || '—'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {invoice.notes && (
            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
              <strong className="text-slate-800 dark:text-slate-200">Note: </strong>
              {invoice.notes}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
