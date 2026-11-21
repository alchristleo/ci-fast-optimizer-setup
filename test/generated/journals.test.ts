import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { count, create, list } from "../../src/domains/generated/journals/service.ts";
import { resetStore } from "../../src/lib/store.ts";
import { send, useTestApp } from "../support/app.ts";
import { params } from "../support/property.ts";

const app = useTestApp();
const valid = { name: "n1", code: "AB123", active: true, priceCents: 250 };

describe("journals", () => {
  test("creates a row", async () => {
    const res = await app.request("/journals", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("journals_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/journals", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/journals");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/journals", send("POST", valid));
    const res = await app.request("/journals");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad code", async () => {
    const res = await app.request("/journals", send("POST", { ...valid, code: "bad" }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad active", async () => {
    const res = await app.request("/journals", send("POST", { ...valid, active: "yes" }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad priceCents", async () => {
    const res = await app.request("/journals", send("POST", { ...valid, priceCents: -5 }));
    expect(res.status).toBe(400);
  });

  test("gets a row", async () => {
    await app.request("/journals", send("POST", valid));
    const res = await app.request("/journals/journals_1");
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("n1");
  });

  test("404s on an unknown row", async () => {
    const res = await app.request("/journals/journals_99");
    expect(res.status).toBe(404);
  });

  test("updates a row", async () => {
    await app.request("/journals", send("POST", valid));
    const res = await app.request("/journals/journals_1", send("PATCH", { name: "renamed" }));
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("renamed");
  });

  test("rejects a bad update", async () => {
    await app.request("/journals", send("POST", valid));
    const res = await app.request("/journals/journals_1", send("PATCH", { name: 123 }));
    expect(res.status).toBe(400);
  });

  test("404s when updating an unknown row", async () => {
    const res = await app.request("/journals/journals_99", send("PATCH", { name: "x" }));
    expect(res.status).toBe(404);
  });

  test("deletes a row", async () => {
    await app.request("/journals", send("POST", valid));
    const res = await app.request("/journals/journals_1", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect((await app.request("/journals")).status).toBe(200);
    expect((await (await app.request("/journals")).json()).length).toBe(0);
  });

  test("404s when deleting an unknown row", async () => {
    const res = await app.request("/journals/journals_99", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  test("reports empty stats", async () => {
    const res = await app.request("/journals/stats");
    expect((await res.json()).count).toBe(0);
  });

  test("reports stats after a create", async () => {
    await app.request("/journals", send("POST", valid));
    const body = await (await app.request("/journals/stats")).json();
    expect(body.count).toBe(1);
    expect(body.active).toBe(1);
  });

  test("handles 385 rows", async () => {
    for (let k = 0; k < 385; k++)
      await app.request("/journals", send("POST", { ...valid, name: `n${k}` }));
    const rows = await (await app.request("/journals")).json();
    expect(rows.length).toBe(385);
  });

  test("creates variant 1", async () => {
    const res = await app.request("/journals", send("POST", { ...valid, name: "v1" }));
    expect(res.status).toBe(201);
  });

  test("property: rows round-trip through the service", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 40 }),
            code: fc.stringMatching(/^[A-Z]{2}[0-9]{3}$/),
            active: fc.boolean(),
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
    expect(list()).toEqual([{ ...valid, id: "journals_1" }]);
  });

  test("property: valid bodies round-trip over HTTP", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 40 }),
          code: fc.stringMatching(/^[A-Z]{2}[0-9]{3}$/),
          active: fc.boolean(),
          priceCents: fc.nat(100000),
        }),
        async (body) => {
          resetStore();
          const res = await app.request("/journals", send("POST", body));
          expect(res.status).toBe(201);
          expect(await res.json()).toEqual({ ...body, id: "journals_1" });
          expect((await (await app.request("/journals")).json()).length).toBe(1);
        },
      ),
      params(2),
    );
  });

  test("HTTP round trip example", async () => {
    const res = await app.request("/journals", send("POST", valid));
    expect(await res.json()).toEqual({ ...valid, id: "journals_1" });
  });
});
