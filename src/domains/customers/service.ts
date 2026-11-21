import { all, find, insert, update, type Row } from "../../lib/store.ts";

const TABLE = "customers";

export function addCustomer(data: { name: string; email: string; vip?: boolean }): Row {
  return insert(TABLE, { vip: false, ...data });
}

export function getCustomer(id: string): Row | undefined {
  return find(TABLE, id);
}

export function listCustomers(): Row[] {
  return all(TABLE);
}

export function findByEmail(email: string): Row | undefined {
  return all(TABLE).find((c) => c.email === email.toLowerCase());
}

export function setVip(id: string, vip: boolean): Row | undefined {
  return update(TABLE, id, { vip });
}
