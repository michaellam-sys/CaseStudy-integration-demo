# Case & Co. Checkout.com Demo

Compact Next.js + TypeScript demo for an iPhone-case merchant comparing Checkout.com payment integration patterns.

## Routes

- `/checkout-v1` preserves the Part 2 checkout flow.
- `/checkout-v2` contains the Part 3 enhancements.
- `/checkout` redirects to `/checkout-v2`.
- `/payment/3ds/return` verifies tokenized 3DS returns against the current demo session before showing a result.

## Part 2 preserved in v1

Checkout v1 still demonstrates:

- Payment Links
- Hosted Payments Page
- Direct card payment through the Payments API
- Saved card payment using a server-held instrument ID

The v1 checkout calls versioned API routes under `/api/checkout-v1` and `/api/payments-v1` so future v2 changes do not break the Part 2 demo.

## Part 3 enhancements in v2

Checkout v2 adds:

- Customer name, cardholder name, email, and billing country collection.
- Merchant UI localization for English, Traditional Chinese, and Dutch.
- HKD, EUR, and USD market/currency support with server-side amount calculation.
- Tokenized card payment with `3ds.enabled: true`.
- Safe server-side payment status lookup.
- Session-scoped order activity state.
- Checkout.com webhook receiver with Authorization and raw-body `Cko-Signature` verification.
- Partial and full refund requests for captured, current-session payments.

Checkout.com Flow and native Apple Pay are intentionally out of scope.

## Environment

Create `.env.local` using `.env.example` as a starting point:

```bash
CHECKOUT_API_BASE_URL=https://YOUR_PREFIX.api.sandbox.checkout.com
CHECKOUT_SECRET_KEY=sk_sbox_replace_me
CHECKOUT_PROCESSING_CHANNEL_ID=pc_replace_me
NEXT_PUBLIC_CHECKOUT_PUBLIC_KEY=pk_sbox_replace_me
NEXT_PUBLIC_CHECKOUT_PROCESSING_CHANNEL_ID=pc_replace_me
APP_URL=http://localhost:3000

WEBHOOK_PUBLIC_URL=https://your-public-tunnel.example/api/webhooks/checkout
CHECKOUT_WEBHOOK_AUTHORIZATION_KEY=replace_me
CHECKOUT_WEBHOOK_SIGNATURE_KEY=replace_me
CHECKOUT_WEBHOOK_WORKFLOW_ID=
```

Legacy Part 2 names are still supported: `CKO_SK`, `NEXT_PUBLIC_CKO_PK`, `PROCESSING_CHANNEL_ID`, `NEXT_PUBLIC_PROCESSING_CHANNEL_ID`, and `BASE_CHECKOUT_URL`.

## Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Useful routes:

- `/` product catalog loaded through `/api/products`
- `/basket` demo shopping cart
- `/profile` card tokenization and saved-card onboarding
- `/checkout-v1` preserved Part 2 checkout
- `/checkout-v2` Part 3 checkout
- `/payment-complete` safe receipt/status/refund screen

## 3DS behavior

The v2 tokenized-card mode sends card details directly from the browser to Checkout.com `/tokens` with the public key. The app server receives only the `tok_...` token, then creates a payment with `source.type = "token"` and `3ds.enabled = true`.

If Checkout.com returns a redirect URL, the browser follows it. The return URL is not treated as proof of success; `/payment/3ds/return` verifies the session-owned pending payment server-side.

## Webhooks

Checkout.com must reach the receiver, so local development needs a public tunnel:

```bash
WEBHOOK_PUBLIC_URL=https://<public-tunnel-domain>/api/webhooks/checkout
```

Register and test a workflow:

```bash
npm run webhook:register
npm run webhook:test
```

The receiver verifies the configured `Authorization` header and computes HMAC-SHA256 over the raw request body before parsing JSON. It deduplicates events by event ID and stores only safe event/payment/refund details in memory.

## Refunds

Refund UI appears on the receipt/status panel only when the server confirms a session-owned payment with `available_to_refund > 0`. A successful refund request returns `202` and is shown as requested, not completed. Final refund state should come from webhook/status updates.

## Security and demo limits

- `CHECKOUT_SECRET_KEY`/`CKO_SK` stay server-only.
- Direct-card mode intentionally sends full card details through the Next.js server and is only a low-level Payments API demonstration for appropriately scoped merchants.
- Tokenized 3DS mode keeps PAN/CVV browser-to-Checkout.com.
- The app does not log or persist PAN, CVV, expiry, secret keys, or raw webhook payloads.
- Demo state is in memory and is cleared when the server restarts or the session expires.
- There is no database, auth system, inventory platform, email provider, Checkout.com Flow integration, or Apple Pay integration.

## Verification

```bash
npm run lint
npm run build
```
