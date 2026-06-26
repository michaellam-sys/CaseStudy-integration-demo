"use client";

import {
  ComponentName,
  loadCheckoutWebComponents,
  type Component,
  type PaymentSessionResponse,
  type TokenizeResult,
} from "@checkout.com/checkout-web-components";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { getMarket } from "@/lib/catalog";
import { flowAppearance } from "@/lib/flow/appearance";

type Market = ReturnType<typeof getMarket>;

type SavedCard = {
  email: string;
  scheme?: string;
  last4?: string;
  expiryMonth?: number;
  expiryYear?: number;
};

type ApiState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type TokenizationMode = "web-components" | "direct-api";

type TokenizationSessionResponse = {
  paymentSession: PaymentSessionResponse;
  publicKey: string;
};

async function readError(response: Response) {
  const data = await response.json().catch(() => ({}));
  return data.error ?? data.errorCodes?.[0] ?? "Request failed.";
}

function getClientPublicKey() {
  return (
    process.env.NEXT_PUBLIC_CHECKOUT_PUBLIC_KEY ??
    process.env.NEXT_PUBLIC_CKO_PK
  );
}

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function readCardToken(result: TokenizeResult | void) {
  if (
    result?.type !== ComponentName.Card ||
    !result.data.token.startsWith("tok_")
  ) {
    throw new Error("Checkout.com did not return a card token.");
  }

  return result.data.token;
}

function WebComponentsCardTokenizer({
  isSaving,
  market,
  onSaveToken,
  onStateChange,
}: {
  isSaving: boolean;
  market: Market;
  onSaveToken: (
    token: string,
    email: string,
    successMessage: string,
  ) => Promise<void>;
  onStateChange: (state: ApiState) => void;
}) {
  const [email, setEmail] = useState("demo.customer@example.com");
  const [isReady, setIsReady] = useState(false);
  const cardContainerRef = useRef<HTMLDivElement | null>(null);
  const cardComponentRef = useRef<Component | null>(null);

  useEffect(() => {
    const normalizedEmail = email.trim();

    if (!validateEmail(normalizedEmail)) {
      cardComponentRef.current?.unmount();
      cardComponentRef.current = null;
      queueMicrotask(() => setIsReady(false));
      return;
    }

    const publicKey = getClientPublicKey();

    if (!publicKey) {
      onStateChange({
        status: "error",
        message:
          "Missing NEXT_PUBLIC_CHECKOUT_PUBLIC_KEY or NEXT_PUBLIC_CKO_PK in .env.local.",
      });
      return;
    }

    const checkoutPublicKey = publicKey;

    if (!cardContainerRef.current) {
      return;
    }

    let isMounted = true;
    const cardContainer = cardContainerRef.current;

    async function mountCardComponent() {
      setIsReady(false);
      cardComponentRef.current?.unmount();
      cardComponentRef.current = null;

      try {
        const sessionResponse = await fetch(
          "/api/profile/tokenization-session",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              market: market.code,
              customer: {
                email: normalizedEmail,
              },
            }),
          },
        );

        if (!sessionResponse.ok) {
          throw new Error(await readError(sessionResponse));
        }

        const sessionData =
          (await sessionResponse.json()) as TokenizationSessionResponse;
        const checkout = await loadCheckoutWebComponents({
          paymentSession: sessionData.paymentSession,
          publicKey: sessionData.publicKey || checkoutPublicKey,
          environment: "sandbox",
          appearance: flowAppearance,
          componentOptions: {
            data: {
              email: normalizedEmail,
              billingCountry: market.country,
            },
          },
        });
        const card = checkout.create("card", {
          displayCardholderName: "top",
          displayCvv: "mandatory",
          showPayButton: false,
          data: {
            email: normalizedEmail,
          },
        });
        const isAvailable = await card.isAvailable();

        if (!isMounted) {
          return;
        }

        if (!isAvailable) {
          onStateChange({
            status: "error",
            message:
              "Checkout.com card tokenization is unavailable for this session.",
          });
          return;
        }

        card.mount(cardContainer);
        cardComponentRef.current = card;
        setIsReady(true);
      } catch (error) {
        if (isMounted) {
          onStateChange({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unable to mount Checkout.com card tokenization.",
          });
        }
      }
    }

    mountCardComponent();

    return () => {
      isMounted = false;
      cardComponentRef.current?.unmount();
      cardComponentRef.current = null;
      setIsReady(false);
    };
  }, [email, market.code, market.country, onStateChange]);

  async function handleSaveWithWebComponents(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const normalizedEmail = email.trim();

    if (!validateEmail(normalizedEmail)) {
      onStateChange({
        status: "error",
        message: "Enter a valid customer email.",
      });
      return;
    }

    const card = cardComponentRef.current;

    if (!card || !isReady) {
      onStateChange({
        status: "error",
        message: "Checkout.com card tokenization is still loading.",
      });
      return;
    }

    if (!card.isValid()) {
      onStateChange({
        status: "error",
        message: "Complete the card fields before saving.",
      });
      return;
    }

    onStateChange({ status: "loading" });

    try {
      const token = readCardToken(await card.tokenize());
      await onSaveToken(
        token,
        normalizedEmail,
        "Saved card instrument created from Checkout Web Components tokenization.",
      );
    } catch (error) {
      onStateChange({
        status: "error",
        message:
          error instanceof Error ? error.message : "Unable to save card.",
      });
    }
  }

  return (
    <form
      onSubmit={handleSaveWithWebComponents}
      className="mt-5 grid gap-4 rounded-lg border border-[#323416]/10 bg-white p-5"
    >
      <label className="grid gap-2 text-sm font-medium text-[#323416]">
        Email
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-11 rounded-md border border-[#323416]/20 px-3"
        />
      </label>
      <div
        ref={cardContainerRef}
        className="min-h-[260px] rounded-md border border-[#323416]/10 bg-[#FFFFFD] p-4"
      >
        {!isReady && (
          <p className="text-sm text-[#323416]/65">
            Loading Checkout.com card tokenization...
          </p>
        )}
      </div>
      <button
        disabled={isSaving || !isReady}
        className="h-11 rounded-md bg-[#323416] px-4 text-sm font-semibold text-white disabled:opacity-60"
      >
        {isSaving ? "Saving..." : "Tokenize with Web Components and save"}
      </button>
    </form>
  );
}

export function ProfileClient() {
  const searchParams = useSearchParams();
  const market = getMarket(searchParams.get("market"));
  const [savedCard, setSavedCard] = useState<SavedCard | null>(null);
  const [state, setState] = useState<ApiState>({ status: "idle" });
  const [tokenizationMode, setTokenizationMode] =
    useState<TokenizationMode>("web-components");
  const checkoutHref = useMemo(
    () => `/checkout?market=${market.code}`,
    [market.code],
  );

  useEffect(() => {
    fetch("/api/profile/saved-card")
      .then((response) => response.json())
      .then((data) => setSavedCard(data.savedCard));
  }, []);

  async function saveTokenizedCard(
    token: string,
    email: string,
    successMessage: string,
  ) {
    const saveResponse = await fetch("/api/profile/saved-card", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token,
        email,
        market: market.code,
      }),
    });

    if (!saveResponse.ok) {
      throw new Error(await readError(saveResponse));
    }

    const savedData = await saveResponse.json();
    setSavedCard(savedData.savedCard);
    setState({
      status: "success",
      message: successMessage,
    });
  }

  async function handleDirectSaveCard(formData: FormData) {
    setState({ status: "loading" });

    const publicKey = getClientPublicKey();

    if (!publicKey) {
      setState({
        status: "error",
        message:
          "Missing NEXT_PUBLIC_CHECKOUT_PUBLIC_KEY or NEXT_PUBLIC_CKO_PK in .env.local.",
      });
      return;
    }

    const expiryMonth = Number(formData.get("expiryMonth"));
    const expiryYear = Number(formData.get("expiryYear"));
    const email = String(formData.get("email") ?? "").trim();
    const cardholderName = String(formData.get("cardholderName") ?? "").trim();
    const cardNumber = String(formData.get("cardNumber") ?? "").replace(
      /\s/g,
      "",
    );
    const cvv = String(formData.get("cvv") ?? "").trim();

    if (!validateEmail(email)) {
      setState({ status: "error", message: "Enter a valid customer email." });
      return;
    }

    if (!cardholderName || !cardNumber || !expiryMonth || !expiryYear || !cvv) {
      setState({ status: "error", message: "Complete all card fields." });
      return;
    }

    try {
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
          number: cardNumber,
          expiry_month: expiryMonth,
          expiry_year: expiryYear,
          name: cardholderName,
          cvv,
          billing_address: {
            country: market.country,
          },
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error(await readError(tokenResponse));
      }

      const tokenData = await tokenResponse.json();
      await saveTokenizedCard(
        tokenData.token,
        email,
        "Saved card instrument created from direct Tokens API tokenization.",
      );
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Unable to save card.",
      });
    }
  }

  async function handleClearCard() {
    setState({ status: "loading" });
    const response = await fetch("/api/profile/saved-card", {
      method: "DELETE",
    });
    const data = await response.json();
    setSavedCard(data.savedCard);
    setState({ status: "success", message: "Saved card cleared." });
  }

  return (
    <main className="mx-auto grid max-w-5xl gap-8 px-5 py-10 lg:grid-cols-[1fr_360px]">
      <section>
        <p className="text-sm font-semibold uppercase tracking-wide text-[#8C9E6E]">
          Profile onboarding
        </p>
        <h1 className="mt-2 text-4xl font-semibold text-[#323416]">
          Remember a card before checkout
        </h1>
        <p className="mt-3 max-w-2xl text-[#323416]/70">
          This page shows the tokenization step separately: card details go from
          the browser to Checkout.com, and this app stores only the reusable
          instrument reference in server memory.
        </p>

        <div className="mt-8 rounded-lg border border-[#323416]/10 bg-white p-1">
          <div className="grid grid-cols-2 gap-1">
            {[
              {
                id: "web-components" as const,
                label: "Checkout Web Components",
              },
              { id: "direct-api" as const, label: "Direct Tokens API" },
            ].map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => {
                  setTokenizationMode(mode.id);
                  setState({ status: "idle" });
                }}
                className={`h-11 rounded-md px-3 text-sm font-semibold ${
                  tokenizationMode === mode.id
                    ? "bg-[#323416] text-white"
                    : "text-[#323416]"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {tokenizationMode === "web-components" ? (
          <WebComponentsCardTokenizer
            isSaving={state.status === "loading"}
            market={market}
            onSaveToken={saveTokenizedCard}
            onStateChange={setState}
          />
        ) : (
          <form
            action={handleDirectSaveCard}
            className="mt-5 grid gap-4 rounded-lg border border-[#323416]/10 bg-white p-5"
          >
            <label className="grid gap-2 text-sm font-medium text-[#323416]">
              Email
              <input
                name="email"
                type="email"
                required
                defaultValue="demo.customer@example.com"
                className="h-11 rounded-md border border-[#323416]/20 px-3"
              />
            </label>
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
                inputMode="numeric"
                name="cardNumber"
                required
                placeholder="Use a Checkout.com sandbox card"
                className="h-11 rounded-md border border-[#323416]/20 px-3"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="grid gap-2 text-sm font-medium text-[#323416]">
                Expiry month
                <input
                  name="expiryMonth"
                  inputMode="numeric"
                  required
                  placeholder="12"
                  className="h-11 rounded-md border border-[#323416]/20 px-3"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-[#323416]">
                Expiry year
                <input
                  name="expiryYear"
                  inputMode="numeric"
                  required
                  placeholder="2030"
                  className="h-11 rounded-md border border-[#323416]/20 px-3"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-[#323416]">
                CVV
                <input
                  name="cvv"
                  inputMode="numeric"
                  required
                  placeholder="100"
                  className="h-11 rounded-md border border-[#323416]/20 px-3"
                />
              </label>
            </div>
            <button
              disabled={state.status === "loading"}
              className="h-11 rounded-md bg-[#323416] px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {state.status === "loading"
                ? "Saving..."
                : "Tokenize with direct API and save"}
            </button>
          </form>
        )}

        {state.status !== "idle" && (
          <p
            className={`mt-4 rounded-md px-4 py-3 text-sm ${
              state.status === "error"
                ? "bg-red-50 text-red-700"
                : "bg-[#8C9E6E]/15 text-[#323416]"
            }`}
          >
            {state.status === "loading" ? "Working..." : state.message}
          </p>
        )}
      </section>

      <aside className="h-fit rounded-lg border border-[#323416]/10 bg-white p-5">
        <h2 className="text-lg font-semibold text-[#323416]">Saved card</h2>
        {savedCard ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-lg bg-[#323416] p-5 text-white">
              <p className="text-sm uppercase tracking-wide text-white/60">
                {savedCard.scheme ?? "Card"}
              </p>
              <p className="mt-8 text-xl font-semibold">
                **** **** **** {savedCard.last4 ?? "----"}
              </p>
              <p className="mt-3 text-sm text-white/70">
                Expires {savedCard.expiryMonth ?? "--"}/
                {savedCard.expiryYear ?? "----"}
              </p>
            </div>
            <p className="text-sm leading-6 text-[#323416]/70">
              This card can be used from checkout until the server restarts or
              the demo session expires.
            </p>
            <Link
              href={checkoutHref}
              className="flex h-11 items-center justify-center rounded-md bg-[#8C9E6E] px-4 text-sm font-semibold text-[#323416]"
            >
              Use in checkout
            </Link>
            <button
              onClick={handleClearCard}
              className="h-11 w-full rounded-md border border-[#323416]/20 px-4 text-sm font-semibold text-[#323416]"
            >
              Clear saved card
            </button>
          </div>
        ) : (
          <p className="mt-4 text-sm leading-6 text-[#323416]/70">
            No card is saved for this demo session yet.
          </p>
        )}
      </aside>
    </main>
  );
}
