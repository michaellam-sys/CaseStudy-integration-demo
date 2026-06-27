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
import { getMarket, type MarketCode } from "@/lib/catalog";

export const runtime = "nodejs";

type TokenizationPaymentSession = PaymentSessionResponse & {
  id?: string;
};

function isMarketCode(value: unknown): value is MarketCode {
  return value === "HK" || value === "NL" || value === "US";
}

export async function POST(request: Request) {
  try {
    const parsedBody = await request.json();
    const body = typeof parsedBody === "object" && parsedBody ? parsedBody : {};

    if (!isMarketCode((body as Record<string, unknown>).market)) {
      return NextResponse.json(
        { error: "A supported market is required." },
        { status: 400 },
      );
    }

    const market = getMarket((body as Record<string, unknown>).market);
    const { processingChannelId } = getServerCheckoutConfig();
    const { publicKey } = getPublicCheckoutConfig();
    const reference = createReference(
      `card-verification-${market.code.toLowerCase()}`,
    );
    const appUrl = getAppUrl(request.url);

    const paymentSession = await checkoutRequest<TokenizationPaymentSession>(
      "/payment-sessions",
      {
        idempotencyKey: createIdempotencyKey("profile-tokenization-session"),
        body: {
          amount: 0,
          currency: market.currency,
          reference,
          processing_channel_id: processingChannelId,
          billing: {
            address: {
              country: market.country,
            },
          },
          success_url: `${appUrl}/profile?market=${market.code}`,
          failure_url: `${appUrl}/profile?market=${market.code}`,
          payment_method_configuration: {
            card: {
              store_payment_details: "disabled",
            },
          },
          metadata: {
            demo: "caseco-profile-card-verification",
            reference,
          },
        },
      },
    );

    return NextResponse.json({
      paymentSession,
      publicKey,
      reference,
      amount: 0,
      currency: market.currency,
    });
  } catch (error) {
    return NextResponse.json(safeCheckoutError(error), { status: 500 });
  }
}
