import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import {
  findOrderForWebhook,
  linkPaymentToOrder,
  markWebhookEventSeen,
  type OrderEvent,
} from "@/lib/session-store";

export const runtime = "nodejs";

type CheckoutWebhook = {
  id?: string;
  type?: string;
  created_on?: string;
  data?: {
    id?: string;
    payment_id?: string;
    reference?: string;
    amount?: number;
    currency?: string;
    response_code?: string;
    response_summary?: string;
    balances?: {
      available_to_refund?: number;
      total_refunded?: number;
    };
    metadata?: {
      cko_payment_session_id?: string;
      reference?: string;
    };
  };
  is_test?: boolean;
};

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  return left.length === right.length && timingSafeEqual(left, right);
}

function webhookConfig() {
  const authorizationKey = process.env.CHECKOUT_WEBHOOK_AUTHORIZATION_KEY;
  const signatureKey = process.env.CHECKOUT_WEBHOOK_SIGNATURE_KEY;

  if (!authorizationKey || !signatureKey) {
    throw new Error("Missing Checkout.com webhook authorization/signature keys.");
  }

  return { authorizationKey, signatureKey };
}

function eventLabel(type: string) {
  const labels: Record<string, string> = {
    payment_approved: "Payment approved",
    payment_captured: "Payment captured",
    payment_declined: "Payment declined",
    payment_pending: "Payment pending",
    payment_refunded: "Refund completed",
    payment_refund_pending: "Refund pending",
    payment_refund_declined: "Refund declined",
  };

  return labels[type] ?? type.replaceAll("_", " ");
}

function statusFromEvent(type: string) {
  const statuses: Record<string, string> = {
    payment_approved: "Approved",
    payment_captured: "Captured",
    payment_declined: "Declined",
    payment_pending: "Pending",
    payment_refunded: "Refunded",
    payment_refund_pending: "Refund pending",
    payment_refund_declined: "Refund declined",
  };

  return statuses[type];
}

function logWebhook(
  level: "log" | "warn" | "error",
  message: string,
  details: Record<string, string | number | boolean | undefined>,
) {
  console[level]({
    event: "checkout.webhook",
    message,
    ...details,
  });
}

export async function POST(request: Request) {
  let config: ReturnType<typeof webhookConfig>;

  try {
    config = webhookConfig();
  } catch (error) {
    logWebhook("error", "Webhook configuration is missing", {
      reason: error instanceof Error ? error.message : "unknown",
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook not configured." },
      { status: 500 },
    );
  }

  const rawBody = await request.text();
  const authorization = request.headers.get("authorization") ?? "";

  if (!safeEqual(authorization, config.authorizationKey)) {
    logWebhook("warn", "Rejected webhook with invalid authorization", {
      userAgent: request.headers.get("user-agent") ?? undefined,
      ckoCorrelationId: request.headers.get("cko-correlation-id") ?? undefined,
      ckoInvocationId: request.headers.get("cko-invocation-id") ?? undefined,
    });

    return NextResponse.json({ error: "Invalid webhook authorization." }, { status: 401 });
  }

  const expectedSignature = createHmac("sha256", config.signatureKey)
    .update(rawBody)
    .digest("hex");
  const actualSignature = request.headers.get("cko-signature") ?? "";

  if (!safeEqual(actualSignature, expectedSignature)) {
    logWebhook("warn", "Rejected webhook with invalid signature", {
      userAgent: request.headers.get("user-agent") ?? undefined,
      ckoCorrelationId: request.headers.get("cko-correlation-id") ?? undefined,
      ckoInvocationId: request.headers.get("cko-invocation-id") ?? undefined,
    });

    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  let event: CheckoutWebhook;

  try {
    event = JSON.parse(rawBody) as CheckoutWebhook;
  } catch {
    logWebhook("warn", "Rejected webhook with invalid JSON", {
      ckoCorrelationId: request.headers.get("cko-correlation-id") ?? undefined,
      ckoInvocationId: request.headers.get("cko-invocation-id") ?? undefined,
    });

    return NextResponse.json({ error: "Invalid webhook JSON." }, { status: 400 });
  }

  if (!event.id || !event.type) {
    logWebhook("warn", "Rejected webhook with missing event fields", {
      eventId: event.id,
      eventType: event.type,
      ckoCorrelationId: request.headers.get("cko-correlation-id") ?? undefined,
      ckoInvocationId: request.headers.get("cko-invocation-id") ?? undefined,
    });

    return NextResponse.json({ error: "Invalid webhook event." }, { status: 400 });
  }

  if (!markWebhookEventSeen(event.id)) {
    logWebhook("log", "Accepted duplicate webhook event", {
      eventId: event.id,
      eventType: event.type,
      paymentId: event.data?.payment_id ?? event.data?.id,
      reference: event.data?.reference ?? event.data?.metadata?.reference,
      ckoCorrelationId: request.headers.get("cko-correlation-id") ?? undefined,
      ckoInvocationId: request.headers.get("cko-invocation-id") ?? undefined,
    });

    return NextResponse.json({ accepted: true, duplicate: true });
  }

  const paymentId = event.data?.payment_id ?? event.data?.id;
  const reference = event.data?.reference ?? event.data?.metadata?.reference;
  const order = findOrderForWebhook(
    paymentId,
    reference,
    event.data?.metadata?.cko_payment_session_id,
  );

  if (order) {
    if (paymentId && !order.paymentId) {
      await linkPaymentToOrder(order.reference, paymentId);
    }

    const status = statusFromEvent(event.type);
    const orderEvent: OrderEvent = {
      id: event.id,
      type: event.type,
      label: `${eventLabel(event.type)} via webhook`,
      createdAt: event.created_on ?? new Date().toISOString(),
      paymentId,
      amount: event.data?.amount,
      currency: event.data?.currency,
      responseCode: event.data?.response_code,
      responseSummary: event.data?.response_summary,
      isTest: event.is_test,
    };

    order.events.push(orderEvent);

    if (paymentId) {
      order.paymentId = paymentId;
    }

    if (status) {
      order.status = status;
      order.payment = {
        paymentId: paymentId ?? order.payment?.paymentId ?? "",
        reference: order.reference,
        amount: order.amount,
        currency: order.currency,
        market: order.market,
        method: order.method,
        createdAt: order.payment?.createdAt ?? orderEvent.createdAt,
        updatedAt: orderEvent.createdAt,
        ...order.payment,
        status,
        responseCode: event.data?.response_code ?? order.payment?.responseCode,
        responseSummary:
          event.data?.response_summary ?? order.payment?.responseSummary,
        availableToRefund:
          event.data?.balances?.available_to_refund ??
          order.payment?.availableToRefund,
        totalRefunded:
          event.data?.balances?.total_refunded ?? order.payment?.totalRefunded,
        pendingRefund:
          event.type === "payment_refund_pending"
            ? true
            : event.type === "payment_refunded" ||
                event.type === "payment_refund_declined"
              ? false
              : order.payment?.pendingRefund,
      };
    }
  }

  logWebhook("log", "Accepted webhook event", {
    eventId: event.id,
    eventType: event.type,
    paymentId,
    reference,
    amount: event.data?.amount,
    currency: event.data?.currency,
    responseCode: event.data?.response_code,
    responseSummary: event.data?.response_summary,
    matchedOrder: Boolean(order),
    ckoCorrelationId: request.headers.get("cko-correlation-id") ?? undefined,
    ckoInvocationId: request.headers.get("cko-invocation-id") ?? undefined,
  });

  return NextResponse.json({ accepted: true });
}
