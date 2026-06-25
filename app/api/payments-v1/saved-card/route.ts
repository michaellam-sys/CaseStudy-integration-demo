import { NextResponse } from "next/server";
import {
  checkoutRequest,
  createIdempotencyKey,
  createReference,
  getServerCheckoutConfig,
  safeCheckoutError,
} from "@/lib/checkout";
import { calculateBasket, getMarket, normalizeBasket } from "@/lib/catalog";
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
    const basket = calculateBasket(market.code, requestBasket);
    const { processingChannelId } = getServerCheckoutConfig();
    const reference = createReference("saved");
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
          id: savedCard.customerId,
          email: savedCard.email,
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
        paymentMethod: "Saved credit card",
        cardSummary: `${savedCard.scheme ?? "Card"} ending ${
          savedCard.last4 ?? "----"
        }`,
      },
    });
  } catch (error) {
    return NextResponse.json(safeCheckoutError(error), { status: 500 });
  }
}
