import { describe, expect, test } from "bun:test";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const valid = { name: "n1", note: "hello", qty: 3, priceCents: 250 };

describe("groups", () => {
  test("creates a row", async () => {
    const res = await app.request("/groups", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("groups_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/groups", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/groups");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/groups", send("POST", valid));
    const res = await app.request("/groups");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad note", async () => {
    const res = await app.request("/groups", send("POST", { ...valid, note: 42 }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad qty", async () => {
    const res = await app.request("/groups", send("POST", { ...valid, qty: -1 }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad priceCents", async () => {
    const res = await app.request("/groups", send("POST", { ...valid, priceCents: -5 }));
    expect(res.status).toBe(400);
  });

  test("updates a row", async () => {
    await app.request("/groups", send("POST", valid));
    const res = await app.request("/groups/groups_1", send("PATCH", { name: "renamed" }));
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("renamed");
  });

  test("rejects a bad update", async () => {
    await app.request("/groups", send("POST", valid));
    const res = await app.request("/groups/groups_1", send("PATCH", { name: 123 }));
    expect(res.status).toBe(400);
  });

  test("404s when updating an unknown row", async () => {
    const res = await app.request("/groups/groups_99", send("PATCH", { name: "x" }));
    expect(res.status).toBe(404);
  });

  test("deletes a row", async () => {
    await app.request("/groups", send("POST", valid));
    const res = await app.request("/groups/groups_1", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect((await app.request("/groups")).status).toBe(200);
    expect((await (await app.request("/groups")).json()).length).toBe(0);
  });

  test("404s when deleting an unknown row", async () => {
    const res = await app.request("/groups/groups_99", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});
