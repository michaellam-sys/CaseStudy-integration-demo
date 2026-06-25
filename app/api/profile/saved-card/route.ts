import { NextResponse } from "next/server";
import {
  checkoutRequest,
  getServerCheckoutConfig,
  safeCheckoutError,
} from "@/lib/checkout";
import { getMarket } from "@/lib/catalog";
import {
  clearSavedCard,
  getSavedCard,
  saveCard,
  toSavedCardResponse,
} from "@/lib/session-store";

export const runtime = "nodejs";

type CreateInstrumentResponse = {
  id: string;
  scheme?: string;
  last4?: string;
  expiry_month?: number;
  expiry_year?: number;
  customer?: {
    id?: string;
    email?: string;
  };
};

export async function GET() {
  return NextResponse.json(toSavedCardResponse(await getSavedCard()));
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const market = getMarket(body.market);
    const email = String(body.email ?? "").trim();
    const token = String(body.token ?? "").trim();

    if (!email || !token.startsWith("tok_")) {
      return NextResponse.json(
        { error: "Email and Checkout.com token are required." },
        { status: 400 },
      );
    }

    const { processingChannelId } = getServerCheckoutConfig();
    const instrument = await checkoutRequest<CreateInstrumentResponse>(
      "/instruments",
      {
        body: {
          type: "token",
          token,
          currency: market.currency,
          country: market.country,
          processing_channel_id: processingChannelId,
          customer: {
            email,
            default: true,
          },
        },
      },
    );

    if (!instrument.id) {
      return NextResponse.json(
        { error: "Checkout.com did not return an instrument id." },
        { status: 502 },
      );
    }

    const savedCard = await saveCard({
      instrumentId: instrument.id,
      customerId: instrument.customer?.id,
      email: instrument.customer?.email ?? email,
      scheme: instrument.scheme,
      last4: instrument.last4,
      expiryMonth: instrument.expiry_month,
      expiryYear: instrument.expiry_year,
    });

    return NextResponse.json(savedCard);
  } catch (error) {
    return NextResponse.json(safeCheckoutError(error), { status: 500 });
  }
}

export async function DELETE() {
  await clearSavedCard();
  return NextResponse.json({ savedCard: null });
}
