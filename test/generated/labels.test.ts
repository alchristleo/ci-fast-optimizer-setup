import { describe, expect, test } from "bun:test";
import { create as createOther } from "../../src/domains/generated/channels/service.ts";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const valid = { name: "n1", priceCents: 250 };

describe("labels", () => {
  test("creates a row", async () => {
    const res = await app.request("/labels", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("labels_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/labels", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/labels");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/labels", send("POST", valid));
    const res = await app.request("/labels");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad priceCents", async () => {
    const res = await app.request("/labels", send("POST", { ...valid, priceCents: -5 }));
    expect(res.status).toBe(400);
  });

  test("gets a row", async () => {
    await app.request("/labels", send("POST", valid));
    const res = await app.request("/labels/labels_1");
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("n1");
  });

  test("404s on an unknown row", async () => {
    const res = await app.request("/labels/labels_99");
    expect(res.status).toBe(404);
  });

  test("updates a row", async () => {
    await app.request("/labels", send("POST", valid));
    const res = await app.request("/labels/labels_1", send("PATCH", { name: "renamed" }));
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("renamed");
  });

  test("rejects a bad update", async () => {
    await app.request("/labels", send("POST", valid));
    const res = await app.request("/labels/labels_1", send("PATCH", { name: 123 }));
    expect(res.status).toBe(400);
  });

  test("404s when updating an unknown row", async () => {
    const res = await app.request("/labels/labels_99", send("PATCH", { name: "x" }));
    expect(res.status).toBe(404);
  });

  test("counts rows in channels", async () => {
    createOther({ name: "o1" });
    createOther({ name: "o2" });
    await app.request("/labels", send("POST", valid));
    expect(await (await app.request("/labels/linked")).json()).toEqual({ own: 1, other: 2 });
  });

  test("handles 166 rows", async () => {
    for (let k = 0; k < 166; k++)
      await app.request("/labels", send("POST", { ...valid, name: `n${k}` }));
    const rows = await (await app.request("/labels")).json();
    expect(rows.length).toBe(166);
  });
});
