import Link from "next/link";
import { ClearBasketOnComplete } from "@/components/clear-basket-on-complete";
import { refreshOwnedPaymentStatus } from "@/lib/checkout-payments";
import { getLatest3dsPaymentId } from "@/lib/session-store";

export const runtime = "nodejs";

type ThreeDsReturnPageProps = {
  searchParams: Promise<{
    result?: string;
  }>;
};

export default async function ThreeDsReturnPage({
  searchParams,
}: ThreeDsReturnPageProps) {
  const params = await searchParams;
  const paymentId = await getLatest3dsPaymentId();
  const status = paymentId
    ? await refreshOwnedPaymentStatus(paymentId).catch(() => undefined)
    : undefined;
  const isSuccessful =
    status?.approved === true ||
    status?.status?.toLowerCase() === "authorized" ||
    status?.status?.toLowerCase() === "captured" ||
    status?.status?.toLowerCase() === "approved";

  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <ClearBasketOnComplete clearImmediately={isSuccessful} />
      <section className="rounded-lg border border-[#323416]/10 bg-white p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#8C9E6E]">
          3DS return
        </p>
        <h1 className="mt-3 text-4xl font-semibold text-[#323416]">
          {status ? "Payment status verified" : "Unable to confirm payment"}
        </h1>
        <p className="mt-4 max-w-2xl leading-7 text-[#323416]/70">
          The return URL result was {params.result ?? "not supplied"}. The
          displayed outcome comes from a server-side Checkout.com status check
          for the pending payment in this demo session.
        </p>
        <dl className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg bg-[#FFFFFD] p-4">
            <dt className="text-sm font-medium text-[#323416]/60">
              Payment status
            </dt>
            <dd className="mt-1 font-semibold text-[#323416]">
              {status?.status ?? "Unable to confirm"}
            </dd>
          </div>
          <div className="rounded-lg bg-[#FFFFFD] p-4">
            <dt className="text-sm font-medium text-[#323416]/60">
              Payment ID
            </dt>
            <dd className="mt-1 break-all font-semibold text-[#323416]">
              {paymentId ?? "Pending confirmation"}
            </dd>
          </div>
        </dl>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={
              paymentId
                ? `/payment-complete?paymentId=${encodeURIComponent(paymentId)}&status=${encodeURIComponent(status?.status ?? "Pending")}`
                : "/checkout-v2"
            }
            className="inline-flex h-11 items-center rounded-md bg-[#323416] px-4 text-sm font-semibold text-white"
          >
            Continue
          </Link>
          <Link
            href="/checkout-v2"
            className="inline-flex h-11 items-center rounded-md border border-[#323416]/20 px-4 text-sm font-semibold text-[#323416]"
          >
            Back to checkout
          </Link>
        </div>
      </section>
    </main>
  );
}
