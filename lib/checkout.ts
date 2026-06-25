import { randomUUID } from "crypto";

type CheckoutErrorBody = {
  request_id?: string;
  error_type?: string;
  error_codes?: string[];
  [key: string]: unknown;
};

export class CheckoutApiError extends Error {
  status: number;
  requestId?: string;
  errorType?: string;
  errorCodes: string[];

  constructor(status: number, body: CheckoutErrorBody) {
    const errorCodes = Array.isArray(body.error_codes) ? body.error_codes : [];
    super(errorCodes[0] ?? body.error_type ?? `Checkout.com error ${status}`);
    this.status = status;
    this.requestId = body.request_id;
    this.errorType = body.error_type;
    this.errorCodes = errorCodes;
  }
}

export function getServerCheckoutConfig() {
  const secretKey = process.env.CHECKOUT_SECRET_KEY ?? process.env.CKO_SK;
  const processingChannelId =
    process.env.CHECKOUT_PROCESSING_CHANNEL_ID ??
    process.env.PROCESSING_CHANNEL_ID;

  if (!secretKey) {
    throw new Error("Missing CHECKOUT_SECRET_KEY or CKO_SK in .env.local");
  }

  if (!processingChannelId) {
    throw new Error(
      "Missing CHECKOUT_PROCESSING_CHANNEL_ID or PROCESSING_CHANNEL_ID in .env.local",
    );
  }

  return {
    secretKey,
    processingChannelId,
    apiBaseUrl: getCheckoutApiBaseUrl(secretKey),
  };
}

export function getPublicCheckoutConfig() {
  const publicKey =
    process.env.NEXT_PUBLIC_CHECKOUT_PUBLIC_KEY ??
    process.env.NEXT_PUBLIC_CKO_PK;
  const processingChannelId =
    process.env.NEXT_PUBLIC_CHECKOUT_PROCESSING_CHANNEL_ID ??
    process.env.NEXT_PUBLIC_PROCESSING_CHANNEL_ID;

  if (!publicKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_CHECKOUT_PUBLIC_KEY or NEXT_PUBLIC_CKO_PK in .env.local",
    );
  }

  if (!processingChannelId) {
    throw new Error(
      "Missing NEXT_PUBLIC_CHECKOUT_PROCESSING_CHANNEL_ID or NEXT_PUBLIC_PROCESSING_CHANNEL_ID in .env.local",
    );
  }

  return {
    publicKey,
    processingChannelId,
    apiBaseUrl: getCheckoutApiBaseUrl(publicKey),
  };
}

export function getCheckoutApiBaseUrl(key: string) {
  const baseCheckoutUrl = (
    process.env.CHECKOUT_API_BASE_URL ?? process.env.BASE_CHECKOUT_URL
  )?.trim();

  if (baseCheckoutUrl) {
    return baseCheckoutUrl.replace(/\/+$/, "");
  }

  return key.includes("_sbox_")
    ? "https://api.sandbox.checkout.com"
    : "https://api.checkout.com";
}

export async function checkoutRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
    idempotencyKey?: string;
    publicKey?: string;
  } = {},
) {
  const config = options.publicKey
    ? {
        secretKey: options.publicKey,
        apiBaseUrl: getCheckoutApiBaseUrl(options.publicKey),
      }
    : getServerCheckoutConfig();
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${config.secretKey}`,
  };

  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  if (options.idempotencyKey) {
    headers["Cko-Idempotency-Key"] = options.idempotencyKey;
  }

  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    method: options.method ?? "POST",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new CheckoutApiError(response.status, parsed);
  }

  return parsed as T;
}

export function createReference(prefix: string) {
  return `caseco-${prefix}-${Date.now()}`;
}

export function createIdempotencyKey(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

export function getAppUrl(requestUrl?: string) {
  const configured = process.env.APP_URL?.trim();

  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  if (requestUrl) {
    return new URL(requestUrl).origin;
  }

  return "http://localhost:3000";
}

export function safeCheckoutError(error: unknown) {
  if (error instanceof CheckoutApiError) {
    return {
      error: "Checkout.com rejected the request. Check sandbox product enablement and request fields.",
      status: error.status,
      requestId: error.requestId,
      errorType: error.errorType,
      errorCodes: error.errorCodes,
    };
  }

  if (error instanceof Error) {
    return {
      error: error.message,
    };
  }

  return {
    error: "Unexpected payment error",
  };
}
