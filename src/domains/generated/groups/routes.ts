import { Hono } from "hono";
import { compile, type Schema } from "../../../lib/validation.ts";
import { change, create, drop, list } from "./service.ts";

export const name = "groups";

export const schema: Schema = {
  name: { type: "string", required: true, min: 1, max: 80 },
  note: { type: "string", max: 200 },
  qty: { type: "number", min: 0, max: 10000 },
  priceCents: { type: "number", min: 0 },
};

export function routes(): Hono {
  const app = new Hono();
  const validate = compile(schema);

  app.get("/", (c) => c.json(list()));
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
