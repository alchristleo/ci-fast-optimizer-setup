import { describe, expect, test } from "bun:test";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const valid = { name: "n1", active: true, code: "AB123", priceCents: 250 };

describe("manifests2", () => {
  test("creates a row", async () => {
    const res = await app.request("/manifests2", send("POST", valid));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("manifests2_1");
  });

  test("rejects a missing name", async () => {
    const res = await app.request("/manifests2", send("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain("name is required");
  });

  test("lists nothing at first", async () => {
    const res = await app.request("/manifests2");
    expect(await res.json()).toEqual([]);
  });

  test.each([1, 2, 3])("lists %i rows", async (n) => {
    for (let k = 0; k < n; k++) await app.request("/manifests2", send("POST", valid));
    const res = await app.request("/manifests2");
    expect((await res.json()).length).toBe(n);
  });

  test("rejects a bad active", async () => {
    const res = await app.request("/manifests2", send("POST", { ...valid, active: "yes" }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad code", async () => {
    const res = await app.request("/manifests2", send("POST", { ...valid, code: "bad" }));
    expect(res.status).toBe(400);
  });

  test("rejects a bad priceCents", async () => {
    const res = await app.request("/manifests2", send("POST", { ...valid, priceCents: -5 }));
    expect(res.status).toBe(400);
  });

  test("updates a row", async () => {
    await app.request("/manifests2", send("POST", valid));
    const res = await app.request("/manifests2/manifests2_1", send("PATCH", { name: "renamed" }));
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("renamed");
  });
});
