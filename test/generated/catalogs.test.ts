import { describe, expect, test } from "bun:test";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const valid = { name: "n1", qty: 3, priceCents: 250, note: "hello" };

describe("catalogs", () => {
  test("creates a row", async () => {
    const res = await app.request("/catalogs", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("catalogs_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/catalogs", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/catalogs");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/catalogs", send("POST", valid));
    const res = await app.request("/catalogs");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad qty", async () => {
    const res = await app.request("/catalogs", send("POST", { ...valid, qty: -1 }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad priceCents", async () => {
    const res = await app.request("/catalogs", send("POST", { ...valid, priceCents: -5 }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad note", async () => {
    const res = await app.request("/catalogs", send("POST", { ...valid, note: 42 }));
    expect(res.status).toBe(400);
  });

  test("gets a row", async () => {
    await app.request("/catalogs", send("POST", valid));
    const res = await app.request("/catalogs/catalogs_1");
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("n1");
  });
});
