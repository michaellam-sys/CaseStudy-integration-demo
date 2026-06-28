/// <reference types="@cloudflare/workers-types" />

import { Container } from "@cloudflare/containers";

type Env = {
  CHECKOUT_CONTAINER: DurableObjectNamespace<CheckoutContainer>;
  CHECKOUT_API_BASE_URL?: string;
  CHECKOUT_SECRET_KEY?: string;
  CHECKOUT_PROCESSING_CHANNEL_ID?: string;
  NEXT_PUBLIC_CHECKOUT_PUBLIC_KEY?: string;
  NEXT_PUBLIC_CHECKOUT_PROCESSING_CHANNEL_ID?: string;
  APP_URL?: string;
  WEBHOOK_PUBLIC_URL?: string;
  CHECKOUT_WEBHOOK_AUTHORIZATION_KEY?: string;
  CHECKOUT_WEBHOOK_SIGNATURE_KEY?: string;
  CHECKOUT_WEBHOOK_WORKFLOW_ID?: string;
};

function setIfPresent(
  values: Record<string, string>,
  name: string,
  value: string | undefined,
) {
  if (value) {
    values[name] = value;
  }
}

function getContainerEnv(env: Env) {
  const values: Record<string, string> = {
    NODE_ENV: "production",
    PORT: "3000",
    HOSTNAME: "0.0.0.0",
  };

  setIfPresent(values, "CHECKOUT_API_BASE_URL", env.CHECKOUT_API_BASE_URL);
  setIfPresent(values, "CHECKOUT_SECRET_KEY", env.CHECKOUT_SECRET_KEY);
  setIfPresent(
    values,
    "CHECKOUT_PROCESSING_CHANNEL_ID",
    env.CHECKOUT_PROCESSING_CHANNEL_ID,
  );
  setIfPresent(
    values,
    "NEXT_PUBLIC_CHECKOUT_PUBLIC_KEY",
    env.NEXT_PUBLIC_CHECKOUT_PUBLIC_KEY,
  );
  setIfPresent(
    values,
    "NEXT_PUBLIC_CHECKOUT_PROCESSING_CHANNEL_ID",
    env.NEXT_PUBLIC_CHECKOUT_PROCESSING_CHANNEL_ID,
  );
  setIfPresent(values, "APP_URL", env.APP_URL);
  setIfPresent(values, "WEBHOOK_PUBLIC_URL", env.WEBHOOK_PUBLIC_URL);
  setIfPresent(
    values,
    "CHECKOUT_WEBHOOK_AUTHORIZATION_KEY",
    env.CHECKOUT_WEBHOOK_AUTHORIZATION_KEY,
  );
  setIfPresent(
    values,
    "CHECKOUT_WEBHOOK_SIGNATURE_KEY",
    env.CHECKOUT_WEBHOOK_SIGNATURE_KEY,
  );
  setIfPresent(
    values,
    "CHECKOUT_WEBHOOK_WORKFLOW_ID",
    env.CHECKOUT_WEBHOOK_WORKFLOW_ID,
  );

  return values;
}

export class CheckoutContainer extends Container<Env> {
  defaultPort = 3000;
  sleepAfter = "10m";

  constructor(ctx: DurableObjectState<object>, env: Env) {
    super(ctx, env);
    this.envVars = getContainerEnv(env);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const container = env.CHECKOUT_CONTAINER.getByName("web");

    return container.fetch(request);
  },
} satisfies ExportedHandler<Env>;
