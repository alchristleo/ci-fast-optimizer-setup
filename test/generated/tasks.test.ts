import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { count, create, list } from "../../src/domains/generated/tasks/service.ts";
import { create as createOther } from "../../src/domains/generated/plans/service.ts";
import { resetStore } from "../../src/lib/store.ts";
import { send, useTestApp } from "../support/app.ts";
import { params } from "../support/property.ts";

const app = useTestApp();
const valid = { name: "n1", note: "hello" };

describe("tasks", () => {
  test("creates a row", async () => {
    const res = await app.request("/tasks", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("tasks_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/tasks", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/tasks");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/tasks", send("POST", valid));
    const res = await app.request("/tasks");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad note", async () => {
    const res = await app.request("/tasks", send("POST", { ...valid, note: 42 }));
    expect(res.status).toBe(400);
  });

  test("gets a row", async () => {
    await app.request("/tasks", send("POST", valid));
    const res = await app.request("/tasks/tasks_1");
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("n1");
  });

  test("404s on an unknown row", async () => {
    const res = await app.request("/tasks/tasks_99");
    expect(res.status).toBe(404);
  });

  test("deletes a row", async () => {
    await app.request("/tasks", send("POST", valid));
    const res = await app.request("/tasks/tasks_1", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect((await app.request("/tasks")).status).toBe(200);
    expect((await (await app.request("/tasks")).json()).length).toBe(0);
  });

  test("404s when deleting an unknown row", async () => {
    const res = await app.request("/tasks/tasks_99", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  test("counts rows in plans", async () => {
    createOther({ name: "o1" });
    createOther({ name: "o2" });
    await app.request("/tasks", send("POST", valid));
    expect(await (await app.request("/tasks/linked")).json()).toEqual({ own: 1, other: 2 });
  });

  test("handles 80 rows", async () => {
    for (let k = 0; k < 80; k++)
      await app.request("/tasks", send("POST", { ...valid, name: `n${k}` }));
    const rows = await (await app.request("/tasks")).json();
    expect(rows.length).toBe(80);
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
    expect(list()).toEqual([{ ...valid, id: "tasks_1" }]);
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
          const res = await app.request("/tasks", send("POST", body));
          expect(res.status).toBe(201);
          expect(await res.json()).toEqual({ ...body, id: "tasks_1" });
          expect((await (await app.request("/tasks")).json()).length).toBe(1);
        },
      ),
      params(2),
    );
  });

  test("HTTP round trip example", async () => {
    const res = await app.request("/tasks", send("POST", valid));
    expect(await res.json()).toEqual({ ...valid, id: "tasks_1" });
  });
});
