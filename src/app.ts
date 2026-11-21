import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv } from "ajv";
import { Hono } from "hono";
import { domains } from "./domains/index.ts";
import { compileSchema } from "./lib/schema.ts";

const defaultFixtures = fileURLToPath(new URL("../fixtures", import.meta.url));

let builds = 0;

function loadJson(dir: string, kind: "schema" | "seed", name: string): unknown {
  return JSON.parse(readFileSync(join(dir, kind, `${name}.json`), "utf8"));
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

// Deep-frozen seed rows, validated once and cached per process and fixtures dir.
// They are read-only reference data served by GET /<d>/catalog, never put in the store.
const seedCache = new Map<string, readonly Record<string, unknown>[]>();

// Builds the router table and compiles every domain JSON schema with ajv. The compiled
// validator is the only request-body validator the domain's routes use. Seed rows that fail
// their schema make boot throw.
export function createApp(fixturesDir: string = defaultFixtures): Hono {
  const app = new Hono();
  const ajv = new Ajv();
  for (const domain of domains) {
    const validate = compileSchema(ajv, loadJson(fixturesDir, "schema", domain.name) as object);
    const key = `${fixturesDir}\0${domain.name}`;
    let cached = seedCache.get(key);
    if (!cached) {
      const rows = loadJson(fixturesDir, "seed", domain.name) as Record<string, unknown>[];
      for (const row of rows) {
        if (!validate(row).ok) throw new Error(`bad seed fixture for ${domain.name}`);
      }
      cached = deepFreeze(rows);
      seedCache.set(key, cached);
    }
    const seed = cached;
    app.get(`/${domain.name}/catalog`, (c) => c.json(seed));
    app.route(`/${domain.name}`, domain.routes(validate));
  }
  builds++;
  const dir = process.env.APP_BUILDS_DIR;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${process.pid}.txt`), String(builds));
  }
  return app;
}
