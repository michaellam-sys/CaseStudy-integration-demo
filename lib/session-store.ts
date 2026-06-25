import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export type SavedCard = {
  instrumentId: string;
  customerId?: string;
  email: string;
  scheme?: string;
  last4?: string;
  expiryMonth?: number;
  expiryYear?: number;
};

export type OrderEvent = {
  id: string;
  type: string;
  label: string;
  createdAt: string;
  paymentId?: string;
  refundReference?: string;
  amount?: number;
  currency?: string;
  responseCode?: string;
  responseSummary?: string;
  isTest?: boolean;
};

export type PaymentRecord = {
  paymentId: string;
  reference: string;
  amount: number;
  currency: string;
  market: string;
  method: string;
  status: string;
  approved?: boolean;
  responseCode?: string;
  responseSummary?: string;
  customerEmail?: string;
  customerName?: string;
  cardSummary?: string;
  availableToRefund?: number;
  totalRefunded?: number;
  pendingRefund?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OrderRecord = {
  reference: string;
  paymentId?: string;
  status: string;
  amount: number;
  currency: string;
  market: string;
  method: string;
  customerEmail?: string;
  customerName?: string;
  events: OrderEvent[];
  payment?: PaymentRecord;
  expiresAt: number;
};

type SessionData = {
  savedCard?: SavedCard;
  orders?: Record<string, OrderRecord>;
  paymentReferences?: Record<string, string>;
  latest3dsPaymentId?: string;
  expiresAt: number;
};

const SESSION_COOKIE = "caseco_session";
const SESSION_TTL_MS = 1000 * 60 * 60;
const WEBHOOK_EVENT_TTL_MS = 1000 * 60 * 60;
const store = globalThis as typeof globalThis & {
  casecoSessions?: Map<string, SessionData>;
  casecoWebhookEvents?: Map<string, number>;
};

if (!store.casecoSessions) {
  store.casecoSessions = new Map<string, SessionData>();
}

if (!store.casecoWebhookEvents) {
  store.casecoWebhookEvents = new Map<string, number>();
}

function getSigningKey() {
  const key = process.env.CHECKOUT_SECRET_KEY ?? process.env.CKO_SK;

  if (!key) {
    throw new Error("Missing CHECKOUT_SECRET_KEY or CKO_SK in .env.local");
  }

  return key;
}

function sign(value: string) {
  return createHmac("sha256", getSigningKey()).update(value).digest("hex");
}

function verify(value: string, signature: string) {
  const expected = Buffer.from(sign(value));
  const actual = Buffer.from(signature);

  return (
    expected.length === actual.length && timingSafeEqual(expected, actual)
  );
}

function encodeSessionCookie(sessionId: string) {
  return `${sessionId}.${sign(sessionId)}`;
}

function decodeSessionCookie(value?: string) {
  if (!value) {
    return undefined;
  }

  const [sessionId, signature] = value.split(".");

  if (!sessionId || !signature || !verify(sessionId, signature)) {
    return undefined;
  }

  return sessionId;
}

export async function getOrCreateSessionId() {
  const cookieStore = await cookies();
  const existingSessionId = decodeSessionCookie(
    cookieStore.get(SESSION_COOKIE)?.value,
  );

  if (existingSessionId) {
    return existingSessionId;
  }

  const sessionId = randomUUID();
  cookieStore.set(SESSION_COOKIE, encodeSessionCookie(sessionId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS / 1000,
    path: "/",
  });

  return sessionId;
}

function activeSession(sessionId: string): SessionData {
  const existing = store.casecoSessions?.get(sessionId);

  if (existing && existing.expiresAt >= Date.now()) {
    existing.expiresAt = Date.now() + SESSION_TTL_MS;
    return existing;
  }

  const session: SessionData = {
    orders: {},
    paymentReferences: {},
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  store.casecoSessions?.set(sessionId, session);

  return session;
}

export async function getSavedCard() {
  const sessionId = await getOrCreateSessionId();
  const session = store.casecoSessions?.get(sessionId);

  if (!session || session.expiresAt < Date.now()) {
    store.casecoSessions?.delete(sessionId);
    return undefined;
  }

  return session.savedCard;
}

export async function saveCard(savedCard: SavedCard) {
  const sessionId = await getOrCreateSessionId();
  const session = activeSession(sessionId);
  session.savedCard = savedCard;
  session.expiresAt = Date.now() + SESSION_TTL_MS;

  return toSavedCardResponse(savedCard);
}

export async function clearSavedCard() {
  const sessionId = await getOrCreateSessionId();
  const session = activeSession(sessionId);
  delete session.savedCard;
}

export function toSavedCardResponse(savedCard?: SavedCard) {
  if (!savedCard) {
    return { savedCard: null };
  }

  return {
    savedCard: {
      email: savedCard.email,
      scheme: savedCard.scheme,
      last4: savedCard.last4,
      expiryMonth: savedCard.expiryMonth,
      expiryYear: savedCard.expiryYear,
    },
  };
}

export async function saveOrder(record: OrderRecord) {
  const sessionId = await getOrCreateSessionId();
  const session = activeSession(sessionId);
  const order = {
    ...record,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };

  session.orders = session.orders ?? {};
  session.paymentReferences = session.paymentReferences ?? {};
  session.orders[order.reference] = order;

  if (order.paymentId) {
    session.paymentReferences[order.paymentId] = order.reference;
  }

  if (order.method === "Tokenized Card + 3DS" && order.paymentId) {
    session.latest3dsPaymentId = order.paymentId;
  }

  return order;
}

export async function getOrderByReference(reference: string) {
  const sessionId = await getOrCreateSessionId();
  const session = activeSession(sessionId);
  return session.orders?.[reference];
}

export async function getOrderByPaymentId(paymentId: string) {
  const sessionId = await getOrCreateSessionId();
  const session = activeSession(sessionId);
  const reference = session.paymentReferences?.[paymentId];

  return reference ? session.orders?.[reference] : undefined;
}

export async function getLatest3dsPaymentId() {
  const sessionId = await getOrCreateSessionId();
  const session = activeSession(sessionId);
  return session.latest3dsPaymentId;
}

export async function linkPaymentToOrder(reference: string, paymentId: string) {
  const sessionId = await getOrCreateSessionId();
  const session = activeSession(sessionId);
  const order = session.orders?.[reference];

  if (!order) {
    return undefined;
  }

  session.paymentReferences = session.paymentReferences ?? {};
  session.paymentReferences[paymentId] = reference;
  order.paymentId = paymentId;

  return order;
}

export async function updatePaymentRecord(
  paymentId: string,
  patch: Partial<PaymentRecord>,
  event?: Omit<OrderEvent, "id" | "createdAt"> & { id?: string; createdAt?: string },
) {
  const order = await getOrderByPaymentId(paymentId);

  if (!order?.payment) {
    return undefined;
  }

  order.payment = {
    ...order.payment,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  order.status = patch.status ?? order.status;

  if (event) {
    order.events.push({
      id: event.id ?? `${event.type}-${Date.now()}`,
      createdAt: event.createdAt ?? new Date().toISOString(),
      ...event,
    });
  }

  return order;
}

export function findOrderForWebhook(paymentId?: string, reference?: string) {
  for (const session of store.casecoSessions?.values() ?? []) {
    if (session.expiresAt < Date.now()) {
      continue;
    }

    if (paymentId) {
      const orderReference = session.paymentReferences?.[paymentId];
      if (orderReference && session.orders?.[orderReference]) {
        return session.orders[orderReference];
      }
    }

    if (reference && session.orders?.[reference]) {
      return session.orders[reference];
    }
  }

  return undefined;
}

export function markWebhookEventSeen(eventId: string) {
  const now = Date.now();

  for (const [id, expiresAt] of store.casecoWebhookEvents?.entries() ?? []) {
    if (expiresAt < now) {
      store.casecoWebhookEvents?.delete(id);
    }
  }

  if (store.casecoWebhookEvents?.has(eventId)) {
    return false;
  }

  store.casecoWebhookEvents?.set(eventId, now + WEBHOOK_EVENT_TTL_MS);
  return true;
}

export function publicOrder(order?: OrderRecord) {
  if (!order) {
    return null;
  }

  return {
    reference: order.reference,
    paymentId: order.paymentId,
    status: order.status,
    amount: order.amount,
    currency: order.currency,
    market: order.market,
    method: order.method,
    customerEmail: order.customerEmail,
    customerName: order.customerName,
    events: order.events,
    payment: order.payment,
  };
}
