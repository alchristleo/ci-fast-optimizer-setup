import { Hono } from "hono";
import { compile, type Schema } from "../../../lib/validation.ts";
import { create, get, linked, list } from "./service.ts";

export const name = "claims2";

export const schema: Schema = {
  name: { type: "string", required: true, min: 1, max: 80 },
  active: { type: "boolean" },
  qty: { type: "number", min: 0, max: 10000 },
  priceCents: { type: "number", min: 0 },
};

export function routes(): Hono {
  const app = new Hono();
  const validate = compile(schema);

  app.get("/", (c) => c.json(list()));
  app.get("/linked", (c) => c.json(linked()));
  app.get("/:id", (c) => {
    const row = get(c.req.param("id"));
    return row ? c.json(row) : c.json({ error: "not found" }, 404);
  });
  app.post("/", async (c) => {
    const result = validate(await c.req.json().catch(() => null));
    if (!result.ok) return c.json({ errors: result.errors }, 400);
    return c.json(create(result.value), 201);
  });
  return app;
}
