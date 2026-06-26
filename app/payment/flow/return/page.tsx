import Link from "next/link";
import { ClearBasketOnComplete } from "@/components/clear-basket-on-complete";
import { PaymentStatusClient } from "@/components/payment-status-client";
import { linkAndRefreshOwnedPayment } from "@/lib/checkout-payments";
import { getOrderByPaymentSessionId, getOrderByReference } from "@/lib/session-store";

export const runtime = "nodejs";

type FlowReturnPageProps = {
  searchParams: Promise<{
    reference?: string;
    result?: string;
    "cko-payment-id"?: string;
    "cko-session-id"?: string;
  }>;
};

function isSuccessful(status?: string, approved?: boolean) {
  const normalized = status?.toLowerCase();

  return (
    approved === true ||
    normalized === "authorized" ||
    normalized === "captured" ||
    normalized === "approved"
  );
}

export default async function FlowReturnPage({
  searchParams,
}: FlowReturnPageProps) {
  const params = await searchParams;
  const candidatePaymentId = params["cko-payment-id"];
  const order = params.reference
    ? await getOrderByReference(params.reference)
    : params["cko-session-id"]
      ? await getOrderByPaymentSessionId(params["cko-session-id"])
      : undefined;
  const status =
    order && candidatePaymentId?.startsWith("pay_")
      ? await linkAndRefreshOwnedPayment(order.reference, candidatePaymentId).catch(
          () => undefined,
        )
      : undefined;
  const paymentId = status?.id ?? candidatePaymentId;
  const clearBasket = isSuccessful(status?.status, status?.approved);

  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <ClearBasketOnComplete clearImmediately={clearBasket} />
      <section className="rounded-lg border border-[#323416]/10 bg-white p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#8C9E6E]">
          Flow return
        </p>
        <h1 className="mt-3 text-4xl font-semibold text-[#323416]">
          {status ? "Payment status verified" : "Payment is being confirmed"}
        </h1>
        <p className="mt-4 max-w-2xl leading-7 text-[#323416]/70">
          Checkout.com returned with result {params.result ?? "not supplied"}.
          This page verifies the payment server-side before showing a final
          result or refund controls.
        </p>
        <dl className="mt-8 grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg bg-[#FFFFFD] p-4">
            <dt className="text-sm font-medium text-[#323416]/60">
              Payment status
            </dt>
            <dd className="mt-1 font-semibold text-[#323416]">
              {status?.status ?? "Pending confirmation"}
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
          <div className="rounded-lg bg-[#FFFFFD] p-4">
            <dt className="text-sm font-medium text-[#323416]/60">
              Reference
            </dt>
            <dd className="mt-1 break-all font-semibold text-[#323416]">
              {order?.reference ?? params.reference ?? "Pending confirmation"}
            </dd>
          </div>
        </dl>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/checkout-flow"
            className="inline-flex h-11 items-center rounded-md bg-[#323416] px-4 text-sm font-semibold text-white"
          >
            Back to checkout
          </Link>
          <Link
            href="/"
            className="inline-flex h-11 items-center rounded-md border border-[#323416]/20 px-4 text-sm font-semibold text-[#323416]"
          >
            Continue shopping
          </Link>
        </div>
      </section>
      <PaymentStatusClient paymentId={status?.id} />
    </main>
  );
}
