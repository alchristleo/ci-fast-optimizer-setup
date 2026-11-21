import { describe, expect, test } from "bun:test";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const valid = { name: "n1", qty: 3, note: "hello" };

describe("grants", () => {
  test("creates a row", async () => {
    const res = await app.request("/grants", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("grants_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/grants", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/grants");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/grants", send("POST", valid));
    const res = await app.request("/grants");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad qty", async () => {
    const res = await app.request("/grants", send("POST", { ...valid, qty: -1 }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad note", async () => {
    const res = await app.request("/grants", send("POST", { ...valid, note: 42 }));
    expect(res.status).toBe(400);
  });

  test("gets a row", async () => {
    await app.request("/grants", send("POST", valid));
    const res = await app.request("/grants/grants_1");
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("n1");
  });

  test("404s on an unknown row", async () => {
    const res = await app.request("/grants/grants_99");
    expect(res.status).toBe(404);
  });

  test("deletes a row", async () => {
    await app.request("/grants", send("POST", valid));
    const res = await app.request("/grants/grants_1", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect((await app.request("/grants")).status).toBe(200);
    expect((await (await app.request("/grants")).json()).length).toBe(0);
  });

  test("404s when deleting an unknown row", async () => {
    const res = await app.request("/grants/grants_99", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  test("reports empty stats", async () => {
    const res = await app.request("/grants/stats");
    expect((await res.json()).count).toBe(0);
  });

  test("reports stats after a create", async () => {
    await app.request("/grants", send("POST", valid));
    const body = await (await app.request("/grants/stats")).json();
    expect(body.count).toBe(1);
  });

  test("handles 147 rows", async () => {
    for (let k = 0; k < 147; k++)
      await app.request("/grants", send("POST", { ...valid, name: `n${k}` }));
    const rows = await (await app.request("/grants")).json();
    expect(rows.length).toBe(147);
  });

  test("creates variant 1", async () => {
    const res = await app.request("/grants", send("POST", { ...valid, name: "v1" }));
    expect(res.status).toBe(201);
  });
});
