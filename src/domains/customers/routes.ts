import { Hono } from "hono";
import type { Validator } from "../../lib/validation.ts";
import { addCustomer, findByEmail, getCustomer, listCustomers, setVip } from "./service.ts";

export const name = "customers";

export function routes(validate: Validator): Hono {
  const app = new Hono();

  app.get("/", (c) => {
    const email = c.req.query("email");
    if (email) {
      const hit = findByEmail(email);
      return hit ? c.json([hit]) : c.json([]);
    }
    return c.json(listCustomers());
  });
  app.get("/:id", (c) => {
    const customer = getCustomer(c.req.param("id"));
    return customer ? c.json(customer) : c.json({ error: "not found" }, 404);
  });
  app.post("/", async (c) => {
    const result = validate(await c.req.json().catch(() => null));
    if (!result.ok) return c.json({ errors: result.errors }, 400);
    const value = result.value as Parameters<typeof addCustomer>[0];
    if (findByEmail(value.email)) return c.json({ error: "email taken" }, 409);
    return c.json(addCustomer({ ...value, email: value.email.toLowerCase() }), 201);
  });
  app.post("/:id/vip", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { vip?: unknown };
    const customer = setVip(c.req.param("id"), body.vip !== false);
    return customer ? c.json(customer) : c.json({ error: "not found" }, 404);
  });
  return app;
}
