import { Suspense } from "react";
import { CheckoutV2Client } from "@/components/checkout/checkout-v2-client";

export default function CheckoutV2Page() {
  return (
    <Suspense>
      <CheckoutV2Client />
    </Suspense>
  );
}
