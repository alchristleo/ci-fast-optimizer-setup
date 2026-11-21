import { describe, expect, test } from "bun:test";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const valid = { name: "n1", priceCents: 250, code: "AB123" };

describe("banners2", () => {
  test("creates a row", async () => {
    const res = await app.request("/banners2", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("banners2_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/banners2", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/banners2");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/banners2", send("POST", valid));
    const res = await app.request("/banners2");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad priceCents", async () => {
    const res = await app.request("/banners2", send("POST", { ...valid, priceCents: -5 }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad code", async () => {
    const res = await app.request("/banners2", send("POST", { ...valid, code: "bad" }));
    expect(res.status).toBe(400);
  });

  test("gets a row", async () => {
    await app.request("/banners2", send("POST", valid));
    const res = await app.request("/banners2/banners2_1");
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("n1");
  });

  test("404s on an unknown row", async () => {
    const res = await app.request("/banners2/banners2_99");
    expect(res.status).toBe(404);
  });

  test("reports empty stats", async () => {
    const res = await app.request("/banners2/stats");
    expect((await res.json()).count).toBe(0);
  });

  test("reports stats after a create", async () => {
    await app.request("/banners2", send("POST", valid));
    const body = await (await app.request("/banners2/stats")).json();
    expect(body.count).toBe(1);
  });

  test("handles 125 rows", async () => {
    for (let k = 0; k < 125; k++)
      await app.request("/banners2", send("POST", { ...valid, name: `n${k}` }));
    const rows = await (await app.request("/banners2")).json();
    expect(rows.length).toBe(125);
  });

  test("creates variant 1", async () => {
    const res = await app.request("/banners2", send("POST", { ...valid, name: "v1" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 2", async () => {
    const res = await app.request("/banners2", send("POST", { ...valid, name: "v2" }));
    expect(res.status).toBe(201);
  });
});
