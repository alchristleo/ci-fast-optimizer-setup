import { all, count as total, find, insert, remove, type Row } from "../../../lib/store.ts";

const TABLE = "claims";

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

export function stats(): { count: number; active: number } {
  const rows = all(TABLE);
  return { count: rows.length, active: rows.filter((r) => r.active === true).length };
}
