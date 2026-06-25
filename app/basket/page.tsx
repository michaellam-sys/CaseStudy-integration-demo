import { Suspense } from "react";
import { BasketClient } from "@/components/basket-client";

export default function BasketPage() {
  return (
    <Suspense>
      <BasketClient />
    </Suspense>
  );
}
