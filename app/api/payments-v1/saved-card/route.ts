import { NextResponse } from "next/server";
import {
  checkoutRequest,
  createIdempotencyKey,
  createReference,
  getAppUrl,
  getServerCheckoutConfig,
  safeCheckoutError,
} from "@/lib/checkout";
import { calculateBasket, getMarket, normalizeBasket } from "@/lib/catalog";
import {
  createPaymentsV1ReturnUrl,
  createStoredOrder,
} from "@/lib/checkout-payments";
import {
  CustomerPhoneInputError,
  normalizeCustomerPhone,
  toCheckoutCustomerPhone,
} from "@/lib/customer-phone";
import { getSavedCard } from "@/lib/session-store";

export const runtime = "nodejs";

type PaymentResponse = {
  id?: string;
  approved?: boolean;
  status?: string;
  response_code?: string;
  response_summary?: string;
  _links?: {
    redirect?: {
      href?: string;
    };
  };
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const savedCard = await getSavedCard();

    if (!savedCard) {
      return NextResponse.json(
        { error: "No saved card found for this demo session." },
        { status: 400 },
      );
    }

    const market = getMarket(body.market);
    const requestBasket = normalizeBasket(body.basket);
    const phone = normalizeCustomerPhone(body.phone);
    const basket = calculateBasket(market.code, requestBasket);
    const { processingChannelId } = getServerCheckoutConfig();
    const reference = createReference("saved");
    const origin = getAppUrl(request.url);
    const paymentMethod = "Saved credit card";
    const cardSummary = `${savedCard.scheme ?? "Card"} ending ${
      savedCard.last4 ?? "----"
    }`;
    const require3ds = body.require3ds === true;
    const threeDsReturnParams = {
      origin,
      reference,
      amount: basket.totalAmount,
      currency: market.currency,
      paymentMethod,
    };
    const payment = await checkoutRequest<PaymentResponse>("/payments", {
      idempotencyKey: createIdempotencyKey("saved-card"),
      body: {
        source: {
          type: "id",
          id: savedCard.instrumentId,
        },
        amount: basket.totalAmount,
        currency: market.currency,
        reference,
        processing_channel_id: processingChannelId,
        capture: true,
        customer: {
          ...(savedCard.customerId ? { id: savedCard.customerId } : {}),
          ...(savedCard.email ? { email: savedCard.email } : {}),
          phone: toCheckoutCustomerPhone(phone),
        },
        ...(require3ds
          ? {
              "3ds": {
                enabled: true,
              },
              success_url: createPaymentsV1ReturnUrl({
                ...threeDsReturnParams,
                status: "success",
              }),
              failure_url: createPaymentsV1ReturnUrl({
                ...threeDsReturnParams,
                status: "failure",
              }),
            }
          : {}),
      },
    });

    await createStoredOrder({
      payment,
      reference,
      amount: basket.totalAmount,
      currency: market.currency,
      market: market.code,
      method: paymentMethod,
      customerEmail: savedCard.email,
      cardSummary,
    });

    return NextResponse.json({
      id: payment.id,
      approved: payment.approved,
      status: payment.status,
      responseCode: payment.response_code,
      responseSummary: payment.response_summary,
      redirectUrl: payment._links?.redirect?.href,
      receipt: {
        transactionDate: new Date().toISOString(),
        reference,
        amount: basket.totalAmount,
        currency: market.currency,
        paymentMethod,
        cardSummary,
      },
    });
  } catch (error) {
    if (error instanceof CustomerPhoneInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(safeCheckoutError(error), { status: 500 });
  }
}
