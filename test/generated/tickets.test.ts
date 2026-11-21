import { describe, expect, test } from "bun:test";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const valid = { name: "n1", qty: 3, note: "hello", priceCents: 250 };

describe("tickets", () => {
  test("creates a row", async () => {
    const res = await app.request("/tickets", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("tickets_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/tickets", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/tickets");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/tickets", send("POST", valid));
    const res = await app.request("/tickets");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad qty", async () => {
    const res = await app.request("/tickets", send("POST", { ...valid, qty: -1 }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad note", async () => {
    const res = await app.request("/tickets", send("POST", { ...valid, note: 42 }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad priceCents", async () => {
    const res = await app.request("/tickets", send("POST", { ...valid, priceCents: -5 }));
    expect(res.status).toBe(400);
  });

  test("reports empty stats", async () => {
    const res = await app.request("/tickets/stats");
    expect((await res.json()).count).toBe(0);
  });

  test("reports stats after a create", async () => {
    await app.request("/tickets", send("POST", valid));
    const body = await (await app.request("/tickets/stats")).json();
    expect(body.count).toBe(1);
    expect(body.valueCents).toBe(750);
  });

  test("handles 164 rows", async () => {
    for (let k = 0; k < 164; k++)
      await app.request("/tickets", send("POST", { ...valid, name: `n${k}` }));
    const rows = await (await app.request("/tickets")).json();
    expect(rows.length).toBe(164);
  });

  test("creates variant 1", async () => {
    const res = await app.request("/tickets", send("POST", { ...valid, name: "v1" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 2", async () => {
    const res = await app.request("/tickets", send("POST", { ...valid, name: "v2" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 3", async () => {
    const res = await app.request("/tickets", send("POST", { ...valid, name: "v3" }));
    expect(res.status).toBe(201);
  });
});
