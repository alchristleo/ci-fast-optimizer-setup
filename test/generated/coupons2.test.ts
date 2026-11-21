import { describe, expect, test } from "bun:test";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const valid = { name: "n1", priceCents: 250, qty: 3 };

describe("coupons2", () => {
  test("creates a row", async () => {
    const res = await app.request("/coupons2", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("coupons2_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/coupons2", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/coupons2");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/coupons2", send("POST", valid));
    const res = await app.request("/coupons2");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad priceCents", async () => {
    const res = await app.request("/coupons2", send("POST", { ...valid, priceCents: -5 }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad qty", async () => {
    const res = await app.request("/coupons2", send("POST", { ...valid, qty: -1 }));
    expect(res.status).toBe(400);
  });
});
