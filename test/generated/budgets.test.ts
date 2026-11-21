import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { count, create, list } from "../../src/domains/generated/budgets/service.ts";
import { resetStore } from "../../src/lib/store.ts";
import { send, useTestApp } from "../support/app.ts";
import { params } from "../support/property.ts";

const app = useTestApp();
const valid = { name: "n1", active: true, code: "AB123" };

describe("budgets", () => {
  test("creates a row", async () => {
    const res = await app.request("/budgets", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("budgets_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/budgets", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/budgets");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/budgets", send("POST", valid));
    const res = await app.request("/budgets");
    expect((await res.json()).length).toBe(n);
  });

  test("property: rows round-trip through the service", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 40 }),
            active: fc.boolean(),
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
      params(2),
    );
  });

  test("service round trip example", () => {
    create(valid);
    expect(list()).toEqual([{ ...valid, id: "budgets_1" }]);
  });

  test("property: valid bodies round-trip over HTTP", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 40 }),
          active: fc.boolean(),
          code: fc.stringMatching(/^[A-Z]{2}[0-9]{3}$/),
        }),
        async (body) => {
          resetStore();
          const res = await app.request("/budgets", send("POST", body));
          expect(res.status).toBe(201);
          expect(await res.json()).toEqual({ ...body, id: "budgets_1" });
          expect((await (await app.request("/budgets")).json()).length).toBe(1);
        },
      ),
      params(2),
    );
  });

  test("HTTP round trip example", async () => {
    const res = await app.request("/budgets", send("POST", valid));
    expect(await res.json()).toEqual({ ...valid, id: "budgets_1" });
  });
});
