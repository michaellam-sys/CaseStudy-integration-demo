"use client";

import { useEffect } from "react";
import {
  clearStoredBasket,
  consumeBasketClearMarker,
} from "./use-basket";

export function ClearBasketOnComplete({
  clearImmediately = false,
}: {
  clearImmediately?: boolean;
}) {
  useEffect(() => {
    if (clearImmediately || consumeBasketClearMarker()) {
      clearStoredBasket();
    }
  }, [clearImmediately]);

  return null;
}
