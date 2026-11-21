import { describe, expect, test } from "bun:test";
import "../../src/domains/customers/service.ts";
import { send, useTestApp } from "../support/app.ts";

const app = useTestApp();
const ann = { name: "Ann", email: "Ann@Example.com" };

describe("customers", () => {
  test("creates a customer with a lowercase email", async () => {
    const res = await app.request("/customers", send("POST", ann));
    expect(res.status).toBe(201);
    expect((await res.json()).email).toBe("ann@example.com");
  });
  test("rejects a bad email", async () => {
    const res = await app.request("/customers", send("POST", { name: "Bo", email: "nope" }));
    expect(res.status).toBe(400);
  });
  test("rejects a duplicate email", async () => {
    await app.request("/customers", send("POST", ann));
    const res = await app.request("/customers", send("POST", ann));
    expect(res.status).toBe(409);
  });
  test("finds by email", async () => {
    await app.request("/customers", send("POST", ann));
    const res = await app.request("/customers?email=ann@example.com");
    expect((await res.json()).length).toBe(1);
  });
  test("marks a customer as vip", async () => {
    await app.request("/customers", send("POST", ann));
    const res = await app.request("/customers/customers_1/vip", send("POST", {}));
    expect((await res.json()).vip).toBe(true);
    expect((await app.request("/customers/nope/vip", send("POST", {}))).status).toBe(404);
  });
});
