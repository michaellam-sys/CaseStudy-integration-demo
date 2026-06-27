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
  email?: string;
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

type TokenizationSessionState = TokenizationSessionResponse;

const tokenizationModes: { id: TokenizationMode; label: string }[] = [
  { id: "web-components", label: "Flow component" },
  { id: "direct-api", label: "Direct Tokens API" },
];

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
    email: string | undefined,
    successMessage: string,
  ) => Promise<void>;
  onStateChange: (state: ApiState) => void;
}) {
  const [tokenizationSession, setTokenizationSession] =
    useState<TokenizationSessionState | null>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const cardContainerRef = useRef<HTMLDivElement | null>(null);
  const cardComponentRef = useRef<Component | null>(null);

  useEffect(() => {
    if (!tokenizationSession || !cardContainerRef.current) {
      return;
    }

    let isMounted = true;
    const cardContainer = cardContainerRef.current;
    const activeSession = tokenizationSession;

    async function mountCardComponent() {
      setIsReady(false);
      cardComponentRef.current?.unmount();
      cardComponentRef.current = null;

      try {
        const checkout = await loadCheckoutWebComponents({
          paymentSession: activeSession.paymentSession,
          publicKey: activeSession.publicKey,
          environment: "sandbox",
          appearance: flowAppearance,
          componentOptions: {
            data: {
              billingCountry: market.country,
            },
          },
        });
        const card = checkout.create("card", {
          displayCardholderName: "top",
          displayCvv: "mandatory",
          showPayButton: false,
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
  }, [market.country, onStateChange, tokenizationSession]);

  function clearTokenizationSession() {
    cardComponentRef.current?.unmount();
    cardComponentRef.current = null;
    setTokenizationSession(null);
    setIsReady(false);
  }

  async function handleStartVerification() {
    const publicKey = getClientPublicKey();

    if (!publicKey) {
      clearTokenizationSession();
      onStateChange({
        status: "error",
        message:
          "Missing NEXT_PUBLIC_CHECKOUT_PUBLIC_KEY or NEXT_PUBLIC_CKO_PK in .env.local.",
      });
      return;
    }

    setIsCreatingSession(true);
    clearTokenizationSession();
    onStateChange({ status: "loading" });

    try {
      const sessionResponse = await fetch("/api/profile/tokenization-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          market: market.code,
        }),
      });

      if (!sessionResponse.ok) {
        throw new Error(await readError(sessionResponse));
      }

      const sessionData =
        (await sessionResponse.json()) as TokenizationSessionResponse;

      setTokenizationSession({
        paymentSession: sessionData.paymentSession,
        publicKey: sessionData.publicKey || publicKey,
      });
      onStateChange({ status: "idle" });
    } catch (error) {
      onStateChange({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to create Checkout.com card verification session.",
      });
    } finally {
      setIsCreatingSession(false);
    }
  }

  async function handleSaveWithWebComponents(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const card = cardComponentRef.current;
    const activeSession = tokenizationSession;

    if (!card || !isReady || !activeSession) {
      onStateChange({
        status: "error",
        message: "Start card verification before saving.",
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
        undefined,
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
      <button
        type="button"
        onClick={handleStartVerification}
        disabled={isSaving || isCreatingSession}
        className="h-11 rounded-md border border-[#323416]/20 px-4 text-sm font-semibold text-[#323416] disabled:opacity-60"
      >
        {isCreatingSession
          ? "Starting verification..."
          : "Start card verification"}
      </button>
      <div
        ref={cardContainerRef}
        className="min-h-[260px] rounded-md border border-[#323416]/10 bg-[#FFFFFD] p-4"
      >
        {!tokenizationSession && !isCreatingSession && (
          <p className="text-sm text-[#323416]/65">
            Start card verification to load Checkout.com card fields.
          </p>
        )}
        {isCreatingSession && (
          <p className="text-sm text-[#323416]/65">
            Creating Checkout.com card verification session...
          </p>
        )}
        {tokenizationSession && !isReady && (
          <p className="text-sm text-[#323416]/65">
            Loading Checkout.com card tokenization...
          </p>
        )}
      </div>
      <button
        disabled={isSaving || isCreatingSession || !isReady}
        className="h-11 rounded-md bg-[#323416] px-4 text-sm font-semibold text-white disabled:opacity-60"
      >
        {isCreatingSession
          ? "Starting verification..."
          : isSaving
            ? "Saving..."
            : "Tokenize with Web Components and save"}
      </button>
    </form>
  );
}

function TokenizationModeTabs({
  selectedMode,
  onSelectMode,
}: {
  selectedMode: TokenizationMode;
  onSelectMode: (mode: TokenizationMode) => void;
}) {
  return (
    <div className="mt-8 rounded-lg border border-[#323416]/10 bg-white p-1">
      <div className="grid grid-cols-2 gap-1">
        {tokenizationModes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            onClick={() => onSelectMode(mode.id)}
            className={`h-11 rounded-md px-3 text-sm font-semibold ${
              selectedMode === mode.id
                ? "bg-[#323416] text-white"
                : "text-[#323416]"
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function DirectTokensApiForm({
  isSaving,
  onSaveCard,
}: {
  isSaving: boolean;
  onSaveCard: (formData: FormData) => void;
}) {
  return (
    <form
      action={onSaveCard}
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
        disabled={isSaving}
        className="h-11 rounded-md bg-[#323416] px-4 text-sm font-semibold text-white disabled:opacity-60"
      >
        {isSaving ? "Saving..." : "Tokenize with direct API and save"}
      </button>
    </form>
  );
}

function StatusMessage({ state }: { state: ApiState }) {
  if (state.status === "idle") {
    return null;
  }

  return (
    <p
      className={`mt-4 rounded-md px-4 py-3 text-sm ${
        state.status === "error"
          ? "bg-red-50 text-red-700"
          : "bg-[#8C9E6E]/15 text-[#323416]"
      }`}
    >
      {state.status === "loading" ? "Working..." : state.message}
    </p>
  );
}

function SavedCardPanel({
  savedCard,
  checkoutHref,
  onClearCard,
}: {
  savedCard: SavedCard | null;
  checkoutHref: string;
  onClearCard: () => void;
}) {
  return (
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
            {savedCard.email
              ? `This card can be used from checkout until the server restarts or the demo session expires. Stored for ${savedCard.email}.`
              : "This card can be used from checkout until the server restarts or the demo session expires."}
          </p>
          <Link
            href={checkoutHref}
            className="flex h-11 items-center justify-center rounded-md bg-[#8C9E6E] px-4 text-sm font-semibold text-[#323416]"
          >
            Use in checkout
          </Link>
          <button
            onClick={onClearCard}
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
    email: string | undefined,
    successMessage: string,
  ) {
    const saveResponse = await fetch("/api/profile/saved-card", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token,
        ...(email ? { email } : {}),
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
          This page compares two in-memory saved-card paths. Card details go
          from the browser to Checkout.com; this app keeps only safe references
          in the demo session.
        </p>

        <TokenizationModeTabs
          selectedMode={tokenizationMode}
          onSelectMode={(mode) => {
            setTokenizationMode(mode);
            setState({ status: "idle" });
          }}
        />

        {tokenizationMode === "web-components" && (
          <WebComponentsCardTokenizer
            key={market.code}
            isSaving={state.status === "loading"}
            market={market}
            onSaveToken={saveTokenizedCard}
            onStateChange={setState}
          />
        )}

        {tokenizationMode === "direct-api" && (
          <DirectTokensApiForm
            isSaving={state.status === "loading"}
            onSaveCard={handleDirectSaveCard}
          />
        )}

        <StatusMessage state={state} />
      </section>

      <SavedCardPanel
        savedCard={savedCard}
        checkoutHref={checkoutHref}
        onClearCard={handleClearCard}
      />
    </main>
  );
}
