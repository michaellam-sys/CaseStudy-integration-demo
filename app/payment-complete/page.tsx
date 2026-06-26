import Link from "next/link";
import { ClearBasketOnComplete } from "@/components/clear-basket-on-complete";
import { PaymentStatusClient } from "@/components/payment-status-client";

type PaymentCompletePageProps = {
  searchParams: Promise<{
    amount?: string;
    currency?: string;
    paymentId?: string;
    paymentMethod?: string;
    reference?: string;
    source?: string;
    status?: string;
    transactionDate?: string;
    cardSummary?: string;
    responseSummary?: string;
    "cko-session-id"?: string;
    "cko-payment-id"?: string;
  }>;
};

function formatAmount(amount?: string, currency?: string) {
  const parsedAmount = Number(amount);

  if (!amount || !currency || Number.isNaN(parsedAmount)) {
    return "Pending confirmation";
  }

  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).format(parsedAmount / 100);
}

function formatDate(value?: string) {
  if (!value) {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getPaymentResultCopy(
  status: string,
  isHosted: boolean,
  isPaymentsV1ThreeDs: boolean,
) {
  const normalizedStatus = status.toLowerCase();

  if (normalizedStatus === "cancel" || normalizedStatus === "cancelled") {
    return {
      eyebrow: "Payment cancelled",
      title: isHosted
        ? "The hosted payment was cancelled."
        : "The payment was cancelled.",
      description:
        "Checkout.com returned without completing the payment. Your basket is still available if you want to try again.",
    };
  }

  if (
    normalizedStatus === "failure" ||
    normalizedStatus === "failed" ||
    normalizedStatus === "declined"
  ) {
    return {
      eyebrow: "Payment not completed",
      title: "The payment was not completed.",
      description:
        "Checkout.com returned a failed payment status. In production, use payment details or webhooks before updating the order.",
    };
  }

  if (isHosted) {
    return {
      eyebrow: "Payment complete",
      title: "Thanks, hosted checkout has returned.",
      description:
        "Checkout.com returned to this receipt page. In production, use payment details or webhooks before fulfillment.",
    };
  }

  if (isPaymentsV1ThreeDs) {
    return {
      eyebrow: "Payment returned",
      title: "Thanks, 3DS has returned.",
      description:
        "Checkout.com returned to this receipt page after the 3DS step. In production, use payment details or webhooks before fulfillment.",
    };
  }

  return {
    eyebrow: "Payment complete",
    title: "Thanks, the payment has been submitted.",
    description:
      "This receipt shows safe payment details returned by the demo checkout flow.",
  };
}

function shouldClearBasket(
  status: string,
  isHosted: boolean,
  isPaymentsV1ThreeDs: boolean,
) {
  return (
    (isHosted || isPaymentsV1ThreeDs) && status.toLowerCase() === "success"
  );
}

export default async function PaymentCompletePage({
  searchParams,
}: PaymentCompletePageProps) {
  const params = await searchParams;
  const checkoutReference = params["cko-session-id"] ?? params["cko-payment-id"];
  const status = params.status ?? "approved";
  const isHosted = params.source === "hpp";
  const isPaymentsV1ThreeDs = params.source === "payments-v1-3ds";
  const copy = getPaymentResultCopy(status, isHosted, isPaymentsV1ThreeDs);

  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <ClearBasketOnComplete
        clearImmediately={shouldClearBasket(
          status,
          isHosted,
          isPaymentsV1ThreeDs,
        )}
      />
      <section className="rounded-lg border border-[#323416]/10 bg-white p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#8C9E6E]">
          {copy.eyebrow}
        </p>
        <h1 className="mt-3 text-4xl font-semibold text-[#323416]">
          {copy.title}
        </h1>
        <p className="mt-4 max-w-2xl leading-7 text-[#323416]/70">
          {copy.description}
        </p>

        <dl className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg bg-[#FFFFFD] p-4">
            <dt className="text-sm font-medium text-[#323416]/60">
              Transaction date
            </dt>
            <dd className="mt-1 font-semibold text-[#323416]">
              {formatDate(params.transactionDate)}
            </dd>
          </div>
          <div className="rounded-lg bg-[#FFFFFD] p-4">
            <dt className="text-sm font-medium text-[#323416]/60">
              Reference number
            </dt>
            <dd className="mt-1 break-all font-semibold text-[#323416]">
              {params.reference ?? "Pending confirmation"}
            </dd>
          </div>
          <div className="rounded-lg bg-[#FFFFFD] p-4">
            <dt className="text-sm font-medium text-[#323416]/60">
              Payment method
            </dt>
            <dd className="mt-1 font-semibold text-[#323416]">
              {params.paymentMethod ?? "Card"}
            </dd>
          </div>
          <div className="rounded-lg bg-[#FFFFFD] p-4">
            <dt className="text-sm font-medium text-[#323416]/60">Amount</dt>
            <dd className="mt-1 font-semibold text-[#323416]">
              {formatAmount(params.amount, params.currency)}
            </dd>
          </div>
          <div className="rounded-lg bg-[#FFFFFD] p-4">
            <dt className="text-sm font-medium text-[#323416]/60">
              Payment status
            </dt>
            <dd className="mt-1 font-semibold capitalize text-[#323416]">
              {status}
            </dd>
          </div>
          <div className="rounded-lg bg-[#FFFFFD] p-4">
            <dt className="text-sm font-medium text-[#323416]/60">
              Payment ID
            </dt>
            <dd className="mt-1 break-all font-semibold text-[#323416]">
              {params.paymentId ?? checkoutReference ?? "Pending confirmation"}
            </dd>
          </div>
          {params.cardSummary && (
            <div className="rounded-lg bg-[#FFFFFD] p-4 sm:col-span-2">
              <dt className="text-sm font-medium text-[#323416]/60">Card</dt>
              <dd className="mt-1 font-semibold text-[#323416]">
                {params.cardSummary}
              </dd>
            </div>
          )}
          {params.responseSummary && (
            <div className="rounded-lg bg-[#FFFFFD] p-4 sm:col-span-2">
              <dt className="text-sm font-medium text-[#323416]/60">
                Gateway response
              </dt>
              <dd className="mt-1 font-semibold text-[#323416]">
                {params.responseSummary}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex h-11 items-center rounded-md bg-[#323416] px-4 text-sm font-semibold text-white"
          >
            Continue shopping
          </Link>
          <Link
            href="/checkout-flow"
            className="inline-flex h-11 items-center rounded-md border border-[#323416]/20 px-4 text-sm font-semibold text-[#323416]"
          >
            Back to checkout
          </Link>
        </div>
      </section>
      <PaymentStatusClient paymentId={params.paymentId ?? checkoutReference} />
    </main>
  );
}
