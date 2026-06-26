import { checkoutRequest } from "./checkout";
import {
  getOrderByPaymentId,
  getOrderByReference,
  linkPaymentToOrder,
  saveOrder,
  saveFlowCustomerIdForEmail,
  updatePaymentRecord,
  type OrderEvent,
  type OrderRecord,
  type PaymentRecord,
} from "./session-store";

export type CheckoutPaymentResponse = {
  id?: string;
  approved?: boolean;
  status?: string;
  response_code?: string;
  response_summary?: string;
  reference?: string;
  amount?: number;
  currency?: string;
  customer?: {
    id?: string;
    email?: string;
  };
  source?: {
    id?: string;
    scheme?: string;
    last4?: string;
    expiry_month?: number;
    expiry_year?: number;
  };
  balances?: {
    total_authorized?: number;
    total_captured?: number;
    total_refunded?: number;
    available_to_refund?: number;
  };
  _links?: {
    redirect?: {
      href?: string;
    };
  };
};

export function safePaymentPayload(payment: CheckoutPaymentResponse) {
  return {
    id: payment.id,
    approved: payment.approved,
    status: payment.status,
    responseCode: payment.response_code,
    responseSummary: payment.response_summary,
    redirectUrl: payment._links?.redirect?.href,
    balances: payment.balances,
    amount: payment.amount,
    currency: payment.currency,
    reference: payment.reference,
  };
}

export function cardSummaryFromPayment(payment: CheckoutPaymentResponse) {
  if (!payment.source?.last4) {
    return undefined;
  }

  return `${payment.source.scheme ?? "Card"} ending ${payment.source.last4}`;
}

export function createPaymentsV1ReturnUrl({
  origin,
  status,
  reference,
  amount,
  currency,
  paymentMethod,
}: {
  origin: string;
  status: "success" | "failure";
  reference: string;
  amount: number;
  currency: string;
  paymentMethod: string;
}) {
  const url = new URL(`${origin}/payment-complete`);

  url.searchParams.set("source", "payments-v1-3ds");
  url.searchParams.set("status", status);
  url.searchParams.set("reference", reference);
  url.searchParams.set("amount", String(amount));
  url.searchParams.set("currency", currency);
  url.searchParams.set("paymentMethod", paymentMethod);

  return url.toString();
}

export async function createStoredOrder(input: {
  payment: CheckoutPaymentResponse;
  reference: string;
  amount: number;
  currency: string;
  market: string;
  method: string;
  customerEmail?: string;
  customerName?: string;
  cardSummary?: string;
}) {
  const now = new Date().toISOString();
  const paymentRecord: PaymentRecord = {
    paymentId: input.payment.id ?? "",
    reference: input.reference,
    amount: input.amount,
    currency: input.currency,
    market: input.market,
    method: input.method,
    status: input.payment.status ?? "Pending",
    approved: input.payment.approved,
    responseCode: input.payment.response_code,
    responseSummary: input.payment.response_summary,
    customerEmail: input.customerEmail,
    customerName: input.customerName,
    cardSummary: input.cardSummary ?? cardSummaryFromPayment(input.payment),
    availableToRefund: input.payment.balances?.available_to_refund,
    totalRefunded: input.payment.balances?.total_refunded,
    createdAt: now,
    updatedAt: now,
  };
  const events: OrderEvent[] = [
    {
      id: `${input.reference}-created`,
      type: "payment_created",
      label: "Payment created",
      createdAt: now,
      paymentId: input.payment.id,
      amount: input.amount,
      currency: input.currency,
    },
  ];

  if (input.payment._links?.redirect?.href) {
    events.push({
      id: `${input.reference}-3ds-required`,
      type: "3ds_required",
      label: "3DS required",
      createdAt: now,
      paymentId: input.payment.id,
    });
  }

  const order: OrderRecord = {
    reference: input.reference,
    paymentId: input.payment.id,
    status: paymentRecord.status,
    amount: input.amount,
    currency: input.currency,
    market: input.market,
    method: input.method,
    customerEmail: input.customerEmail,
    customerName: input.customerName,
    events,
    payment: paymentRecord,
    expiresAt: Date.now() + 1000 * 60 * 60,
  };

  return saveOrder(order);
}

export async function createPendingFlowOrder(input: {
  reference: string;
  paymentSessionId?: string;
  amount: number;
  currency: string;
  market: string;
  customerEmail?: string;
  customerName?: string;
}) {
  const now = new Date().toISOString();
  const order: OrderRecord = {
    reference: input.reference,
    paymentSessionId: input.paymentSessionId,
    status: "Payment session created",
    amount: input.amount,
    currency: input.currency,
    market: input.market,
    method: "Checkout.com Flow",
    customerEmail: input.customerEmail,
    customerName: input.customerName,
    events: [
      {
        id: `${input.reference}-flow-session-created`,
        type: "flow_session_created",
        label: "Flow payment session created",
        createdAt: now,
        amount: input.amount,
        currency: input.currency,
      },
    ],
    expiresAt: Date.now() + 1000 * 60 * 60,
  };

  return saveOrder(order);
}

export async function linkAndRefreshOwnedPayment(
  reference: string,
  paymentId: string,
) {
  const order = await getOrderByReference(reference);

  if (!order) {
    return undefined;
  }

  await linkPaymentToOrder(reference, paymentId);

  if (!order.events.some((event) => event.type === "flow_payment_completed")) {
    order.events.push({
      id: `${reference}-flow-payment-completed`,
      type: "flow_payment_completed",
      label: "Flow payment completed",
      createdAt: new Date().toISOString(),
      paymentId,
      amount: order.amount,
      currency: order.currency,
    });
  }

  return refreshOwnedPaymentStatus(paymentId);
}

export async function refreshOwnedPaymentStatus(paymentId: string) {
  const order = await getOrderByPaymentId(paymentId);

  if (!order) {
    return undefined;
  }

  const payment = await checkoutRequest<CheckoutPaymentResponse>(
    `/payments/${encodeURIComponent(paymentId)}`,
    { method: "GET" },
  );
  const status = payment.status ?? order.payment?.status ?? "Unknown";

  await updatePaymentRecord(paymentId, {
    status,
    approved: payment.approved,
    responseCode: payment.response_code,
    responseSummary: payment.response_summary,
    cardSummary:
      cardSummaryFromPayment(payment) ?? order.payment?.cardSummary,
    availableToRefund: payment.balances?.available_to_refund,
    totalRefunded: payment.balances?.total_refunded,
  });

  if (order.customerEmail && payment.customer?.id) {
    await saveFlowCustomerIdForEmail(order.customerEmail, payment.customer.id);
  }

  return {
    ...safePaymentPayload(payment),
    status,
    availableToRefund: payment.balances?.available_to_refund ?? 0,
    totalRefunded: payment.balances?.total_refunded ?? 0,
    orderReference: order.reference,
    events: order.events,
    cardSummary: cardSummaryFromPayment(payment) ?? order.payment?.cardSummary,
    method: order.method,
  };
}
