import {
  phoneCountryOptions,
  type PhoneCountryCode,
} from "@/lib/customer-phone";

type CustomerPhoneInputProps = {
  countryCode: PhoneCountryCode;
  phoneNumber: string;
  onCountryCodeChange: (countryCode: PhoneCountryCode) => void;
  onPhoneNumberChange: (phoneNumber: string) => void;
  countryCodeLabel?: string;
  phoneNumberLabel?: string;
};

export function CustomerPhoneInput({
  countryCode,
  phoneNumber,
  onCountryCodeChange,
  onPhoneNumberChange,
  countryCodeLabel = "Country code",
  phoneNumberLabel = "Phone number",
}: CustomerPhoneInputProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
      <label className="grid gap-2 text-sm font-medium text-[#323416]">
        {countryCodeLabel}
        <select
          value={countryCode}
          onChange={(event) =>
            onCountryCodeChange(event.target.value as PhoneCountryCode)
          }
          className="h-11 rounded-md border border-[#323416]/20 px-3"
        >
          {phoneCountryOptions.map((option) => (
            <option key={option.countryCode} value={option.countryCode}>
              {option.countryCode} {option.dialCode}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-2 text-sm font-medium text-[#323416]">
        {phoneNumberLabel}
        <input
          type="tel"
          inputMode="tel"
          required
          value={phoneNumber}
          onChange={(event) => onPhoneNumberChange(event.target.value)}
          className="h-11 rounded-md border border-[#323416]/20 px-3"
        />
      </label>
    </div>
  );
}
