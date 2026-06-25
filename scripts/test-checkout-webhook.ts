function env(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

export {};

async function main() {
  const baseUrl = env("CHECKOUT_API_BASE_URL").replace(/\/+$/, "");
  const secretKey = env("CHECKOUT_SECRET_KEY");
  const workflowId = env("CHECKOUT_WEBHOOK_WORKFLOW_ID");
  const response = await fetch(
    `${baseUrl}/workflows/${encodeURIComponent(workflowId)}/test`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
    },
  );
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(
      `Workflow test failed (${response.status}): ${JSON.stringify(data)}`,
    );
  }

  console.log("Checkout.com webhook workflow test requested");
  console.log(`Workflow ID: ${workflowId}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
