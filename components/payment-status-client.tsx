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
    type?: string;
    label: string;
    createdAt: string;
    paymentId?: string;
    refundReference?: string;
    amount?: number;
    currency?: string;
    responseSummary?: string;
  }[];
};

type PaymentEvent = NonNullable<PaymentStatus["events"]>[number];

type RefundWebhookState = {
  status: "waiting" | "received";
  reference?: string;
  event?: PaymentEvent;
  lastCheckedAt?: string;
};

const refundWebhookEventTypes = new Set([
  "payment_refunded",
  "payment_refund_pending",
  "payment_refund_declined",
]);

function formatMoney(amount: number, currency?: string) {
  if (!currency) {
    return String(amount);
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount / 100);
}

function latestRefundWebhookEvent(events: PaymentEvent[]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const label = event.label.toLowerCase();

    if (
      (event.type && refundWebhookEventTypes.has(event.type)) ||
      (label.includes("refund") && label.includes("via webhook"))
    ) {
      return event;
    }
  }

  return undefined;
}

export function PaymentStatusClient({
  paymentId,
  showFlowRefundWebhook = false,
}: {
  paymentId?: string;
  showFlowRefundWebhook?: boolean;
}) {
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refundWebhook, setRefundWebhook] =
    useState<RefundWebhookState | null>(null);
  const refundWebhookStatus = refundWebhook?.status;

  useEffect(() => {
    if (!paymentId) {
      return;
    }

    fetch(`/api/payments/${encodeURIComponent(paymentId)}/status`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setStatus(data))
      .catch(() => undefined);
  }, [paymentId]);

  useEffect(() => {
    if (
      !showFlowRefundWebhook ||
      !paymentId ||
      refundWebhookStatus !== "waiting"
    ) {
      return;
    }

    const encodedPaymentId = encodeURIComponent(paymentId);
    let attempts = 0;
    let isMounted = true;

    async function checkRefundWebhook() {
      const response = await fetch(`/api/payments/${encodedPaymentId}/status`);
      const data = response.ok ? ((await response.json()) as PaymentStatus) : null;

      if (!isMounted || !data) {
        return;
      }

      const event = latestRefundWebhookEvent(data.events ?? []);
      setStatus(data);
      setRefundWebhook((current) =>
        current
          ? {
              ...current,
              status: event ? "received" : "waiting",
              event,
              lastCheckedAt: new Date().toISOString(),
            }
          : current,
      );
    }

    checkRefundWebhook().catch(() => undefined);

    const interval = window.setInterval(() => {
      attempts += 1;

      if (attempts >= 60) {
        window.clearInterval(interval);
        return;
      }

      checkRefundWebhook().catch(() => undefined);
    }, 5000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [
    paymentId,
    refundWebhookStatus,
    showFlowRefundWebhook,
  ]);

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
      if (showFlowRefundWebhook) {
        setRefundWebhook({
          status: "waiting",
          reference: data.reference,
        });
      }
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
          {showFlowRefundWebhook && refundWebhook && (
            <div
              className={`mt-4 rounded-lg border p-4 ${
                refundWebhook.status === "received"
                  ? "border-[#8C9E6E]/30 bg-[#F3F7ED]"
                  : "border-[#323416]/10 bg-white"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-semibold text-[#323416]">
                  Refund webhook
                </h4>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    refundWebhook.status === "received"
                      ? "bg-[#8C9E6E] text-white"
                      : "bg-[#323416]/10 text-[#323416]/70"
                  }`}
                >
                  {refundWebhook.status === "received"
                    ? "Received"
                    : "Waiting"}
                </span>
              </div>
              {refundWebhook.reference && (
                <p className="mt-2 break-all text-sm text-[#323416]/70">
                  Refund reference: {refundWebhook.reference}
                </p>
              )}
              {refundWebhook.event ? (
                <div className="mt-3 space-y-1 text-sm text-[#323416]/75">
                  <p>
                    <span className="font-medium text-[#323416]">
                      {refundWebhook.event.label}
                    </span>{" "}
                    {new Date(refundWebhook.event.createdAt).toLocaleString()}
                  </p>
                  <p className="break-all">Event ID: {refundWebhook.event.id}</p>
                  {refundWebhook.event.responseSummary && (
                    <p>Gateway response: {refundWebhook.event.responseSummary}</p>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-sm leading-6 text-[#323416]/70">
                  Waiting for Checkout.com to send the asynchronous refund
                  webhook.
                </p>
              )}
              {refundWebhook.lastCheckedAt && (
                <p className="mt-3 text-xs text-[#323416]/50">
                  Last checked{" "}
                  {new Date(refundWebhook.lastCheckedAt).toLocaleTimeString()}
                </p>
              )}
            </div>
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
