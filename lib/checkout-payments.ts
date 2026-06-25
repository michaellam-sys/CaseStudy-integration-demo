import { checkoutRequest } from "./checkout";
import {
  getOrderByPaymentId,
  saveOrder,
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
    availableToRefund: payment.balances?.available_to_refund,
    totalRefunded: payment.balances?.total_refunded,
  });

  return {
    ...safePaymentPayload(payment),
    status,
    availableToRefund: payment.balances?.available_to_refund ?? 0,
    totalRefunded: payment.balances?.total_refunded ?? 0,
    orderReference: order.reference,
    events: order.events,
    cardSummary: order.payment?.cardSummary,
    method: order.method,
  };
}
