export type MarketCode = "HK" | "NL" | "US";
export type LocaleCode = "en-US" | "zh-HK" | "nl-NL";

export type Market = {
  code: MarketCode;
  label: string;
  currency: "HKD" | "EUR" | "USD";
  country: "HK" | "NL" | "US";
  defaultLocale: LocaleCode;
  symbol: string;
};

export type Product = {
  id: string;
  name: string;
  description: string;
  color: string;
  prices: Record<MarketCode, number>;
};

export type BasketItem = {
  productId: string;
  quantity: number;
};

export const markets: Record<MarketCode, Market> = {
  HK: {
    code: "HK",
    label: "Hong Kong",
    currency: "HKD",
    country: "HK",
    defaultLocale: "zh-HK",
    symbol: "HK$",
  },
  NL: {
    code: "NL",
    label: "Netherlands",
    currency: "EUR",
    country: "NL",
    defaultLocale: "nl-NL",
    symbol: "€",
  },
  US: {
    code: "US",
    label: "International test mode",
    currency: "USD",
    country: "US",
    defaultLocale: "en-US",
    symbol: "$",
  },
};

export const products: Product[] = [
  {
    id: "olive-shield",
    name: "Olive Shield Case",
    description: "Matte recycled shell with raised camera protection.",
    color: "#8C9E6E",
    prices: {
      HK: 28900,
      NL: 3495,
      US: 3799,
    },
  },
  {
    id: "ink-loop",
    name: "Ink Loop Case",
    description: "Soft-touch black case with detachable wrist loop.",
    color: "#323416",
    prices: {
      HK: 32900,
      NL: 3995,
      US: 4299,
    },
  },
  {
    id: "clay-snap",
    name: "Clay Snap Case",
    description: "Slim MagSafe-compatible case in warm clay.",
    color: "#B77D5C",
    prices: {
      HK: 25900,
      NL: 2995,
      US: 3299,
    },
  },
];

export const defaultBasket: BasketItem[] = [];

export function getMarket(value: unknown): Market {
  if (value === "NL") {
    return markets.NL;
  }

  if (value === "US") {
    return markets.US;
  }

  return markets.HK;
}

export function getProduct(productId: string) {
  return products.find((product) => product.id === productId);
}

export function normalizeBasket(value: unknown): BasketItem[] {
  if (!Array.isArray(value)) {
    return defaultBasket;
  }

  const merged = new Map<string, number>();

  for (const item of value) {
    const productId = String(item?.productId ?? "");
    const quantity = Number(item?.quantity);

    if (!getProduct(productId)) {
      throw new Error(`Unknown product: ${productId}`);
    }

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new Error("Basket quantity must be between 1 and 99.");
    }

    merged.set(productId, (merged.get(productId) ?? 0) + quantity);
  }

  const basket = Array.from(merged, ([productId, quantity]) => ({
    productId,
    quantity,
  }));

  if (basket.length === 0) {
    throw new Error("Basket is empty.");
  }

  return basket;
}

export function calculateBasket(
  marketCode: MarketCode,
  basket: BasketItem[] = defaultBasket,
) {
  const market = markets[marketCode];
  const items = basket.map((item) => {
    const product = getProduct(item.productId);

    if (!product) {
      throw new Error(`Unknown product: ${item.productId}`);
    }

    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new Error("Basket quantity must be at least 1.");
    }

    const unitAmount = product.prices[marketCode];

    return {
      product,
      quantity: item.quantity,
      unitAmount,
      totalAmount: unitAmount * item.quantity,
    };
  });
  const totalAmount = items.reduce(
    (total, item) => total + item.totalAmount,
    0,
  );

  return {
    market,
    items,
    totalAmount,
  };
}

export function formatMoney(
  amount: number,
  market: Market,
  locale: LocaleCode = "en-US",
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: market.currency,
  }).format(amount / 100);
}

export function checkoutProducts(
  marketCode: MarketCode,
  basket: BasketItem[] = defaultBasket,
) {
  return calculateBasket(marketCode, basket).items.map((item) => ({
    name: item.product.name,
    quantity: item.quantity,
    price: item.unitAmount,
  }));
}
