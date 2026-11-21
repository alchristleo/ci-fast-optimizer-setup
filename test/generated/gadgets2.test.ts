import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { count, create, list } from "../../src/domains/generated/gadgets2/service.ts";
import { create as createOther } from "../../src/domains/generated/teams/service.ts";
import { resetStore } from "../../src/lib/store.ts";
import { send, useTestApp } from "../support/app.ts";
import { params } from "../support/property.ts";

const app = useTestApp();
const valid = { name: "n1", active: true };

describe("gadgets2", () => {
  test("creates a row", async () => {
    const res = await app.request("/gadgets2", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("gadgets2_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/gadgets2", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/gadgets2");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/gadgets2", send("POST", valid));
    const res = await app.request("/gadgets2");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad active", async () => {
    const res = await app.request("/gadgets2", send("POST", { ...valid, active: "yes" }));
    expect(res.status).toBe(400);
  });

  test("deletes a row", async () => {
    await app.request("/gadgets2", send("POST", valid));
    const res = await app.request("/gadgets2/gadgets2_1", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect((await app.request("/gadgets2")).status).toBe(200);
    expect((await (await app.request("/gadgets2")).json()).length).toBe(0);
  });

  test("404s when deleting an unknown row", async () => {
    const res = await app.request("/gadgets2/gadgets2_99", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  test("reports empty stats", async () => {
    const res = await app.request("/gadgets2/stats");
    expect((await res.json()).count).toBe(0);
  });

  test("reports stats after a create", async () => {
    await app.request("/gadgets2", send("POST", valid));
    const body = await (await app.request("/gadgets2/stats")).json();
    expect(body.count).toBe(1);
    expect(body.active).toBe(1);
  });

  test("counts rows in teams", async () => {
    createOther({ name: "o1" });
    createOther({ name: "o2" });
    await app.request("/gadgets2", send("POST", valid));
    expect(await (await app.request("/gadgets2/linked")).json()).toEqual({ own: 1, other: 2 });
  });

  test("handles 301 rows", async () => {
    for (let k = 0; k < 301; k++)
      await app.request("/gadgets2", send("POST", { ...valid, name: `n${k}` }));
    const rows = await (await app.request("/gadgets2")).json();
    expect(rows.length).toBe(301);
  });

  test("creates variant 1", async () => {
    const res = await app.request("/gadgets2", send("POST", { ...valid, name: "v1" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 2", async () => {
    const res = await app.request("/gadgets2", send("POST", { ...valid, name: "v2" }));
    expect(res.status).toBe(201);
  });

  test("property: rows round-trip through the service", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ name: fc.string({ minLength: 1, maxLength: 40 }), active: fc.boolean() }),
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
    expect(list()).toEqual([{ ...valid, id: "gadgets2_1" }]);
  });

  test("property: valid bodies round-trip over HTTP", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({ name: fc.string({ minLength: 1, maxLength: 40 }), active: fc.boolean() }),
        async (body) => {
          resetStore();
          const res = await app.request("/gadgets2", send("POST", body));
          expect(res.status).toBe(201);
          expect(await res.json()).toEqual({ ...body, id: "gadgets2_1" });
          expect((await (await app.request("/gadgets2")).json()).length).toBe(1);
        },
      ),
      params(1),
    );
  });

  test("HTTP round trip example", async () => {
    const res = await app.request("/gadgets2", send("POST", valid));
    expect(await res.json()).toEqual({ ...valid, id: "gadgets2_1" });
  });
});
