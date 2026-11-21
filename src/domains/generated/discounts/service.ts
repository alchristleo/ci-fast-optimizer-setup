import { all, count as total, find, insert, type Row } from "../../../lib/store.ts";
import { count as otherCount } from "../clients/service.ts";

const TABLE = "discounts";

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

export function stats(): { count: number } {
  return { count: total(TABLE) };
}

export function linked(): { own: number; other: number } {
  return { own: total(TABLE), other: otherCount() };
}
