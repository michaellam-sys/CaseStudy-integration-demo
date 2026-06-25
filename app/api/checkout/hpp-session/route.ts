import { NextResponse } from "next/server";
import { checkoutRequest, safeCheckoutError } from "@/lib/checkout";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const sessionId =
    new URL(request.url).searchParams.get("cko-session-id") ??
    new URL(request.url).searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json(
      { error: "Missing cko-session-id." },
      { status: 400 },
    );
  }

  try {
    const session = await checkoutRequest(`/hosted-payments/${sessionId}`, {
      method: "GET",
    });
    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json(safeCheckoutError(error), { status: 500 });
  }
}
