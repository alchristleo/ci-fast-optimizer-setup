import { all, count as total, find, insert, remove, type Row } from "../../../lib/store.ts";
import { lineTotal } from "../../../lib/pricing.ts";

const TABLE = "fleets";

export function create(data: Record<string, unknown>): Row {
  return insert(TABLE, data);
}

export function list(): Row[] {
  return all(TABLE);
}

export function count(): number {
  return total(TABLE);
}

export function get(id: string): Row | undefined {
  return find(TABLE, id);
}

export function drop(id: string): boolean {
  return remove(TABLE, id);
}

export function stats(): { count: number; valueCents: number } {
  const rows = all(TABLE);
  let valueCents = 0;
  for (const r of rows) valueCents += lineTotal(r.priceCents as number, r.qty as number);
  return { count: rows.length, valueCents };
}
