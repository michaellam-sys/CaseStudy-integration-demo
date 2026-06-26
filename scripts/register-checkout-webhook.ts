const requiredEvents = [
  "payment_approved",
  "payment_captured",
  "payment_declined",
  "payment_pending",
  "payment_refunded",
  "payment_refund_pending",
  "payment_refund_declined",
];

export {};

function env(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

function checkoutBaseUrl() {
  return env("CHECKOUT_API_BASE_URL").replace(/\/+$/, "");
}

async function main() {
  const baseUrl = checkoutBaseUrl();
  const secretKey = env("CHECKOUT_SECRET_KEY");
  const publicUrl = env("WEBHOOK_PUBLIC_URL");
  const authorizationKey = env("CHECKOUT_WEBHOOK_AUTHORIZATION_KEY");
  const signatureKey = env("CHECKOUT_WEBHOOK_SIGNATURE_KEY");
  const processingChannelId = process.env.CHECKOUT_PROCESSING_CHANNEL_ID?.trim();
  const conditions: unknown[] = [
    {
      type: "event",
      events: {
        gateway: requiredEvents,
      },
    },
  ];

  if (processingChannelId) {
    conditions.push({
      type: "entity",
      entities: [processingChannelId],
    });
  }

  const response = await fetch(`${baseUrl}/workflows`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: `Case & Co. Checkout Flow ${new Date().toISOString()}`,
      active: true,
      conditions,
      actions: [
        {
          type: "webhook",
          url: publicUrl,
          headers: {
            Authorization: authorizationKey,
          },
          signature: {
            key: signatureKey,
          },
        },
      ],
    }),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(
      `Workflow registration failed (${response.status}): ${JSON.stringify(data)}`,
    );
  }

  console.log("Checkout.com webhook workflow registered");
  console.log(`Workflow ID: ${data.id}`);
  console.log(`URL: ${publicUrl}`);
  console.log(`Events: ${requiredEvents.join(", ")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
