import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { count, create, list } from "../../src/domains/generated/campaigns2/service.ts";
import { create as createOther } from "../../src/domains/generated/vouchers/service.ts";
import { resetStore } from "../../src/lib/store.ts";
import { send, useTestApp } from "../support/app.ts";
import { params } from "../support/property.ts";

const app = useTestApp();
const valid = { name: "n1", qty: 3, code: "AB123", priceCents: 250 };

describe("campaigns2", () => {
  test("creates a row", async () => {
    const res = await app.request("/campaigns2", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("campaigns2_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/campaigns2", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/campaigns2");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/campaigns2", send("POST", valid));
    const res = await app.request("/campaigns2");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad qty", async () => {
    const res = await app.request("/campaigns2", send("POST", { ...valid, qty: -1 }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad code", async () => {
    const res = await app.request("/campaigns2", send("POST", { ...valid, code: "bad" }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad priceCents", async () => {
    const res = await app.request("/campaigns2", send("POST", { ...valid, priceCents: -5 }));
    expect(res.status).toBe(400);
  });

  test("counts rows in vouchers", async () => {
    createOther({ name: "o1" });
    createOther({ name: "o2" });
    await app.request("/campaigns2", send("POST", valid));
    expect(await (await app.request("/campaigns2/linked")).json()).toEqual({ own: 1, other: 2 });
  });

  test("handles 262 rows", async () => {
    for (let k = 0; k < 262; k++)
      await app.request("/campaigns2", send("POST", { ...valid, name: `n${k}` }));
    const rows = await (await app.request("/campaigns2")).json();
    expect(rows.length).toBe(262);
  });

  test("creates variant 1", async () => {
    const res = await app.request("/campaigns2", send("POST", { ...valid, name: "v1" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 2", async () => {
    const res = await app.request("/campaigns2", send("POST", { ...valid, name: "v2" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 3", async () => {
    const res = await app.request("/campaigns2", send("POST", { ...valid, name: "v3" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 4", async () => {
    const res = await app.request("/campaigns2", send("POST", { ...valid, name: "v4" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 5", async () => {
    const res = await app.request("/campaigns2", send("POST", { ...valid, name: "v5" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 6", async () => {
    const res = await app.request("/campaigns2", send("POST", { ...valid, name: "v6" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 7", async () => {
    const res = await app.request("/campaigns2", send("POST", { ...valid, name: "v7" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 8", async () => {
    const res = await app.request("/campaigns2", send("POST", { ...valid, name: "v8" }));
    expect(res.status).toBe(201);
  });

  test("property: rows round-trip through the service", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 40 }),
            qty: fc.nat(10000),
            code: fc.stringMatching(/^[A-Z]{2}[0-9]{3}$/),
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
    expect(list()).toEqual([{ ...valid, id: "campaigns2_1" }]);
  });

  test("property: valid bodies round-trip over HTTP", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 40 }),
          qty: fc.nat(10000),
          code: fc.stringMatching(/^[A-Z]{2}[0-9]{3}$/),
          priceCents: fc.nat(100000),
        }),
        async (body) => {
          resetStore();
          const res = await app.request("/campaigns2", send("POST", body));
          expect(res.status).toBe(201);
          expect(await res.json()).toEqual({ ...body, id: "campaigns2_1" });
          expect((await (await app.request("/campaigns2")).json()).length).toBe(1);
        },
      ),
      params(3),
    );
  });

  test("HTTP round trip example", async () => {
    const res = await app.request("/campaigns2", send("POST", valid));
    expect(await res.json()).toEqual({ ...valid, id: "campaigns2_1" });
  });
});
