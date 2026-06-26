import { NextResponse } from "next/server";
import { linkAndRefreshOwnedPayment } from "@/lib/checkout-payments";
import { safeCheckoutError } from "@/lib/checkout";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const parsedBody = await request.json();
    const body =
      typeof parsedBody === "object" && parsedBody
        ? (parsedBody as Record<string, unknown>)
        : {};
    const reference = String(body.reference ?? "").trim();
    const paymentId = String(body.paymentId ?? "").trim();

    if (!reference || !paymentId.startsWith("pay_")) {
      return NextResponse.json(
        { error: "A session-owned reference and Checkout.com payment ID are required." },
        { status: 400 },
      );
    }

    const status = await linkAndRefreshOwnedPayment(reference, paymentId);

    if (!status) {
      return NextResponse.json(
        { error: "Payment was not found in this demo session." },
        { status: 404 },
      );
    }

    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(safeCheckoutError(error), { status: 500 });
  }
}
