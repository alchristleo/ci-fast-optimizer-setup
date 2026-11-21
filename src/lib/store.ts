import { nextId, resetIds } from "./ids.ts";

export type Row = { id: string } & Record<string, unknown>;

const tables = new Map<string, Map<string, Row>>();

function table(name: string): Map<string, Row> {
  let t = tables.get(name);
  if (!t) {
    t = new Map();
    tables.set(name, t);
  }
  return t;
}

export function insert(name: string, data: Record<string, unknown>): Row {
  const row: Row = { ...data, id: nextId(name) };
  table(name).set(row.id, row);
  return row;
}

export function find(name: string, id: string): Row | undefined {
  return table(name).get(id);
}

export function all(name: string): Row[] {
  return [...table(name).values()];
}

export function update(name: string, id: string, patch: Record<string, unknown>): Row | undefined {
  const current = table(name).get(id);
  if (!current) return undefined;
  const next: Row = { ...current, ...patch, id };
  table(name).set(id, next);
  return next;
}

export function remove(name: string, id: string): boolean {
  return table(name).delete(id);
}

export function count(name: string): number {
  return table(name).size;
}

export function resetStore(): void {
  tables.clear();
  resetIds();
}
