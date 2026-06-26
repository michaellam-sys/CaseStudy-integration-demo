# Codex Handoff — Checkout.com Case Study Part 3 (Revised: Add Flow)

## Purpose

Extend the existing **Next.js + TypeScript** Checkout.com case-study project.

Part 2 contains four Checkout.com integration models:

1. Hosted Payments Page (HPP)
2. Payment Links
3. Direct card payment through the Payments API
4. Browser tokenization -> payment -> saved payment instrument -> subsequent payment

Part 3 must add **Checkout.com Flow** as the primary, production-oriented checkout implementation. It should also complete the optional requirements in the case-study brief where practical:

- Flow customization
- cardholder name and customer email collection
- Flow localization
- 3D Secure (3DS)
- multi-currency support
- webhooks
- partial and full refunds

## Core product decision

**Flow should become the default checkout experience shown to a normal customer.**

The existing Part 2 options are implementation comparisons and should live behind a small “Integration demos” panel, developer route, or clearly-labelled selector intended for the interviewer.

Do not present five unrelated payment methods to shoppers. Instead:

```text
Customer-facing checkout
  -> Default: Checkout.com Flow

Technical demonstration / comparison area
  -> Hosted Payments Page
  -> Payment Link
  -> Direct Card API
  -> Tokenized Card + Saved Instrument
```

This keeps the journey coherent and makes the architecture easy to explain:

> “For the production-oriented path, I recommend Flow because it keeps raw card data off the merchant server, supports 3DS and additional payment methods with one integration, and can be localized and styled. The other paths demonstrate when a merchant may choose a hosted, assisted-payment, or lower-level API integration.”

The case-study specifically lists **Flow Customizations** as an optional Part 3 task. fileciteturn0file1

---

# 1. Flow scope and architecture

## Required Flow path

```text
Customer browser
  -> Checkout page with cart, customer details, market/currency, locale
  -> POST /api/flow/payment-session
  -> Next.js server validates basket and creates Checkout.com Payment Session
  -> browser receives complete, unmodified payment-session response + public key
  -> browser initializes CheckoutWebComponents
  -> mount Flow into #flow-container
  -> customer pays with an available Flow method
  -> Flow handles card input, tokenization, validation, and 3DS/redirect actions
  -> onPaymentCompleted / success_url callback
  -> app verifies payment status server-side
  -> Checkout.com webhook updates final order lifecycle
```

## Why Flow is the primary path

Flow is Checkout.com’s embeddable payment UI. It tokenizes sensitive payment details so they do not reach the merchant server, displays payment methods available to the customer, collects payment data required by the selected method, and handles 3DS authentication/redirects. citeturn697927search2turn623290search3

For this demo, **do not send PAN, CVV, expiry, or Flow tokenization data through the Next.js backend**. The browser mounts Flow with a public key and a server-created payment session. The secret key is used only by the server to create sessions, look up payment state, process refunds, and manage webhooks.

## Account prerequisites

Before coding, document that the account must have Flow enabled. Checkout.com’s documentation says to contact an account manager or support to enable Flow. citeturn697927search8

Required keys/scopes should be verified in the Checkout.com Dashboard and current documentation. At minimum, use:

```bash
CHECKOUT_API_BASE_URL=https://YOUR_PREFIX.api.sandbox.checkout.com
CHECKOUT_SECRET_KEY=sk_sbox_replace_me
NEXT_PUBLIC_CHECKOUT_PUBLIC_KEY=pk_sbox_replace_me
CHECKOUT_PROCESSING_CHANNEL_ID=pc_replace_me

APP_URL=http://localhost:3000
SESSION_SECRET=replace-with-long-random-value

ENABLE_FLOW=true
```

Do not commit real values.

---

# 2. Customer-facing Flow checkout

## UI requirements

Create a `FlowCheckout` component and make it the default payment panel on `/`.

The page should contain:

- Case & Co. merchant heading
- hard-coded iPhone case basket
- product quantity controls
- market selector:
  - Hong Kong -> billing country `HK`, default currency `HKD`, default Flow locale `zh-hk`
  - Netherlands -> billing country `NL`, default currency `EUR`, default Flow locale `nl`
  - International demo -> billing country `US`, default currency `USD`, default Flow locale `en`
- language override selector:
  - English
  - 繁體中文
  - Nederlands
- customer details section:
  - first name
  - last name
  - email
- order total, formatted using `Intl.NumberFormat`
- Flow payment container
- safe loading/error/pending state
- “Payment is being confirmed” result state after redirect or client completion

Use the case-study palette lightly:

- Dark: `#323416`
- Accent: `#8C9E6E`
- Background: `#FFFFFD`

## Customer data requirements

- Require first name, last name, and email before creating a Payment Session.
- Validate on client for usability and repeat validation on server.
- Pass customer name/email and billing country in the server-side Payment Session request, using the current API schema.
- Do not log customer PII unnecessarily.
- Pre-populate Flow fields where supported:
  - `componentOptions.data.email`
  - `componentOptions.card.data.cardholderName`
- Display cardholder name in Flow:
  - `componentOptions.card.displayCardholderName: "top"`
- Keep CVV mandatory:
  - `componentOptions.card.displayCvv: "mandatory"`

Checkout.com’s Flow library supports pre-populating email and cardholder name and supports positioning the cardholder name field. citeturn302715view2

## Flow Payment Session route

Create:

```text
POST /api/flow/payment-session
```

### Client input

The client may send only:

```ts
type CreateFlowSessionInput = {
  productIds: string[];
  quantities: Record<string, number>;
  market: "HK" | "NL" | "US";
  locale: "zh-hk" | "nl" | "en";
  customer: {
    firstName: string;
    lastName: string;
    email: string;
  };
};
```

The client must **not** send an authoritative amount, currency, payment ID, card data, or Checkout.com credential.

### Server responsibilities

1. Validate the request.
2. Derive line items, amount, currency, billing country, and reference from the server-side catalog.
3. Generate:
   - order reference: `CASE-<market>-<timestamp>-<random>`
   - session/correlation ID
4. Create a Checkout.com Payment Session using the account-specific sandbox base URL.

Use the current `POST /payment-sessions` contract. At minimum the payload should follow this intent:

```ts
{
  amount: 3499,
  currency: "EUR",
  reference: "CASE-NL-...",
  processing_channel_id: process.env.CHECKOUT_PROCESSING_CHANNEL_ID,
  billing: {
    address: {
      country: "NL"
    }
  },
  customer: {
    name: "Ada Lovelace",
    email: "ada@example.test"
  },
  success_url: `${APP_URL}/payment/flow/return?result=success`,
  failure_url: `${APP_URL}/payment/flow/return?result=failure`,
  payment_method_configuration: {
    card: {
      store_payment_details: "collect_consent"
    }
  },
  locale: "nl"
}
```

Important:

- Confirm field names/enums against the current Checkout.com Flow Payment Session API before implementation.
- Send amount in integer minor units only.
- Return the **entire, unmodified** Payment Session response body to the client. Checkout.com requires the unmodified response when initializing Flow. citeturn216740search7
- Return only:
  - `paymentSession` (the complete response)
  - `publicKey`
  - non-sensitive local order metadata such as `reference`, `displayAmount`, and `currency`
- Never return the secret key.

## Client initialization

Install the official package:

```bash
npm install @checkout.com/checkout-web-components
```

Use a client-side component with this shape:

```ts
const checkout = await CheckoutWebComponents({
  paymentSession,
  publicKey,
  environment: "sandbox",
  locale,
  appearance,
  componentOptions,
  onPaymentCompleted: async (_self, paymentResponse) => {
    await confirmPaymentStatus(paymentResponse.id);
  }
});

const flow = checkout.create("flow");
flow.mount("#flow-container");
```

Do not place Flow in an iframe or Shadow DOM. Checkout.com documents both as unsupported. citeturn697927search2

Clean up / unmount Flow when the React component unmounts or when a new payment session is created due to cart, market, or customer-detail changes.

---

# 3. Flow customization

## Appearance

Customize Flow using the `appearance` object, not CSS selectors that reach into Flow internals.

Create:

```text
lib/flow/appearance.ts
```

Use design tokens that match the case-study palette without harming contrast or readability.

Suggested direction:

- primary action / focus color: `#323416`
- accent / secondary highlight: `#8C9E6E`
- page/container background: `#FFFFFD`
- use a clean system font stack
- light rounded borders
- preserve accessible contrast
- do not override card-field security behavior or iframe internals

Checkout.com Flow supports appearance configuration and component-level options. citeturn302715view2turn697927search10

## Card configuration

Use only documented options:

```ts
componentOptions: {
  card: {
    displayCardholderName: "top",
    displayCvv: "mandatory",
    acceptedCardSchemes: ["visa", "mastercard"]
  },
  data: {
    email: customer.email
  }
}
```

Do not hard-code card schemes unless the merchant requirement demands it. For the case study, Visa and Mastercard are acceptable as an optional constraint; otherwise let Flow determine availability.

## Store card details

Set:

```ts
payment_method_configuration: {
  card: {
    store_payment_details: "collect_consent"
  }
}
```

and provide `customer.email` or `customer.id`.

This asks the customer for consent to store credentials. Flow can then support stored-card payments in later checkouts. citeturn302715view3turn302715view4

Treat this as the **production-oriented saved-card demonstration**, and keep the Part 2 `tok_ -> src_` path as a lower-level technical comparison.

---

# 4. Flow localization

## Required languages

- Chinese (Hong Kong): `zh-hk`
- Dutch: `nl`
- English: `en`

Checkout.com Flow derives language from the `locale` in the Payment Session by default. The client `locale` option can explicitly override it. Flow supports Chinese (Hong Kong), Dutch, and English. citeturn302715view0

## Implementation requirements

Create:

```text
lib/i18n/
  en.ts
  zh-hk.ts
  nl.ts

lib/flow/translations.ts
```

Requirements:

- Translate all merchant-owned UI labels, validation messages, checkout results, order timeline, and refund UI.
- Pass the selected locale in the Payment Session request.
- Pass the selected locale to `CheckoutWebComponents`.
- Provide a small Flow `translations` dictionary only for brand-specific wording, such as:
  - Pay button copy
  - generic payment error fallback
  - save-card consent label, where needed
- Do not attempt to translate server-side Checkout.com response codes directly. Map them to stable customer-facing messages.
- Do not falsely assume every Flow string needs custom translation. Use Checkout.com’s native supported language first and keep translation overrides minimal.

## Acceptance criteria

- [ ] Language changes Flow UI and merchant UI.
- [ ] HK market defaults to `zh-hk`.
- [ ] NL market defaults to `nl`.
- [ ] International demo defaults to `en`.
- [ ] A manual language override does not change transaction currency unless the user changes market/currency.

---

# 5. 3DS behavior

## Flow path

Flow must be the preferred 3DS demonstration for the customer-facing route.

Flow performs the payment request and handles additional actions such as 3DS authentication and redirect flows. citeturn302715view4turn623290search0

Requirements:

- Do not implement a custom raw-card 3DS form for the Flow route.
- Do not treat a redirect to `success_url` as payment confirmation.
- For synchronous flows, handle `onPaymentCompleted`.
- For asynchronous / redirect / 3DS flows, use `/payment/flow/return`.
- Retrieve safe payment status server-side after client completion or return redirect.
- Webhook state is authoritative for fulfilment/order-finalization.

## Existing direct API / tokenized API path

Keep the existing Part 3 technical demonstration for explicit `3ds.enabled: true` on the tokenized API flow.

This lets you explain two legitimate integrations:

- **Flow**: Checkout.com manages the payment and 3DS customer journey.
- **Tokenized Payments API**: merchant controls more of the request / redirect logic and explicitly requests 3DS.

Checkout.com explains that 3DS is required for SCA compliance for relevant European card payments and describes integrated 3DS as a payment request with `3ds.enabled: true` that redirects when needed. citeturn623290search2turn623290search4

---

# 6. Apple Pay position

Do **not** make native Apple Pay a mandatory requirement for this Part 3 implementation.

However, add a short README section:

> “Flow is the recommended integration path for future Apple Pay enablement. Apple Pay can appear in Flow once the merchant completes Checkout.com and Apple domain onboarding. This requires a valid HTTPS domain, appropriate key scopes, and Apple Pay enrollment; it cannot be reliably demonstrated from plain localhost.”

Checkout.com’s Flow Apple Pay path requires HTTPS, eligible key scopes, domain onboarding/enrollment, and a server-created payment session. citeturn302715view5

This is a good implementation-engineer point: the code path can be correct while payment-method activation and domain onboarding remain external configuration dependencies.

---

# 7. Payment status, webhooks, and refunds

Keep the Part 3 requirements for:

- payment status retrieval
- webhooks
- partial and full refunds

Flow should use the same shared order/payment state model as the other approaches.

## Status endpoints

```text
GET /api/payments/[paymentId]/status
GET /api/orders/[reference]
```

Rules:

- Resolve payment/order identity from the signed server-side demo session where possible.
- Never accept an arbitrary payment ID as refundable or viewable without checking it belongs to the current demo session.
- Return safe fields only: ID, reference, amount, currency, approved/status, response code/summary, captured amount, available-to-refund, and refund timeline.

## Webhook receiver

```text
POST /api/webhooks/checkout
```

Keep the existing webhook requirements:

- raw body read first
- verify Authorization header
- verify HMAC SHA-256 `Cko-Signature` against raw body
- parse only after verification
- deduplicate by event ID
- acknowledge quickly
- subscribe to:
  - `payment_approved`
  - `payment_captured`
  - `payment_declined`
  - `payment_refunded`
  - `payment_refund_declined`

Use webhook event state, not client-side callback alone, as the final fulfilment signal. Checkout.com’s Flow documentation explicitly advises waiting for webhooks before starting fulfilment. citeturn697927search2turn302715view4

## Refunds

Keep:

```text
POST /api/payments/[paymentId]/refunds
```

Requirements:

- only for captured payments associated with current demo session
- accept partial/full amount
- validate amount against current `available_to_refund`
- use a new idempotency key for each refund attempt
- show `Refund requested` after API acceptance
- mark completed/declined only after webhook or verified payment status
- never provide a UI that can refund arbitrary payment IDs

---

# 8. Suggested routes and files

```text
app/
  page.tsx
  payment/
    flow/
      return/page.tsx
    success/page.tsx
    failure/page.tsx
  api/
    flow/
      payment-session/route.ts
    payments/
      [paymentId]/
        status/route.ts
        refunds/route.ts
      direct-card/route.ts
      tokenized/route.ts
      saved-card/route.ts
    checkout/
      hpp/route.ts
      payment-link/route.ts
    orders/
      [reference]/route.ts
    webhooks/
      checkout/route.ts

components/
  FlowCheckout.tsx
  CustomerDetailsForm.tsx
  OrderSummary.tsx
  MarketSelector.tsx
  LanguageSelector.tsx
  PaymentStatusPanel.tsx
  OrderActivityTimeline.tsx
  RefundForm.tsx
  IntegrationDemos.tsx

lib/
  flow/
    appearance.ts
    translations.ts
    payment-session.ts
  i18n/
    en.ts
    zh-hk.ts
    nl.ts
  checkout-client.ts
  catalog.ts
  money.ts
  order-store.ts
  session.ts
  validation.ts
```

---

# 9. Implementation order

1. Confirm Flow is enabled in the Sandbox account and obtain appropriate key scopes.
2. Add customer details, market/currency selection, and localization foundation.
3. Implement `POST /api/flow/payment-session`.
4. Implement the Flow client component and mount/unmount lifecycle.
5. Add Flow appearance, cardholder name, email prefill, and save-card consent.
6. Implement synchronous completion + redirect return behavior.
7. Reuse/add safe payment-status endpoint.
8. Connect webhooks and order timeline.
9. Add refunds to captured Flow payments.
10. Move the four Part 2 approaches into technical comparison UI/routes.
11. Update README, screenshots, and demo script.

Do not block Flow delivery on Apple Pay onboarding. It is a documented future extension, not a mandatory local-demo test case.

---

# 10. Definition of done

- [ ] Flow is the default checkout panel.
- [ ] Payment Session is created only server-side.
- [ ] Browser receives unmodified Payment Session response and public key only.
- [ ] Flow mounts successfully and accepts a sandbox card payment.
- [ ] Raw PAN/CVV never reaches application server/logs/storage.
- [ ] Customer name/email are collected and passed through the Payment Session contract.
- [ ] Cardholder-name input is displayed in Flow.
- [ ] Save-card consent is enabled through Flow only when customer email/ID is supplied.
- [ ] Flow renders in `zh-hk`, `nl`, and `en`.
- [ ] Appearance reflects the supplied palette and remains readable.
- [ ] 3DS/redirect/return states are handled without assuming a success URL equals success.
- [ ] Webhook and payment-status confirmation drives final order state.
- [ ] Refund UI works only after verified capture and respects refundable amount.
- [ ] README states Flow account enablement and Apple Pay configuration prerequisites.
- [ ] README distinguishes the customer-facing Flow path from the Part 2 technical comparison implementations.

---

# 11. Official documentation to consult

Use current Checkout.com official documentation/API reference only:

- Flow overview / website integration  
  https://www.checkout.com/docs/payments/accept-payments/accept-a-payment-on-your-website

- Get started with Flow  
  https://www.checkout.com/docs/payments/accept-payments/accept-a-payment-on-your-website/get-started-with-flow

- Flow customization  
  https://www.checkout.com/docs/payments/accept-payments/accept-a-payment-on-your-website/customize-your-flow-integration

- Flow localization  
  https://www.checkout.com/docs/payments/accept-payments/accept-a-payment-on-your-website/add-localization-to-your-flow-integration

- Stored card credentials with Flow  
  https://www.checkout.com/docs/payments/accept-payments/accept-a-payment-on-your-website/extend-your-flow-integration/accept-payments-with-stored-card-credentials

- Flow API reference  
  https://api-reference.checkout.com/tag/Flow/

- CheckoutWebComponents library reference  
  https://www.checkout.com/docs/payments/accept-payments/accept-a-payment-on-your-website/flow-library-reference/checkoutwebcomponents

- Apple Pay with Flow  
  https://www.checkout.com/docs/payments/add-payment-methods/apple-pay/web

- Checkout.com webhooks  
  https://www.checkout.com/docs/developer-resources/event-notifications/receive-webhooks/configure-your-webhook-server

- Refund a payment  
  https://www.checkout.com/docs/payments/manage-payments/refund-a-payment/refund-a-payment-with-a-reference
