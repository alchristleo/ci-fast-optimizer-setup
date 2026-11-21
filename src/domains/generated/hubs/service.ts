import {
  all,
  count as total,
  find,
  insert,
  type Row,
  update as patch,
} from "../../../lib/store.ts";

const TABLE = "hubs";

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

export function change(id: string, data: Record<string, unknown>): Row | undefined {
  return patch(TABLE, id, data);
}
