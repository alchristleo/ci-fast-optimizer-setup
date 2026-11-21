import { Hono } from "hono";
import { compile, type Schema } from "../../lib/validation.ts";
import { cancelOrder, getOrder, listOrders, placeOrder, revenue } from "./service.ts";

export const name = "orders";

export const schema: Schema = {
  customerId: { type: "string", required: true },
  itemId: { type: "string", required: true },
  quantity: { type: "number", required: true, min: 1, max: 1000 },
};

export function routes(): Hono {
  const app = new Hono();
  const validate = compile(schema);

  app.get("/", (c) => c.json(listOrders()));
  app.get("/revenue", (c) => c.json({ revenueCents: revenue() }));
  app.get("/:id", (c) => {
    const order = getOrder(c.req.param("id"));
    return order ? c.json(order) : c.json({ error: "not found" }, 404);
  });
  app.post("/", async (c) => {
    const result = validate(await c.req.json().catch(() => null));
    if (!result.ok) return c.json({ errors: result.errors }, 400);
    try {
      return c.json(placeOrder(result.value as Parameters<typeof placeOrder>[0]), 201);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 422);
    }
  });
  app.post("/:id/cancel", (c) => {
    try {
      const order = cancelOrder(c.req.param("id"));
      return order ? c.json(order) : c.json({ error: "not found" }, 404);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 409);
    }
  });
  return app;
}
