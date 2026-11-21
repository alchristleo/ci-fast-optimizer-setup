import { Hono } from "hono";
import { compile, type Schema } from "../../../lib/validation.ts";
import { create, drop, list } from "./service.ts";

export const name = "stores";

export const schema: Schema = {
  name: { type: "string", required: true, min: 1, max: 80 },
  code: { type: "string", pattern: "^[A-Z]{2}[0-9]{3}$" },
  qty: { type: "number", min: 0, max: 10000 },
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
  app.delete("/:id", (c) =>
    drop(c.req.param("id")) ? c.body(null, 204) : c.json({ error: "not found" }, 404),
  );
  return app;
}
