import { describe, expect, test } from "bun:test";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const valid = { name: "n1", note: "hello" };

describe("discounts", () => {
  test("creates a row", async () => {
    const res = await app.request("/discounts", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("discounts_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/discounts", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/discounts");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/discounts", send("POST", valid));
    const res = await app.request("/discounts");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad note", async () => {
    const res = await app.request("/discounts", send("POST", { ...valid, note: 42 }));
    expect(res.status).toBe(400);
  });
});
