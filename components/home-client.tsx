"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { MarketCode, Product } from "@/lib/catalog";
import { formatMoney, markets } from "@/lib/catalog";
import { ProductArt } from "./product-art";
import { useBasket } from "./use-basket";

export function HomeClient() {
  const [products, setProducts] = useState<Product[]>([]);
  const [market, setMarket] = useState<MarketCode>("HK");
  const [isLoading, setIsLoading] = useState(true);
  const { addProduct, totalQuantity } = useBasket();
  const selectedMarket = markets[market];
  const basketHref = useMemo(() => `/basket?market=${market}`, [market]);

  useEffect(() => {
    fetch("/api/products")
      .then((response) => response.json())
      .then((data) => setProducts(data.products ?? []))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-5 py-10 lg:grid-cols-[0.85fr_1.15fr]">
      <section className="flex flex-col justify-center gap-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-[#8C9E6E]">
            Checkout.com integration demo
          </p>
          <h1 className="mt-3 max-w-xl text-5xl font-semibold leading-tight text-[#323416]">
            iPhone cases with four payment integration paths.
          </h1>
          <p className="mt-4 max-w-lg text-lg leading-8 text-[#323416]/70">
            A hard-coded storefront built for comparing Checkout.com Payment
            Links, Hosted Payments Page, direct card payments, and saved-card
            payments.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={market}
            onChange={(event) => setMarket(event.target.value as MarketCode)}
            className="h-11 rounded-md border border-[#323416]/20 bg-white px-3 text-sm font-medium text-[#323416]"
          >
            <option value="HK">Hong Kong / HKD</option>
            <option value="NL">Netherlands / EUR</option>
          </select>
          <Link
            href={basketHref}
            className="inline-flex h-11 items-center rounded-md bg-[#323416] px-5 text-sm font-semibold text-white"
          >
            View basket ({totalQuantity})
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {isLoading ? (
          <div className="col-span-full rounded-lg border border-[#323416]/10 bg-white p-6 text-[#323416]/70">
            Loading products from API...
          </div>
        ) : (
          products.map((product) => (
            <article
              key={product.id}
              className="rounded-lg border border-[#323416]/10 bg-white p-5 shadow-sm"
            >
              <ProductArt color={product.color} />
              <h2 className="mt-5 text-lg font-semibold text-[#323416]">
                {product.name}
              </h2>
              <p className="mt-2 min-h-16 text-sm leading-6 text-[#323416]/65">
                {product.description}
              </p>
              <p className="mt-4 text-lg font-semibold text-[#323416]">
                {formatMoney(product.prices[market], selectedMarket)}
              </p>
              <button
                onClick={() => addProduct(product.id)}
                className="mt-4 h-10 w-full rounded-md bg-[#323416] px-4 text-sm font-semibold text-white"
              >
                Add to basket
              </button>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
