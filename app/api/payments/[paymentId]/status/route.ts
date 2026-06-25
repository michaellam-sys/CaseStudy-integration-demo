import { NextResponse } from "next/server";
import { safeCheckoutError } from "@/lib/checkout";
import { refreshOwnedPaymentStatus } from "@/lib/checkout-payments";

export const runtime = "nodejs";

type StatusRouteProps = {
  params: Promise<{
    paymentId: string;
  }>;
};

export async function GET(_request: Request, { params }: StatusRouteProps) {
  try {
    const { paymentId } = await params;
    const status = await refreshOwnedPaymentStatus(paymentId);

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
