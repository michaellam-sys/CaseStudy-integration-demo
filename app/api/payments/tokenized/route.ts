import { NextResponse } from "next/server";
import {
  checkoutRequest,
  createIdempotencyKey,
  createReference,
  getAppUrl,
  getServerCheckoutConfig,
  safeCheckoutError,
} from "@/lib/checkout";
import { calculateBasket, getMarket, normalizeBasket } from "@/lib/catalog";
import {
  createStoredOrder,
  safePaymentPayload,
  type CheckoutPaymentResponse,
} from "@/lib/checkout-payments";
import { saveCard } from "@/lib/session-store";
import {
  customerName,
  normalizeCustomerDetails,
  toCheckoutBilling,
  toCheckoutCustomer,
} from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = String(body.token ?? "").trim();

    if (!token.startsWith("tok_")) {
      return NextResponse.json(
        { error: "A Checkout.com card token is required." },
        { status: 400 },
      );
    }

    const market = getMarket(body.market);
    const requestBasket = normalizeBasket(body.basket);
    const basket = calculateBasket(market.code, requestBasket);
    const customer = normalizeCustomerDetails(body.customer, market.code);
    const { processingChannelId } = getServerCheckoutConfig();
    const reference = createReference("3ds");
    const appUrl = getAppUrl(request.url);
    const payment = await checkoutRequest<CheckoutPaymentResponse>("/payments", {
      idempotencyKey: createIdempotencyKey("tokenized-3ds"),
      body: {
        source: {
          type: "token",
          token,
        },
        amount: basket.totalAmount,
        currency: market.currency,
        reference,
        processing_channel_id: processingChannelId,
        capture: true,
        customer: toCheckoutCustomer(customer),
        billing: toCheckoutBilling(customer),
        "3ds": {
          enabled: true,
        },
        success_url: `${appUrl}/payment/3ds/return?result=success`,
        failure_url: `${appUrl}/payment/3ds/return?result=failure`,
      },
    });

    await createStoredOrder({
      payment,
      reference,
      amount: basket.totalAmount,
      currency: market.currency,
      market: market.code,
      method: "Tokenized Card + 3DS",
      customerEmail: customer.email,
      customerName: customerName(customer),
    });

    if (payment.source?.id) {
      await saveCard({
        instrumentId: payment.source.id,
        customerId: payment.customer?.id,
        email: payment.customer?.email ?? customer.email,
        scheme: payment.source.scheme,
        last4: payment.source.last4,
        expiryMonth: payment.source.expiry_month,
        expiryYear: payment.source.expiry_year,
      });
    }

    return NextResponse.json({
      ...safePaymentPayload(payment),
      nextActionUrl: payment._links?.redirect?.href,
      receipt: {
        transactionDate: new Date().toISOString(),
        reference,
        amount: basket.totalAmount,
        currency: market.currency,
        paymentMethod: "Tokenized Card + 3DS",
      },
    });
  } catch (error) {
    return NextResponse.json(safeCheckoutError(error), { status: 500 });
  }
}
