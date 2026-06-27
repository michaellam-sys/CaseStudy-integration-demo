"use client";

import {
  loadCheckoutWebComponents,
  type Component,
  type PaymentSessionResponse,
} from "@checkout.com/checkout-web-components";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  calculateBasket,
  formatMoney,
  getMarket,
  markets,
  type LocaleCode,
} from "@/lib/catalog";
import {
  defaultCustomerPhone,
  normalizeCustomerPhone,
  toCheckoutComponentPhoneData,
  type CustomerPhone,
} from "@/lib/customer-phone";
import { flowAppearance } from "@/lib/flow/appearance";
import { flowTranslations } from "@/lib/flow/translations";
import { getLocale, getMessages, languageOptions } from "@/lib/i18n";
import { CustomerPhoneInput } from "@/components/customer-phone-input";
import { markBasketForClearing, useBasket } from "@/components/use-basket";

type FlowSessionState = {
  paymentSession: PaymentSessionResponse;
  publicKey: string;
  reference: string;
  amount: number;
  currency: string;
  locale: string;
  customerEmail: string;
  customerPhone: CustomerPhone;
};

type Result = {
  tone: "success" | "error" | "info";
  title: string;
  detail?: string;
};

async function readError(response: Response) {
  const data = await response.json().catch(() => ({}));
  return data.errorCodes?.[0] ?? data.error ?? "Request failed.";
}

function paymentCompleteUrl(input: {
  paymentId: string;
  status?: string;
  responseSummary?: string;
  cardSummary?: string;
  reference: string;
  amount: number;
  currency: string;
}) {
  const params = new URLSearchParams({
    paymentId: input.paymentId,
    status: input.status ?? "Pending",
    reference: input.reference,
    amount: String(input.amount),
    currency: input.currency,
    paymentMethod: "Checkout.com Flow",
    transactionDate: new Date().toISOString(),
  });

  if (input.responseSummary) {
    params.set("responseSummary", input.responseSummary);
  }

  if (input.cardSummary) {
    params.set("cardSummary", input.cardSummary);
  }

  return `/payment-complete?${params.toString()}`;
}

export function CheckoutFlowClient() {
  const searchParams = useSearchParams();
  const market = getMarket(searchParams.get("market"));
  const initialLocale = getLocale(searchParams.get("locale"), market);
  const { items, setQuantity, removeProduct } = useBasket();
  const basket = useMemo(
    () => (items.length ? calculateBasket(market.code, items) : null),
    [items, market.code],
  );
  const [locale, setLocale] = useState<LocaleCode>(initialLocale);
  const [customerEmail, setCustomerEmail] = useState(
    "demo.customer@example.com",
  );
  const [phoneCountryCode, setPhoneCountryCode] = useState(
    defaultCustomerPhone(market.country).countryCode,
  );
  const [phoneNumber, setPhoneNumber] = useState(
    defaultCustomerPhone(market.country).number,
  );
  const [flowSession, setFlowSession] = useState<FlowSessionState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const flowContainerRef = useRef<HTMLDivElement | null>(null);
  const flowComponentRef = useRef<Component | null>(null);
  const copy = getMessages(locale);

  useEffect(() => {
    const stored = window.localStorage.getItem("caseco_locale");
    const nextLocale = getLocale(searchParams.get("locale") ?? stored, market);
    queueMicrotask(() => setLocale(nextLocale));
  }, [market, searchParams]);

  useEffect(() => {
    queueMicrotask(() => {
      setFlowSession(null);
      setResult(null);
    });
  }, [items, market.code, locale, customerEmail, phoneCountryCode, phoneNumber]);

  useEffect(() => {
    if (!flowSession || !flowContainerRef.current) {
      return;
    }

    let isMounted = true;
    const activeFlowSession = flowSession;
    const flowContainer = flowContainerRef.current;
    const phoneData = toCheckoutComponentPhoneData(
      activeFlowSession.customerPhone,
    );

    async function mountFlow() {
      flowComponentRef.current?.unmount();
      flowComponentRef.current = null;

      try {
        const checkout = await loadCheckoutWebComponents({
          paymentSession: activeFlowSession.paymentSession,
          publicKey: activeFlowSession.publicKey,
          environment: "sandbox",
          locale: activeFlowSession.locale,
          appearance: flowAppearance,
          translations: flowTranslations,
          componentOptions: {
            data: {
              email: activeFlowSession.customerEmail,
              ...phoneData,
              billingCountry: market.country,
            },
            card: {
              displayCardholderName: "top",
              displayCvv: "mandatory",
              data: {
                email: activeFlowSession.customerEmail,
                ...phoneData,
              },
            },
            remember_me: {
              data: {
                email: activeFlowSession.customerEmail,
                ...phoneData,
              },
            },
          },
          onPaymentCompleted: async (_component, payment) => {
            setResult({
              tone: "info",
              title: copy.paymentPending,
              detail: copy.flowConfirming,
            });

            const response = await fetch("/api/flow/confirm", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                reference: activeFlowSession.reference,
                paymentId: payment.id,
              }),
            });

            if (!response.ok) {
              throw new Error(await readError(response));
            }

            const status = await response.json();
            markBasketForClearing();
            window.location.href = paymentCompleteUrl({
              paymentId: payment.id,
              status: status.status,
              responseSummary: status.responseSummary,
              cardSummary: status.cardSummary,
              reference: activeFlowSession.reference,
              amount: activeFlowSession.amount,
              currency: activeFlowSession.currency,
            });
          },
          onError: (_component, error) => {
            setResult({
              tone: "error",
              title: copy.paymentFailed,
              detail:
                error instanceof Error
                  ? error.message
                  : "Checkout.com Flow returned an error.",
            });
          },
        });
        const flow = checkout.create("flow");
        const isAvailable = await flow.isAvailable();

        if (!isMounted) {
          return;
        }

        if (!isAvailable) {
          setResult({
            tone: "error",
            title: copy.paymentFailed,
            detail: copy.flowUnavailable,
          });
          return;
        }

        flow.mount(flowContainer);
        flowComponentRef.current = flow;
      } catch (error) {
        if (isMounted) {
          setResult({
            tone: "error",
            title: copy.paymentFailed,
            detail:
              error instanceof Error ? error.message : "Unable to mount Flow.",
          });
        }
      }
    }

    mountFlow();

    return () => {
      isMounted = false;
      flowComponentRef.current?.unmount();
      flowComponentRef.current = null;
    };
  }, [copy, flowSession, market.country]);

  async function createFlowSession() {
    if (!basket) {
      return;
    }

    const normalizedEmail = customerEmail.trim();
    let normalizedPhone: CustomerPhone;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setResult({
        tone: "error",
        title: copy.validationFailed,
        detail: copy.emailInvalid,
      });
      return;
    }

    try {
      normalizedPhone = normalizeCustomerPhone({
        countryCode: phoneCountryCode,
        number: phoneNumber,
      });
    } catch {
      setResult({
        tone: "error",
        title: copy.validationFailed,
        detail: copy.phoneInvalid,
      });
      return;
    }

    setIsLoading(true);
    setResult(null);
    setFlowSession(null);

    try {
      const response = await fetch("/api/flow/payment-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          market: market.code,
          basket: items,
          locale,
          customer: {
            email: normalizedEmail,
            phone: normalizedPhone,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const data = await response.json();
      setFlowSession({
        paymentSession: data.paymentSession,
        publicKey: data.publicKey,
        reference: data.reference,
        amount: data.amount,
        currency: data.currency,
        locale: data.locale,
        customerEmail: normalizedEmail,
        customerPhone: normalizedPhone,
      });
      setResult({
        tone: "info",
        title: copy.flowReady,
        detail: data.hasStoredFlowCustomer
          ? copy.storedCardReady
          : copy.flowReadyDetail,
      });
    } catch (error) {
      setResult({
        tone: "error",
        title: copy.paymentFailed,
        detail: error instanceof Error ? error.message : "Unexpected error.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-5 py-10 lg:grid-cols-[1fr_360px]">
      <section>
        <p className="text-sm font-semibold uppercase tracking-wide text-[#8C9E6E]">
          {copy.checkoutEyebrow}
        </p>
        <h1 className="mt-2 text-4xl font-semibold text-[#323416]">
          {copy.checkoutTitle}
        </h1>
        <p className="mt-3 max-w-2xl text-[#323416]/70">
          {copy.checkoutIntro}
        </p>

        <div className="mt-6 grid gap-4 rounded-lg border border-[#323416]/10 bg-white p-5 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium text-[#323416]">
            {copy.market}
            <select
              value={market.code}
              onChange={(event) => {
                window.location.href = `/checkout-flow?market=${event.target.value}&locale=${locale}`;
              }}
              className="h-11 rounded-md border border-[#323416]/20 px-3"
            >
              {Object.values(markets).map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label} / {item.currency}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium text-[#323416]">
            {copy.language}
            <select
              value={locale}
              onChange={(event) => {
                const nextLocale = event.target.value as LocaleCode;
                window.localStorage.setItem("caseco_locale", nextLocale);
                setLocale(nextLocale);
              }}
              className="h-11 rounded-md border border-[#323416]/20 px-3"
            >
              {languageOptions.map((item) => (
                <option key={item.locale} value={item.locale}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-6 rounded-lg border border-[#323416]/10 bg-white p-5">
          <label className="grid gap-2 text-sm font-medium text-[#323416]">
            {copy.customerEmail}
            <input
              type="email"
              value={customerEmail}
              onChange={(event) => setCustomerEmail(event.target.value)}
              className="h-11 rounded-md border border-[#323416]/20 px-3"
            />
          </label>
          <p className="mt-2 text-sm leading-6 text-[#323416]/65">
            {copy.customerEmailHelp}
          </p>
          <div className="mt-4">
            <CustomerPhoneInput
              countryCode={phoneCountryCode}
              phoneNumber={phoneNumber}
              onCountryCodeChange={setPhoneCountryCode}
              onPhoneNumberChange={setPhoneNumber}
              countryCodeLabel={copy.phoneCountryCode}
              phoneNumberLabel={copy.phoneNumber}
            />
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-[#323416]/10 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[#323416]">
                {copy.flowPayment}
              </h2>
              <p className="mt-1 text-sm text-[#323416]/65">
                {copy.flowIntro}
              </p>
            </div>
            <button
              onClick={createFlowSession}
              disabled={isLoading || !basket}
              className="h-11 rounded-md bg-[#323416] px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isLoading ? copy.working : copy.startFlowPayment}
            </button>
          </div>

          <div
            ref={flowContainerRef}
            className="mt-5 min-h-[220px] rounded-md border border-[#323416]/10 bg-[#FFFFFD] p-4"
          >
            {!flowSession && (
              <p className="text-sm text-[#323416]/65">
                {basket ? copy.flowPlaceholder : copy.emptyBasket}
              </p>
            )}
          </div>
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
          </div>
        )}
      </section>

      <aside className="h-fit rounded-lg border border-[#323416]/10 bg-white p-5">
        <h2 className="text-lg font-semibold text-[#323416]">
          {copy.orderSummary}
        </h2>
        <div className="mt-5 space-y-4">
          {basket ? (
            basket.items.map((item) => (
              <div
                key={item.product.id}
                className="rounded-md bg-[#FFFFFD] p-3 text-sm text-[#323416]/70"
              >
                <div className="flex justify-between gap-4">
                  <span className="font-medium text-[#323416]">
                    {item.product.name}
                  </span>
                  <span>{formatMoney(item.totalAmount, market, locale)}</span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() =>
                      setQuantity(item.product.id, item.quantity - 1)
                    }
                    className="h-8 w-8 rounded-md border border-[#323416]/20 text-[#323416]"
                    aria-label={`Decrease ${item.product.name}`}
                  >
                    -
                  </button>
                  <span className="min-w-8 text-center font-semibold text-[#323416]">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() =>
                      setQuantity(item.product.id, item.quantity + 1)
                    }
                    className="h-8 w-8 rounded-md border border-[#323416]/20 text-[#323416]"
                    aria-label={`Increase ${item.product.name}`}
                  >
                    +
                  </button>
                  <button
                    onClick={() => removeProduct(item.product.id)}
                    className="ml-auto h-8 rounded-md border border-[#323416]/20 px-3 text-xs font-semibold text-[#323416]"
                  >
                    {copy.remove}
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm leading-6 text-[#323416]/70">
              {copy.emptyBasket}
            </p>
          )}
        </div>
        <div className="mt-5 flex justify-between border-t border-[#323416]/10 pt-5 text-lg font-semibold text-[#323416]">
          <span>{copy.total}</span>
          <span>{formatMoney(basket?.totalAmount ?? 0, market, locale)}</span>
        </div>
        <p className="mt-4 text-sm text-[#323416]/60">
          {market.label} / {market.currency}
        </p>
      </aside>
    </main>
  );
}
