import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-[#323416]/10 bg-[#FFFFFD]/95">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link href="/" className="text-xl font-semibold text-[#323416]">
          Case & Co.
        </Link>
        <nav className="flex items-center gap-4 text-sm font-medium text-[#323416]/75">
          <Link href="/">Home</Link>
          <Link href="/basket">Basket</Link>
          <Link href="/profile">Profile</Link>
          <Link href="/checkout-v1">Checkout (v1)</Link>
          <Link href="/checkout-v2">Checkout (v2)</Link>
        </nav>
      </div>
    </header>
  );
}
