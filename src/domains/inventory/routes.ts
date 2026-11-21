import { Hono } from "hono";
import type { Validator } from "../../lib/validation.ts";
import {
  addItem,
  adjustStock,
  describeItem,
  getItem,
  listItems,
  lowStock,
  removeItem,
} from "./service.ts";

export const name = "inventory";

export function routes(validate: Validator): Hono {
  const app = new Hono();

  app.get("/", (c) => c.json(listItems()));
  app.get("/low-stock", (c) => c.json(lowStock(Number(c.req.query("threshold") ?? 5))));
  app.get("/:id", (c) => {
    const item = getItem(c.req.param("id"));
    return item
      ? c.json({ ...item, label: describeItem(item) })
      : c.json({ error: "not found" }, 404);
  });
  app.post("/", async (c) => {
    const result = validate(await c.req.json().catch(() => null));
    if (!result.ok) return c.json({ errors: result.errors }, 400);
    return c.json(addItem(result.value as Parameters<typeof addItem>[0]), 201);
  });
  app.post("/:id/adjust", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { delta?: unknown };
    if (typeof body.delta !== "number") return c.json({ errors: ["delta must be a number"] }, 400);
    try {
      const item = adjustStock(c.req.param("id"), body.delta);
      return item ? c.json(item) : c.json({ error: "not found" }, 404);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 409);
    }
  });
  app.delete("/:id", (c) =>
    removeItem(c.req.param("id")) ? c.body(null, 204) : c.json({ error: "not found" }, 404),
  );
  return app;
}
