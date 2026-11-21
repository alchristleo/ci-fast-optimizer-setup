import { all, count as total, insert, type Row, update as patch } from "../../../lib/store.ts";
import { count as otherCount } from "../grants/service.ts";

const TABLE = "markets";

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

export function linked(): { own: number; other: number } {
  return { own: total(TABLE), other: otherCount() };
}
