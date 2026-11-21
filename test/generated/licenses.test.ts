import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { count, create, list } from "../../src/domains/generated/licenses/service.ts";
import { resetStore } from "../../src/lib/store.ts";
import { send, useTestApp } from "../support/app.ts";
import { params } from "../support/property.ts";

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

  test("property: rows round-trip through the service", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 40 }),
            priceCents: fc.nat(100000),
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
      params(2),
    );
  });

  test("service round trip example", () => {
    create(valid);
    expect(list()).toEqual([{ ...valid, id: "licenses_1" }]);
  });

  test("property: valid bodies round-trip over HTTP", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({ name: fc.string({ minLength: 1, maxLength: 40 }), priceCents: fc.nat(100000) }),
        async (body) => {
          resetStore();
          const res = await app.request("/licenses", send("POST", body));
          expect(res.status).toBe(201);
          expect(await res.json()).toEqual({ ...body, id: "licenses_1" });
          expect((await (await app.request("/licenses")).json()).length).toBe(1);
        },
      ),
      params(2),
    );
  });

  test("HTTP round trip example", async () => {
    const res = await app.request("/licenses", send("POST", valid));
    expect(await res.json()).toEqual({ ...valid, id: "licenses_1" });
  });
});
