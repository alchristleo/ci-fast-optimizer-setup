import { Hono } from "hono";
import type { Validator } from "../../../lib/validation.ts";
import { change, create, drop, list, stats } from "./service.ts";

export const name = "drivers";

export function routes(validate: Validator): Hono {
  const app = new Hono();

  app.get("/", (c) => c.json(list()));
  app.get("/stats", (c) => c.json(stats()));
  app.post("/", async (c) => {
    const result = validate(await c.req.json().catch(() => null));
    if (!result.ok) return c.json({ errors: result.errors }, 400);
    return c.json(create(result.value), 201);
  });
  app.patch("/:id", async (c) => {
    const result = validate(await c.req.json().catch(() => null), true);
    if (!result.ok) return c.json({ errors: result.errors }, 400);
    const row = change(c.req.param("id"), result.value);
    return row ? c.json(row) : c.json({ error: "not found" }, 404);
  });
  app.delete("/:id", (c) =>
    drop(c.req.param("id")) ? c.body(null, 204) : c.json({ error: "not found" }, 404),
  );
  return app;
}
