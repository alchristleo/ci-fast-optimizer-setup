import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { count, create, list } from "../../src/domains/generated/badges2/service.ts";
import { resetStore } from "../../src/lib/store.ts";
import { send, useTestApp } from "../support/app.ts";
import { params } from "../support/property.ts";

const app = useTestApp();
const valid = { name: "n1", note: "hello" };

describe("badges2", () => {
  test("creates a row", async () => {
    const res = await app.request("/badges2", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("badges2_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/badges2", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/badges2");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/badges2", send("POST", valid));
    const res = await app.request("/badges2");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad note", async () => {
    const res = await app.request("/badges2", send("POST", { ...valid, note: 42 }));
    expect(res.status).toBe(400);
  });

  test("gets a row", async () => {
    await app.request("/badges2", send("POST", valid));
    const res = await app.request("/badges2/badges2_1");
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("n1");
  });

  test("404s on an unknown row", async () => {
    const res = await app.request("/badges2/badges2_99");
    expect(res.status).toBe(404);
  });

  test("updates a row", async () => {
    await app.request("/badges2", send("POST", valid));
    const res = await app.request("/badges2/badges2_1", send("PATCH", { name: "renamed" }));
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("renamed");
  });

  test("rejects a bad update", async () => {
    await app.request("/badges2", send("POST", valid));
    const res = await app.request("/badges2/badges2_1", send("PATCH", { name: 123 }));
    expect(res.status).toBe(400);
  });

  test("404s when updating an unknown row", async () => {
    const res = await app.request("/badges2/badges2_99", send("PATCH", { name: "x" }));
    expect(res.status).toBe(404);
  });

  test("reports empty stats", async () => {
    const res = await app.request("/badges2/stats");
    expect((await res.json()).count).toBe(0);
  });

  test("reports stats after a create", async () => {
    await app.request("/badges2", send("POST", valid));
    const body = await (await app.request("/badges2/stats")).json();
    expect(body.count).toBe(1);
  });

  test("handles 380 rows", async () => {
    for (let k = 0; k < 380; k++)
      await app.request("/badges2", send("POST", { ...valid, name: `n${k}` }));
    const rows = await (await app.request("/badges2")).json();
    expect(rows.length).toBe(380);
  });

  test("property: rows round-trip through the service", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 40 }),
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
    expect(list()).toEqual([{ ...valid, id: "badges2_1" }]);
  });

  test("property: valid bodies round-trip over HTTP", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 40 }),
          note: fc.string({ maxLength: 60 }),
        }),
        async (body) => {
          resetStore();
          const res = await app.request("/badges2", send("POST", body));
          expect(res.status).toBe(201);
          expect(await res.json()).toEqual({ ...body, id: "badges2_1" });
          expect((await (await app.request("/badges2")).json()).length).toBe(1);
        },
      ),
      params(2),
    );
  });

  test("HTTP round trip example", async () => {
    const res = await app.request("/badges2", send("POST", valid));
    expect(await res.json()).toEqual({ ...valid, id: "badges2_1" });
  });
});
