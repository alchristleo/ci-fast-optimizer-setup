import { all, find, insert, update, type Row } from "../../lib/store.ts";
import { addMoney } from "../../lib/money.ts";
import { applyDiscount, lineTotal } from "../../lib/pricing.ts";
import { getCustomer } from "../customers/service.ts";
import { adjustStock, getItem } from "../inventory/service.ts";

const TABLE = "orders";
const TAX_RATE = 0.08;

export function placeOrder(data: { customerId: string; itemId: string; quantity: number }): Row {
  const customer = getCustomer(data.customerId);
  if (!customer) throw new Error("unknown customer");
  const item = getItem(data.itemId);
  if (!item) throw new Error("unknown item");
  adjustStock(data.itemId, -data.quantity);
  let total = lineTotal(item.unitCents as number, data.quantity, TAX_RATE);
  if (customer.vip === true) total = applyDiscount(total, 5);
  return insert(TABLE, { ...data, totalCents: total, status: "open" });
}

export function getOrder(id: string): Row | undefined {
  return find(TABLE, id);
}

export function listOrders(): Row[] {
  return all(TABLE);
}

export function cancelOrder(id: string): Row | undefined {
  const order = find(TABLE, id);
  if (!order) return undefined;
  if (order.status !== "open") throw new Error("order not open");
  adjustStock(order.itemId as string, order.quantity as number);
  return update(TABLE, id, { status: "cancelled" });
}

export function revenue(): number {
  return addMoney(
    ...all(TABLE)
      .filter((o) => o.status === "open")
      .map((o) => o.totalCents as number),
  );
}
