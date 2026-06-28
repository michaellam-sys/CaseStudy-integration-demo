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
import {
  CustomerPhoneInputError,
  normalizeCustomerPhone,
  toCheckoutCustomerPhone,
} from "@/lib/customer-phone";
import { saveOrder } from "@/lib/session-store";

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
    const phone = normalizeCustomerPhone(body.phone);
    const basket = calculateBasket(market.code, requestBasket);
    const { processingChannelId } = getServerCheckoutConfig();
    const reference = createReference("plink");
    const paymentLink = await checkoutRequest<PaymentLinkResponse>(
      "/payment-links",
      {
        idempotencyKey: createIdempotencyKey("payment-link"),
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
            ...(email ? { email } : {}),
            phone: toCheckoutCustomerPhone(phone),
          },
          products: checkoutProducts(market.code, requestBasket),
          expires_in: 86400,
          capture: true,
          allow_payment_methods: ["card"],
        },
      },
    );
    const orderReference = paymentLink.reference ?? reference;

    await saveOrder({
      reference: orderReference,
      status: paymentLink.status ?? "Payment link created",
      amount: basket.totalAmount,
      currency: market.currency,
      market: market.code,
      method: "Payment Link",
      customerEmail: email,
      events: [
        {
          id: `${orderReference}-payment-link-created`,
          type: "payment_link_created",
          label: "Payment link created",
          createdAt: new Date().toISOString(),
          amount: basket.totalAmount,
          currency: market.currency,
        },
      ],
      expiresAt: Date.now() + 1000 * 60 * 60,
    });

    return NextResponse.json(paymentLinkPayload(paymentLink));
  } catch (error) {
    if (error instanceof CustomerPhoneInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

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
