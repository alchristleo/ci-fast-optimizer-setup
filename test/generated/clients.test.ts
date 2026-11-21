import { describe, expect, test } from "bun:test";
import { create as createOther } from "../../src/domains/generated/bundles/service.ts";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const valid = { name: "n1", code: "AB123" };

describe("clients", () => {
  test("creates a row", async () => {
    const res = await app.request("/clients", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("clients_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/clients", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/clients");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/clients", send("POST", valid));
    const res = await app.request("/clients");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad code", async () => {
    const res = await app.request("/clients", send("POST", { ...valid, code: "bad" }));
    expect(res.status).toBe(400);
  });

  test("gets a row", async () => {
    await app.request("/clients", send("POST", valid));
    const res = await app.request("/clients/clients_1");
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("n1");
  });

  test("404s on an unknown row", async () => {
    const res = await app.request("/clients/clients_99");
    expect(res.status).toBe(404);
  });

  test("updates a row", async () => {
    await app.request("/clients", send("POST", valid));
    const res = await app.request("/clients/clients_1", send("PATCH", { name: "renamed" }));
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("renamed");
  });

  test("rejects a bad update", async () => {
    await app.request("/clients", send("POST", valid));
    const res = await app.request("/clients/clients_1", send("PATCH", { name: 123 }));
    expect(res.status).toBe(400);
  });

  test("404s when updating an unknown row", async () => {
    const res = await app.request("/clients/clients_99", send("PATCH", { name: "x" }));
    expect(res.status).toBe(404);
  });

  test("counts rows in bundles", async () => {
    createOther({ name: "o1" });
    createOther({ name: "o2" });
    await app.request("/clients", send("POST", valid));
    expect(await (await app.request("/clients/linked")).json()).toEqual({ own: 1, other: 2 });
  });

  test("handles 32 rows", async () => {
    for (let k = 0; k < 32; k++)
      await app.request("/clients", send("POST", { ...valid, name: `n${k}` }));
    const rows = await (await app.request("/clients")).json();
    expect(rows.length).toBe(32);
  });

  test("creates variant 1", async () => {
    const res = await app.request("/clients", send("POST", { ...valid, name: "v1" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 2", async () => {
    const res = await app.request("/clients", send("POST", { ...valid, name: "v2" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 3", async () => {
    const res = await app.request("/clients", send("POST", { ...valid, name: "v3" }));
    expect(res.status).toBe(201);
  });
});
