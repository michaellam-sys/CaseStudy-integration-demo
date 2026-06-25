import { NextResponse } from "next/server";
import { getPublicCheckoutConfig, safeCheckoutError } from "@/lib/checkout";

export function GET() {
  try {
    const { apiBaseUrl } = getPublicCheckoutConfig();

    return NextResponse.json({ apiBaseUrl });
  } catch (error) {
    return NextResponse.json(safeCheckoutError(error), { status: 500 });
  }
}
