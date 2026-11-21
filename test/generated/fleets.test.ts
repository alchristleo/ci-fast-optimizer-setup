import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { count, create, list, stats } from "../../src/domains/generated/fleets/service.ts";
import { resetStore } from "../../src/lib/store.ts";
import { send, useTestApp } from "../support/app.ts";
import { params } from "../support/property.ts";

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

  test("property: rows round-trip through the service", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 40 }),
            code: fc.stringMatching(/^[A-Z]{2}[0-9]{3}$/),
            priceCents: fc.nat(100000),
            qty: fc.nat(10000),
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
      params(1),
    );
  });

  test("service round trip example", () => {
    create(valid);
    expect(list()).toEqual([{ ...valid, id: "fleets_1" }]);
  });

  test("property: valid bodies round-trip over HTTP", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 40 }),
          code: fc.stringMatching(/^[A-Z]{2}[0-9]{3}$/),
          priceCents: fc.nat(100000),
          qty: fc.nat(10000),
        }),
        async (body) => {
          resetStore();
          const res = await app.request("/fleets", send("POST", body));
          expect(res.status).toBe(201);
          expect(await res.json()).toEqual({ ...body, id: "fleets_1" });
          expect((await (await app.request("/fleets")).json()).length).toBe(1);
        },
      ),
      params(1),
    );
  });

  test("HTTP round trip example", async () => {
    const res = await app.request("/fleets", send("POST", valid));
    expect(await res.json()).toEqual({ ...valid, id: "fleets_1" });
  });

  test("property: stats value is the sum of undiscounted line totals", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ name: fc.constant("n"), qty: fc.nat(4), priceCents: fc.nat(100000) }),
          { maxLength: 30 },
        ),
        (rows) => {
          resetStore();
          for (const r of rows) create(r);
          expect(stats().valueCents).toBe(rows.reduce((t, r) => t + r.qty * r.priceCents, 0));
        },
      ),
      params(1),
    );
  });

  test("property: bulk discounts never raise the stats value", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ name: fc.constant("n"), qty: fc.nat(1000), priceCents: fc.nat(100000) }),
          { maxLength: 30 },
        ),
        (rows) => {
          resetStore();
          for (const r of rows) create(r);
          const { valueCents } = stats();
          expect(Number.isInteger(valueCents)).toBe(true);
          expect(valueCents).toBeLessThanOrEqual(
            rows.reduce((t, r) => t + r.qty * r.priceCents, 0),
          );
        },
      ),
      params(1),
    );
  });

  test("stats of a 20 unit row example", () => {
    create({ name: "n", qty: 20, priceCents: 100 });
    expect(stats().valueCents).toBe(1800);
  });
});
