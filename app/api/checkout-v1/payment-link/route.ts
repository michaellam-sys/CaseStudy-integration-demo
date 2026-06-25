import { NextResponse } from "next/server";
import {
  checkoutRequest,
  createIdempotencyKey,
  createReference,
  getServerCheckoutConfig,
  safeCheckoutError,
} from "@/lib/checkout";
import {
  calculateBasket,
  checkoutProducts,
  getMarket,
  normalizeBasket,
} from "@/lib/catalog";

export const runtime = "nodejs";

type PaymentLinkResponse = {
  id?: string;
  status?: string;
  payment_id?: string;
  amount?: number;
  currency?: string;
  reference?: string;
  expires_on?: string;
  _links?: {
    redirect?: {
      href?: string;
    };
  };
};

function paymentLinkPayload(paymentLink: PaymentLinkResponse) {
  return {
    id: paymentLink.id,
    status: paymentLink.status,
    paymentId: paymentLink.payment_id,
    amount: paymentLink.amount,
    currency: paymentLink.currency,
    reference: paymentLink.reference,
    expiresOn: paymentLink.expires_on,
    url: paymentLink._links?.redirect?.href,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const market = getMarket(body.market);
    const requestBasket = normalizeBasket(body.basket);
    const email = String(body.email ?? "").trim();
    const basket = calculateBasket(market.code, requestBasket);
    const { processingChannelId } = getServerCheckoutConfig();
    const paymentLink = await checkoutRequest<PaymentLinkResponse>(
      "/payment-links",
      {
        idempotencyKey: createIdempotencyKey("payment-link"),
        body: {
          amount: basket.totalAmount,
          currency: market.currency,
          reference: createReference("plink"),
          processing_channel_id: processingChannelId,
          billing: {
            address: {
              country: market.country,
            },
          },
          customer: email ? { email } : undefined,
          products: checkoutProducts(market.code, requestBasket),
          expires_in: 86400,
          capture: true,
          allow_payment_methods: ["card"],
        },
      },
    );

    return NextResponse.json(paymentLinkPayload(paymentLink));
  } catch (error) {
    return NextResponse.json(safeCheckoutError(error), { status: 500 });
  }
}

export async function GET(request: Request) {
  const paymentLinkId = new URL(request.url).searchParams.get("id");

  if (!paymentLinkId) {
    return NextResponse.json(
      { error: "Missing payment link id." },
      { status: 400 },
    );
  }

  try {
    const paymentLink = await checkoutRequest<PaymentLinkResponse>(
      `/payment-links/${encodeURIComponent(paymentLinkId)}`,
      {
        method: "GET",
      },
    );

    return NextResponse.json(paymentLinkPayload(paymentLink));
  } catch (error) {
    return NextResponse.json(safeCheckoutError(error), { status: 500 });
  }
}
