# Case & Co. Checkout.com Demo

Compact Next.js + TypeScript demo for an iPhone-case merchant using Checkout.com.

## Routes

- `/profile` performs saved card flow for the current session.
- `/checkout` preserves the non-Flow checkout flow (payment-link, HPP, direct card payment (thru API) and saved card payment (thru API)).
- `/checkout-flow` is the Part 3 customer-facing Checkout.com Flow checkout.
- `/payment/flow/return` verifies Flow redirect/3DS returns against the current demo session before showing a result.
- `/api/webhooks/checkout` webhook endpoint to receive asynchronous payment and refund updates from Checkout.com.

## Part 2 preserved in checkout

Checkout still demonstrates:

- Payment Links
- Hosted Payments Page
- Direct card payment through the Payments API
- Saved card payment using a server-held instrument ID

## Part 3 Flow checkout

Checkout Flow uses Checkout.com Flow as the default customer-facing payment path:

- Server-created Checkout.com Payment Sessions.
- Merchant-collected customer email for Flow stored-card support.
- Flow-hosted cardholder and payment-detail collection.
- Merchant UI localization for English, Traditional Chinese, and Dutch.
- Flow locale mapping for English, Chinese Hong Kong, and Dutch.
- HKD, EUR, and USD market/currency support with server-side amount calculation.
- Flow cardholder-name display, mandatory CVV, 3DS, and redirect handling.
- Safe server-side payment status lookup.
- Safe card display from payment details, such as card scheme and last four digits.
- Session-scoped order activity state.
- Checkout.com webhook receiver with Authorization and raw-body `Cko-Signature` verification.
- Partial and full refund requests for captured, current-session payments.
- Flow saved-card consent and returning stored-card display for the current demo session.

Flow saved-card support uses `customer.email` plus `payment_method_configuration.card.store_payment_details: "collect_consent"` when creating the Payment Session. After a successful payment, the demo stores the returned Checkout.com `customer.id` in memory for the current session and sends it as `payment_method_configuration.stored_card.customer_id` on later Flow sessions for the same email.

## Environment

Create `.env.local` using `.env.example` as a starting point:

```bash
CHECKOUT_API_BASE_URL=https://YOUR_PREFIX.api.sandbox.checkout.com
CHECKOUT_SECRET_KEY=sk_sbox_replace_me
CHECKOUT_PROCESSING_CHANNEL_ID=pc_replace_me
NEXT_PUBLIC_CHECKOUT_PUBLIC_KEY=pk_sbox_replace_me
NEXT_PUBLIC_CHECKOUT_PROCESSING_CHANNEL_ID=pc_replace_me
APP_URL=http://localhost:3000
```

Flow must be enabled for the Checkout.com sandbox account. The public key needs payment-session payment/tokenization scopes, and the secret key needs payment-session and payment-management scopes for session creation, status lookup, webhooks, and refunds.

## Start locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The deployed demo is available at [https://cko-checkout-demo.michael-lam-3f0.workers.dev](https://cko-checkout-demo.michael-lam-3f0.workers.dev).

Useful routes:

- `/` product catalog loaded through `/api/products`
- `/basket` demo shopping cart
- `/checkout` preserved Part 2 checkout
- `/checkout-flow` Part 3 Flow checkout
- `/payment-complete` safe receipt/status/refund screen

## Checking flow

Use this as the main reviewer path:

1. Open `/`, add an item to the basket, and continue from `/basket`.
2. For Part 2, use `/checkout` as the basic checkout route. It demonstrates Payment Links, Hosted Payments Page, direct card payment, and saved-card payment.
3. For Part 3, use `/checkout-flow` as the Flow checkout route. It creates a Checkout.com Payment Session, mounts Checkout.com Flow, and returns through `/payment/flow/return` before showing the payment result.
4. After a payment attempt, review `/payment-complete` for the safe receipt, status, and refund UI where available.

## Flow and 3DS behavior

Checkout Flow collects customer email before creating a Payment Session through `/api/flow/payment-session`. The browser receives the complete unmodified Payment Session response plus the public key, then mounts Checkout.com Flow. Cardholder details, raw PAN, and CVV stay inside Checkout.com-controlled Flow fields.

For synchronous payments, `onPaymentCompleted` links the returned payment ID to the current demo order and confirms status server-side. For redirect or 3DS flows, `/payment/flow/return` treats `cko-payment-id` as a candidate only and verifies payment status server-side before showing a result.

When Checkout.com returns safe source details from the payment lookup, the receipt/status UI displays only the card scheme and last four digits.

## Webhooks

The demo includes a Checkout.com webhook receiver for asynchronous payment and refund updates. Webhook data is verified server-side and stored only as safe session activity for the demo UI.

## Refunds

Refund UI appears on the receipt/status panel only when the server confirms a session-owned payment with `available_to_refund > 0`. A successful refund request returns `202` and is shown as requested, not completed. Final refund state should come from webhook/status updates.

## Security and demo limits

- `CHECKOUT_SECRET_KEY` stays server-only.
- Flow keeps card data out of the application server for the customer-facing checkout.
- The app does not log or persist PAN, CVV, secret keys, Flow session data, or raw webhook payloads.
- Demo state is in memory and is cleared when the server restarts or the session expires.

## Verification

```bash
npm run lint
npm run build
```
