import { getMarket, type MarketCode } from "./catalog";

export type CustomerDetails = {
  firstName: string;
  lastName: string;
  email: string;
  cardholderName: string;
  billingCountry: "HK" | "NL" | "US";
};

export function normalizeCustomerDetails(
  value: unknown,
  marketCode: MarketCode,
): CustomerDetails {
  const data = typeof value === "object" && value ? value : {};
  const field = (name: string) =>
    String((data as Record<string, unknown>)[name] ?? "").trim();
  const market = getMarket(marketCode);
  const firstName = field("firstName");
  const lastName = field("lastName");
  const email = field("email");
  const suppliedCardholderName = field("cardholderName");
  const cardholderName = suppliedCardholderName || `${firstName} ${lastName}`.trim();

  if (!firstName || !lastName || !cardholderName) {
    throw new Error("Customer name and cardholder name are required.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("A valid customer email is required.");
  }

  return {
    firstName,
    lastName,
    email,
    cardholderName,
    billingCountry: market.country,
  };
}

export function customerName(customer: CustomerDetails) {
  return `${customer.firstName} ${customer.lastName}`.trim();
}

export function toCheckoutCustomer(customer: CustomerDetails) {
  return {
    name: customerName(customer),
    email: customer.email,
  };
}

export function toCheckoutBilling(customer: CustomerDetails) {
  return {
    address: {
      country: customer.billingCountry,
    },
  };
}

export function parseDecimalAmountToMinorUnits(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .replace(",", ".");

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Refund amount must be a valid positive amount.");
  }

  const [major, minor = ""] = normalized.split(".");
  const amount = Number(major) * 100 + Number(minor.padEnd(2, "0"));

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Refund amount must be greater than zero.");
  }

  return amount;
}
