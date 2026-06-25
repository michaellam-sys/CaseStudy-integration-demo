import { NextResponse } from "next/server";
import { getOrderByReference, publicOrder } from "@/lib/session-store";

type OrderRouteProps = {
  params: Promise<{
    reference: string;
  }>;
};

export async function GET(_request: Request, { params }: OrderRouteProps) {
  const { reference } = await params;
  const order = await getOrderByReference(reference);

  if (!order) {
    return NextResponse.json(
      { error: "Order was not found in this demo session." },
      { status: 404 },
    );
  }

  return NextResponse.json({ order: publicOrder(order) });
}
