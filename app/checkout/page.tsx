import { Suspense } from "react";
import { CheckoutClient } from "@/components/checkout/checkout-client";

export default function CheckoutPage() {
  return (
    <Suspense>
      <CheckoutClient />
    </Suspense>
  );
}
