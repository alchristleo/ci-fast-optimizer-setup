import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { count, create, list } from "../../src/domains/generated/devices/service.ts";
import { create as createOther } from "../../src/domains/generated/brands/service.ts";
import { resetStore } from "../../src/lib/store.ts";
import { send, useTestApp } from "../support/app.ts";
import { params } from "../support/property.ts";

const app = useTestApp();
const valid = { name: "n1", qty: 3, active: true };

describe("devices", () => {
  test("creates a row", async () => {
    const res = await app.request("/devices", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("devices_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/devices", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/devices");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/devices", send("POST", valid));
    const res = await app.request("/devices");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad qty", async () => {
    const res = await app.request("/devices", send("POST", { ...valid, qty: -1 }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad active", async () => {
    const res = await app.request("/devices", send("POST", { ...valid, active: "yes" }));
    expect(res.status).toBe(400);
  });

  test("gets a row", async () => {
    await app.request("/devices", send("POST", valid));
    const res = await app.request("/devices/devices_1");
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("n1");
  });

  test("404s on an unknown row", async () => {
    const res = await app.request("/devices/devices_99");
    expect(res.status).toBe(404);
  });

  test("counts rows in brands", async () => {
    createOther({ name: "o1" });
    createOther({ name: "o2" });
    await app.request("/devices", send("POST", valid));
    expect(await (await app.request("/devices/linked")).json()).toEqual({ own: 1, other: 2 });
  });

  test("handles 94 rows", async () => {
    for (let k = 0; k < 94; k++)
      await app.request("/devices", send("POST", { ...valid, name: `n${k}` }));
    const rows = await (await app.request("/devices")).json();
    expect(rows.length).toBe(94);
  });

  test("creates variant 1", async () => {
    const res = await app.request("/devices", send("POST", { ...valid, name: "v1" }));
    expect(res.status).toBe(201);
  });

  test("property: rows round-trip through the service", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 40 }),
            qty: fc.nat(10000),
            active: fc.boolean(),
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
    expect(list()).toEqual([{ ...valid, id: "devices_1" }]);
  });

  test("property: valid bodies round-trip over HTTP", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 40 }),
          qty: fc.nat(10000),
          active: fc.boolean(),
        }),
        async (body) => {
          resetStore();
          const res = await app.request("/devices", send("POST", body));
          expect(res.status).toBe(201);
          expect(await res.json()).toEqual({ ...body, id: "devices_1" });
          expect((await (await app.request("/devices")).json()).length).toBe(1);
        },
      ),
      params(1),
    );
  });

  test("HTTP round trip example", async () => {
    const res = await app.request("/devices", send("POST", valid));
    expect(await res.json()).toEqual({ ...valid, id: "devices_1" });
  });
});
