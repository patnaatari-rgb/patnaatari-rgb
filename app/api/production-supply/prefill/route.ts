import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";

/**
 * Carry-forward for Production & Supply's Add/Edit form: given the picked
 * Product name, return its own real Unit from the Product master (client
 * direction, 2026-09-13 - "Unit auto fetch karega jaise litre hai to litre
 * dikhega kg to kg") instead of a KVK typing it by hand every time. `unit`
 * stays a normal editable field after this, same as Equipment Details' own
 * carry-forward - a KVK can still correct it if a master row's unit is ever
 * wrong. Looked up by name within the KVK's zone only (same "name is unique
 * enough in practice" precedent as /api/equipment-details/prefill); the rare
 * product name that repeats under a second Product Type just returns
 * whichever row matches first.
 */
export async function GET(request: Request) {
  const auth = await requireSession(["SUPER_ADMIN", "KVK_ADMIN"]);
  if (!auth.ok) return auth.response;

  const value = new URL(request.url).searchParams.get("value")?.trim() ?? "";
  if (!value) return NextResponse.json({ fields: {} });

  const product = await prisma.productMaster.findFirst({
    where: { zoneId: auth.session.zoneId, name: value },
    select: { unit: true },
  });
  if (!product?.unit) return NextResponse.json({ fields: {} });

  // Same real unit shown twice - once for the produced Quantity, once for
  // the Sell/Supply section's own Quantity Sold/Supplied (client direction,
  // 2026-09-13: the Sell/Supply section needed its own visible auto-fetched
  // Unit too, not just the one above it).
  return NextResponse.json({ fields: { unit: product.unit, supplyUnit: product.unit } });
}
