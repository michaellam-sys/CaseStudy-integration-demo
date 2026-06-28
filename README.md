# Case & Co. Checkout.com Demo

Compact Next.js + TypeScript demo for an iPhone-case merchant using Checkout.com.

## Routes

- `/checkout` preserves the Part 2 comparison checkout.
- `/checkout-flow` is the Part 3 customer-facing Checkout.com Flow checkout.
- `/payment/flow/return` verifies Flow redirect/3DS returns against the current demo session before showing a result.

## Part 2 preserved in checkout

Checkout still demonstrates:

- Payment Links
- Hosted Payments Page
- Direct card payment through the Payments API
- Saved card payment using a server-held instrument ID

The checkout calls versioned API routes under `/api/checkout-v1` and `/api/payments-v1` so Part 3 Flow changes do not break the Part 2 demo.

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

Native Apple Pay is not implemented directly. Flow is the recommended future path for Apple Pay once the merchant completes Checkout.com and Apple domain onboarding with a valid HTTPS domain, eligible key scopes, and Apple Pay enrollment.

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

Flow must be enabled for the Checkout.com sandbox account. The public key needs payment-session payment/tokenization scopes, and the secret key needs payment-session and payment-management scopes for session creation, status lookup, webhooks, and refunds.

Legacy Part 2 names are still supported: `CKO_SK`, `NEXT_PUBLIC_CKO_PK`, `PROCESSING_CHANNEL_ID`, `NEXT_PUBLIC_PROCESSING_CHANNEL_ID`, and `BASE_CHECKOUT_URL`.

## Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Useful routes:

- `/` product catalog loaded through `/api/products`
- `/basket` demo shopping cart
- `/profile` in-memory card tokenization and saved-card onboarding
- `/checkout` preserved Part 2 checkout
- `/checkout-flow` Part 3 Flow checkout
- `/payment-complete` safe receipt/status/refund screen

## Flow and 3DS behavior

Checkout Flow collects customer email before creating a Payment Session through `/api/flow/payment-session`. The browser receives the complete unmodified Payment Session response plus the public key, then mounts Checkout.com Flow. Cardholder details, raw PAN, and CVV stay inside Checkout.com-controlled Flow fields.

The profile page demonstrates two in-memory card-saving approaches. Direct Tokens API and the standalone card component create reusable instruments and store only the safe instrument reference in memory for saved-card checkout.

For synchronous payments, `onPaymentCompleted` links the returned payment ID to the current demo order and confirms status server-side. For redirect or 3DS flows, `/payment/flow/return` treats `cko-payment-id` as a candidate only and verifies payment status server-side before showing a result.

When Checkout.com returns safe source details from the payment lookup, the receipt/status UI displays only the card scheme and last four digits.

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

For the Payment Link demo, `/checkout` saves a session-scoped order when the link is created. The payment-link section then shows a **Checkout.com webhook** panel that waits for Checkout.com to send the asynchronous payment event. When the webhook arrives, the panel changes from waiting to received and displays safe event details such as the event ID, payment ID, timestamp, and gateway response.

The webhook route also emits structured, safe logs with `event: "checkout.webhook"` for Cloudflare Observability. It does not log raw webhook bodies, signatures, Authorization headers, card data, or secret keys.

## Cloudflare deployment

The app deploys to Cloudflare Containers through `.github/workflows/deploy-cloudflare-containers.yml`. The workflow runs only when a version tag is pushed:

```yaml
on:
  push:
    tags:
      - "v*.*.*"
```

Required GitHub Actions secrets:

```bash
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
CHECKOUT_SECRET_KEY
CHECKOUT_WEBHOOK_AUTHORIZATION_KEY
CHECKOUT_WEBHOOK_SIGNATURE_KEY
```

Required GitHub Actions variables:

```bash
CHECKOUT_API_BASE_URL
CHECKOUT_PROCESSING_CHANNEL_ID
NEXT_PUBLIC_CHECKOUT_PUBLIC_KEY
NEXT_PUBLIC_CHECKOUT_PROCESSING_CHANNEL_ID
APP_URL
WEBHOOK_PUBLIC_URL
CHECKOUT_WEBHOOK_WORKFLOW_ID
```

`APP_URL` should be the deployed Worker URL, for example:

```bash
https://cko-checkout-demo.michael-lam-3f0.workers.dev
```

`WEBHOOK_PUBLIC_URL` should point to the deployed webhook route:

```bash
https://cko-checkout-demo.michael-lam-3f0.workers.dev/api/webhooks/checkout
```

The workflow renders `wrangler.jsonc`, writes the Checkout webhook secrets to `.wrangler-secrets.json`, and runs:

```bash
wrangler deploy --secrets-file .wrangler-secrets.json
```

Wrangler builds the local `Dockerfile`, pushes changed image layers to Cloudflare's managed registry, and deploys the Worker that forwards traffic to the container.

Deployment steps:

```bash
npm run lint
npm run build
git status --short
git add <changed-files>
git commit -m "your change"
git tag v0.0.4
git push origin main
git push origin v0.0.4
```

Use the next unused semantic version tag each time, such as `v0.0.5` after `v0.0.4`. After GitHub Actions completes, check the public Worker URL and the Cloudflare dashboard:

- GitHub Actions: `Deploy Cloudflare Containers`
- Cloudflare Worker: `cko-checkout-demo`
- Cloudflare Container app: `cko-checkout-demo-checkoutcontainer`

## Refunds

Refund UI appears on the receipt/status panel only when the server confirms a session-owned payment with `available_to_refund > 0`. A successful refund request returns `202` and is shown as requested, not completed. Final refund state should come from webhook/status updates.

## Security and demo limits

- `CHECKOUT_SECRET_KEY`/`CKO_SK` stay server-only.
- Flow keeps card data out of the application server for the customer-facing checkout.
- In-memory saved-card instruments and Flow stored-card customer IDs stay server-side in demo-session stores.
- Direct-card mode remains only in the preserved `/checkout` technical demo.
- The app does not log or persist PAN, CVV, expiry, secret keys, Flow session data, or raw webhook payloads.
- Demo state is in memory and is cleared when the server restarts or the session expires.
- There is no database, auth system, inventory platform, email provider, or native Apple Pay implementation.

## Verification

```bash
npm run lint
npm run build
```
