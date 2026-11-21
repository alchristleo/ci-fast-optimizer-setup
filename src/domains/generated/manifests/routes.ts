import { Hono } from "hono";
import type { Validator } from "../../../lib/validation.ts";
import { create, list, stats } from "./service.ts";

export const name = "manifests";

export function routes(validate: Validator): Hono {
  const app = new Hono();

  app.get("/", (c) => c.json(list()));
  app.get("/stats", (c) => c.json(stats()));
  app.post("/", async (c) => {
    const result = validate(await c.req.json().catch(() => null));
    if (!result.ok) return c.json({ errors: result.errors }, 400);
    return c.json(create(result.value), 201);
  });
  return app;
}
