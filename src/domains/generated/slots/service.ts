import { all, count as total, insert, type Row, update as patch } from "../../../lib/store.ts";
import { count as otherCount } from "../labels/service.ts";

const TABLE = "slots";

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

export function stats(): { count: number } {
  return { count: total(TABLE) };
}

export function linked(): { own: number; other: number } {
  return { own: total(TABLE), other: otherCount() };
}
