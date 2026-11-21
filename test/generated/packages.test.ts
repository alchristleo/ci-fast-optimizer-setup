import { describe, expect, test } from "bun:test";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const valid = { name: "n1", code: "AB123" };

describe("packages", () => {
  test("creates a row", async () => {
    const res = await app.request("/packages", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("packages_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/packages", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/packages");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/packages", send("POST", valid));
    const res = await app.request("/packages");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad code", async () => {
    const res = await app.request("/packages", send("POST", { ...valid, code: "bad" }));
    expect(res.status).toBe(400);
  });

  test("updates a row", async () => {
    await app.request("/packages", send("POST", valid));
    const res = await app.request("/packages/packages_1", send("PATCH", { name: "renamed" }));
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("renamed");
  });

  test("rejects a bad update", async () => {
    await app.request("/packages", send("POST", valid));
    const res = await app.request("/packages/packages_1", send("PATCH", { name: 123 }));
    expect(res.status).toBe(400);
  });

  test("404s when updating an unknown row", async () => {
    const res = await app.request("/packages/packages_99", send("PATCH", { name: "x" }));
    expect(res.status).toBe(404);
  });

  test("reports empty stats", async () => {
    const res = await app.request("/packages/stats");
    expect((await res.json()).count).toBe(0);
  });

  test("reports stats after a create", async () => {
    await app.request("/packages", send("POST", valid));
    const body = await (await app.request("/packages/stats")).json();
    expect(body.count).toBe(1);
  });

  test("handles 65 rows", async () => {
    for (let k = 0; k < 65; k++)
      await app.request("/packages", send("POST", { ...valid, name: `n${k}` }));
    const rows = await (await app.request("/packages")).json();
    expect(rows.length).toBe(65);
  });

  test("creates variant 1", async () => {
    const res = await app.request("/packages", send("POST", { ...valid, name: "v1" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 2", async () => {
    const res = await app.request("/packages", send("POST", { ...valid, name: "v2" }));
    expect(res.status).toBe(201);
  });
});
