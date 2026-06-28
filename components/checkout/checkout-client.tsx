"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { calculateBasket, formatMoney, getMarket } from "@/lib/catalog";
import { defaultCustomerPhone } from "@/lib/customer-phone";
import { CustomerPhoneInput } from "@/components/customer-phone-input";
import { markBasketForClearing, useBasket } from "@/components/use-basket";
import {
  WebhookStatusPanel,
  type WebhookStatusEvent,
} from "@/components/webhook-status-panel";

type Mode = "payment-link" | "hpp" | "direct-card" | "saved-card";

type SavedCard = {
  email?: string;
  scheme?: string;
  last4?: string;
  expiryMonth?: number;
  expiryYear?: number;
};

type Result = {
  tone: "success" | "error" | "info";
  title: string;
  detail?: string;
  url?: string;
  paymentLinkId?: string;
};

type PaymentLinkWebhookEvent = WebhookStatusEvent & {
  type?: string;
};

type PaymentLinkWebhookState = {
  reference: string;
  status: "waiting" | "received";
  event?: PaymentLinkWebhookEvent;
  lastCheckedAt?: string;
  checkFailed?: boolean;
};

type Receipt = {
  transactionDate?: string;
  reference?: string;
  amount?: number;
  currency?: string;
  paymentMethod?: string;
  cardSummary?: string;
};

const modes: { id: Mode; label: string }[] = [
  { id: "payment-link", label: "Payment Link" },
  { id: "hpp", label: "Hosted Checkout Page" },
  { id: "direct-card", label: "Direct Credit Card" },
  { id: "saved-card", label: "Saved Credit Card" },
];

const webhookEventTypes = new Set([
  "payment_approved",
  "payment_captured",
  "payment_declined",
  "payment_pending",
  "payment_refunded",
  "payment_refund_pending",
  "payment_refund_declined",
]);

function luhn(value: string) {
  let sum = 0;
  let shouldDouble = false;

  for (let index = value.length - 1; index >= 0; index -= 1) {
    let digit = Number(value[index]);

    if (shouldDouble) {
      digit *= 2;

      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

function isFutureExpiry(month: number, year: number) {
  const now = new Date();
  const expiry = new Date(year, month, 0);

  return month >= 1 && month <= 12 && expiry >= now;
}

async function readError(response: Response) {
  const data = await response.json().catch(() => ({}));
  return data.errorCodes?.[0] ?? data.error ?? "Request failed.";
}

function latestWebhookEvent(events: PaymentLinkWebhookEvent[]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (
      (event.type && webhookEventTypes.has(event.type)) ||
      event.label.toLowerCase().includes("via webhook")
    ) {
      return event;
    }
  }

  return undefined;
}

function goToPaymentComplete(data: {
  id?: string;
  status?: string;
  responseSummary?: string;
  receipt?: Receipt;
}) {
  markBasketForClearing();

  const params = new URLSearchParams();

  if (data.id) {
    params.set("paymentId", data.id);
  }

  if (data.status) {
    params.set("status", data.status);
  }

  if (data.responseSummary) {
    params.set("responseSummary", data.responseSummary);
  }

  if (data.receipt?.transactionDate) {
    params.set("transactionDate", data.receipt.transactionDate);
  }

  if (data.receipt?.reference) {
    params.set("reference", data.receipt.reference);
  }

  if (data.receipt?.amount !== undefined) {
    params.set("amount", String(data.receipt.amount));
  }

  if (data.receipt?.currency) {
    params.set("currency", data.receipt.currency);
  }

  if (data.receipt?.paymentMethod) {
    params.set("paymentMethod", data.receipt.paymentMethod);
  }

  if (data.receipt?.cardSummary) {
    params.set("cardSummary", data.receipt.cardSummary);
  }

  window.location.href = `/payment-complete?${params.toString()}`;
}

export function CheckoutClient() {
  const searchParams = useSearchParams();
  const market = getMarket(searchParams.get("market"));
  const { items } = useBasket();
  const basket = useMemo(
    () => (items.length ? calculateBasket(market.code, items) : null),
    [items, market.code],
  );
  const initialMode =
    searchParams.get("mode") === "saved-card" ? "saved-card" : "payment-link";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("demo.customer@example.com");
  const [phoneCountryCode, setPhoneCountryCode] = useState(
    defaultCustomerPhone(market.country).countryCode,
  );
  const [phoneNumber, setPhoneNumber] = useState(
    defaultCustomerPhone(market.country).number,
  );
  const [savedCard, setSavedCard] = useState<SavedCard | null>(null);
  const [require3ds, setRequire3ds] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [paymentLinkWebhook, setPaymentLinkWebhook] =
    useState<PaymentLinkWebhookState | null>(null);
  const customerPhone = {
    countryCode: phoneCountryCode,
    number: phoneNumber,
  };

  useEffect(() => {
    fetch("/api/profile/saved-card")
      .then((response) => response.json())
      .then((data) => setSavedCard(data.savedCard));
  }, []);

  useEffect(() => {
    if (
      !paymentLinkWebhook?.reference ||
      paymentLinkWebhook.status === "received"
    ) {
      return;
    }

    const reference = paymentLinkWebhook.reference;
    const encodedReference = encodeURIComponent(reference);
    let isMounted = true;
    let attempts = 0;

    async function checkWebhook() {
      const response = await fetch(`/api/orders/${encodedReference}`);

      if (!isMounted) {
        return;
      }

      if (!response.ok) {
        setPaymentLinkWebhook((current) =>
          current?.reference === reference
            ? {
                ...current,
                lastCheckedAt: new Date().toISOString(),
                checkFailed: true,
              }
            : current,
        );
        return;
      }

      const data = await response.json();
      const events = (data.order?.events ?? []) as PaymentLinkWebhookEvent[];
      const event = latestWebhookEvent(events);

      setPaymentLinkWebhook((current) =>
        current?.reference === reference
          ? {
              ...current,
              status: event ? "received" : "waiting",
              event,
              lastCheckedAt: new Date().toISOString(),
              checkFailed: false,
            }
          : current,
      );
    }

    checkWebhook().catch(() => undefined);

    const interval = window.setInterval(() => {
      attempts += 1;

      if (attempts >= 60) {
        window.clearInterval(interval);
        return;
      }

      checkWebhook().catch(() => undefined);
    }, 5000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [paymentLinkWebhook?.reference, paymentLinkWebhook?.status]);

  async function postJson(path: string, body: unknown) {
    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      return await response.json();
    } catch (error) {
      setResult({
        tone: "error",
        title: "Payment request failed",
        detail: error instanceof Error ? error.message : "Unexpected error.",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePaymentLink() {
    setPaymentLinkWebhook(null);

    const data = await postJson("/api/checkout-v1/payment-link", {
      market: market.code,
      email,
      phone: customerPhone,
      basket: items,
    });

    if (!data) {
      return;
    }

    if (data.reference) {
      setPaymentLinkWebhook({
        reference: data.reference,
        status: "waiting",
      });
    }

    setResult({
      tone: "success",
      title: "Payment link created",
      detail: data.expiresOn
        ? `Expires ${new Date(data.expiresOn).toLocaleString()}`
        : "Single-use Checkout.com-hosted link.",
      url: data.url,
      paymentLinkId: data.id,
    });
  }

  async function handlePaymentLinkStatus(paymentLinkId: string) {
    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch(
        `/api/checkout-v1/payment-link?id=${encodeURIComponent(paymentLinkId)}`,
      );

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const data = await response.json();

      if (data.status === "Payment Received") {
        goToPaymentComplete({
          id: data.paymentId,
          status: data.status,
          receipt: {
            reference: data.reference,
            amount: data.amount,
            currency: data.currency,
            paymentMethod: "Payment Link",
          },
        });
        return;
      }

      if (data.status === "Active") {
        setResult({
          tone: "info",
          title: "Payment not received yet",
          detail:
            "Checkout.com says this payment link is still active. Complete the external checkout, then try again.",
          url: data.url ?? result?.url,
          paymentLinkId,
        });
        return;
      }

      if (data.status === "Expired") {
        setResult({
          tone: "error",
          title: "Payment link expired",
          detail:
            "Checkout.com says this payment link can no longer accept payment. Generate a new payment link to continue.",
        });
        return;
      }

      setResult({
        tone: "info",
        title: "Payment status unavailable",
        detail: data.status
          ? `Checkout.com returned status: ${data.status}.`
          : "Checkout.com did not return a payment link status.",
        url: data.url ?? result?.url,
        paymentLinkId,
      });
    } catch (error) {
      setResult({
        tone: "error",
        title: "Payment status check failed",
        detail: error instanceof Error ? error.message : "Unexpected error.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleHpp() {
    const data = await postJson("/api/checkout-v1/hpp", {
      market: market.code,
      email,
      phone: customerPhone,
      basket: items,
    });

    if (data?.redirectUrl) {
      window.location.href = data.redirectUrl;
      return;
    }

    setResult({
      tone: "error",
      title: "Hosted page was not created",
      detail: "Checkout.com did not return a redirect URL.",
    });
  }

  async function handleDirectCard(formData: FormData) {
    const cardNumber = String(formData.get("cardNumber") ?? "").replace(
      /\s/g,
      "",
    );
    const expiryMonth = Number(formData.get("expiryMonth"));
    const expiryYear = Number(formData.get("expiryYear"));
    const cvv = String(formData.get("cvv") ?? "").trim();

    if (!luhn(cardNumber)) {
      setResult({
        tone: "error",
        title: "Card validation failed",
        detail: "Card number failed Luhn validation.",
      });
      return;
    }

    if (!isFutureExpiry(expiryMonth, expiryYear)) {
      setResult({
        tone: "error",
        title: "Card validation failed",
        detail: "Expiry date must be in the future.",
      });
      return;
    }

    if (!/^\d{3,4}$/.test(cvv)) {
      setResult({
        tone: "error",
        title: "Card validation failed",
        detail: "CVV must be 3 or 4 digits.",
      });
      return;
    }

    const data = await postJson("/api/payments-v1/direct-card", {
      market: market.code,
      basket: items,
      email,
      phone: customerPhone,
      cardholderName: String(formData.get("cardholderName") ?? "").trim(),
      cardNumber,
      expiryMonth,
      expiryYear,
      cvv,
      require3ds,
    });

    if (data) {
      if (require3ds && data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }

      if (data.approved) {
        goToPaymentComplete(data);
        return;
      }

      setResult({
        tone: data.approved ? "success" : "info",
        title: `Payment ${data.status ?? "submitted"}`,
        detail: [data.id, data.responseCode, data.responseSummary]
          .filter(Boolean)
          .join(" / "),
        url: data.redirectUrl,
      });
    }
  }

  async function handleSavedCard() {
    const data = await postJson("/api/payments-v1/saved-card", {
      market: market.code,
      basket: items,
      phone: customerPhone,
      require3ds,
    });

    if (data) {
      if (require3ds && data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }

      if (data.approved) {
        goToPaymentComplete(data);
        return;
      }

      setResult({
        tone: data.approved ? "success" : "info",
        title: `Saved-card payment ${data.status ?? "submitted"}`,
        detail: [data.id, data.responseCode, data.responseSummary]
          .filter(Boolean)
          .join(" / "),
        url: data.redirectUrl,
      });
    }
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-5 py-10 lg:grid-cols-[1fr_360px]">
      <section>
        <p className="text-sm font-semibold uppercase tracking-wide text-[#8C9E6E]">
          Interview checkout
        </p>
        <h1 className="mt-2 text-4xl font-semibold text-[#323416]">
          Compare four Checkout.com integration modes
        </h1>
        <p className="mt-3 max-w-2xl text-[#323416]/70">
          These are merchant implementation patterns, not consumer payment
          choices. Select one to exercise the corresponding sandbox flow.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {modes.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setMode(item.id);
                setResult(null);
                setPaymentLinkWebhook(null);
              }}
              className={`rounded-lg border p-4 text-left font-semibold ${
                mode === item.id
                  ? "border-[#323416] bg-[#323416] text-white"
                  : "border-[#323416]/10 bg-white text-[#323416]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-6 rounded-lg border border-[#323416]/10 bg-white p-5">
          <label className="grid gap-2 text-sm font-medium text-[#323416]">
            Customer email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11 rounded-md border border-[#323416]/20 px-3"
            />
          </label>
          <div className="mt-4">
            <CustomerPhoneInput
              countryCode={phoneCountryCode}
              phoneNumber={phoneNumber}
              onCountryCodeChange={setPhoneCountryCode}
              onPhoneNumberChange={setPhoneNumber}
            />
          </div>

          {mode === "payment-link" && (
            <div className="mt-5">
              <p className="text-sm leading-6 text-[#323416]/70">
                Generate a one-time Checkout.com-hosted payment request for
                chat, email, or manual collection.
              </p>
              <button
                onClick={handlePaymentLink}
                disabled={isLoading || !basket}
                className="mt-4 h-11 rounded-md bg-[#323416] px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                Generate payment link
              </button>
            </div>
          )}

          {mode === "hpp" && (
            <div className="mt-5">
              <p className="text-sm leading-6 text-[#323416]/70">
                Create a Hosted Payments Page session and redirect the browser
                to Checkout.com.
              </p>
              <button
                onClick={handleHpp}
                disabled={isLoading || !basket}
                className="mt-4 h-11 rounded-md bg-[#323416] px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                Continue to hosted checkout
              </button>
            </div>
          )}

          {mode === "direct-card" && (
            <form action={handleDirectCard} className="mt-5 grid gap-4">
              <p className="text-sm leading-6 text-[#323416]/70">
                Full-card Payments API demo. This intentionally increases PCI
                scope and is included to show the low-level integration path.
              </p>
              <label className="grid gap-2 text-sm font-medium text-[#323416]">
                Cardholder name
                <input
                  name="cardholderName"
                  required
                  defaultValue="Demo Customer"
                  className="h-11 rounded-md border border-[#323416]/20 px-3"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-[#323416]">
                Card number
                <input
                  name="cardNumber"
                  required
                  inputMode="numeric"
                  placeholder="Use a Checkout.com sandbox card"
                  className="h-11 rounded-md border border-[#323416]/20 px-3"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="grid gap-2 text-sm font-medium text-[#323416]">
                  Expiry month
                  <input
                    name="expiryMonth"
                    required
                    inputMode="numeric"
                    placeholder="12"
                    className="h-11 rounded-md border border-[#323416]/20 px-3"
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium text-[#323416]">
                  Expiry year
                  <input
                    name="expiryYear"
                    required
                    inputMode="numeric"
                    placeholder="2030"
                    className="h-11 rounded-md border border-[#323416]/20 px-3"
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium text-[#323416]">
                  CVV
                  <input
                    name="cvv"
                    required
                    inputMode="numeric"
                    placeholder="100"
                    className="h-11 rounded-md border border-[#323416]/20 px-3"
                  />
                </label>
              </div>
              <label className="flex items-start gap-3 rounded-lg border border-[#323416]/10 bg-[#FFFFFD] p-4 text-sm text-[#323416]">
                <input
                  type="checkbox"
                  checked={require3ds}
                  onChange={(event) => setRequire3ds(event.target.checked)}
                  className="mt-1 h-4 w-4 accent-[#323416]"
                />
                <span>
                  <span className="block font-semibold">
                    Require 3DS authentication
                  </span>
                  <span className="mt-1 block text-[#323416]/65">
                    Request Checkout.com 3DS for this payment attempt.
                  </span>
                </span>
              </label>
              <button
                disabled={isLoading || !basket}
                className="h-11 rounded-md bg-[#323416] px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                Pay directly by card
              </button>
            </form>
          )}

          {mode === "saved-card" && (
            <div className="mt-5">
              {savedCard ? (
                <>
                  <div className="rounded-lg border border-[#323416]/10 bg-[#FFFFFD] p-4">
                    <p className="text-sm font-semibold text-[#323416]">
                      {savedCard.scheme ?? "Card"} ending{" "}
                      {savedCard.last4 ?? "----"}
                    </p>
                    <p className="mt-1 text-sm text-[#323416]/65">
                      {savedCard.email
                        ? `Stored in server memory for ${savedCard.email}`
                        : "Stored in server memory for this demo session"}
                    </p>
                  </div>
                  <label className="mt-4 flex items-start gap-3 rounded-lg border border-[#323416]/10 bg-[#FFFFFD] p-4 text-sm text-[#323416]">
                    <input
                      type="checkbox"
                      checked={require3ds}
                      onChange={(event) => setRequire3ds(event.target.checked)}
                      className="mt-1 h-4 w-4 accent-[#323416]"
                    />
                    <span>
                      <span className="block font-semibold">
                        Require 3DS authentication
                      </span>
                      <span className="mt-1 block text-[#323416]/65">
                        Request Checkout.com 3DS for this saved-card payment.
                      </span>
                    </span>
                  </label>
                  <button
                    onClick={handleSavedCard}
                    disabled={isLoading || !basket}
                    className="mt-4 h-11 rounded-md bg-[#323416] px-4 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Pay with saved card
                  </button>
                </>
              ) : (
                <div className="rounded-lg border border-[#323416]/10 bg-[#FFFFFD] p-4">
                  <p className="text-sm leading-6 text-[#323416]/70">
                    Save a card on the profile page before using this checkout
                    mode.
                  </p>
                  <Link
                    href={`/profile?market=${market.code}`}
                    className="mt-4 inline-flex h-11 items-center rounded-md bg-[#8C9E6E] px-4 text-sm font-semibold text-[#323416]"
                  >
                    Go to profile
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        {result && (
          <div
            className={`mt-5 rounded-lg p-5 ${
              result.tone === "error"
                ? "bg-red-50 text-red-700"
                : result.tone === "success"
                  ? "bg-[#8C9E6E]/15 text-[#323416]"
                  : "bg-amber-50 text-amber-800"
            }`}
          >
            <h2 className="font-semibold">{result.title}</h2>
            {result.detail && (
              <p className="mt-2 text-sm leading-6">{result.detail}</p>
            )}
            {result.url && (
              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href={result.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center rounded-md bg-[#323416] px-4 text-sm font-semibold text-white"
                >
                  Open link
                </a>
                <button
                  onClick={() =>
                    navigator.clipboard.writeText(result.url ?? "")
                  }
                  className="h-10 rounded-md border border-[#323416]/20 px-4 text-sm font-semibold text-[#323416]"
                >
                  Copy link
                </button>
                {result.paymentLinkId && (
                  <button
                    onClick={() => {
                      if (result.paymentLinkId) {
                        handlePaymentLinkStatus(result.paymentLinkId);
                      }
                    }}
                    disabled={isLoading}
                    className="h-10 rounded-md border border-[#323416]/20 px-4 text-sm font-semibold text-[#323416] disabled:opacity-60"
                  >
                    I have paid
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {mode === "payment-link" && paymentLinkWebhook && (
          <WebhookStatusPanel
            title="Checkout.com webhook"
            status={paymentLinkWebhook.status}
            referenceLabel="Order reference"
            reference={paymentLinkWebhook.reference}
            event={paymentLinkWebhook.event}
            waitingDetail="Complete the generated payment link. This panel will update when Checkout.com sends the asynchronous payment webhook."
            lastCheckedAt={paymentLinkWebhook.lastCheckedAt}
            checkFailedDetail={
              paymentLinkWebhook.checkFailed
                ? "order activity unavailable"
                : undefined
            }
          />
        )}
      </section>

      <aside className="h-fit rounded-lg border border-[#323416]/10 bg-white p-5">
        <h2 className="text-lg font-semibold text-[#323416]">Order summary</h2>
        <div className="mt-5 space-y-4">
          {basket ? (
            basket.items.map((item) => (
              <div
                key={item.product.id}
                className="flex justify-between gap-4 text-sm text-[#323416]/70"
              >
                <span>
                  {item.product.name} x {item.quantity}
                </span>
                <span>{formatMoney(item.totalAmount, market)}</span>
              </div>
            ))
          ) : (
            <p className="text-sm leading-6 text-[#323416]/70">
              Your basket is empty. Add products before starting a payment demo.
            </p>
          )}
        </div>
        <div className="mt-5 flex justify-between border-t border-[#323416]/10 pt-5 text-lg font-semibold text-[#323416]">
          <span>Total</span>
          <span>{formatMoney(basket?.totalAmount ?? 0, market)}</span>
        </div>
        <p className="mt-4 text-sm text-[#323416]/60">
          Market: {market.label} / {market.currency}
        </p>
      </aside>
    </main>
  );
}
