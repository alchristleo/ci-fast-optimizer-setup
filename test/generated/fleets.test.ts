import { describe, expect, test } from "bun:test";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const valid = { name: "n1", code: "AB123", priceCents: 250, qty: 3 };

describe("fleets", () => {
  test("creates a row", async () => {
    const res = await app.request("/fleets", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("fleets_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/fleets", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/fleets");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/fleets", send("POST", valid));
    const res = await app.request("/fleets");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad code", async () => {
    const res = await app.request("/fleets", send("POST", { ...valid, code: "bad" }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad priceCents", async () => {
    const res = await app.request("/fleets", send("POST", { ...valid, priceCents: -5 }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad qty", async () => {
    const res = await app.request("/fleets", send("POST", { ...valid, qty: -1 }));
    expect(res.status).toBe(400);
  });

  test("gets a row", async () => {
    await app.request("/fleets", send("POST", valid));
    const res = await app.request("/fleets/fleets_1");
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("n1");
  });

  test("404s on an unknown row", async () => {
    const res = await app.request("/fleets/fleets_99");
    expect(res.status).toBe(404);
  });

  test("deletes a row", async () => {
    await app.request("/fleets", send("POST", valid));
    const res = await app.request("/fleets/fleets_1", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect((await app.request("/fleets")).status).toBe(200);
    expect((await (await app.request("/fleets")).json()).length).toBe(0);
  });

  test("404s when deleting an unknown row", async () => {
    const res = await app.request("/fleets/fleets_99", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});
