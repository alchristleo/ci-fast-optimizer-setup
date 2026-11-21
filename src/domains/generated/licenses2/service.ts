import {
  all,
  count as total,
  find,
  insert,
  remove,
  type Row,
  update as patch,
} from "../../../lib/store.ts";
import { count as otherCount } from "../agents2/service.ts";

const TABLE = "licenses2";

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

export function drop(id: string): boolean {
  return remove(TABLE, id);
}

export function linked(): { own: number; other: number } {
  return { own: total(TABLE), other: otherCount() };
}
