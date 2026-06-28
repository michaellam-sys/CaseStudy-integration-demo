export const phoneCountryOptions = [
  { countryCode: "HK", dialCode: "+852", label: "Hong Kong" },
  { countryCode: "NL", dialCode: "+31", label: "Netherlands" },
] as const;

export type PhoneCountryCode = (typeof phoneCountryOptions)[number]["countryCode"];

export type CustomerPhone = {
  countryCode: PhoneCountryCode;
  number: string;
};

export class CustomerPhoneInputError extends Error {}

const phoneCountryCodes = new Set<string>(
  phoneCountryOptions.map((option) => option.countryCode),
);
const checkoutPhoneDialCodes: Record<PhoneCountryCode, string> =
  Object.fromEntries(
    phoneCountryOptions.map((option) => [
      option.countryCode,
      option.dialCode,
    ]),
  ) as Record<PhoneCountryCode, string>;

export function isPhoneCountryCode(
  value: string,
): value is PhoneCountryCode {
  return phoneCountryCodes.has(value);
}

export function normalizePhoneNumber(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[\s()-]/g, "");
}

export function normalizeCustomerPhone(value: unknown): CustomerPhone {
  const data = typeof value === "object" && value ? value : {};
  const countryCode = String(
    (data as Record<string, unknown>).countryCode ?? "",
  )
    .trim()
    .toUpperCase();
  const number = normalizePhoneNumber(
    (data as Record<string, unknown>).number,
  );

  if (!isPhoneCountryCode(countryCode) || !/^\d{4,15}$/.test(number)) {
    throw new CustomerPhoneInputError(
      "A valid customer phone number is required.",
    );
  }

  return {
    countryCode,
    number,
  };
}

export function defaultCustomerPhone(country?: string): CustomerPhone {
  if (country === "NL") {
    return {
      countryCode: "NL",
      number: "612345678",
    };
  }

  return {
    countryCode: "HK",
    number: "91234567",
  };
}

export function toCheckoutCustomerPhone(phone: CustomerPhone) {
  return {
    country_code: checkoutPhoneDialCodes[phone.countryCode],
    number: phone.number,
  };
}

export function toCheckoutComponentPhoneData(phone: CustomerPhone) {
  return {
    phoneCountryCode: phone.countryCode,
    phoneNumber: phone.number,
  };
}
