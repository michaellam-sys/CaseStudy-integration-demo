import { NextResponse } from "next/server";
import {
  checkoutRequest,
  createIdempotencyKey,
  safeCheckoutError,
} from "@/lib/checkout";
import { refreshOwnedPaymentStatus } from "@/lib/checkout-payments";
import { getOrderByPaymentId, updatePaymentRecord } from "@/lib/session-store";
import { parseDecimalAmountToMinorUnits } from "@/lib/validation";

export const runtime = "nodejs";

type RefundRouteProps = {
  params: Promise<{
    paymentId: string;
  }>;
};

type RefundResponse = {
  action_id?: string;
  reference?: string;
};

export async function POST(request: Request, { params }: RefundRouteProps) {
  try {
    const { paymentId } = await params;
    const body = await request.json();
    const order = await getOrderByPaymentId(paymentId);

    if (!order?.payment) {
      return NextResponse.json(
        { error: "Payment was not found in this demo session." },
        { status: 404 },
      );
    }

    const status = await refreshOwnedPaymentStatus(paymentId);
    const availableToRefund = status?.availableToRefund ?? 0;
    const amount =
      body.full === true
        ? availableToRefund
        : parseDecimalAmountToMinorUnits(body.amount);

    if (amount <= 0 || amount > availableToRefund) {
      return NextResponse.json(
        { error: "Refund amount exceeds the available captured balance." },
        { status: 400 },
      );
    }

    const reference = `REF-${order.reference}-${Date.now()}`;
    const refund = await checkoutRequest<RefundResponse>(
      `/payments/${encodeURIComponent(paymentId)}/refunds`,
      {
        idempotencyKey: createIdempotencyKey("refund"),
        body: {
          amount,
          reference,
          metadata: {
            demo: "caseco-checkout-v2",
          },
        },
      },
    );

    await updatePaymentRecord(
      paymentId,
      {
        pendingRefund: true,
      },
      {
        id: `${reference}-requested`,
        type: "refund_requested",
        label: "Refund requested",
        paymentId,
        refundReference: reference,
        amount,
        currency: order.currency,
      },
    );

    return NextResponse.json(
      {
        accepted: true,
        actionId: refund.action_id,
        reference: refund.reference ?? reference,
        amount,
        currency: order.currency,
        status: "requested",
      },
      { status: 202 },
    );
  } catch (error) {
    return NextResponse.json(safeCheckoutError(error), { status: 500 });
  }
}
