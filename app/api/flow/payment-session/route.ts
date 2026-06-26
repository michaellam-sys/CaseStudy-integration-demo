import { NextResponse } from "next/server";
import type { PaymentSessionResponse } from "@checkout.com/checkout-web-components";
import {
  checkoutRequest,
  createIdempotencyKey,
  createReference,
  getAppUrl,
  getPublicCheckoutConfig,
  getServerCheckoutConfig,
  safeCheckoutError,
} from "@/lib/checkout";
import {
  calculateBasket,
  checkoutProducts,
  getMarket,
  normalizeBasket,
  type MarketCode,
} from "@/lib/catalog";
import { createPendingFlowOrder } from "@/lib/checkout-payments";
import { getFlowCustomerIdByEmail } from "@/lib/session-store";

export const runtime = "nodejs";

type FlowPaymentSession = PaymentSessionResponse & {
  id?: string;
};

class FlowInputError extends Error {}

const disallowedClientFields = [
  "amount",
  "currency",
  "paymentId",
  "payment_id",
  "reference",
  "processing_channel_id",
  "processingChannelId",
  "secretKey",
  "publicKey",
  "card",
  "source",
  "token",
];

function isMarketCode(value: unknown): value is MarketCode {
  return value === "HK" || value === "NL" || value === "US";
}

function normalizeFlowCustomer(value: unknown) {
  const data = typeof value === "object" && value ? value : {};
  const keys = Object.keys(data);

  if (keys.some((key) => key !== "email")) {
    throw new FlowInputError(
      "Only customer.email is accepted for Flow sessions.",
    );
  }

  const email = String((data as Record<string, unknown>).email ?? "").trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new FlowInputError("A valid customer email is required.");
  }

  return { email };
}

export async function POST(request: Request) {
  try {
    const parsedBody = await request.json();
    const body = typeof parsedBody === "object" && parsedBody ? parsedBody : {};

    for (const field of disallowedClientFields) {
      if (field in body) {
        return NextResponse.json(
          { error: `Client field is not accepted: ${field}` },
          { status: 400 },
        );
      }
    }

    if (!isMarketCode((body as Record<string, unknown>).market)) {
      return NextResponse.json(
        { error: "A supported market is required." },
        { status: 400 },
      );
    }

    const requestBody = body as Record<string, unknown>;
    const market = getMarket(requestBody.market);
    const requestBasket = normalizeBasket(requestBody.basket);
    const basket = calculateBasket(market.code, requestBasket);
    const customer = normalizeFlowCustomer(requestBody.customer);
    const requestedLocale =
      typeof requestBody.locale === "string"
        ? requestBody.locale
        : market.defaultLocale;
    const flowLocale =
      requestedLocale === "zh-HK"
        ? "zh-HK"
        : requestedLocale === "nl" || requestedLocale === "nl-NL"
          ? "nl"
          : "en";
    const { processingChannelId } = getServerCheckoutConfig();
    const { publicKey } = getPublicCheckoutConfig();
    const reference = createReference(`flow-${market.code.toLowerCase()}`);
    const appUrl = getAppUrl(request.url);
    const returnUrl = `${appUrl}/payment/flow/return?reference=${encodeURIComponent(reference)}`;
    const savedCustomerId = await getFlowCustomerIdByEmail(customer.email);

    const paymentSession = await checkoutRequest<FlowPaymentSession>(
      "/payment-sessions",
      {
        idempotencyKey: createIdempotencyKey("flow-session"),
        body: {
          amount: basket.totalAmount,
          currency: market.currency,
          reference,
          processing_channel_id: processingChannelId,
          billing: {
            address: {
              country: market.country,
            },
          },
          customer: {
            email: customer.email,
          },
          success_url: `${returnUrl}&result=success`,
          failure_url: `${returnUrl}&result=failure`,
          locale: flowLocale,
          "3ds": {
            enabled: true,
          },
          items: checkoutProducts(market.code, requestBasket).map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unit_price: item.price,
            total_amount: item.price * item.quantity,
          })),
          payment_method_configuration: {
            card: {
              store_payment_details: "collect_consent",
            },
            ...(savedCustomerId
              ? {
                  stored_card: {
                    customer_id: savedCustomerId,
                  },
                }
              : {}),
          },
          metadata: {
            demo: "caseco-flow-v2",
            reference,
          },
        },
      },
    );

    await createPendingFlowOrder({
      reference,
      paymentSessionId: paymentSession.id,
      amount: basket.totalAmount,
      currency: market.currency,
      market: market.code,
      customerEmail: customer.email,
    });

    return NextResponse.json({
      paymentSession,
      publicKey,
      reference,
      amount: basket.totalAmount,
      currency: market.currency,
      locale: flowLocale,
      hasStoredFlowCustomer: Boolean(savedCustomerId),
      displayAmount: new Intl.NumberFormat(market.defaultLocale, {
        style: "currency",
        currency: market.currency,
      }).format(basket.totalAmount / 100),
    });
  } catch (error) {
    if (error instanceof FlowInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(safeCheckoutError(error), { status: 500 });
  }
}
