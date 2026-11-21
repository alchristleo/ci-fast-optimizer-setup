import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { count, create, list } from "../../src/domains/generated/channels2/service.ts";
import { resetStore } from "../../src/lib/store.ts";
import { send, useTestApp } from "../support/app.ts";
import { params } from "../support/property.ts";

const app = useTestApp();
const valid = { name: "n1", priceCents: 250, active: true };

describe("channels2", () => {
  test("creates a row", async () => {
    const res = await app.request("/channels2", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("channels2_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/channels2", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/channels2");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/channels2", send("POST", valid));
    const res = await app.request("/channels2");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad priceCents", async () => {
    const res = await app.request("/channels2", send("POST", { ...valid, priceCents: -5 }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad active", async () => {
    const res = await app.request("/channels2", send("POST", { ...valid, active: "yes" }));
    expect(res.status).toBe(400);
  });

  test("property: rows round-trip through the service", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 40 }),
            priceCents: fc.nat(100000),
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
      params(2),
    );
  });

  test("service round trip example", () => {
    create(valid);
    expect(list()).toEqual([{ ...valid, id: "channels2_1" }]);
  });

  test("property: valid bodies round-trip over HTTP", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 40 }),
          priceCents: fc.nat(100000),
          active: fc.boolean(),
        }),
        async (body) => {
          resetStore();
          const res = await app.request("/channels2", send("POST", body));
          expect(res.status).toBe(201);
          expect(await res.json()).toEqual({ ...body, id: "channels2_1" });
          expect((await (await app.request("/channels2")).json()).length).toBe(1);
        },
      ),
      params(2),
    );
  });

  test("HTTP round trip example", async () => {
    const res = await app.request("/channels2", send("POST", valid));
    expect(await res.json()).toEqual({ ...valid, id: "channels2_1" });
  });
});
