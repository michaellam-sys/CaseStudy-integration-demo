"use client";

import { useEffect, useState } from "react";

type PaymentStatus = {
  id?: string;
  status?: string;
  responseSummary?: string;
  cardSummary?: string;
  availableToRefund?: number;
  totalRefunded?: number;
  currency?: string;
  events?: {
    id: string;
    label: string;
    createdAt: string;
    amount?: number;
    currency?: string;
  }[];
};

function formatMoney(amount: number, currency?: string) {
  if (!currency) {
    return String(amount);
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount / 100);
}

export function PaymentStatusClient({ paymentId }: { paymentId?: string }) {
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!paymentId) {
      return;
    }

    fetch(`/api/payments/${encodeURIComponent(paymentId)}/status`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setStatus(data))
      .catch(() => undefined);
  }, [paymentId]);

  async function submitRefund(full: boolean) {
    if (!paymentId) {
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/payments/${encodeURIComponent(paymentId)}/refunds`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ full, amount: refundAmount }),
        },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Refund request failed.");
      }

      setMessage(
        `Refund requested: ${formatMoney(data.amount, data.currency)}. Final status follows webhook/status updates.`,
      );
      setRefundAmount("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Refund failed.");
    } finally {
      setIsLoading(false);
    }
  }

  if (!paymentId || !status) {
    return null;
  }

  const availableToRefund = status.availableToRefund ?? 0;

  return (
    <section className="mt-6 rounded-lg border border-[#323416]/10 bg-white p-6">
      <h2 className="text-lg font-semibold text-[#323416]">Safe status</h2>
      <p className="mt-2 text-sm text-[#323416]/70">
        Server-confirmed status:{" "}
        <span className="font-semibold text-[#323416]">
          {status.status ?? "Unknown"}
        </span>
      </p>
      {status.responseSummary && (
        <p className="mt-1 text-sm text-[#323416]/70">
          Gateway response: {status.responseSummary}
        </p>
      )}
      {status.cardSummary && (
        <p className="mt-1 text-sm text-[#323416]/70">
          Card: {status.cardSummary}
        </p>
      )}

      {availableToRefund > 0 && (
        <div className="mt-5 rounded-lg bg-[#FFFFFD] p-4">
          <h3 className="font-semibold text-[#323416]">Refund payment</h3>
          <p className="mt-2 text-sm text-[#323416]/70">
            Available to refund:{" "}
            {formatMoney(availableToRefund, status.currency)}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <input
              value={refundAmount}
              onChange={(event) => setRefundAmount(event.target.value)}
              inputMode="decimal"
              placeholder="Amount"
              className="h-10 rounded-md border border-[#323416]/20 px-3 text-sm"
            />
            <button
              onClick={() => submitRefund(false)}
              disabled={isLoading}
              className="h-10 rounded-md bg-[#323416] px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              Submit refund
            </button>
            <button
              onClick={() => submitRefund(true)}
              disabled={isLoading}
              className="h-10 rounded-md border border-[#323416]/20 px-4 text-sm font-semibold text-[#323416] disabled:opacity-60"
            >
              Refund full amount
            </button>
          </div>
          {message && (
            <p className="mt-3 text-sm font-medium text-[#323416]">{message}</p>
          )}
        </div>
      )}

      {status.events && status.events.length > 0 && (
        <div className="mt-5">
          <h3 className="font-semibold text-[#323416]">Order activity</h3>
          <ol className="mt-3 space-y-2">
            {status.events.map((event) => (
              <li
                key={event.id}
                className="rounded-md bg-[#FFFFFD] px-3 py-2 text-sm text-[#323416]/75"
              >
                <span className="font-medium text-[#323416]">
                  {event.label}
                </span>{" "}
                <span>{new Date(event.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
