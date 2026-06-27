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

export const runtime = "nodejs";

type HostedPaymentResponse = {
  id?: string;
  _links?: {
    redirect?: {
      href?: string;
    };
  };
};

function createHostedReturnUrl({
  origin,
  status,
  reference,
  amount,
  currency,
}: {
  origin: string;
  status: "success" | "failure" | "cancel";
  reference: string;
  amount: number;
  currency: string;
}) {
  const url = new URL(`${origin}/payment-complete`);

  url.searchParams.set("source", "hpp");
  url.searchParams.set("status", status);
  url.searchParams.set("reference", reference);
  url.searchParams.set("amount", String(amount));
  url.searchParams.set("currency", currency);
  url.searchParams.set("paymentMethod", "Hosted Payments Page");

  return url.toString();
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
    const origin = new URL(request.url).origin;
    const reference = createReference("hpp");
    const commonReturnParams = {
      origin,
      reference,
      amount: basket.totalAmount,
      currency: market.currency,
    };
    const hpp = await checkoutRequest<HostedPaymentResponse>(
      "/hosted-payments",
      {
        idempotencyKey: createIdempotencyKey("hpp"),
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
          success_url: createHostedReturnUrl({
            ...commonReturnParams,
            status: "success",
          }),
          failure_url: createHostedReturnUrl({
            ...commonReturnParams,
            status: "failure",
          }),
          cancel_url: createHostedReturnUrl({
            ...commonReturnParams,
            status: "cancel",
          }),
          products: checkoutProducts(market.code, requestBasket),
          allow_payment_methods: ["card"],
        },
      },
    );

    return NextResponse.json({
      id: hpp.id,
      redirectUrl: hpp._links?.redirect?.href,
    });
  } catch (error) {
    if (error instanceof CustomerPhoneInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(safeCheckoutError(error), { status: 500 });
  }
}
