import { Suspense } from "react";
import { CheckoutV1Client } from "@/components/checkout/checkout-v1-client";

export default function CheckoutV1Page() {
  return (
    <Suspense>
      <CheckoutV1Client />
    </Suspense>
  );
}
