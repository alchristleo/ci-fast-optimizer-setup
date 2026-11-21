import { Hono } from "hono";
import { compile, type Schema } from "../../../lib/validation.ts";
import { create, drop, list, stats } from "./service.ts";

export const name = "ledgers2";

export const schema: Schema = {
  name: { type: "string", required: true, min: 1, max: 80 },
  priceCents: { type: "number", min: 0 },
  active: { type: "boolean" },
  note: { type: "string", max: 200 },
};

export function routes(): Hono {
  const app = new Hono();
  const validate = compile(schema);

  app.get("/", (c) => c.json(list()));
  app.get("/stats", (c) => c.json(stats()));
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
