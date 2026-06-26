import { Suspense } from "react";
import { CheckoutFlowClient } from "@/components/checkout/checkout-flow-client";

export default function CheckoutFlowPage() {
  return (
    <Suspense>
      <CheckoutFlowClient />
    </Suspense>
  );
}
