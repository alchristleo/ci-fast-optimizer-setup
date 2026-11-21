import { describe, expect, test } from "bun:test";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const valid = { name: "n1", active: true, priceCents: 250, note: "hello" };

describe("depots2", () => {
  test("creates a row", async () => {
    const res = await app.request("/depots2", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("depots2_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/depots2", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/depots2");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/depots2", send("POST", valid));
    const res = await app.request("/depots2");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad active", async () => {
    const res = await app.request("/depots2", send("POST", { ...valid, active: "yes" }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad priceCents", async () => {
    const res = await app.request("/depots2", send("POST", { ...valid, priceCents: -5 }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad note", async () => {
    const res = await app.request("/depots2", send("POST", { ...valid, note: 42 }));
    expect(res.status).toBe(400);
  });

  test("gets a row", async () => {
    await app.request("/depots2", send("POST", valid));
    const res = await app.request("/depots2/depots2_1");
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("n1");
  });

  test("404s on an unknown row", async () => {
    const res = await app.request("/depots2/depots2_99");
    expect(res.status).toBe(404);
  });

  test("updates a row", async () => {
    await app.request("/depots2", send("POST", valid));
    const res = await app.request("/depots2/depots2_1", send("PATCH", { name: "renamed" }));
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("renamed");
  });

  test("rejects a bad update", async () => {
    await app.request("/depots2", send("POST", valid));
    const res = await app.request("/depots2/depots2_1", send("PATCH", { name: 123 }));
    expect(res.status).toBe(400);
  });

  test("404s when updating an unknown row", async () => {
    const res = await app.request("/depots2/depots2_99", send("PATCH", { name: "x" }));
    expect(res.status).toBe(404);
  });

  test("deletes a row", async () => {
    await app.request("/depots2", send("POST", valid));
    const res = await app.request("/depots2/depots2_1", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect((await app.request("/depots2")).status).toBe(200);
    expect((await (await app.request("/depots2")).json()).length).toBe(0);
  });

  test("404s when deleting an unknown row", async () => {
    const res = await app.request("/depots2/depots2_99", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  test("reports empty stats", async () => {
    const res = await app.request("/depots2/stats");
    expect((await res.json()).count).toBe(0);
  });

  test("reports stats after a create", async () => {
    await app.request("/depots2", send("POST", valid));
    const body = await (await app.request("/depots2/stats")).json();
    expect(body.count).toBe(1);
    expect(body.active).toBe(1);
  });

  test("handles 29 rows", async () => {
    for (let k = 0; k < 29; k++)
      await app.request("/depots2", send("POST", { ...valid, name: `n${k}` }));
    const rows = await (await app.request("/depots2")).json();
    expect(rows.length).toBe(29);
  });
});
