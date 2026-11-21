import { describe, expect, test } from "bun:test";
import { create as createOther } from "../../src/domains/generated/regions/service.ts";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const valid = { name: "n1", code: "AB123", note: "hello" };

describe("agents2", () => {
  test("creates a row", async () => {
    const res = await app.request("/agents2", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("agents2_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/agents2", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/agents2");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/agents2", send("POST", valid));
    const res = await app.request("/agents2");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad code", async () => {
    const res = await app.request("/agents2", send("POST", { ...valid, code: "bad" }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad note", async () => {
    const res = await app.request("/agents2", send("POST", { ...valid, note: 42 }));
    expect(res.status).toBe(400);
  });

  test("gets a row", async () => {
    await app.request("/agents2", send("POST", valid));
    const res = await app.request("/agents2/agents2_1");
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("n1");
  });

  test("404s on an unknown row", async () => {
    const res = await app.request("/agents2/agents2_99");
    expect(res.status).toBe(404);
  });

  test("deletes a row", async () => {
    await app.request("/agents2", send("POST", valid));
    const res = await app.request("/agents2/agents2_1", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect((await app.request("/agents2")).status).toBe(200);
    expect((await (await app.request("/agents2")).json()).length).toBe(0);
  });

  test("404s when deleting an unknown row", async () => {
    const res = await app.request("/agents2/agents2_99", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  test("reports empty stats", async () => {
    const res = await app.request("/agents2/stats");
    expect((await res.json()).count).toBe(0);
  });

  test("reports stats after a create", async () => {
    await app.request("/agents2", send("POST", valid));
    const body = await (await app.request("/agents2/stats")).json();
    expect(body.count).toBe(1);
  });

  test("counts rows in regions", async () => {
    createOther({ name: "o1" });
    createOther({ name: "o2" });
    await app.request("/agents2", send("POST", valid));
    expect(await (await app.request("/agents2/linked")).json()).toEqual({ own: 1, other: 2 });
  });

  test("handles 135 rows", async () => {
    for (let k = 0; k < 135; k++)
      await app.request("/agents2", send("POST", { ...valid, name: `n${k}` }));
    const rows = await (await app.request("/agents2")).json();
    expect(rows.length).toBe(135);
  });
});
