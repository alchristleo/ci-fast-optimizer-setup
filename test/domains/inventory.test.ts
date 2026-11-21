import { describe, expect, test } from "bun:test";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const item = { name: "Widget", sku: "WID-1", quantity: 10, unitCents: 250 };

describe("inventory", () => {
  test("creates and reads an item", async () => {
    const created = await app.request("/inventory", send("POST", item));
    expect(created.status).toBe(201);
    const res = await app.request("/inventory/inventory_1");
    expect((await res.json()).label).toBe("Widget x10 @ 2.50 USD");
  });
  test("rejects a bad sku", async () => {
    const res = await app.request("/inventory", send("POST", { ...item, sku: "x" }));
    expect(res.status).toBe(400);
  });
  test("adjusts stock and refuses to go negative", async () => {
    await app.request("/inventory", send("POST", item));
    const ok = await app.request("/inventory/inventory_1/adjust", send("POST", { delta: -4 }));
    expect((await ok.json()).quantity).toBe(6);
    const bad = await app.request("/inventory/inventory_1/adjust", send("POST", { delta: -7 }));
    expect(bad.status).toBe(409);
  });
  test("lists low stock", async () => {
    await app.request("/inventory", send("POST", item));
    await app.request("/inventory", send("POST", { ...item, quantity: 2 }));
    const res = await app.request("/inventory/low-stock?threshold=5");
    expect((await res.json()).map((r: { id: string }) => r.id)).toEqual(["inventory_2"]);
  });
  test("deletes an item", async () => {
    await app.request("/inventory", send("POST", item));
    expect((await app.request("/inventory/inventory_1", { method: "DELETE" })).status).toBe(204);
    expect((await app.request("/inventory/inventory_1")).status).toBe(404);
  });
});
