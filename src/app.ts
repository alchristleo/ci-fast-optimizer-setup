import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv } from "ajv";
import { Hono } from "hono";
import { domains } from "./domains/index.ts";
import { insert } from "./lib/store.ts";

const fixturesDir = fileURLToPath(new URL("../fixtures", import.meta.url));

let builds = 0;

export function appBuilds(): number {
  return builds;
}

function loadJson(kind: "schema" | "seed", name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, kind, `${name}.json`), "utf8"));
}

// Parsed seed rows, cached per process. Read-only: callers deep-clone before inserting.
const seedCache = new Map<string, readonly Record<string, unknown>[]>();

function seedRows(name: string): readonly Record<string, unknown>[] {
  let rows = seedCache.get(name);
  if (!rows) {
    rows = loadJson("seed", name) as Record<string, unknown>[];
    seedCache.set(name, rows);
  }
  return rows;
}

// Builds the router table, compiles every domain JSON schema with ajv and seeds the store
// with deep clones of the cached fixtures.
export function createApp(): Hono {
  const app = new Hono();
  const ajv = new Ajv();
  for (const domain of domains) {
    app.route(`/${domain.name}`, domain.routes());
    const validate = ajv.compile(loadJson("schema", domain.name) as object);
    for (const row of seedRows(domain.name)) {
      const copy = structuredClone(row);
      if (!validate(copy)) throw new Error(`bad seed fixture for ${domain.name}`);
      insert(domain.name, copy);
    }
  }
  builds++;
  const dir = process.env.APP_BUILDS_DIR;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${process.pid}.txt`), String(builds));
  }
  return app;
}
