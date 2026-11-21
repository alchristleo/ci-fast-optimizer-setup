import { describe, expect, test } from "bun:test";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const valid = { name: "n1", active: true };

describe("quotes", () => {
  test("creates a row", async () => {
    const res = await app.request("/quotes", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("quotes_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/quotes", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/quotes");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/quotes", send("POST", valid));
    const res = await app.request("/quotes");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad active", async () => {
    const res = await app.request("/quotes", send("POST", { ...valid, active: "yes" }));
    expect(res.status).toBe(400);
  });

  test("handles 91 rows", async () => {
    for (let k = 0; k < 91; k++)
      await app.request("/quotes", send("POST", { ...valid, name: `n${k}` }));
    const rows = await (await app.request("/quotes")).json();
    expect(rows.length).toBe(91);
  });

  test("creates variant 1", async () => {
    const res = await app.request("/quotes", send("POST", { ...valid, name: "v1" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 2", async () => {
    const res = await app.request("/quotes", send("POST", { ...valid, name: "v2" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 3", async () => {
    const res = await app.request("/quotes", send("POST", { ...valid, name: "v3" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 4", async () => {
    const res = await app.request("/quotes", send("POST", { ...valid, name: "v4" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 5", async () => {
    const res = await app.request("/quotes", send("POST", { ...valid, name: "v5" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 6", async () => {
    const res = await app.request("/quotes", send("POST", { ...valid, name: "v6" }));
    expect(res.status).toBe(201);
  });

  test("creates variant 7", async () => {
    const res = await app.request("/quotes", send("POST", { ...valid, name: "v7" }));
    expect(res.status).toBe(201);
  });
});
