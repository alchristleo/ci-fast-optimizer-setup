import { describe, expect, test } from "bun:test";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const valid = { name: "n1", active: true, priceCents: 250, code: "AB123" };

describe("warehouses", () => {
  test("creates a row", async () => {
    const res = await app.request("/warehouses", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("warehouses_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/warehouses", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/warehouses");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/warehouses", send("POST", valid));
    const res = await app.request("/warehouses");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad active", async () => {
    const res = await app.request("/warehouses", send("POST", { ...valid, active: "yes" }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad priceCents", async () => {
    const res = await app.request("/warehouses", send("POST", { ...valid, priceCents: -5 }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad code", async () => {
    const res = await app.request("/warehouses", send("POST", { ...valid, code: "bad" }));
    expect(res.status).toBe(400);
  });

  test("gets a row", async () => {
    await app.request("/warehouses", send("POST", valid));
    const res = await app.request("/warehouses/warehouses_1");
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("n1");
  });

  test("404s on an unknown row", async () => {
    const res = await app.request("/warehouses/warehouses_99");
    expect(res.status).toBe(404);
  });
});
