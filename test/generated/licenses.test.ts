import { describe, expect, test } from "bun:test";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const valid = { name: "n1", priceCents: 250 };

describe("licenses", () => {
  test("creates a row", async () => {
    const res = await app.request("/licenses", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("licenses_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/licenses", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/licenses");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/licenses", send("POST", valid));
    const res = await app.request("/licenses");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad priceCents", async () => {
    const res = await app.request("/licenses", send("POST", { ...valid, priceCents: -5 }));
    expect(res.status).toBe(400);
  });

  test("reports empty stats", async () => {
    const res = await app.request("/licenses/stats");
    expect((await res.json()).count).toBe(0);
  });

  test("reports stats after a create", async () => {
    await app.request("/licenses", send("POST", valid));
    const body = await (await app.request("/licenses/stats")).json();
    expect(body.count).toBe(1);
  });
});
