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
  createStoredOrder,
  type CheckoutPaymentResponse,
} from "@/lib/checkout-payments";
import {
  normalizeCustomerDetails,
  toCheckoutBilling,
  toCheckoutCustomer,
} from "@/lib/validation";

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
    const customer = normalizeCustomerDetails(body.customer, market.code);
    const basket = calculateBasket(market.code, requestBasket);
    const { processingChannelId } = getServerCheckoutConfig();
    const paymentLink = await checkoutRequest<PaymentLinkResponse>(
      "/payment-links",
      {
        idempotencyKey: createIdempotencyKey("payment-link-v2"),
        body: {
          amount: basket.totalAmount,
          currency: market.currency,
          reference: createReference("plink"),
          processing_channel_id: processingChannelId,
          billing: toCheckoutBilling(customer),
          customer: toCheckoutCustomer(customer),
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

    if (paymentLink.payment_id && paymentLink.reference) {
      await createStoredOrder({
        payment: {
          id: paymentLink.payment_id,
          status: paymentLink.status,
          reference: paymentLink.reference,
          amount: paymentLink.amount,
          currency: paymentLink.currency,
        } satisfies CheckoutPaymentResponse,
        reference: paymentLink.reference,
        amount: paymentLink.amount ?? 0,
        currency: paymentLink.currency ?? "HKD",
        market: "unknown",
        method: "Payment Link",
      });
    }

    return NextResponse.json(paymentLinkPayload(paymentLink));
  } catch (error) {
    return NextResponse.json(safeCheckoutError(error), { status: 500 });
  }
}
