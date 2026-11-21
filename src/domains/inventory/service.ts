import { all, find, insert, remove, update, type Row } from "../../lib/store.ts";
import { formatMoney } from "../../lib/money.ts";

const TABLE = "inventory";

export function addItem(data: {
  name: string;
  sku: string;
  quantity: number;
  unitCents: number;
}): Row {
  return insert(TABLE, data);
}

export function getItem(id: string): Row | undefined {
  return find(TABLE, id);
}

export function listItems(): Row[] {
  return all(TABLE);
}

export function adjustStock(id: string, delta: number): Row | undefined {
  const item = find(TABLE, id);
  if (!item) return undefined;
  const next = (item.quantity as number) + delta;
  if (next < 0) throw new Error("insufficient stock");
  return update(TABLE, id, { quantity: next });
}

export function lowStock(threshold: number): Row[] {
  return all(TABLE).filter((item) => (item.quantity as number) <= threshold);
}

export function describeItem(item: Row): string {
  return `${item.name as string} x${item.quantity as number} @ ${formatMoney(item.unitCents as number)}`;
}

export function removeItem(id: string): boolean {
  return remove(TABLE, id);
}
