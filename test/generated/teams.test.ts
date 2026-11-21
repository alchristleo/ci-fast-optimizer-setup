import { describe, expect, test } from "bun:test";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const valid = { name: "n1", qty: 3, code: "AB123" };

describe("teams", () => {
  test("creates a row", async () => {
    const res = await app.request("/teams", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("teams_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/teams", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/teams");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/teams", send("POST", valid));
    const res = await app.request("/teams");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad qty", async () => {
    const res = await app.request("/teams", send("POST", { ...valid, qty: -1 }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad code", async () => {
    const res = await app.request("/teams", send("POST", { ...valid, code: "bad" }));
    expect(res.status).toBe(400);
  });

  test("gets a row", async () => {
    await app.request("/teams", send("POST", valid));
    const res = await app.request("/teams/teams_1");
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("n1");
  });

  test("404s on an unknown row", async () => {
    const res = await app.request("/teams/teams_99");
    expect(res.status).toBe(404);
  });

  test("handles 349 rows", async () => {
    for (let k = 0; k < 349; k++)
      await app.request("/teams", send("POST", { ...valid, name: `n${k}` }));
    const rows = await (await app.request("/teams")).json();
    expect(rows.length).toBe(349);
  });

  test("creates variant 1", async () => {
    const res = await app.request("/teams", send("POST", { ...valid, name: "v1" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 2", async () => {
    const res = await app.request("/teams", send("POST", { ...valid, name: "v2" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 3", async () => {
    const res = await app.request("/teams", send("POST", { ...valid, name: "v3" }));
    expect(res.status).toBe(201);
  });
});
