import { describe, expect, test } from "bun:test";
import { domains } from "../../src/domains/index.ts";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();

describe("wiring", () => {
  test("every registered domain mounts an empty list route", async () => {
    for (const d of domains) {
      const res = await app.request(`/${d.name}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    }
  });

  test("an order flows across customers, inventory and orders", async () => {
    await app.request("/customers", send("POST", { name: "Ann", email: "ann@example.com" }));
    await app.request(
      "/inventory",
      send("POST", { name: "Widget", sku: "WID-1", quantity: 50, unitCents: 1000 }),
    );
    const res = await app.request(
      "/orders",
      send("POST", { customerId: "customers_1", itemId: "inventory_1", quantity: 5 }),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).totalCents).toBe(5130);
    expect((await (await app.request("/inventory/inventory_1")).json()).quantity).toBe(45);
  });
});
