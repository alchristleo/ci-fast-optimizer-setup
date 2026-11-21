import { describe, expect, test } from "bun:test";
import { create as createOther } from "../../src/domains/generated/bookings/service.ts";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const valid = { name: "n1", qty: 3, active: true };

describe("feedback", () => {
  test("creates a row", async () => {
    const res = await app.request("/feedback", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("feedback_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/feedback", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/feedback");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/feedback", send("POST", valid));
    const res = await app.request("/feedback");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad qty", async () => {
    const res = await app.request("/feedback", send("POST", { ...valid, qty: -1 }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad active", async () => {
    const res = await app.request("/feedback", send("POST", { ...valid, active: "yes" }));
    expect(res.status).toBe(400);
  });

  test("updates a row", async () => {
    await app.request("/feedback", send("POST", valid));
    const res = await app.request("/feedback/feedback_1", send("PATCH", { name: "renamed" }));
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("renamed");
  });

  test("rejects a bad update", async () => {
    await app.request("/feedback", send("POST", valid));
    const res = await app.request("/feedback/feedback_1", send("PATCH", { name: 123 }));
    expect(res.status).toBe(400);
  });

  test("404s when updating an unknown row", async () => {
    const res = await app.request("/feedback/feedback_99", send("PATCH", { name: "x" }));
    expect(res.status).toBe(404);
  });

  test("reports empty stats", async () => {
    const res = await app.request("/feedback/stats");
    expect((await res.json()).count).toBe(0);
  });

  test("reports stats after a create", async () => {
    await app.request("/feedback", send("POST", valid));
    const body = await (await app.request("/feedback/stats")).json();
    expect(body.count).toBe(1);
    expect(body.active).toBe(1);
  });

  test("counts rows in bookings", async () => {
    createOther({ name: "o1" });
    createOther({ name: "o2" });
    await app.request("/feedback", send("POST", valid));
    expect(await (await app.request("/feedback/linked")).json()).toEqual({ own: 1, other: 2 });
  });

  test("handles 142 rows", async () => {
    for (let k = 0; k < 142; k++)
      await app.request("/feedback", send("POST", { ...valid, name: `n${k}` }));
    const rows = await (await app.request("/feedback")).json();
    expect(rows.length).toBe(142);
  });
});
