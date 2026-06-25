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
    const market = getMarket(body.market);
    const requestBasket = normalizeBasket(body.basket);
    const basket = calculateBasket(market.code, requestBasket);
    const customer = normalizeCustomerDetails(body.customer, market.code);
    const { processingChannelId } = getServerCheckoutConfig();
    const reference = createReference("direct");
    const cardNumber = String(body.cardNumber ?? "").replace(/\s/g, "");
    const payment = await checkoutRequest<CheckoutPaymentResponse>("/payments", {
      idempotencyKey: createIdempotencyKey("direct-card"),
      body: {
        source: {
          type: "card",
          number: cardNumber,
          expiry_month: Number(body.expiryMonth),
          expiry_year: Number(body.expiryYear),
          cvv: String(body.cvv ?? ""),
          name: customer.cardholderName,
        },
        amount: basket.totalAmount,
        currency: market.currency,
        reference,
        processing_channel_id: processingChannelId,
        capture: true,
        customer: toCheckoutCustomer(customer),
        billing: toCheckoutBilling(customer),
      },
    });
    await createStoredOrder({
      payment,
      reference,
      amount: basket.totalAmount,
      currency: market.currency,
      market: market.code,
      method: "Direct credit card",
      customerEmail: customer.email,
      customerName: customerName(customer),
      cardSummary: `Card ending ${cardNumber.slice(-4)}`,
    });

    return NextResponse.json({
      ...safePaymentPayload(payment),
      receipt: {
        transactionDate: new Date().toISOString(),
        reference,
        amount: basket.totalAmount,
        currency: market.currency,
        paymentMethod: "Direct credit card",
        cardSummary: `Card ending ${cardNumber.slice(-4)}`,
      },
    });
  } catch (error) {
    return NextResponse.json(safeCheckoutError(error), { status: 500 });
  }
}
