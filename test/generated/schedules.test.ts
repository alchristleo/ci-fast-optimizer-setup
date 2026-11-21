import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { count, create, list } from "../../src/domains/generated/schedules/service.ts";
import { create as createOther } from "../../src/domains/generated/feedback/service.ts";
import { resetStore } from "../../src/lib/store.ts";
import { send, useTestApp } from "../support/app.ts";
import { params } from "../support/property.ts";

const app = useTestApp();
const valid = { name: "n1", qty: 3, note: "hello" };

describe("schedules", () => {
  test("creates a row", async () => {
    const res = await app.request("/schedules", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("schedules_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/schedules", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/schedules");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/schedules", send("POST", valid));
    const res = await app.request("/schedules");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad qty", async () => {
    const res = await app.request("/schedules", send("POST", { ...valid, qty: -1 }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad note", async () => {
    const res = await app.request("/schedules", send("POST", { ...valid, note: 42 }));
    expect(res.status).toBe(400);
  });

  test("deletes a row", async () => {
    await app.request("/schedules", send("POST", valid));
    const res = await app.request("/schedules/schedules_1", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect((await app.request("/schedules")).status).toBe(200);
    expect((await (await app.request("/schedules")).json()).length).toBe(0);
  });

  test("404s when deleting an unknown row", async () => {
    const res = await app.request("/schedules/schedules_99", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  test("counts rows in feedback", async () => {
    createOther({ name: "o1" });
    createOther({ name: "o2" });
    await app.request("/schedules", send("POST", valid));
    expect(await (await app.request("/schedules/linked")).json()).toEqual({ own: 1, other: 2 });
  });

  test("property: rows round-trip through the service", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 40 }),
            qty: fc.nat(10000),
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
      params(2),
    );
  });

  test("service round trip example", () => {
    create(valid);
    expect(list()).toEqual([{ ...valid, id: "schedules_1" }]);
  });

  test("property: valid bodies round-trip over HTTP", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 40 }),
          qty: fc.nat(10000),
          note: fc.string({ maxLength: 60 }),
        }),
        async (body) => {
          resetStore();
          const res = await app.request("/schedules", send("POST", body));
          expect(res.status).toBe(201);
          expect(await res.json()).toEqual({ ...body, id: "schedules_1" });
          expect((await (await app.request("/schedules")).json()).length).toBe(1);
        },
      ),
      params(2),
    );
  });

  test("HTTP round trip example", async () => {
    const res = await app.request("/schedules", send("POST", valid));
    expect(await res.json()).toEqual({ ...valid, id: "schedules_1" });
  });
});
