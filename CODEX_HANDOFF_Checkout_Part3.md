# Codex Handoff — Checkout.com Case Study Part 3 (Optional Enhancements)

## Goal

Extend the existing **Next.js + TypeScript** case-study app. Part 2 contains one hard-coded iPhone-case basket and four Checkout.com integration models:

1. Hosted Payments Page (HPP)
2. Payment Links
3. Direct full-card Payments API
4. Tokenized card → payment → saved payment instrument → subsequent payment

Part 3 adds the following optional enhancements:

1. Collect customer/cardholder name and email and forward them through supported Checkout.com request fields.
2. Localize the merchant checkout UI.
3. Require 3D Secure (3DS) for the first tokenized-card payment.
4. Support HKD, EUR, and USD transactions.
5. Register, receive, authenticate, and process Checkout.com webhooks.
6. Enable partial and full refunds after captured payments.

## Scope decisions

- Do **not** add Checkout.com Flow in this iteration.
- Do **not** add native Apple Pay in this iteration.
- The original case-study request to display Flow in another language is implemented here as **merchant-site localization**, because Flow is intentionally excluded.
- Keep the hard-coded product catalog and server-side amount calculation.
- Do not add a database, auth system, inventory platform, or email provider.
- Do not claim the application itself is formally PCI DSS compliant.

---

# 1. Architecture and non-negotiable security boundaries

```text
Browser
  ├─ Localized checkout UI
  ├─ HPP / Payment Link actions
  ├─ Direct-card API form
  └─ Tokenized-card + 3DS form
       ├─ browser calls Checkout.com /tokens using public key
       ├─ app server creates payment with 3ds.enabled = true
       ├─ browser follows redirect when Checkout.com requires it
       └─ app verifies final safe payment status after return

Next.js server
  ├─ Server-only Checkout.com secret-key calls
  ├─ In-memory session/order state for this demo only
  ├─ Webhook receiver with authorization and HMAC checks
  ├─ Safe payment status endpoint
  └─ Refund endpoint after capture verification
```

## Security rules

- `CHECKOUT_SECRET_KEY` must remain server-only. Never expose it in the browser bundle, source control, logs, errors, or client requests.
- Never log, persist, serialize, screenshot, analyze, or send PAN, CVV, or expiry values to monitoring/analytics tools.
- For tokenized + 3DS mode, card data travels only **browser → Checkout.com `/tokens`** using the public key. It must not pass through Next.js.
- Do not persist `tok_` tokens. They are short-lived and single-use.
- Keep `src_` payment-instrument IDs and `cus_` IDs server-side. Associate them with a signed, HttpOnly, SameSite cookie and short in-memory TTL.
- Refund endpoints may refund only payment IDs connected to the current demo session. Never accept a browser-submitted arbitrary `pay_...` ID.
- Verify webhook signatures against the **raw HTTP request body**, not reserialized JSON.
- Deduplicate webhook events by event ID.

---

# 2. Enhancement A — Customer data collection

## Objective

Collect cardholder/customer name and email in direct-card and tokenized-card checkout, then pass them to Checkout.com through current supported endpoint fields.

## UI requirements

Add a **Customer details** section above payment details:

- First name — required
- Last name — required
- Email — required
- Billing country — derived from selected market, visible as read-only or controlled selector
- Cardholder name — required for card entry; default to first + last name but remain editable

Validation:

- Trim values.
- Validate email with a practical email rule.
- Reject empty/whitespace names.
- Localize all messages.
- Never include raw customer form data in debug logs.

## Checkout.com request mapping

Use current API reference/request types; do not invent fields. The intended mapping is:

```ts
{
  source: {
    type: "card",
    number: "...",
    expiry_month: 12,
    expiry_year: 2027,
    cvv: "...",
    name: "Ada Lovelace"
  },
  customer: {
    name: "Ada Lovelace",
    email: "ada@example.test"
  },
  billing: {
    address: { country: "HK" }
  }
}
```

### Direct Card API

- Send cardholder name in the card source if supported by current contract.
- Send customer name/email and billing country using current Payments API fields.
- Do not echo raw card data in validation/API responses.

### Tokenized card + 3DS

- Cardholder name/email remain merchant-collected data.
- After browser tokenization, the server creates a payment with customer/billing data.
- Store only safe session display data: first name, email, masked scheme/last four, payment ID, amount, currency, reference, and status.

### HPP and Payment Links

- Pass available `customer` and `billing` fields when current schema supports them.
- Billing country is required input for eligible-method selection.
- Do not block HPP/Payment Link generation solely because optional customer data is absent unless the actual endpoint schema requires it.

## Acceptance criteria

- [ ] Direct card and tokenized modes collect/validate customer name and email.
- [ ] Supported customer and billing fields are forwarded to Checkout.com.
- [ ] HPP/Payment Link creation includes billing country and available customer data.
- [ ] Customer data is never mixed with PAN/CVV storage/logging.

---

# 3. Enhancement B — Localization and multi-currency

## Objective

Localize the merchant application for the two target markets and add USD as a third technical-demo currency.

## Supported combinations

| Market | Default language | Locale | Currency | Billing country |
|---|---|---|---|---|
| Hong Kong | Traditional Chinese | `zh-HK` | `HKD` | `HK` |
| Netherlands | Dutch | `nl-NL` | `EUR` | `NL` |
| International test mode | English | `en-US` | `USD` | `US` |

`International test mode` exists to demonstrate multi-currency handling; do not present it as a business expansion claim.

## UI requirements

- Add language picker: English, 繁體中文, Nederlands.
- Default language follows market; user can override it.
- Persist only non-sensitive language preference in cookie/local storage.
- Translate all merchant-controlled content:
  - titles/headings
  - product descriptions
  - form labels
  - validation errors
  - payment state labels
  - refund UI
  - order activity timeline
  - safe error messages
- Map Checkout.com response codes to stable localized user-facing text; do not translate/alter raw codes internally.

## Implementation requirements

Use lightweight in-repo dictionaries:

```text
lib/i18n/
  en-US.ts
  zh-HK.ts
  nl-NL.ts
  index.ts
```

Use:

```ts
new Intl.NumberFormat(locale, { style: "currency", currency })
```

All Checkout.com amounts must remain integers in minor units. Prices must be derived server-side from catalog IDs, quantities, and selected market/currency. Never trust browser amount input.

Example catalog conversions:

- HKD 299.00 → `29900`
- EUR 34.99 → `3499`
- USD 37.99 → `3799`

### HPP / Payment Link language note

HPP and Payment Links have built-in language support, but do **not** invent a request `locale` property. Check the current endpoint schema at implementation time and add a Checkout.com-specific localization field only if documented. The merchant UI must be localized regardless.

## Acceptance criteria

- [ ] English, Traditional Chinese, and Dutch work without page errors.
- [ ] Market defaults are HKD / EUR / USD as specified.
- [ ] Form errors, payment states, order timeline, and refund states are localized.
- [ ] Server independently validates currency and calculates integer minor-unit amount.

---

# 4. Enhancement C — Required 3DS for initial tokenized payment

## Objective

Require 3DS for the **initial customer-initiated tokenized card payment** that creates/saves a payment instrument. This is the custom 3DS route for the case study.

## Required flow

```text
Card form in browser
  → Checkout.com /tokens with public key
  → app POST /api/payments/tokenized with tok_ value
  → server POST /payments
       source.type = "token"
       3ds.enabled = true
  → browser redirects only if Checkout.com provides redirect action
  → return page calls safe server status endpoint
  → final approved/pending/declined/failed state shown
```

## Update route: `POST /api/payments/tokenized`

Validate basket, selected market/currency, customer data, and token format. Build the payment request from the current Checkout.com API contract:

```ts
{
  source: { type: "token", token: "tok_..." },
  amount: /* server calculated minor units */,
  currency: "EUR",
  reference: "CASE-NL-...",
  processing_channel_id: process.env.CHECKOUT_PROCESSING_CHANNEL_ID,
  capture: true,
  customer: { /* current supported fields */ },
  billing: { /* current supported fields */ },
  "3ds": { enabled: true },
  success_url: `${APP_URL}/payment/3ds/return?result=success`,
  failure_url: `${APP_URL}/payment/3ds/return?result=failure`
}
```

Also:

- Send a fresh `Cko-Idempotency-Key` UUID.
- Save a pending safe payment record in the server-side demo session before responding.
- Return only safe fields: payment ID, status, approved boolean, response code/summary, and next action URL if needed.

## Return page: `/payment/3ds/return`

- Resolve payment ID from authenticated server-side session state; do not trust an arbitrary `pay_...` query parameter.
- Fetch safe payment status server-side.
- Show one of: approved/captured, pending, declined, failed, unable to confirm.
- Do not treat navigation to `success_url` as final proof of success.

## Safe status route

Create:

```text
GET /api/payments/[paymentId]/status
```

- Verify payment belongs to current session.
- Retrieve payment details server-to-server from Checkout.com.
- Return only safe status, balances, amount/currency/reference, payment ID, and refund availability.
- Never return raw source card details or raw upstream response.

## Boundaries

- HPP and Payment Links use Checkout.com-hosted authentication; do not build custom 3DS UI for them.
- Direct-card mode remains a separate direct API demonstration; do not falsely claim it follows the tokenized 3DS sequence.
- Saved-card follow-up is customer-triggered in this demo. Do not label it MIT unless implementing current stored-credential/recurring rules correctly.

## Acceptance criteria

- [ ] Initial tokenized payment includes `3ds.enabled: true`.
- [ ] Browser redirects only when instructed by Checkout.com.
- [ ] Return page verifies final state using server-side status retrieval.
- [ ] Pending, declined, failure, and success states are distinct.
- [ ] A successful initial flow can expose safe saved-instrument display metadata.

---

# 5. Enhancement D — Webhooks

## Objective

Register a Checkout.com webhook workflow and receive authenticated payment lifecycle notifications.

## Required events

At minimum register:

- `payment_approved`
- `payment_captured`
- `payment_declined`

Also register refund-related events needed by this Part 3 scope:

- `payment_refunded`
- `payment_refund_declined`

Optional useful events:

- `payment_pending`
- `payment_refund_pending`

## Local development prerequisite

Checkout.com must reach the webhook receiver. Use a public tunnel, for example ngrok or Cloudflare Tunnel:

```text
WEBHOOK_PUBLIC_URL=https://<public-tunnel-domain>/api/webhooks/checkout
```

Never commit a personal/temporary tunnel URL.

## Environment variables

Add to `.env.example`:

```bash
CHECKOUT_API_BASE_URL=https://YOUR_PREFIX.api.sandbox.checkout.com
CHECKOUT_SECRET_KEY=sk_sbox_replace_me
CHECKOUT_PROCESSING_CHANNEL_ID=pc_replace_me
APP_URL=http://localhost:3000

WEBHOOK_PUBLIC_URL=https://your-public-tunnel.example/api/webhooks/checkout
CHECKOUT_WEBHOOK_AUTHORIZATION_KEY=replace_me
CHECKOUT_WEBHOOK_SIGNATURE_KEY=replace_me
CHECKOUT_WEBHOOK_WORKFLOW_ID=
```

## Registration script

Create:

```text
scripts/register-checkout-webhook.ts
scripts/test-checkout-webhook.ts
```

Add scripts:

```json
{
  "scripts": {
    "webhook:register": "tsx scripts/register-checkout-webhook.ts",
    "webhook:test": "tsx scripts/test-checkout-webhook.ts"
  }
}
```

### `webhook:register`

- Fail early if any webhook/key/base-url env is missing.
- Use Checkout.com Workflows API to create a webhook workflow.
- Scope to configured processing channel when current API supports it.
- Configure action:
  - URL = `WEBHOOK_PUBLIC_URL`
  - `Authorization` header = `CHECKOUT_WEBHOOK_AUTHORIZATION_KEY`
  - signature key = `CHECKOUT_WEBHOOK_SIGNATURE_KEY`
- Subscribe to required event types.
- Print workflow ID, public URL, and event types only. Never output secret values.
- Store workflow ID only in `.env.local` or ask developer to copy it there; never modify source-controlled files.

### `webhook:test`

- If workflow ID exists, call Checkout.com Test Workflow endpoint.
- Receiver/UI should label `isTest` events clearly.
- Treat test payload data as example data; it may not match active checkout session/order.

## Webhook receiver route

Create:

```text
POST /api/webhooks/checkout
```

### Mandatory verification sequence

1. Read raw body: `await request.text()`.
2. Compare inbound `Authorization` header with configured authorization key using timing-safe comparison.
3. Compute `HMAC-SHA256(rawBody, CHECKOUT_WEBHOOK_SIGNATURE_KEY)`.
4. Compare it with inbound `Cko-Signature` using timing-safe comparison.
5. Only then parse JSON.
6. Reject invalid authorization/signature with safe `401`/`400` response.
7. Acknowledge valid webhooks promptly, within 10 seconds.

### State handling

- Deduplicate by webhook event `id` using in-memory TTL storage.
- Update order state only if event is newer or is a valid lifecycle transition.
- Store only safe values:
  - event ID/type/time
  - payment ID
  - order reference
  - amount/currency
  - response code/summary
  - payment/refund status
  - `available_to_refund` where supplied
- Do not retain full raw payloads beyond what is necessary for a short diagnostic period.

### UI behavior

Add `Order activity` timeline on payment status/success pages:

- Payment created
- 3DS required / completed where applicable
- Payment approved
- Payment captured
- Payment declined
- Refund requested
- Refund pending
- Refund completed
- Refund declined

Use safe app polling, not browser calls to Checkout.com:

```text
GET /api/orders/[reference]
```

Only return data associated with current session.

## Acceptance criteria

- [ ] Webhook receiver is configurable by public URL.
- [ ] Registration script creates a workflow with expected events.
- [ ] Receiver verifies Authorization and `Cko-Signature` against raw body.
- [ ] Event handling is idempotent by event ID.
- [ ] `payment_approved`, `payment_captured`, `payment_declined` update UI state.
- [ ] Refund webhooks update UI final state.
- [ ] No secrets/card data enter logs.

---

# 6. Enhancement E — Partial and full refunds

## Objective

After a captured payment, let the user request a partial or full refund in the original transaction currency.

## Scope

- Refund only captured payments connected to current demo session.
- Support any Part 2 mode only after server-side confirmation of a captured Checkout.com payment ID associated with current session.
- Do not build “refund arbitrary payment ID”.
- Use referenced refunds only; do not implement unreferenced refunds.

## UI requirements

Show `Refund payment` only when:

- Payment is captured/eligible.
- `available_to_refund > 0`.
- Payment belongs to current session.
- No pending refund is blocking another submission.

Show:

- Original captured amount
- Total refunded
- Available to refund
- Currency
- Refund amount input
- `Refund full amount` action
- `Submit refund` action
- Refund timeline/status

Validation:

- Permit localized decimal input in UI but parse/validate server-side.
- Convert to minor units server-side.
- Requested amount must be greater than zero and less than/equal to current `available_to_refund`.
- Disable duplicate submits while pending.
- Wording must distinguish:
  - **Refund requested** after Checkout.com accepts request
  - **Refund completed** only after webhook/status confirms it
  - **Refund declined** after webhook/status confirms it

## Route

Create:

```text
POST /api/payments/[paymentId]/refunds
```

### Server behavior

1. Verify current session owns payment ID.
2. Retrieve payment details server-side or use trusted recent webhook state.
3. Confirm captured/eligible state and current `available_to_refund`.
4. Create refund reference: `REF-<original-reference>-<random>`.
5. Create a new idempotency UUID.
6. POST Checkout.com:

```text
POST /payments/{paymentId}/refunds
```

with integer minor-unit amount, reference, optional safe metadata, and `Cko-Idempotency-Key`.

7. Return safe response only:

```ts
{
  accepted: true,
  actionId: "act_...", // where returned
  reference: "REF-...",
  amount: 3499,
  currency: "EUR",
  status: "requested"
}
```

## Critical rules

- `202 Refund accepted` is asynchronous acceptance, not refund completion.
- Final UI status must be driven by `payment_refunded` or `payment_refund_declined` webhook/status.
- Full refund may occur once.
- Multiple partial refunds may be allowed, but total cannot exceed original captured amount.
- Processed refunds cannot be cancelled.
- Refund currency must match original captured-payment currency.
- Idempotency must prevent duplicate refunds on retry.

## Acceptance criteria

- [ ] Refund UI appears only for verified captured payment in current session.
- [ ] Valid partial refund works.
- [ ] Full refund uses exactly `available_to_refund`.
- [ ] Over-refund is rejected in UI and server.
- [ ] Fresh idempotency key used per refund attempt.
- [ ] HTTP `202` shown as requested, not completed.
- [ ] Final webhook/status updates refund state correctly.

---

# 7. Suggested file structure

```text
app/
  page.tsx
  payment/
    success/page.tsx
    failure/page.tsx
    cancel/page.tsx
    3ds/
      return/page.tsx
  api/
    payments/
      direct-card/route.ts
      tokenized/route.ts
      saved-card/route.ts
      [paymentId]/
        status/route.ts
        refunds/route.ts
    checkout/
      hpp/route.ts
      payment-link/route.ts
    orders/
      [reference]/route.ts
    webhooks/
      checkout/route.ts

components/
  CustomerDetailsForm.tsx
  CardPaymentForm.tsx
  Tokenized3dsCardForm.tsx
  PaymentStatusPanel.tsx
  OrderActivityTimeline.tsx
  RefundForm.tsx
  LanguageSelector.tsx
  MarketSelector.tsx

lib/
  checkout-client.ts
  checkout-payments.ts
  checkout-webhooks.ts
  catalog.ts
  money.ts
  order-store.ts
  session.ts
  validation.ts
  i18n/
    en-US.ts
    zh-HK.ts
    nl-NL.ts
    index.ts

scripts/
  register-checkout-webhook.ts
  test-checkout-webhook.ts

README.md
.env.example
```

---

# 8. Implementation order

1. Add customer model, input fields, validation, and safe request mapping.
2. Add translations, language picker, market/currency mapping, and Intl formatting.
3. Add 3DS to tokenized initial payment and handle redirect/return/status verification.
4. Add safe order/payment in-memory state plus status/order endpoints.
5. Add webhook receiver with raw-body HMAC verification and idempotency.
6. Add webhook registration/test scripts.
7. Add refund UI and server endpoint.
8. Test all sandbox flows.
9. Update README, screenshots, and demo notes.

Do not build all changes at once. Preserve a working flow at each checkpoint.

---

# 9. README additions

Add these sections:

1. **Part 3 enhancements** — customer data, localization, currencies, 3DS, webhooks, refunds.
2. **3DS behavior** — `3ds.enabled: true` on initial tokenized payment; redirect only as required; return URL is not authoritative.
3. **Webhook setup** — app start, public tunnel, environment variables, `npm run webhook:register`, testing flow.
4. **Refund behavior** — captured payments only; asynchronous; webhook confirms final outcome; partial/full constraints.
5. **Security and PCI boundaries** — direct full-card API mode is deliberately SAQ D scope; no PAN/CVV/expiry/secret key logging or storage. Tokenized 3DS uses browser-to-Checkout tokenization.
6. **Known demo limitations** — in-memory state reset, public tunnel requirement, HPP/Payment Link account enablement, no Apple Pay/Flow.

---

# 10. Official resources to verify at implementation time

Use current official Checkout.com docs/API reference only:

- Payments API: https://www.checkout.com/docs/payments/accept-payments/accept-a-payment-using-the-payments-api
- Integrated 3DS: https://www.checkout.com/docs/payments/authenticate-payments
- 3DS overview: https://www.checkout.com/docs/payments/authenticate-payments/3d-secure
- Webhook server: https://www.checkout.com/docs/developer-resources/event-notifications/receive-webhooks/configure-your-webhook-server
- Webhook API: https://www.checkout.com/docs/developer-resources/event-notifications/receive-webhooks/manage-webhooks-using-the-api
- Event types: https://www.checkout.com/docs/developer-resources/event-notifications/event-types
- Refunds: https://www.checkout.com/docs/payments/manage-payments/refund-a-payment/refund-a-payment-with-a-reference
- Payment solution comparison: https://www.checkout.com/docs/payments/accept-payments/payments-solution-comparison
- API reference: https://api-reference.checkout.com/

Do not rely on old Frames examples or generic/non-prefix sandbox URLs.

---

# 11. Definition of done

- [ ] Customer name/email captured and passed safely in supported requests.
- [ ] UI supports English, Traditional Chinese, and Dutch.
- [ ] HKD, EUR, and USD routes calculate/display/send amounts correctly.
- [ ] Initial tokenized payment uses 3DS and verifies outcome server-side.
- [ ] Webhook workflow can be registered via script.
- [ ] Receiver authenticates raw body with Authorization and `Cko-Signature`.
- [ ] Core payment lifecycle events display in order activity.
- [ ] User can request partial/full refunds only after captured payment.
- [ ] Refund final state uses webhook/status, not only API acceptance.
- [ ] No secrets or card data are exposed/logged.
- [ ] README describes only tested functionality.
