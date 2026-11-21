import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { count, create, list } from "../../src/domains/generated/invoices/service.ts";
import { resetStore } from "../../src/lib/store.ts";
import { send, useTestApp } from "../support/app.ts";
import { params } from "../support/property.ts";

const app = useTestApp();
const valid = { name: "n1", code: "AB123", qty: 3, priceCents: 250 };

describe("invoices", () => {
  test("creates a row", async () => {
    const res = await app.request("/invoices", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("invoices_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/invoices", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/invoices");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/invoices", send("POST", valid));
    const res = await app.request("/invoices");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad code", async () => {
    const res = await app.request("/invoices", send("POST", { ...valid, code: "bad" }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad qty", async () => {
    const res = await app.request("/invoices", send("POST", { ...valid, qty: -1 }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad priceCents", async () => {
    const res = await app.request("/invoices", send("POST", { ...valid, priceCents: -5 }));
    expect(res.status).toBe(400);
  });

  test("updates a row", async () => {
    await app.request("/invoices", send("POST", valid));
    const res = await app.request("/invoices/invoices_1", send("PATCH", { name: "renamed" }));
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("renamed");
  });

  test("rejects a bad update", async () => {
    await app.request("/invoices", send("POST", valid));
    const res = await app.request("/invoices/invoices_1", send("PATCH", { name: 123 }));
    expect(res.status).toBe(400);
  });

  test("404s when updating an unknown row", async () => {
    const res = await app.request("/invoices/invoices_99", send("PATCH", { name: "x" }));
    expect(res.status).toBe(404);
  });

  test("deletes a row", async () => {
    await app.request("/invoices", send("POST", valid));
    const res = await app.request("/invoices/invoices_1", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect((await app.request("/invoices")).status).toBe(200);
    expect((await (await app.request("/invoices")).json()).length).toBe(0);
  });

  test("property: rows round-trip through the service", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 40 }),
            code: fc.stringMatching(/^[A-Z]{2}[0-9]{3}$/),
            qty: fc.nat(10000),
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
    expect(list()).toEqual([{ ...valid, id: "invoices_1" }]);
  });

  test("property: valid bodies round-trip over HTTP", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 40 }),
          code: fc.stringMatching(/^[A-Z]{2}[0-9]{3}$/),
          qty: fc.nat(10000),
          priceCents: fc.nat(100000),
        }),
        async (body) => {
          resetStore();
          const res = await app.request("/invoices", send("POST", body));
          expect(res.status).toBe(201);
          expect(await res.json()).toEqual({ ...body, id: "invoices_1" });
          expect((await (await app.request("/invoices")).json()).length).toBe(1);
        },
      ),
      params(2),
    );
  });

  test("HTTP round trip example", async () => {
    const res = await app.request("/invoices", send("POST", valid));
    expect(await res.json()).toEqual({ ...valid, id: "invoices_1" });
  });
});
