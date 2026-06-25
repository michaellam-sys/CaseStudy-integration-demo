"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { calculateBasket, formatMoney, getMarket } from "@/lib/catalog";
import { ProductArt } from "./product-art";
import { useBasket } from "./use-basket";

export function BasketClient() {
  const searchParams = useSearchParams();
  const market = getMarket(searchParams.get("market"));
  const {
    items,
    setQuantity,
    removeProduct,
    clearBasket,
    resetBasket,
    totalQuantity,
  } = useBasket();
  const basket = items.length ? calculateBasket(market.code, items) : null;

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-[#8C9E6E]">
            Demo basket
          </p>
          <h1 className="mt-2 text-4xl font-semibold text-[#323416]">
            Shopping cart
          </h1>
          <p className="mt-2 text-sm text-[#323416]/65">
            {totalQuantity} item{totalQuantity === 1 ? "" : "s"} in basket
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/basket?market=HK"
            className={`rounded-md border px-3 py-2 text-sm font-medium ${
              market.code === "HK"
                ? "border-[#323416] bg-[#323416] text-white"
                : "border-[#323416]/20 text-[#323416]"
            }`}
          >
            HKD
          </Link>
          <Link
            href="/basket?market=NL"
            className={`rounded-md border px-3 py-2 text-sm font-medium ${
              market.code === "NL"
                ? "border-[#323416] bg-[#323416] text-white"
                : "border-[#323416]/20 text-[#323416]"
            }`}
          >
            EUR
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="divide-y divide-[#323416]/10 rounded-lg border border-[#323416]/10 bg-white">
          {basket ? (
            basket.items.map((item) => (
              <div
                key={item.product.id}
                className="grid gap-4 p-5 sm:grid-cols-[90px_1fr_auto]"
              >
                <ProductArt color={item.product.color} compact />
                <div>
                  <h2 className="font-semibold text-[#323416]">
                    {item.product.name}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-[#323416]/65">
                    {item.product.description}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <div className="inline-flex h-10 items-center rounded-md border border-[#323416]/20">
                      <button
                        onClick={() =>
                          setQuantity(item.product.id, item.quantity - 1)
                        }
                        className="h-full px-3 text-lg font-semibold text-[#323416]"
                        aria-label={`Decrease ${item.product.name}`}
                      >
                        -
                      </button>
                      <input
                        value={item.quantity}
                        onChange={(event) =>
                          setQuantity(
                            item.product.id,
                            Number(event.target.value),
                          )
                        }
                        className="h-full w-12 border-x border-[#323416]/20 text-center text-sm font-semibold text-[#323416]"
                        inputMode="numeric"
                        aria-label={`${item.product.name} quantity`}
                      />
                      <button
                        onClick={() =>
                          setQuantity(item.product.id, item.quantity + 1)
                        }
                        className="h-full px-3 text-lg font-semibold text-[#323416]"
                        aria-label={`Increase ${item.product.name}`}
                      >
                        +
                      </button>
                    </div>
                    <button
                      onClick={() => removeProduct(item.product.id)}
                      className="h-10 rounded-md border border-[#323416]/20 px-3 text-sm font-semibold text-[#323416]"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <p className="font-semibold text-[#323416]">
                  {formatMoney(item.totalAmount, market)}
                </p>
              </div>
            ))
          ) : (
            <div className="p-6">
              <h2 className="text-lg font-semibold text-[#323416]">
                Your basket is empty
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#323416]/65">
                Add products from the catalog or restore the default interview
                basket.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href={`/?market=${market.code}`}
                  className="inline-flex h-10 items-center rounded-md bg-[#323416] px-4 text-sm font-semibold text-white"
                >
                  Browse products
                </Link>
                <button
                  onClick={resetBasket}
                  className="h-10 rounded-md border border-[#323416]/20 px-4 text-sm font-semibold text-[#323416]"
                >
                  Restore demo basket
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="h-fit rounded-lg border border-[#323416]/10 bg-white p-5">
          <h2 className="text-lg font-semibold text-[#323416]">
            Order summary
          </h2>
          <div className="mt-5 space-y-3 text-sm text-[#323416]/70">
            <div className="flex justify-between">
              <span>Market</span>
              <span>{market.label}</span>
            </div>
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatMoney(basket?.totalAmount ?? 0, market)}</span>
            </div>
            <div className="flex justify-between">
              <span>Shipping</span>
              <span>Included</span>
            </div>
          </div>
          <div className="mt-5 flex justify-between border-t border-[#323416]/10 pt-5 text-lg font-semibold text-[#323416]">
            <span>Total</span>
            <span>{formatMoney(basket?.totalAmount ?? 0, market)}</span>
          </div>
          <div className="mt-6 grid gap-3">
            <Link
              href={`/checkout-v2?market=${market.code}`}
              className={`inline-flex h-11 items-center justify-center rounded-md px-4 text-sm font-semibold ${
                basket
                  ? "bg-[#323416] text-white"
                  : "pointer-events-none bg-[#323416]/30 text-white"
              }`}
            >
              Proceed to checkout
            </Link>
            <Link
              href={`/profile?market=${market.code}`}
              className="inline-flex h-11 items-center justify-center rounded-md border border-[#323416]/20 px-4 text-sm font-semibold text-[#323416]"
            >
              Save card first
            </Link>
            {basket && (
              <button
                onClick={clearBasket}
                className="h-11 rounded-md border border-[#323416]/20 px-4 text-sm font-semibold text-[#323416]"
              >
                Clear basket
              </button>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
