import { describe, expect, test } from "bun:test";
import { create as createOther } from "../../src/domains/generated/banners/service.ts";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const valid = { name: "n1", qty: 3 };

describe("carts", () => {
  test("creates a row", async () => {
    const res = await app.request("/carts", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("carts_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/carts", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/carts");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/carts", send("POST", valid));
    const res = await app.request("/carts");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad qty", async () => {
    const res = await app.request("/carts", send("POST", { ...valid, qty: -1 }));
    expect(res.status).toBe(400);
  });

  test("gets a row", async () => {
    await app.request("/carts", send("POST", valid));
    const res = await app.request("/carts/carts_1");
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("n1");
  });

  test("404s on an unknown row", async () => {
    const res = await app.request("/carts/carts_99");
    expect(res.status).toBe(404);
  });

  test("reports empty stats", async () => {
    const res = await app.request("/carts/stats");
    expect((await res.json()).count).toBe(0);
  });

  test("reports stats after a create", async () => {
    await app.request("/carts", send("POST", valid));
    const body = await (await app.request("/carts/stats")).json();
    expect(body.count).toBe(1);
  });

  test("counts rows in banners", async () => {
    createOther({ name: "o1" });
    createOther({ name: "o2" });
    await app.request("/carts", send("POST", valid));
    expect(await (await app.request("/carts/linked")).json()).toEqual({ own: 1, other: 2 });
  });

  test("handles 277 rows", async () => {
    for (let k = 0; k < 277; k++)
      await app.request("/carts", send("POST", { ...valid, name: `n${k}` }));
    const rows = await (await app.request("/carts")).json();
    expect(rows.length).toBe(277);
  });

  test("creates variant 1", async () => {
    const res = await app.request("/carts", send("POST", { ...valid, name: "v1" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 2", async () => {
    const res = await app.request("/carts", send("POST", { ...valid, name: "v2" }));
    expect(res.status).toBe(201);
  });
});
