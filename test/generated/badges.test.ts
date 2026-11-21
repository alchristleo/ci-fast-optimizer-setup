import { describe, expect, test } from "bun:test";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const valid = { name: "n1", qty: 3, priceCents: 250, note: "hello" };

describe("badges", () => {
  test("creates a row", async () => {
    const res = await app.request("/badges", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("badges_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/badges", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/badges");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/badges", send("POST", valid));
    const res = await app.request("/badges");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad qty", async () => {
    const res = await app.request("/badges", send("POST", { ...valid, qty: -1 }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad priceCents", async () => {
    const res = await app.request("/badges", send("POST", { ...valid, priceCents: -5 }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad note", async () => {
    const res = await app.request("/badges", send("POST", { ...valid, note: 42 }));
    expect(res.status).toBe(400);
  });

  test("gets a row", async () => {
    await app.request("/badges", send("POST", valid));
    const res = await app.request("/badges/badges_1");
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("n1");
  });

  test("404s on an unknown row", async () => {
    const res = await app.request("/badges/badges_99");
    expect(res.status).toBe(404);
  });

  test("deletes a row", async () => {
    await app.request("/badges", send("POST", valid));
    const res = await app.request("/badges/badges_1", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect((await app.request("/badges")).status).toBe(200);
    expect((await (await app.request("/badges")).json()).length).toBe(0);
  });

  test("404s when deleting an unknown row", async () => {
    const res = await app.request("/badges/badges_99", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  test("reports empty stats", async () => {
    const res = await app.request("/badges/stats");
    expect((await res.json()).count).toBe(0);
  });

  test("reports stats after a create", async () => {
    await app.request("/badges", send("POST", valid));
    const body = await (await app.request("/badges/stats")).json();
    expect(body.count).toBe(1);
    expect(body.valueCents).toBe(750);
  });
});
