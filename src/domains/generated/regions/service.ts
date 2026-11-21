import { all, count as total, insert, type Row } from "../../../lib/store.ts";

const TABLE = "regions";

export function create(data: Record<string, unknown>): Row {
  return insert(TABLE, data);
}

export function list(): Row[] {
  return all(TABLE);
}

export function count(): number {
  return total(TABLE);
}

export function stats(): { count: number } {
  return { count: total(TABLE) };
}
