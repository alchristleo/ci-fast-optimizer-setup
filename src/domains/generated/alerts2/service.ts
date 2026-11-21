import { all, count as total, insert, type Row } from "../../../lib/store.ts";
import { lineTotal } from "../../../lib/pricing.ts";
import { count as otherCount } from "../vendors/service.ts";

const TABLE = "alerts2";

export function create(data: Record<string, unknown>): Row {
  return insert(TABLE, data);
}

export function list(): Row[] {
  return all(TABLE);
}

export function count(): number {
  return total(TABLE);
}

export function stats(): { count: number; valueCents: number } {
  const rows = all(TABLE);
  let valueCents = 0;
  for (const r of rows) valueCents += lineTotal(r.priceCents as number, r.qty as number);
  return { count: rows.length, valueCents };
}

export function linked(): { own: number; other: number } {
  return { own: total(TABLE), other: otherCount() };
}
