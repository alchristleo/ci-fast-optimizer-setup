import { describe, expect, test } from "bun:test";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const valid = { name: "n1", qty: 3, priceCents: 250 };

describe("depots", () => {
  test("creates a row", async () => {
    const res = await app.request("/depots", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("depots_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/depots", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/depots");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/depots", send("POST", valid));
    const res = await app.request("/depots");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad qty", async () => {
    const res = await app.request("/depots", send("POST", { ...valid, qty: -1 }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad priceCents", async () => {
    const res = await app.request("/depots", send("POST", { ...valid, priceCents: -5 }));
    expect(res.status).toBe(400);
  });

  test("updates a row", async () => {
    await app.request("/depots", send("POST", valid));
    const res = await app.request("/depots/depots_1", send("PATCH", { name: "renamed" }));
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("renamed");
  });

  test("rejects a bad update", async () => {
    await app.request("/depots", send("POST", valid));
    const res = await app.request("/depots/depots_1", send("PATCH", { name: 123 }));
    expect(res.status).toBe(400);
  });

  test("404s when updating an unknown row", async () => {
    const res = await app.request("/depots/depots_99", send("PATCH", { name: "x" }));
    expect(res.status).toBe(404);
  });
});
