import { describe, expect, test } from "bun:test";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();

async function seed(): Promise<void> {
  await app.request("/customers", send("POST", { name: "Ann", email: "ann@example.com" }));
  await app.request(
    "/inventory",
    send("POST", { name: "Widget", sku: "WID-1", quantity: 50, unitCents: 1000 }),
  );
}

const order = { customerId: "customers_1", itemId: "inventory_1", quantity: 5 };

describe("orders", () => {
  test("places an order with tier discount and tax", async () => {
    await seed();
    const res = await app.request("/orders", send("POST", order));
    expect(res.status).toBe(201);
    // 5 * 1000 = 5000, 5% tier discount = 4750, 8% tax = 5130
    expect((await res.json()).totalCents).toBe(5130);
  });
  test("takes stock from inventory", async () => {
    await seed();
    await app.request("/orders", send("POST", order));
    const item = await (await app.request("/inventory/inventory_1")).json();
    expect(item.quantity).toBe(45);
  });
  test("gives vip customers 5 percent off", async () => {
    await seed();
    await app.request("/customers/customers_1/vip", send("POST", {}));
    const res = await app.request("/orders", send("POST", order));
    expect((await res.json()).totalCents).toBe(4874);
  });
  test("rejects unknown customers and invalid bodies", async () => {
    await seed();
    const unknown = await app.request("/orders", send("POST", { ...order, customerId: "x" }));
    expect(unknown.status).toBe(422);
    const invalid = await app.request("/orders", send("POST", { ...order, quantity: 0 }));
    expect(invalid.status).toBe(400);
  });
  test("rejects unknown body fields", async () => {
    await seed();
    const res = await app.request("/orders", send("POST", { ...order, note: "x" }));
    expect(res.status).toBe(400);
  });
  test("cancels an order and restores stock", async () => {
    await seed();
    await app.request("/orders", send("POST", order));
    const res = await app.request("/orders/orders_1/cancel", send("POST", {}));
    expect((await res.json()).status).toBe("cancelled");
    expect((await (await app.request("/inventory/inventory_1")).json()).quantity).toBe(50);
    expect((await app.request("/orders/orders_1/cancel", send("POST", {}))).status).toBe(409);
  });
  test("reports revenue of open orders", async () => {
    await seed();
    await app.request("/orders", send("POST", order));
    const res = await app.request("/orders/revenue");
    expect((await res.json()).revenueCents).toBe(5130);
  });
});
