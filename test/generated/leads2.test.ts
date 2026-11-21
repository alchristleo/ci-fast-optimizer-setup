import { describe, expect, test } from "bun:test";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const valid = { name: "n1", qty: 3 };

describe("leads2", () => {
  test("creates a row", async () => {
    const res = await app.request("/leads2", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("leads2_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/leads2", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/leads2");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/leads2", send("POST", valid));
    const res = await app.request("/leads2");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad qty", async () => {
    const res = await app.request("/leads2", send("POST", { ...valid, qty: -1 }));
    expect(res.status).toBe(400);
  });

  test("reports empty stats", async () => {
    const res = await app.request("/leads2/stats");
    expect((await res.json()).count).toBe(0);
  });

  test("reports stats after a create", async () => {
    await app.request("/leads2", send("POST", valid));
    const body = await (await app.request("/leads2/stats")).json();
    expect(body.count).toBe(1);
  });
});
