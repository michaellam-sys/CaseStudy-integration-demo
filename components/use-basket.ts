"use client";

import { useEffect, useMemo, useState } from "react";
import { type BasketItem, defaultBasket, getProduct } from "@/lib/catalog";

const STORAGE_KEY = "caseco_basket";
const CLEAR_ON_COMPLETE_KEY = "caseco_clear_basket_on_complete";

export function clearStoredBasket() {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
  }
}

export function markBasketForClearing() {
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(CLEAR_ON_COMPLETE_KEY, "true");
  }
}

export function consumeBasketClearMarker() {
  if (typeof window === "undefined") {
    return false;
  }

  const shouldClear =
    window.sessionStorage.getItem(CLEAR_ON_COMPLETE_KEY) === "true";

  if (shouldClear) {
    window.sessionStorage.removeItem(CLEAR_ON_COMPLETE_KEY);
  }

  return shouldClear;
}

function readBasket(): BasketItem[] {
  if (typeof window === "undefined") {
    return defaultBasket;
  }

  try {
    const value = window.localStorage.getItem(STORAGE_KEY);

    if (!value) {
      return defaultBasket;
    }

    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return defaultBasket;
    }

    return parsed
      .map((item) => ({
        productId: String(item.productId),
        quantity: Number(item.quantity),
      }))
      .filter(
        (item) =>
          item.productId &&
          getProduct(item.productId) &&
          Number.isInteger(item.quantity) &&
          item.quantity > 0,
      );
  } catch {
    return defaultBasket;
  }
}

function writeBasket(items: BasketItem[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function useBasket() {
  const [items, setItems] = useState<BasketItem[]>(defaultBasket);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setItems(readBasket()), 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  function updateItems(nextItems: BasketItem[]) {
    setItems(nextItems);
    writeBasket(nextItems);
  }

  function addProduct(productId: string) {
    const existing = items.find((item) => item.productId === productId);

    if (existing) {
      updateItems(
        items.map((item) =>
          item.productId === productId
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        ),
      );
      return;
    }

    updateItems([...items, { productId, quantity: 1 }]);
  }

  function setQuantity(productId: string, quantity: number) {
    if (quantity < 1) {
      updateItems(items.filter((item) => item.productId !== productId));
      return;
    }

    updateItems(
      items.map((item) =>
        item.productId === productId
          ? { ...item, quantity: Math.min(quantity, 99) }
          : item,
      ),
    );
  }

  function removeProduct(productId: string) {
    updateItems(items.filter((item) => item.productId !== productId));
  }

  function clearBasket() {
    clearStoredBasket();
    setItems([]);
  }

  function resetBasket() {
    updateItems(defaultBasket);
  }

  const totalQuantity = useMemo(
    () => items.reduce((total, item) => total + item.quantity, 0),
    [items],
  );

  return {
    items,
    totalQuantity,
    addProduct,
    setQuantity,
    removeProduct,
    clearBasket,
    resetBasket,
  };
}
