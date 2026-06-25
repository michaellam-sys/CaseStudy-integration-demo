import { NextResponse } from "next/server";
import {
  checkoutRequest,
  createIdempotencyKey,
  createReference,
  getServerCheckoutConfig,
  safeCheckoutError,
} from "@/lib/checkout";
import { calculateBasket, getMarket, normalizeBasket } from "@/lib/catalog";

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
    const market = getMarket(body.market);
    const requestBasket = normalizeBasket(body.basket);
    const basket = calculateBasket(market.code, requestBasket);
    const { processingChannelId } = getServerCheckoutConfig();
    const reference = createReference("direct");
    const cardNumber = String(body.cardNumber ?? "").replace(/\s/g, "");
    const payment = await checkoutRequest<PaymentResponse>("/payments", {
      idempotencyKey: createIdempotencyKey("direct-card"),
      body: {
        source: {
          type: "card",
          number: cardNumber,
          expiry_month: Number(body.expiryMonth),
          expiry_year: Number(body.expiryYear),
          cvv: String(body.cvv ?? ""),
          name: String(body.cardholderName ?? "").trim(),
          billing_address: {
            country: market.country,
          },
        },
        amount: basket.totalAmount,
        currency: market.currency,
        reference,
        processing_channel_id: processingChannelId,
        capture: true,
        customer: {
          email: String(body.email ?? "").trim(),
        },
      },
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
        paymentMethod: "Direct credit card",
        cardSummary: `Card ending ${cardNumber.slice(-4)}`,
      },
    });
  } catch (error) {
    return NextResponse.json(safeCheckoutError(error), { status: 500 });
  }
}
