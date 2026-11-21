import { Hono } from "hono";
import { compile, type Schema } from "../../../lib/validation.ts";
import { create, list } from "./service.ts";

export const name = "quotes";

export const schema: Schema = {
  name: { type: "string", required: true, min: 1, max: 80 },
  active: { type: "boolean" },
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
  return app;
}
