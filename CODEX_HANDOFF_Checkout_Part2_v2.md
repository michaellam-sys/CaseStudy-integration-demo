# Codex Handoff — Checkout.com Case Study Part 2 (Revised: Four Native Integration Models)

## Goal

Build a compact, runnable **Next.js + TypeScript** checkout demonstration for an iPhone-case merchant selling in:

- Hong Kong (`HKD`)
- The Netherlands (`EUR`)

The project should demonstrate four Checkout.com-native ways to accept card payments. This is not four unrelated storefronts. It is one hard-coded basket and one consistent visual design, with an **Integration mode** selector that lets the interviewer exercise and compare four payment acceptance patterns.

## Scope change

Do **not** implement native Apple Pay in this iteration.

Reason: native Apple Pay requires merchant-domain validation, Apple Developer setup, certificates, and an HTTPS environment. It is a valid future extension, but it distracts from the core Checkout.com integration work in a localhost-based case study.

Note: Checkout.com Hosted Payments Page and Payment Links can expose Apple Pay on Checkout.com-hosted checkout pages when the payment method is enabled and eligible. Do not rely on this for acceptance testing unless the sandbox account has it enabled.

---

## Four integration modes

### 1. Hosted Payments Page (HPP)

**Use case:** merchant wants a low-code, Checkout.com-hosted checkout page.

Flow:

```text
Merchant checkout
  -> POST /api/checkout/hpp
  -> Checkout.com POST /hosted-payments (secret key)
  -> response _links.redirect.href
  -> browser redirect to Checkout.com hosted payment page
  -> success / failure / cancel URL
```

Requirements:

- Build `POST /api/checkout/hpp`.
- Server validates basket and calculates amount in minor units.
- Server calls Checkout.com `POST /hosted-payments`.
- Include:
  - `amount`
  - `currency`
  - `billing.address.country`
  - `reference`
  - `processing_channel_id`
  - `success_url`
  - `failure_url`
  - `cancel_url`
  - `products`
  - `allow_payment_methods: ["card"]` initially, or omit to let Checkout.com determine available methods
- Return/redirect to `_links.redirect.href`.
- Success page should read `cko-session-id` or `cko-payment-id` from the query string and show a non-final “Payment received; confirming status…” message.
- Add a server route to query HPP session details if the session ID is available.
- Document that HPP is a feature that may need Checkout.com enablement.

**Important:** Hosted Payments Page cannot be embedded in an iframe. Redirect the browser.

### 2. Payment Links

**Use case:** merchant needs a payment option that can be sent over email, chat, SMS, or used before a full storefront is ready.

Flow:

```text
Merchant checkout / payment request screen
  -> POST /api/checkout/payment-link
  -> Checkout.com POST /payment-links (secret key)
  -> link returned
  -> display Copy Link / Open Link actions
  -> customer opens Checkout.com-hosted payment page
```

Requirements:

- Build `POST /api/checkout/payment-link`.
- Server validates basket and calculates amount in minor units.
- Server calls Checkout.com `POST /payment-links`.
- Include:
  - `amount`
  - `currency`
  - `billing.address.country`
  - `reference`
  - `processing_channel_id`
  - `customer.email` when supplied
  - `products`
  - `expires_in: 86400` (explicit 24-hour expiry is fine)
  - `allow_payment_methods: ["card"]` initially
- Display the returned hosted link with:
  - Copy button
  - Open payment link button
  - expiry label
- Do not attempt actual email delivery; that is out of scope.
- Clearly label this in the UI as “Generate a payment link” rather than a standard consumer checkout option.
- Document that Payment Links are single-use, one-time payment links and may require Checkout.com enablement.

### 3. Direct Card Payment via Payments API

**Use case:** merchant needs maximum control and is prepared for the PCI DSS scope required to handle raw card data.

Flow:

```text
Custom checkout page form
  -> POST /api/payments/direct-card
  -> Checkout.com POST /payments with source.type = "card"
  -> application displays approved / declined / pending result
```

Requirements:

- Build a custom card form:
  - Cardholder name
  - Card number
  - Expiry month/year
  - CVV
  - Customer email
  - billing country
- Use minimal client-side validation:
  - Luhn check
  - expiry not in the past
  - CVV 3–4 digits
- Build `POST /api/payments/direct-card`.
- Server:
  - validates basket server-side
  - maps the market to country/currency
  - uses `source.type = "card"`
  - uses `amount` in minor units
  - uses `currency`
  - uses `processing_channel_id`
  - adds `reference`
  - sets `capture: true`
  - includes a per-attempt `Cko-Idempotency-Key`
  - includes `customer.email` and billing details where supported/appropriate
- Return only safe fields:
  - payment ID
  - approved flag
  - status
  - response code
  - response summary
  - required action / redirect data, if any
- Never return or log PAN, CVV, expiry, Authorization header, or raw Checkout.com request/response body.
- Handle expected outcomes:
  - approved
  - declined
  - validation error
  - 3DS / asynchronous action required
  - unexpected gateway failure

**PCI note to use in README:**

> This proof of concept uses the direct full-card Payments API route to demonstrate low-level payment integration. Checkout.com documents that full card processing is for SAQ D-compliant merchants and requires account enablement. The application does not persist or log cardholder data. In production, the merchant must meet all applicable PCI DSS, operational, infrastructure, and security requirements.

### 4. Tokenize Card -> Pay with Token -> Reuse Saved Payment Instrument

**Use case:** demonstrate token lifecycle, server-side payment execution, Checkout.com customer/payment-instrument creation, and a second purchase with saved credentials.

This mode has two stages.

#### Stage A: initial payment and save card

```text
Custom checkout form
  -> Browser POSTs card fields directly to Checkout.com /tokens using public key
  -> Checkout.com returns one-time tok_ token
  -> Browser POSTs only token + cart/customer details to /api/payments/tokenized
  -> server POSTs /payments with source.type = "token"
  -> Checkout.com returns payment + source.id (src_) and customer.id (cus_)
  -> app stores opaque mapping for current demo session
```

Requirements:

- **Do not send raw card fields through the Next.js server** for this mode.
- Browser calls Checkout.com `POST /tokens` directly using `NEXT_PUBLIC_CHECKOUT_PUBLIC_KEY`.
- The card token is single-use and expires quickly. Immediately submit it to the app server.
- Build `POST /api/payments/tokenized`.
- Server validates basket and customer email, then calls `POST /payments` with:
  - `source.type = "token"`
  - `source.token = "tok_..."`
  - amount/currency/reference/processing channel
  - customer email so Checkout.com can create or associate a customer/payment instrument
  - `3ds.enabled = true` for the initial stored-credential payment, especially relevant for SCA markets such as the Netherlands
- On success, Checkout.com returns:
  - payment ID `pay_...`
  - reusable payment instrument `source.id` (`src_...`)
  - customer ID `customer.id` (`cus_...`)
  - masked metadata such as scheme and last four digits
- Store `src_`, `cus_`, scheme, last four, and expiry in a **server-side in-memory session store**, keyed by a signed, HttpOnly, SameSite cookie with a short TTL. There is no database.
- Document the limitation: restarting the server clears the demo saved-card state.

#### Stage B: subsequent payment with saved card

```text
Customer returns in same demo session
  -> UI shows “Saved Visa •••• 4242”
  -> POST /api/payments/saved-card
  -> server POSTs /payments with source.type = "id", source.id = "src_..."
  -> application displays result
```

Requirements:

- Show saved-card section only after Stage A has succeeded.
- Do not expose `src_` or `cus_` identifiers to browser JavaScript.
- Build `POST /api/payments/saved-card`.
- Server loads instrument ID from its server-side demo session.
- Server calls `POST /payments` with:
  - `source.type = "id"`
  - `source.id = "src_..."`
  - new amount/currency/reference
  - appropriate stored-credential/payment-type data according to the current API contract
- Use a fresh idempotency key and reference for each payment.
- Show that the customer did not need to re-enter card details.

**Critical limitation to state clearly:**

Checkout.com’s current Tokens API says card tokenization with the `card` type should only be used for testing purposes. Therefore, this direct browser-to-`/tokens` card flow is suitable for the sandbox case study but should not be represented as the recommended production card-tokenization design. For a production checkout with lower PCI scope, use Checkout.com’s current hosted/tokenizing components such as Flow or another approved approach.

---

## Product / UI model

This is one merchant site:

- Brand: **Case & Co.**
- Product catalog: 2–3 hard-coded iPhone cases
- Market selector:
  - Hong Kong -> `HKD`, billing country `HK`
  - Netherlands -> `EUR`, billing country `NL`
- A shared order summary and total
- Secondary “Integration approach” selector intended for an interviewer / technical demo:
  1. Hosted Payment Page
  2. Payment Link
  3. Direct Card API
  4. Tokenized Card + Saved Card

Do not frame these as four choices a real consumer normally sees. They are four integration patterns selected by a merchant/implementation decision.

Use provided colors lightly:

- dark: `#323416`
- accent: `#8C9E6E`
- background: `#FFFFFD`

---

## Recommended implementation priority

Do not build all four in parallel.

1. Shared catalog, basket, HK/NL market selector, minor-unit money helpers.
2. Direct Card API (primary functional baseline).
3. Tokenized Card -> payment instrument -> saved-card repeat payment (primary advanced demo).
4. Hosted Payments Page.
5. Payment Links.
6. Optional later: webhook verification, refunds, 3DS variations, localization, Flow comparison.

The direct and tokenized flows give the clearest evidence of API-level skill. HPP and Payment Links demonstrate that you can choose the right low/no-code product for a merchant’s business model rather than defaulting to a custom integration.

---

## Routes

### Pages

```text
/
  -> product/basket and integration approach selector

/payment/success
/payment/failure
/payment/cancel
```

### Application API routes

```text
POST /api/checkout/hpp
GET  /api/checkout/hpp/[sessionId]              # optional status lookup

POST /api/checkout/payment-link

POST /api/payments/direct-card
POST /api/payments/tokenized
POST /api/payments/saved-card

GET  /api/saved-card                             # returns only masked display metadata
POST /api/session/clear-saved-card               # optional demo reset
```

No route should log complete request bodies for direct-card requests.

---

## Environment variables

Create `.env.example` only. No real values in source control.

```bash
# Checkout.com account-specific sandbox host
CHECKOUT_API_BASE_URL=https://YOUR_PREFIX.api.sandbox.checkout.com

# Checkout.com keys
CHECKOUT_SECRET_KEY=sk_sbox_replace_me
NEXT_PUBLIC_CHECKOUT_PUBLIC_KEY=pk_sbox_replace_me
CHECKOUT_PROCESSING_CHANNEL_ID=pc_replace_me

# Application
APP_URL=http://localhost:3000
SESSION_SECRET=replace-with-a-long-random-value

# Feature flags
ENABLE_HPP=true
ENABLE_PAYMENT_LINKS=true
ENABLE_DIRECT_CARD=true
ENABLE_TOKENIZED_CARD_DEMO=true
```

Important:

- Checkout.com API base URLs contain an account/environment-specific prefix.
- Keep secret key server-side.
- Public key may be used by browser tokenization mode.
- Never commit `.env.local`, `sk_` keys, payment IDs from real customer data, or any cardholder data.

---

## Data / security rules

### Common rules

- Amount must be calculated server-side from product IDs and quantities.
- Use integer minor units. Example:
  - HKD 299.00 -> `29900`
  - EUR 34.99 -> `3499`
- Generate a new order reference per attempt:
  - `CASE-HK-20260625-<random>`
  - `CASE-NL-20260625-<random>`
- Send a unique `Cko-Idempotency-Key` on payment creation.
- Do not treat success-page navigation as order fulfilment confirmation.
- In Part 3, add webhooks or server-side status retrieval to confirm final outcome.
- Never store CVV. Never write PAN/CVV to logs, database, analytics, cookies, local storage, error monitoring, or screenshots.

### Full-card direct mode

- Raw card fields reach the Next.js server only for this one deliberate direct-card demonstration.
- Do not use automatic JSON body logging, debug middleware, request dumps, or exception serialization.
- Do not echo invalid values back in validation responses.

### Tokenized mode

- Browser creates `tok_` directly using public key.
- Browser sends token to backend, not raw card fields.
- Token is not a saved payment method; it is short-lived and single-use.
- The reusable object is the `src_` payment instrument received after the successful payment/save flow.

---

## Tests / acceptance criteria

### Shared

- [ ] Hong Kong and Netherlands selection changes currency and total correctly.
- [ ] Product total is calculated server-side.
- [ ] Every payment attempt gets a unique reference/idempotency key.
- [ ] Secret key never reaches browser bundle/network call.

### HPP

- [ ] Clicking HPP creates a checkout session and redirects to Checkout.com URL.
- [ ] HPP success/failure/cancel callback views display safe state.
- [ ] An unavailable feature/configuration error is readable and actionable.

### Payment Links

- [ ] Clicking “Generate payment link” creates a link.
- [ ] User can copy/open it.
- [ ] UI displays expiry and one-time nature.
- [ ] No mail provider required.

### Direct Card

- [ ] Valid sandbox payment produces an approved/authorized/captured outcome.
- [ ] Invalid/declined sandbox outcome is handled cleanly.
- [ ] Double-click does not duplicate payment.
- [ ] No raw card data is logged or retained.

### Tokenized / saved card

- [ ] Browser obtains `tok_` using public key.
- [ ] Backend pays using `source.type = "token"`.
- [ ] Successful initial payment gives saved-card display metadata.
- [ ] Subsequent payment uses `source.type = "id"` from server-held session state.
- [ ] Saved-card demo state disappears after reset/restart and README explains why.

---

## README required sections

1. Overview and four integration patterns.
2. Architecture diagram for each mode.
3. Why these are integration models, not four normal payment methods.
4. Prerequisites and environment setup.
5. How to test direct card mode.
6. How to test tokenized saved-card mode.
7. Hosted Payments Page / Payment Links account enablement notes.
8. Security and PCI boundaries:
   - HPP and Payment Links: Checkout.com hosted; official comparison lists them as SAQ-A.
   - Direct full-card API: SAQ D scope.
   - Direct `/tokens` `card` flow: sandbox/testing demonstration only.
9. Known limitations:
   - no database
   - saved instrument demo is in-memory session only
   - HPP/Payment Links may require account enablement
   - no native Apple Pay in this baseline
10. Part 3 roadmap:
   - 3DS testing/configuration
   - webhook signature validation and fulfilment state
   - refunds
   - HPP/Payment Link locale changes
   - Flow implementation comparison

---

## Checkout.com current documentation to consult

Use Checkout.com official documentation/API reference only:

- Payments solution comparison  
  https://www.checkout.com/docs/payments/accept-payments/payments-solution-comparison

- Hosted Payments Page  
  https://www.checkout.com/docs/payments/accept-payments/accept-a-payment-on-a-hosted-page

- Payment Links  
  https://www.checkout.com/docs/payments/accept-payments/create-a-payment-link

- Payments API  
  https://www.checkout.com/docs/payments/accept-payments/accept-a-payment-using-the-payments-api

- Payment instruments / stored cards  
  https://www.checkout.com/docs/payments/store-and-manage-credentials/store-credentials/payment-instruments

- Tokens API reference  
  https://api-reference.checkout.com/tag/Tokens/

---

## Do not do

- Do not implement Apple Pay in this iteration.
- Do not use Checkout.com Flow in this iteration.
- Do not expose the secret key.
- Do not send full card data through server in tokenized mode.
- Do not claim the application itself is “PCI compliant.”
- Do not represent direct `card` tokenization as a production recommendation.
- Do not fake HPP, Payment Link, or Apple Pay outcomes.
- Do not turn the app into a generic ecommerce platform.
