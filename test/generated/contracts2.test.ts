import { describe, expect, test } from "bun:test";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const valid = { name: "n1", code: "AB123", priceCents: 250 };

describe("contracts2", () => {
  test("creates a row", async () => {
    const res = await app.request("/contracts2", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("contracts2_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/contracts2", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/contracts2");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/contracts2", send("POST", valid));
    const res = await app.request("/contracts2");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad code", async () => {
    const res = await app.request("/contracts2", send("POST", { ...valid, code: "bad" }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad priceCents", async () => {
    const res = await app.request("/contracts2", send("POST", { ...valid, priceCents: -5 }));
    expect(res.status).toBe(400);
  });

  test("updates a row", async () => {
    await app.request("/contracts2", send("POST", valid));
    const res = await app.request("/contracts2/contracts2_1", send("PATCH", { name: "renamed" }));
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("renamed");
  });

  test("rejects a bad update", async () => {
    await app.request("/contracts2", send("POST", valid));
    const res = await app.request("/contracts2/contracts2_1", send("PATCH", { name: 123 }));
    expect(res.status).toBe(400);
  });

  test("404s when updating an unknown row", async () => {
    const res = await app.request("/contracts2/contracts2_99", send("PATCH", { name: "x" }));
    expect(res.status).toBe(404);
  });

  test("deletes a row", async () => {
    await app.request("/contracts2", send("POST", valid));
    const res = await app.request("/contracts2/contracts2_1", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect((await app.request("/contracts2")).status).toBe(200);
    expect((await (await app.request("/contracts2")).json()).length).toBe(0);
  });

  test("404s when deleting an unknown row", async () => {
    const res = await app.request("/contracts2/contracts2_99", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  test("reports empty stats", async () => {
    const res = await app.request("/contracts2/stats");
    expect((await res.json()).count).toBe(0);
  });

  test("reports stats after a create", async () => {
    await app.request("/contracts2", send("POST", valid));
    const body = await (await app.request("/contracts2/stats")).json();
    expect(body.count).toBe(1);
  });
});
