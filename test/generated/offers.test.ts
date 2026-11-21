import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { count, create, list } from "../../src/domains/generated/offers/service.ts";
import { create as createOther } from "../../src/domains/generated/depots/service.ts";
import { resetStore } from "../../src/lib/store.ts";
import { send, useTestApp } from "../support/app.ts";
import { params } from "../support/property.ts";

const app = useTestApp();
const valid = { name: "n1", code: "AB123" };

describe("offers", () => {
  test("creates a row", async () => {
    const res = await app.request("/offers", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("offers_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/offers", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/offers");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/offers", send("POST", valid));
    const res = await app.request("/offers");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad code", async () => {
    const res = await app.request("/offers", send("POST", { ...valid, code: "bad" }));
    expect(res.status).toBe(400);
  });

  test("reports empty stats", async () => {
    const res = await app.request("/offers/stats");
    expect((await res.json()).count).toBe(0);
  });

  test("reports stats after a create", async () => {
    await app.request("/offers", send("POST", valid));
    const body = await (await app.request("/offers/stats")).json();
    expect(body.count).toBe(1);
  });

  test("counts rows in depots", async () => {
    createOther({ name: "o1" });
    createOther({ name: "o2" });
    await app.request("/offers", send("POST", valid));
    expect(await (await app.request("/offers/linked")).json()).toEqual({ own: 1, other: 2 });
  });

  test("handles 166 rows", async () => {
    for (let k = 0; k < 166; k++)
      await app.request("/offers", send("POST", { ...valid, name: `n${k}` }));
    const rows = await (await app.request("/offers")).json();
    expect(rows.length).toBe(166);
  });

  test("creates variant 1", async () => {
    const res = await app.request("/offers", send("POST", { ...valid, name: "v1" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 2", async () => {
    const res = await app.request("/offers", send("POST", { ...valid, name: "v2" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 3", async () => {
    const res = await app.request("/offers", send("POST", { ...valid, name: "v3" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 4", async () => {
    const res = await app.request("/offers", send("POST", { ...valid, name: "v4" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 5", async () => {
    const res = await app.request("/offers", send("POST", { ...valid, name: "v5" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 6", async () => {
    const res = await app.request("/offers", send("POST", { ...valid, name: "v6" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 7", async () => {
    const res = await app.request("/offers", send("POST", { ...valid, name: "v7" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 8", async () => {
    const res = await app.request("/offers", send("POST", { ...valid, name: "v8" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 9", async () => {
    const res = await app.request("/offers", send("POST", { ...valid, name: "v9" }));
    expect(res.status).toBe(201);
  });

  test("property: rows round-trip through the service", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 40 }),
            code: fc.stringMatching(/^[A-Z]{2}[0-9]{3}$/),
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
    expect(list()).toEqual([{ ...valid, id: "offers_1" }]);
  });

  test("property: valid bodies round-trip over HTTP", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 40 }),
          code: fc.stringMatching(/^[A-Z]{2}[0-9]{3}$/),
        }),
        async (body) => {
          resetStore();
          const res = await app.request("/offers", send("POST", body));
          expect(res.status).toBe(201);
          expect(await res.json()).toEqual({ ...body, id: "offers_1" });
          expect((await (await app.request("/offers")).json()).length).toBe(1);
        },
      ),
      params(3),
    );
  });

  test("HTTP round trip example", async () => {
    const res = await app.request("/offers", send("POST", valid));
    expect(await res.json()).toEqual({ ...valid, id: "offers_1" });
  });
});
