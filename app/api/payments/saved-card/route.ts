import { NextResponse } from "next/server";
import {
  checkoutRequest,
  createIdempotencyKey,
  createReference,
  getServerCheckoutConfig,
  safeCheckoutError,
} from "@/lib/checkout";
import { calculateBasket, getMarket, normalizeBasket } from "@/lib/catalog";
import {
  createStoredOrder,
  safePaymentPayload,
  type CheckoutPaymentResponse,
} from "@/lib/checkout-payments";
import { getSavedCard } from "@/lib/session-store";

export const runtime = "nodejs";

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
    const payment = await checkoutRequest<CheckoutPaymentResponse>("/payments", {
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
    await createStoredOrder({
      payment,
      reference,
      amount: basket.totalAmount,
      currency: market.currency,
      market: market.code,
      method: "Saved credit card",
      customerEmail: savedCard.email,
      cardSummary: `${savedCard.scheme ?? "Card"} ending ${
        savedCard.last4 ?? "----"
      }`,
    });

    return NextResponse.json({
      ...safePaymentPayload(payment),
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
