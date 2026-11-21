import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { domains } from "./domains/index.ts";
import { insert } from "./lib/store.ts";
import { compile, type Schema } from "./lib/validation.ts";

const WARMUP_ROUNDS = 20000;
const SEED_ROWS = 50;

let builds = 0;

export function appBuilds(): number {
  return builds;
}

function sample(schema: Schema, round: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(schema)) {
    if (field.type === "number") out[key] = round % 7;
    else if (field.type === "boolean") out[key] = round % 2 === 0;
    else out[key] = field.pattern ? "AB123" : `v${round}`;
  }
  return out;
}

// Registers every domain router, compiles and warms every validator, seeds the store.
export function createApp(): Hono {
  const app = new Hono();
  for (const domain of domains) {
    app.route(`/${domain.name}`, domain.routes());
    const validate = compile(domain.schema);
    for (let round = 0; round < WARMUP_ROUNDS; round++) validate(sample(domain.schema, round));
    for (let row = 0; row < SEED_ROWS; row++) insert(domain.name, sample(domain.schema, row));
  }
  builds++;
  const dir = process.env.APP_BUILDS_DIR;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${process.pid}.txt`), String(builds));
  }
  return app;
}
