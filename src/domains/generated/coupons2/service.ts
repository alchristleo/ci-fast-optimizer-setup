import { all, count as total, insert, type Row, update as patch } from "../../../lib/store.ts";
import { lineTotal } from "../../../lib/pricing.ts";

const TABLE = "coupons2";

export function create(data: Record<string, unknown>): Row {
  return insert(TABLE, data);
}

export function list(): Row[] {
  return all(TABLE);
}

export function count(): number {
  return total(TABLE);
}

export function change(id: string, data: Record<string, unknown>): Row | undefined {
  return patch(TABLE, id, data);
}

export function stats(): { count: number; valueCents: number } {
  const rows = all(TABLE);
  let valueCents = 0;
  for (const r of rows) valueCents += lineTotal(r.priceCents as number, r.qty as number);
  return { count: rows.length, valueCents };
}
