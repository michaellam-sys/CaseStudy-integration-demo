import { NextResponse } from "next/server";
import { products } from "@/lib/catalog";

export function GET() {
  return NextResponse.json({ products });
}
