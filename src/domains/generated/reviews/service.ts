import {
  all,
  count as total,
  insert,
  remove,
  type Row,
  update as patch,
} from "../../../lib/store.ts";

const TABLE = "reviews";

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

export function drop(id: string): boolean {
  return remove(TABLE, id);
}

export function stats(): { count: number; active: number } {
  const rows = all(TABLE);
  return { count: rows.length, active: rows.filter((r) => r.active === true).length };
}
