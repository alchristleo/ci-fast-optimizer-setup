import { all, count as total, insert, remove, type Row } from "../../../lib/store.ts";

const TABLE = "carriers2";

export function create(data: Record<string, unknown>): Row {
  return insert(TABLE, data);
}

export function list(): Row[] {
  return all(TABLE);
}

export function count(): number {
  return total(TABLE);
}

export function drop(id: string): boolean {
  return remove(TABLE, id);
}
