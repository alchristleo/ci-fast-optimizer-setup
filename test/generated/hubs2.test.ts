import { describe, expect, test } from "bun:test";
import { create as createOther } from "../../src/domains/generated/discounts/service.ts";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const valid = { name: "n1", qty: 3 };

describe("hubs2", () => {
  test("creates a row", async () => {
    const res = await app.request("/hubs2", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("hubs2_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/hubs2", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/hubs2");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/hubs2", send("POST", valid));
    const res = await app.request("/hubs2");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad qty", async () => {
    const res = await app.request("/hubs2", send("POST", { ...valid, qty: -1 }));
    expect(res.status).toBe(400);
  });

  test("gets a row", async () => {
    await app.request("/hubs2", send("POST", valid));
    const res = await app.request("/hubs2/hubs2_1");
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("n1");
  });

  test("404s on an unknown row", async () => {
    const res = await app.request("/hubs2/hubs2_99");
    expect(res.status).toBe(404);
  });

  test("deletes a row", async () => {
    await app.request("/hubs2", send("POST", valid));
    const res = await app.request("/hubs2/hubs2_1", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect((await app.request("/hubs2")).status).toBe(200);
    expect((await (await app.request("/hubs2")).json()).length).toBe(0);
  });

  test("404s when deleting an unknown row", async () => {
    const res = await app.request("/hubs2/hubs2_99", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  test("counts rows in discounts", async () => {
    createOther({ name: "o1" });
    createOther({ name: "o2" });
    await app.request("/hubs2", send("POST", valid));
    expect(await (await app.request("/hubs2/linked")).json()).toEqual({ own: 1, other: 2 });
  });
});
