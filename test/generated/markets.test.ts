import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { count, create, list } from "../../src/domains/generated/markets/service.ts";
import { create as createOther } from "../../src/domains/generated/grants/service.ts";
import { resetStore } from "../../src/lib/store.ts";
import { send, useTestApp } from "../support/app.ts";
import { params } from "../support/property.ts";

const app = useTestApp();
const valid = { name: "n1", qty: 3 };

describe("markets", () => {
  test("creates a row", async () => {
    const res = await app.request("/markets", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("markets_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/markets", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/markets");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/markets", send("POST", valid));
    const res = await app.request("/markets");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad qty", async () => {
    const res = await app.request("/markets", send("POST", { ...valid, qty: -1 }));
    expect(res.status).toBe(400);
  });

  test("updates a row", async () => {
    await app.request("/markets", send("POST", valid));
    const res = await app.request("/markets/markets_1", send("PATCH", { name: "renamed" }));
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("renamed");
  });

  test("rejects a bad update", async () => {
    await app.request("/markets", send("POST", valid));
    const res = await app.request("/markets/markets_1", send("PATCH", { name: 123 }));
    expect(res.status).toBe(400);
  });

  test("404s when updating an unknown row", async () => {
    const res = await app.request("/markets/markets_99", send("PATCH", { name: "x" }));
    expect(res.status).toBe(404);
  });

  test("counts rows in grants", async () => {
    createOther({ name: "o1" });
    createOther({ name: "o2" });
    await app.request("/markets", send("POST", valid));
    expect(await (await app.request("/markets/linked")).json()).toEqual({ own: 1, other: 2 });
  });

  test("handles 88 rows", async () => {
    for (let k = 0; k < 88; k++)
      await app.request("/markets", send("POST", { ...valid, name: `n${k}` }));
    const rows = await (await app.request("/markets")).json();
    expect(rows.length).toBe(88);
  });

  test("property: rows round-trip through the service", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ name: fc.string({ minLength: 1, maxLength: 40 }), qty: fc.nat(10000) }),
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
    expect(list()).toEqual([{ ...valid, id: "markets_1" }]);
  });

  test("property: valid bodies round-trip over HTTP", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({ name: fc.string({ minLength: 1, maxLength: 40 }), qty: fc.nat(10000) }),
        async (body) => {
          resetStore();
          const res = await app.request("/markets", send("POST", body));
          expect(res.status).toBe(201);
          expect(await res.json()).toEqual({ ...body, id: "markets_1" });
          expect((await (await app.request("/markets")).json()).length).toBe(1);
        },
      ),
      params(3),
    );
  });

  test("HTTP round trip example", async () => {
    const res = await app.request("/markets", send("POST", valid));
    expect(await res.json()).toEqual({ ...valid, id: "markets_1" });
  });
});
