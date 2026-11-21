import { describe, expect, test } from "bun:test";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const valid = { name: "n1", qty: 3, code: "AB123", note: "hello" };

describe("policies", () => {
  test("creates a row", async () => {
    const res = await app.request("/policies", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("policies_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/policies", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/policies");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/policies", send("POST", valid));
    const res = await app.request("/policies");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad qty", async () => {
    const res = await app.request("/policies", send("POST", { ...valid, qty: -1 }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad code", async () => {
    const res = await app.request("/policies", send("POST", { ...valid, code: "bad" }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad note", async () => {
    const res = await app.request("/policies", send("POST", { ...valid, note: 42 }));
    expect(res.status).toBe(400);
  });

  test("handles 347 rows", async () => {
    for (let k = 0; k < 347; k++)
      await app.request("/policies", send("POST", { ...valid, name: `n${k}` }));
    const rows = await (await app.request("/policies")).json();
    expect(rows.length).toBe(347);
  });

  test("creates variant 1", async () => {
    const res = await app.request("/policies", send("POST", { ...valid, name: "v1" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 2", async () => {
    const res = await app.request("/policies", send("POST", { ...valid, name: "v2" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 3", async () => {
    const res = await app.request("/policies", send("POST", { ...valid, name: "v3" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 4", async () => {
    const res = await app.request("/policies", send("POST", { ...valid, name: "v4" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 5", async () => {
    const res = await app.request("/policies", send("POST", { ...valid, name: "v5" }));
    expect(res.status).toBe(201);
  });
});
