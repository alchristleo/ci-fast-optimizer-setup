import { describe, expect, test } from "bun:test";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const valid = { name: "n1", priceCents: 250, qty: 3, note: "hello" };

describe("devices2", () => {
  test("creates a row", async () => {
    const res = await app.request("/devices2", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("devices2_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/devices2", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/devices2");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/devices2", send("POST", valid));
    const res = await app.request("/devices2");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad priceCents", async () => {
    const res = await app.request("/devices2", send("POST", { ...valid, priceCents: -5 }));
    expect(res.status).toBe(400);
  });
});
