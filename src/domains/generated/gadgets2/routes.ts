import { Hono } from "hono";
import { compile, type Schema } from "../../../lib/validation.ts";
import { create, drop, linked, list, stats } from "./service.ts";

export const name = "gadgets2";

export const schema: Schema = {
  name: { type: "string", required: true, min: 1, max: 80 },
  active: { type: "boolean" },
};

export function routes(): Hono {
  const app = new Hono();
  const validate = compile(schema);

  app.get("/", (c) => c.json(list()));
  app.get("/stats", (c) => c.json(stats()));
  app.get("/linked", (c) => c.json(linked()));
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
