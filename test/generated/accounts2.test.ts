import { describe, expect, test } from "bun:test";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const valid = { name: "n1", priceCents: 250, qty: 3 };

describe("accounts2", () => {
  test("creates a row", async () => {
    const res = await app.request("/accounts2", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("accounts2_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/accounts2", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/accounts2");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/accounts2", send("POST", valid));
    const res = await app.request("/accounts2");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad priceCents", async () => {
    const res = await app.request("/accounts2", send("POST", { ...valid, priceCents: -5 }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad qty", async () => {
    const res = await app.request("/accounts2", send("POST", { ...valid, qty: -1 }));
    expect(res.status).toBe(400);
  });

  test("gets a row", async () => {
    await app.request("/accounts2", send("POST", valid));
    const res = await app.request("/accounts2/accounts2_1");
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("n1");
  });

  test("404s on an unknown row", async () => {
    const res = await app.request("/accounts2/accounts2_99");
    expect(res.status).toBe(404);
  });

  test("handles 329 rows", async () => {
    for (let k = 0; k < 329; k++)
      await app.request("/accounts2", send("POST", { ...valid, name: `n${k}` }));
    const rows = await (await app.request("/accounts2")).json();
    expect(rows.length).toBe(329);
  });

  test("creates variant 1", async () => {
    const res = await app.request("/accounts2", send("POST", { ...valid, name: "v1" }));
    expect(res.status).toBe(201);
  });
});
