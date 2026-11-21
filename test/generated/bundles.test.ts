import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { count, create, list } from "../../src/domains/generated/bundles/service.ts";
import { resetStore } from "../../src/lib/store.ts";
import { send, useTestApp } from "../support/app.ts";
import { params } from "../support/property.ts";

const app = useTestApp();
const valid = { name: "n1", priceCents: 250, note: "hello" };

describe("bundles", () => {
  test("creates a row", async () => {
    const res = await app.request("/bundles", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("bundles_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/bundles", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/bundles");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/bundles", send("POST", valid));
    const res = await app.request("/bundles");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad priceCents", async () => {
    const res = await app.request("/bundles", send("POST", { ...valid, priceCents: -5 }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad note", async () => {
    const res = await app.request("/bundles", send("POST", { ...valid, note: 42 }));
    expect(res.status).toBe(400);
  });

  test("gets a row", async () => {
    await app.request("/bundles", send("POST", valid));
    const res = await app.request("/bundles/bundles_1");
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("n1");
  });

  test("404s on an unknown row", async () => {
    const res = await app.request("/bundles/bundles_99");
    expect(res.status).toBe(404);
  });

  test("updates a row", async () => {
    await app.request("/bundles", send("POST", valid));
    const res = await app.request("/bundles/bundles_1", send("PATCH", { name: "renamed" }));
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("renamed");
  });

  test("rejects a bad update", async () => {
    await app.request("/bundles", send("POST", valid));
    const res = await app.request("/bundles/bundles_1", send("PATCH", { name: 123 }));
    expect(res.status).toBe(400);
  });

  test("404s when updating an unknown row", async () => {
    const res = await app.request("/bundles/bundles_99", send("PATCH", { name: "x" }));
    expect(res.status).toBe(404);
  });

  test("reports empty stats", async () => {
    const res = await app.request("/bundles/stats");
    expect((await res.json()).count).toBe(0);
  });

  test("property: rows round-trip through the service", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 40 }),
            priceCents: fc.nat(100000),
            note: fc.string({ maxLength: 60 }),
          }),
          { maxLength: 30 },
        ),
        (rows) => {
          resetStore();
          const made = rows.map((r) => create(r));
          expect(count()).toBe(rows.length);
          expect(new Set(made.map((r) => r.id)).size).toBe(rows.length);
          expect(list().map((r) => r.name)).toEqual(rows.map((r) => r.name));
        },
      ),
      params(3),
    );
  });

  test("service round trip example", () => {
    create(valid);
    expect(list()).toEqual([{ ...valid, id: "bundles_1" }]);
  });

  test("property: valid bodies round-trip over HTTP", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 40 }),
          priceCents: fc.nat(100000),
          note: fc.string({ maxLength: 60 }),
        }),
        async (body) => {
          resetStore();
          const res = await app.request("/bundles", send("POST", body));
          expect(res.status).toBe(201);
          expect(await res.json()).toEqual({ ...body, id: "bundles_1" });
          expect((await (await app.request("/bundles")).json()).length).toBe(1);
        },
      ),
      params(3),
    );
  });

  test("HTTP round trip example", async () => {
    const res = await app.request("/bundles", send("POST", valid));
    expect(await res.json()).toEqual({ ...valid, id: "bundles_1" });
  });
});
