import { describe, expect, test } from "bun:test";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const valid = { name: "n1", qty: 3, code: "AB123" };

describe("assets2", () => {
  test("creates a row", async () => {
    const res = await app.request("/assets2", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("assets2_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/assets2", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/assets2");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/assets2", send("POST", valid));
    const res = await app.request("/assets2");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad qty", async () => {
    const res = await app.request("/assets2", send("POST", { ...valid, qty: -1 }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad code", async () => {
    const res = await app.request("/assets2", send("POST", { ...valid, code: "bad" }));
    expect(res.status).toBe(400);
  });

  test("deletes a row", async () => {
    await app.request("/assets2", send("POST", valid));
    const res = await app.request("/assets2/assets2_1", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect((await app.request("/assets2")).status).toBe(200);
    expect((await (await app.request("/assets2")).json()).length).toBe(0);
  });

  test("404s when deleting an unknown row", async () => {
    const res = await app.request("/assets2/assets2_99", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});
