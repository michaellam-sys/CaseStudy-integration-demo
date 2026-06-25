"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  calculateBasket,
  formatMoney,
  getMarket,
  markets,
  type LocaleCode,
} from "@/lib/catalog";
import { getLocale, getMessages, languageOptions } from "@/lib/i18n";
import { markBasketForClearing, useBasket } from "@/components/use-basket";

type Mode =
  | "payment-link"
  | "hpp"
  | "direct-card"
  | "tokenized-3ds"
  | "saved-card";

type SavedCard = {
  email: string;
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

type Receipt = {
  transactionDate?: string;
  reference?: string;
  amount?: number;
  currency?: string;
  paymentMethod?: string;
  cardSummary?: string;
};

type CustomerDetails = {
  firstName: string;
  lastName: string;
  email: string;
  cardholderName: string;
};

const defaultCustomer: CustomerDetails = {
  firstName: "Demo",
  lastName: "Customer",
  email: "demo.customer@example.com",
  cardholderName: "Demo Customer",
};

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

export function CheckoutV2Client() {
  const searchParams = useSearchParams();
  const market = getMarket(searchParams.get("market"));
  const initialLocale = getLocale(searchParams.get("locale"), market);
  const { items } = useBasket();
  const basket = useMemo(
    () => (items.length ? calculateBasket(market.code, items) : null),
    [items, market.code],
  );
  const [locale, setLocale] = useState<LocaleCode>(initialLocale);
  const copy = getMessages(locale);
  const initialMode =
    searchParams.get("mode") === "saved-card" ? "saved-card" : "payment-link";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [customer, setCustomer] = useState<CustomerDetails>(defaultCustomer);
  const [savedCard, setSavedCard] = useState<SavedCard | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("caseco_locale");
    const nextLocale = getLocale(searchParams.get("locale") ?? stored, market);
    queueMicrotask(() => setLocale(nextLocale));
  }, [market, searchParams]);

  useEffect(() => {
    fetch("/api/profile/saved-card")
      .then((response) => response.json())
      .then((data) => setSavedCard(data.savedCard));
  }, []);

  function updateCustomer(field: keyof CustomerDetails, value: string) {
    setCustomer((current) => {
      const next = { ...current, [field]: value };

      if (field === "firstName" || field === "lastName") {
        const combined = `${next.firstName} ${next.lastName}`.trim();
        if (
          current.cardholderName ===
            `${current.firstName} ${current.lastName}`.trim() ||
          !current.cardholderName
        ) {
          next.cardholderName = combined;
        }
      }

      return next;
    });
  }

  function validateCustomer() {
    const fields = [
      customer.firstName,
      customer.lastName,
      customer.email,
      customer.cardholderName,
    ];

    if (fields.some((field) => !field.trim())) {
      setResult({
        tone: "error",
        title: copy.validationFailed,
        detail: "Complete customer name, email, and cardholder name.",
      });
      return false;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())) {
      setResult({
        tone: "error",
        title: copy.validationFailed,
        detail: "Enter a valid email address.",
      });
      return false;
    }

    return true;
  }

  async function postJson(path: string, body: unknown) {
    if (!validateCustomer()) {
      return null;
    }

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
        title: copy.paymentFailed,
        detail: error instanceof Error ? error.message : "Unexpected error.",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }

  function requestBody(extra: Record<string, unknown> = {}) {
    return {
      market: market.code,
      basket: items,
      customer: {
        ...customer,
        email: customer.email.trim(),
        firstName: customer.firstName.trim(),
        lastName: customer.lastName.trim(),
        cardholderName: customer.cardholderName.trim(),
      },
      ...extra,
    };
  }

  async function handlePaymentLink() {
    const data = await postJson(
      "/api/checkout-v2/payment-link",
      requestBody(),
    );

    if (!data) {
      return;
    }

    setResult({
      tone: "success",
      title: copy.linkCreated,
      detail: data.expiresOn
        ? `Expires ${new Date(data.expiresOn).toLocaleString(locale)}`
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
        `/api/checkout-v2/payment-link?id=${encodeURIComponent(paymentLinkId)}`,
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

      setResult({
        tone: "info",
        title: data.status ?? copy.paymentPending,
        detail: "Complete the external checkout, then check again.",
        url: data.url ?? result?.url,
        paymentLinkId,
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

  async function handleHpp() {
    const data = await postJson("/api/checkout-v2/hpp", requestBody());

    if (data?.redirectUrl) {
      window.location.href = data.redirectUrl;
      return;
    }

    setResult({
      tone: "error",
      title: copy.paymentFailed,
      detail: "Checkout.com did not return a redirect URL.",
    });
  }

  function validateCard(formData: FormData) {
    const cardNumber = String(formData.get("cardNumber") ?? "").replace(
      /\s/g,
      "",
    );
    const expiryMonth = Number(formData.get("expiryMonth"));
    const expiryYear = Number(formData.get("expiryYear"));
    const cvv = String(formData.get("cvv") ?? "").trim();

    if (!luhn(cardNumber)) {
      throw new Error("Card number failed Luhn validation.");
    }

    if (!isFutureExpiry(expiryMonth, expiryYear)) {
      throw new Error("Expiry date must be in the future.");
    }

    if (!/^\d{3,4}$/.test(cvv)) {
      throw new Error("CVV must be 3 or 4 digits.");
    }

    return { cardNumber, expiryMonth, expiryYear, cvv };
  }

  async function handleDirectCard(formData: FormData) {
    let card;

    try {
      card = validateCard(formData);
    } catch (error) {
      setResult({
        tone: "error",
        title: copy.validationFailed,
        detail: error instanceof Error ? error.message : "Invalid card.",
      });
      return;
    }

    const data = await postJson(
      "/api/payments/direct-card",
      requestBody({
        cardNumber: card.cardNumber,
        expiryMonth: card.expiryMonth,
        expiryYear: card.expiryYear,
        cvv: card.cvv,
      }),
    );

    if (data?.approved) {
      goToPaymentComplete(data);
      return;
    }

    if (data) {
      setResult({
        tone: "info",
        title: data.status ?? copy.paymentPending,
        detail: [data.id, data.responseCode, data.responseSummary]
          .filter(Boolean)
          .join(" / "),
        url: data.redirectUrl,
      });
    }
  }

  async function tokenizeCard(formData: FormData) {
    const publicKey =
      process.env.NEXT_PUBLIC_CHECKOUT_PUBLIC_KEY ??
      process.env.NEXT_PUBLIC_CKO_PK;

    if (!publicKey) {
      throw new Error("Missing public Checkout.com key.");
    }

    const card = validateCard(formData);
    const configResponse = await fetch("/api/checkout/config");

    if (!configResponse.ok) {
      throw new Error(await readError(configResponse));
    }

    const config = await configResponse.json();
    const tokenResponse = await fetch(`${config.apiBaseUrl}/tokens`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${publicKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "card",
        number: card.cardNumber,
        expiry_month: card.expiryMonth,
        expiry_year: card.expiryYear,
        name: customer.cardholderName.trim(),
        cvv: card.cvv,
        billing_address: {
          country: market.country,
        },
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(await readError(tokenResponse));
    }

    const tokenData = await tokenResponse.json();
    return tokenData.token as string;
  }

  async function handleTokenized3ds(formData: FormData) {
    if (!validateCustomer()) {
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const token = await tokenizeCard(formData);
      const response = await fetch("/api/payments/tokenized", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody({ token })),
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const data = await response.json();

      if (data.nextActionUrl) {
        window.location.href = data.nextActionUrl;
        return;
      }

      if (data.approved) {
        goToPaymentComplete(data);
        return;
      }

      setResult({
        tone: "info",
        title: data.status ?? copy.paymentPending,
        detail: [data.id, data.responseCode, data.responseSummary]
          .filter(Boolean)
          .join(" / "),
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

  async function handleSavedCard() {
    const data = await postJson("/api/payments/saved-card", {
      market: market.code,
      basket: items,
    });

    if (data?.approved) {
      goToPaymentComplete(data);
      return;
    }

    if (data) {
      setResult({
        tone: "info",
        title: data.status ?? copy.paymentPending,
        detail: [data.id, data.responseCode, data.responseSummary]
          .filter(Boolean)
          .join(" / "),
        url: data.redirectUrl,
      });
    }
  }

  const modes: { id: Mode; label: string }[] = [
    { id: "payment-link", label: copy.paymentLink },
    { id: "hpp", label: copy.hpp },
    { id: "direct-card", label: copy.directCard },
    { id: "tokenized-3ds", label: copy.tokenized3ds },
    { id: "saved-card", label: copy.savedCard },
  ];

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
                window.location.href = `/checkout-v2?market=${event.target.value}&locale=${locale}`;
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

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {modes.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setMode(item.id);
                setResult(null);
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
          <h2 className="text-lg font-semibold text-[#323416]">
            {copy.customerDetails}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-[#323416]">
              {copy.firstName}
              <input
                value={customer.firstName}
                onChange={(event) =>
                  updateCustomer("firstName", event.target.value)
                }
                className="h-11 rounded-md border border-[#323416]/20 px-3"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-[#323416]">
              {copy.lastName}
              <input
                value={customer.lastName}
                onChange={(event) =>
                  updateCustomer("lastName", event.target.value)
                }
                className="h-11 rounded-md border border-[#323416]/20 px-3"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-[#323416]">
              {copy.email}
              <input
                type="email"
                value={customer.email}
                onChange={(event) => updateCustomer("email", event.target.value)}
                className="h-11 rounded-md border border-[#323416]/20 px-3"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-[#323416]">
              {copy.billingCountry}
              <input
                value={market.country}
                readOnly
                className="h-11 rounded-md border border-[#323416]/20 bg-[#FFFFFD] px-3"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-[#323416] sm:col-span-2">
              {copy.cardholderName}
              <input
                value={customer.cardholderName}
                onChange={(event) =>
                  updateCustomer("cardholderName", event.target.value)
                }
                className="h-11 rounded-md border border-[#323416]/20 px-3"
              />
            </label>
          </div>

          {mode === "payment-link" && (
            <button
              onClick={handlePaymentLink}
              disabled={isLoading || !basket}
              className="mt-5 h-11 rounded-md bg-[#323416] px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isLoading ? copy.working : copy.generatePaymentLink}
            </button>
          )}

          {mode === "hpp" && (
            <button
              onClick={handleHpp}
              disabled={isLoading || !basket}
              className="mt-5 h-11 rounded-md bg-[#323416] px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isLoading ? copy.working : copy.continueToHpp}
            </button>
          )}

          {(mode === "direct-card" || mode === "tokenized-3ds") && (
            <form
              action={
                mode === "direct-card" ? handleDirectCard : handleTokenized3ds
              }
              className="mt-5 grid gap-4"
            >
              <label className="grid gap-2 text-sm font-medium text-[#323416]">
                {copy.cardNumber}
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
                  {copy.expiryMonth}
                  <input
                    name="expiryMonth"
                    required
                    inputMode="numeric"
                    placeholder="12"
                    className="h-11 rounded-md border border-[#323416]/20 px-3"
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium text-[#323416]">
                  {copy.expiryYear}
                  <input
                    name="expiryYear"
                    required
                    inputMode="numeric"
                    placeholder="2030"
                    className="h-11 rounded-md border border-[#323416]/20 px-3"
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium text-[#323416]">
                  {copy.cvv}
                  <input
                    name="cvv"
                    required
                    inputMode="numeric"
                    placeholder="100"
                    className="h-11 rounded-md border border-[#323416]/20 px-3"
                  />
                </label>
              </div>
              <button
                disabled={isLoading || !basket}
                className="h-11 rounded-md bg-[#323416] px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                {isLoading
                  ? copy.working
                  : mode === "direct-card"
                    ? copy.payDirect
                    : copy.payTokenized}
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
                      {savedCard.email}
                    </p>
                  </div>
                  <button
                    onClick={handleSavedCard}
                    disabled={isLoading || !basket}
                    className="mt-4 h-11 rounded-md bg-[#323416] px-4 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {isLoading ? copy.working : copy.paySaved}
                  </button>
                </>
              ) : (
                <div className="rounded-lg border border-[#323416]/10 bg-[#FFFFFD] p-4">
                  <p className="text-sm leading-6 text-[#323416]/70">
                    {copy.noSavedCard}
                  </p>
                  <Link
                    href={`/profile?market=${market.code}`}
                    className="mt-4 inline-flex h-11 items-center rounded-md bg-[#8C9E6E] px-4 text-sm font-semibold text-[#323416]"
                  >
                    {copy.goToProfile}
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
                  {copy.openLink}
                </a>
                <button
                  onClick={() => navigator.clipboard.writeText(result.url ?? "")}
                  className="h-10 rounded-md border border-[#323416]/20 px-4 text-sm font-semibold text-[#323416]"
                >
                  {copy.copyLink}
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
                    {copy.paid}
                  </button>
                )}
              </div>
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
                className="flex justify-between gap-4 text-sm text-[#323416]/70"
              >
                <span>
                  {item.product.name} x {item.quantity}
                </span>
                <span>{formatMoney(item.totalAmount, market, locale)}</span>
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
