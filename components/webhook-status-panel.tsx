export type WebhookStatusEvent = {
  id: string;
  label: string;
  createdAt: string;
  paymentId?: string;
  responseSummary?: string;
};

type WebhookStatusPanelProps = {
  title: string;
  status: "waiting" | "received";
  referenceLabel?: string;
  reference?: string;
  event?: WebhookStatusEvent;
  waitingDetail: string;
  lastCheckedAt?: string;
  checkFailedDetail?: string;
};

export function WebhookStatusPanel({
  title,
  status,
  referenceLabel,
  reference,
  event,
  waitingDetail,
  lastCheckedAt,
  checkFailedDetail,
}: WebhookStatusPanelProps) {
  const isReceived = status === "received";

  return (
    <div
      className={`mt-5 rounded-lg border p-5 ${
        isReceived
          ? "border-[#8C9E6E]/30 bg-[#F3F7ED]"
          : "border-[#323416]/10 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold text-[#323416]">{title}</h2>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            isReceived
              ? "bg-[#8C9E6E] text-white"
              : "bg-[#323416]/10 text-[#323416]/70"
          }`}
        >
          {isReceived ? "Received" : "Waiting"}
        </span>
      </div>
      {referenceLabel && reference && (
        <p className="mt-2 break-all text-sm text-[#323416]/70">
          {referenceLabel}: {reference}
        </p>
      )}
      {event ? (
        <div className="mt-3 space-y-1 text-sm text-[#323416]/75">
          <p>
            <span className="font-medium text-[#323416]">{event.label}</span>{" "}
            {new Date(event.createdAt).toLocaleString()}
          </p>
          <p className="break-all">Event ID: {event.id}</p>
          {event.paymentId && (
            <p className="break-all">Payment ID: {event.paymentId}</p>
          )}
          {event.responseSummary && (
            <p>Gateway response: {event.responseSummary}</p>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-6 text-[#323416]/70">
          {waitingDetail}
        </p>
      )}
      {lastCheckedAt && (
        <p className="mt-3 text-xs text-[#323416]/50">
          Last checked {new Date(lastCheckedAt).toLocaleTimeString()}
          {checkFailedDetail ? ` / ${checkFailedDetail}` : ""}
        </p>
      )}
    </div>
  );
}
