import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { count, create, list, stats } from "../../src/domains/generated/tickets/service.ts";
import { resetStore } from "../../src/lib/store.ts";
import { send, useTestApp } from "../support/app.ts";
import { params } from "../support/property.ts";

const app = useTestApp();
const valid = { name: "n1", qty: 3, note: "hello", priceCents: 250 };

describe("tickets", () => {
  test("creates a row", async () => {
    const res = await app.request("/tickets", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("tickets_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/tickets", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/tickets");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/tickets", send("POST", valid));
    const res = await app.request("/tickets");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad qty", async () => {
    const res = await app.request("/tickets", send("POST", { ...valid, qty: -1 }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad note", async () => {
    const res = await app.request("/tickets", send("POST", { ...valid, note: 42 }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad priceCents", async () => {
    const res = await app.request("/tickets", send("POST", { ...valid, priceCents: -5 }));
    expect(res.status).toBe(400);
  });

  test("reports empty stats", async () => {
    const res = await app.request("/tickets/stats");
    expect((await res.json()).count).toBe(0);
  });

  test("reports stats after a create", async () => {
    await app.request("/tickets", send("POST", valid));
    const body = await (await app.request("/tickets/stats")).json();
    expect(body.count).toBe(1);
    expect(body.valueCents).toBe(750);
  });

  test("handles 164 rows", async () => {
    for (let k = 0; k < 164; k++)
      await app.request("/tickets", send("POST", { ...valid, name: `n${k}` }));
    const rows = await (await app.request("/tickets")).json();
    expect(rows.length).toBe(164);
  });

  test("creates variant 1", async () => {
    const res = await app.request("/tickets", send("POST", { ...valid, name: "v1" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 2", async () => {
    const res = await app.request("/tickets", send("POST", { ...valid, name: "v2" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 3", async () => {
    const res = await app.request("/tickets", send("POST", { ...valid, name: "v3" }));
    expect(res.status).toBe(201);
  });

  test("property: rows round-trip through the service", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 40 }),
            qty: fc.nat(10000),
            note: fc.string({ maxLength: 60 }),
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
      params(3),
    );
  });

  test("service round trip example", () => {
    create(valid);
    expect(list()).toEqual([{ ...valid, id: "tickets_1" }]);
  });

  test("property: valid bodies round-trip over HTTP", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 40 }),
          qty: fc.nat(10000),
          note: fc.string({ maxLength: 60 }),
          priceCents: fc.nat(100000),
        }),
        async (body) => {
          resetStore();
          const res = await app.request("/tickets", send("POST", body));
          expect(res.status).toBe(201);
          expect(await res.json()).toEqual({ ...body, id: "tickets_1" });
          expect((await (await app.request("/tickets")).json()).length).toBe(1);
        },
      ),
      params(3),
    );
  });

  test("HTTP round trip example", async () => {
    const res = await app.request("/tickets", send("POST", valid));
    expect(await res.json()).toEqual({ ...valid, id: "tickets_1" });
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
      params(3),
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
      params(3),
    );
  });

  test("stats of a 20 unit row example", () => {
    create({ name: "n", qty: 20, priceCents: 100 });
    expect(stats().valueCents).toBe(1800);
  });
});
