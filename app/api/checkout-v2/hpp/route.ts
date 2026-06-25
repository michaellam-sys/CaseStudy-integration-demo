import { NextResponse } from "next/server";
import {
  checkoutRequest,
  createIdempotencyKey,
  createReference,
  getAppUrl,
  getServerCheckoutConfig,
  safeCheckoutError,
} from "@/lib/checkout";
import {
  calculateBasket,
  checkoutProducts,
  getMarket,
  normalizeBasket,
} from "@/lib/catalog";
import { saveOrder } from "@/lib/session-store";
import {
  customerName,
  normalizeCustomerDetails,
  toCheckoutBilling,
  toCheckoutCustomer,
} from "@/lib/validation";

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
    const customer = normalizeCustomerDetails(body.customer, market.code);
    const basket = calculateBasket(market.code, requestBasket);
    const { processingChannelId } = getServerCheckoutConfig();
    const origin = getAppUrl(request.url);
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
        idempotencyKey: createIdempotencyKey("hpp-v2"),
        body: {
          amount: basket.totalAmount,
          currency: market.currency,
          reference,
          processing_channel_id: processingChannelId,
          billing: toCheckoutBilling(customer),
          customer: toCheckoutCustomer(customer),
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

    await saveOrder({
      reference,
      status: "Pending",
      amount: basket.totalAmount,
      currency: market.currency,
      market: market.code,
      method: "Hosted Payments Page",
      customerEmail: customer.email,
      customerName: customerName(customer),
      events: [
        {
          id: `${reference}-created`,
          type: "hpp_created",
          label: "Hosted payment created",
          createdAt: new Date().toISOString(),
          amount: basket.totalAmount,
          currency: market.currency,
        },
      ],
      expiresAt: Date.now() + 1000 * 60 * 60,
    });

    return NextResponse.json({
      id: hpp.id,
      redirectUrl: hpp._links?.redirect?.href,
    });
  } catch (error) {
    return NextResponse.json(safeCheckoutError(error), { status: 500 });
  }
}
