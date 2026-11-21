import { describe, expect, test } from "bun:test";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const valid = { name: "n1", active: true };

describe("lockers2", () => {
  test("creates a row", async () => {
    const res = await app.request("/lockers2", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("lockers2_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/lockers2", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/lockers2");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/lockers2", send("POST", valid));
    const res = await app.request("/lockers2");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad active", async () => {
    const res = await app.request("/lockers2", send("POST", { ...valid, active: "yes" }));
    expect(res.status).toBe(400);
  });

  test("gets a row", async () => {
    await app.request("/lockers2", send("POST", valid));
    const res = await app.request("/lockers2/lockers2_1");
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("n1");
  });

  test("404s on an unknown row", async () => {
    const res = await app.request("/lockers2/lockers2_99");
    expect(res.status).toBe(404);
  });

  test("updates a row", async () => {
    await app.request("/lockers2", send("POST", valid));
    const res = await app.request("/lockers2/lockers2_1", send("PATCH", { name: "renamed" }));
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("renamed");
  });

  test("rejects a bad update", async () => {
    await app.request("/lockers2", send("POST", valid));
    const res = await app.request("/lockers2/lockers2_1", send("PATCH", { name: 123 }));
    expect(res.status).toBe(400);
  });

  test("404s when updating an unknown row", async () => {
    const res = await app.request("/lockers2/lockers2_99", send("PATCH", { name: "x" }));
    expect(res.status).toBe(404);
  });
});
