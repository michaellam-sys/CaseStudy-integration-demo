import type { LocaleCode, Market } from "@/lib/catalog";
import { enUS } from "./en-US";
import { nlNL } from "./nl-NL";
import { zhHK } from "./zh-HK";

export type Messages = typeof enUS;

export const dictionaries: Record<LocaleCode, Messages> = {
  "en-US": enUS,
  "zh-HK": zhHK,
  "nl-NL": nlNL,
};

export const languageOptions: { locale: LocaleCode; label: string }[] = [
  { locale: "en-US", label: "English" },
  { locale: "zh-HK", label: "繁體中文" },
  { locale: "nl-NL", label: "Nederlands" },
];

export function getLocale(value: unknown, market: Market): LocaleCode {
  if (value === "en-US" || value === "zh-HK" || value === "nl-NL") {
    return value;
  }

  return market.defaultLocale;
}

export function getMessages(locale: LocaleCode) {
  return dictionaries[locale];
}
