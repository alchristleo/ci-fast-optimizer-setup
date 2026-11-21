import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { count, create, list } from "../../src/domains/generated/leads/service.ts";
import { resetStore } from "../../src/lib/store.ts";
import { send, useTestApp } from "../support/app.ts";
import { params } from "../support/property.ts";

const app = useTestApp();
const valid = { name: "n1", note: "hello", priceCents: 250 };

describe("leads", () => {
  test("creates a row", async () => {
    const res = await app.request("/leads", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("leads_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/leads", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/leads");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/leads", send("POST", valid));
    const res = await app.request("/leads");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad note", async () => {
    const res = await app.request("/leads", send("POST", { ...valid, note: 42 }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad priceCents", async () => {
    const res = await app.request("/leads", send("POST", { ...valid, priceCents: -5 }));
    expect(res.status).toBe(400);
  });

  test("deletes a row", async () => {
    await app.request("/leads", send("POST", valid));
    const res = await app.request("/leads/leads_1", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect((await app.request("/leads")).status).toBe(200);
    expect((await (await app.request("/leads")).json()).length).toBe(0);
  });

  test("404s when deleting an unknown row", async () => {
    const res = await app.request("/leads/leads_99", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  test("handles 85 rows", async () => {
    for (let k = 0; k < 85; k++)
      await app.request("/leads", send("POST", { ...valid, name: `n${k}` }));
    const rows = await (await app.request("/leads")).json();
    expect(rows.length).toBe(85);
  });

  test("creates variant 1", async () => {
    const res = await app.request("/leads", send("POST", { ...valid, name: "v1" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 2", async () => {
    const res = await app.request("/leads", send("POST", { ...valid, name: "v2" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 3", async () => {
    const res = await app.request("/leads", send("POST", { ...valid, name: "v3" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 4", async () => {
    const res = await app.request("/leads", send("POST", { ...valid, name: "v4" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 5", async () => {
    const res = await app.request("/leads", send("POST", { ...valid, name: "v5" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 6", async () => {
    const res = await app.request("/leads", send("POST", { ...valid, name: "v6" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 7", async () => {
    const res = await app.request("/leads", send("POST", { ...valid, name: "v7" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 8", async () => {
    const res = await app.request("/leads", send("POST", { ...valid, name: "v8" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 9", async () => {
    const res = await app.request("/leads", send("POST", { ...valid, name: "v9" }));
    expect(res.status).toBe(201);
  });

  test("property: rows round-trip through the service", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 40 }),
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
      params(1),
    );
  });

  test("service round trip example", () => {
    create(valid);
    expect(list()).toEqual([{ ...valid, id: "leads_1" }]);
  });

  test("property: valid bodies round-trip over HTTP", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 40 }),
          note: fc.string({ maxLength: 60 }),
          priceCents: fc.nat(100000),
        }),
        async (body) => {
          resetStore();
          const res = await app.request("/leads", send("POST", body));
          expect(res.status).toBe(201);
          expect(await res.json()).toEqual({ ...body, id: "leads_1" });
          expect((await (await app.request("/leads")).json()).length).toBe(1);
        },
      ),
      params(1),
    );
  });

  test("HTTP round trip example", async () => {
    const res = await app.request("/leads", send("POST", valid));
    expect(await res.json()).toEqual({ ...valid, id: "leads_1" });
  });
});
