// Deterministic generator: bun scripts/gen.ts --domains K --seed S
// Writes src/domains/generated/<name>/{service,routes}.ts, test/generated/<name>.test.ts,
// src/domains/index.ts and fixtures/{schema,seed}/<name>.json. Output depends only on K and S.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const NOUNS = [
  "accounts",
  "agents",
  "alerts",
  "assets",
  "badges",
  "banners",
  "batches",
  "bookings",
  "brands",
  "budgets",
  "bundles",
  "campaigns",
  "carriers",
  "carts",
  "catalogs",
  "channels",
  "claims",
  "clients",
  "contracts",
  "coupons",
  "credits",
  "depots",
  "devices",
  "discounts",
  "drivers",
  "events",
  "expenses",
  "feedback",
  "fleets",
  "gadgets",
  "grants",
  "groups",
  "hubs",
  "invoices",
  "journals",
  "labels",
  "leads",
  "ledgers",
  "licenses",
  "lockers",
  "manifests",
  "markets",
  "members",
  "merchants",
  "notices",
  "offers",
  "packages",
  "partners",
  "payments",
  "permits",
  "plans",
  "policies",
  "quotes",
  "rebates",
  "refunds",
  "regions",
  "returns",
  "reviews",
  "routes",
  "schedules",
  "shipments",
  "shops",
  "slots",
  "stores",
  "suppliers",
  "tags",
  "tasks",
  "teams",
  "tickets",
  "tiers",
  "tokens",
  "vendors",
  "vouchers",
  "wallets",
  "warehouses",
  "zones",
];

type FieldDef = {
  key: string;
  decl: string;
  valid: string;
  invalid: string;
};

const FIELD_POOL: FieldDef[] = [
  { key: "qty", decl: `{ type: "number", min: 0, max: 10000 }`, valid: "3", invalid: "-1" },
  { key: "priceCents", decl: `{ type: "number", min: 0 }`, valid: "250", invalid: "-5" },
  { key: "active", decl: `{ type: "boolean" }`, valid: "true", invalid: `"yes"` },
  {
    key: "code",
    decl: `{ type: "string", pattern: "^[A-Z]{2}[0-9]{3}$" }`,
    valid: `"AB123"`,
    invalid: `"bad"`,
  },
  { key: "note", decl: `{ type: "string", max: 200 }`, valid: `"hello"`, invalid: "42" },
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SCHEMA_PROPS = 80;
const SEED_ROWS = 60;
const ROW_PROPS = 10;

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

// JSON schema (many optional props) and seed rows for one domain, seeded per domain name.
function genFixtures(name: string, seed: number): { schema: unknown; seed: unknown[] } {
  const rand = mulberry32(seed ^ hash(name));
  const int = (lo: number, hi: number): number => lo + Math.floor(rand() * (hi - lo + 1));
  const kinds = ["string", "integer", "enum", "boolean", "pattern"] as const;
  const props: Record<string, unknown> = { name: { type: "string", minLength: 1, maxLength: 80 } };
  const make: Record<string, () => unknown> = {};
  for (let p = 0; p < SCHEMA_PROPS; p++) {
    const key = `attr${p}`;
    const kind = kinds[p % kinds.length]!;
    if (kind === "string") {
      props[key] = { type: "string", minLength: 1, maxLength: int(20, 200) };
      make[key] = () => `s${int(0, 9999)}`;
    } else if (kind === "integer") {
      const hi = int(100, 100000);
      props[key] = { type: "integer", minimum: 0, maximum: hi, multipleOf: 1 };
      make[key] = () => int(0, hi);
    } else if (kind === "enum") {
      const values = [0, 1, 2, 3, 4].map((v) => `e${p}_${v}`);
      props[key] = { type: "string", enum: values };
      make[key] = () => values[int(0, 4)]!;
    } else if (kind === "boolean") {
      props[key] = { type: "boolean" };
      make[key] = () => rand() < 0.5;
    } else {
      props[key] = { type: "string", pattern: "^[A-Z]{2}[0-9]{3}$" };
      make[key] = () => `AB${int(100, 999)}`;
    }
  }
  const rows: unknown[] = [];
  for (let r = 0; r < SEED_ROWS; r++) {
    const row: Record<string, unknown> = { name: `${name}-${r}` };
    for (let k = 0; k < ROW_PROPS; k++) {
      const key = `attr${int(0, SCHEMA_PROPS - 1)}`;
      row[key] = make[key]!();
    }
    rows.push(row);
  }
  return {
    schema: { type: "object", required: ["name"], additionalProperties: false, properties: props },
    seed: rows,
  };
}

function parseArgs(argv: string[]): { domains: number; seed: number } {
  const get = (flag: string): number => {
    const i = argv.indexOf(flag);
    const n = i >= 0 ? Number(argv[i + 1]) : NaN;
    if (!Number.isInteger(n) || n < 0)
      throw new Error(`usage: gen.ts --domains K --seed S (bad ${flag})`);
    return n;
  };
  return { domains: get("--domains"), seed: get("--seed") };
}

function domainName(i: number): string {
  const base = NOUNS[i % NOUNS.length]!;
  return i < NOUNS.length ? base : `${base}${Math.floor(i / NOUNS.length) + 1}`;
}

function genDomain(
  i: number,
  rand: () => number,
): { service: string; routes: string; test: string; name: string } {
  const name = domainName(i);
  const int = (lo: number, hi: number): number => lo + Math.floor(rand() * (hi - lo + 1));
  const shuffled = [...FIELD_POOL].sort(() => rand() - 0.5);
  const extra = shuffled.slice(0, int(1, 3));
  const fields = extra.map((f) => f.key);
  const has = (k: string): boolean => fields.includes(k);

  const optional = ["get", "update", "remove", "stats", "linked"].filter(() => rand() < 0.5);
  if (optional.length > 4) optional.length = 4;
  const other = i > 0 && rand() < 0.4 ? domainName(int(0, i - 1)) : null;
  const handlers = new Set(optional);
  if (other) handlers.add("linked");
  else handlers.delete("linked");
  while (handlers.size > 4) handlers.delete([...handlers].pop()!);
  const useLine = has("qty") && has("priceCents");

  // ---- service
  const svcImports = ["all", "insert", "count as total", "type Row"];
  if (handlers.has("get")) svcImports.push("find");
  if (handlers.has("update")) svcImports.push("update as patch");
  if (handlers.has("remove")) svcImports.push("remove");
  const svc: string[] = [];
  svc.push(`import { ${svcImports.sort().join(", ")} } from "../../../lib/store.ts";`);
  if (handlers.has("stats") && useLine)
    svc.push(`import { lineTotal } from "../../../lib/pricing.ts";`);
  if (handlers.has("linked") && other)
    svc.push(`import { count as otherCount } from "../${other}/service.ts";`);
  svc.push("", `const TABLE = "${name}";`, "");
  svc.push(
    `export function create(data: Record<string, unknown>): Row {\n  return insert(TABLE, data);\n}\n`,
  );
  svc.push(`export function list(): Row[] {\n  return all(TABLE);\n}\n`);
  svc.push(`export function count(): number {\n  return total(TABLE);\n}\n`);
  if (handlers.has("get"))
    svc.push(`export function get(id: string): Row | undefined {\n  return find(TABLE, id);\n}\n`);
  if (handlers.has("update"))
    svc.push(
      `export function change(id: string, data: Record<string, unknown>): Row | undefined {\n  return patch(TABLE, id, data);\n}\n`,
    );
  if (handlers.has("remove"))
    svc.push(`export function drop(id: string): boolean {\n  return remove(TABLE, id);\n}\n`);
  if (handlers.has("stats")) {
    if (useLine)
      svc.push(
        `export function stats(): { count: number; valueCents: number } {\n  const rows = all(TABLE);\n  let valueCents = 0;\n  for (const r of rows) valueCents += lineTotal(r.priceCents as number, r.qty as number);\n  return { count: rows.length, valueCents };\n}\n`,
      );
    else if (has("active"))
      svc.push(
        `export function stats(): { count: number; active: number } {\n  const rows = all(TABLE);\n  return { count: rows.length, active: rows.filter((r) => r.active === true).length };\n}\n`,
      );
    else
      svc.push(
        `export function stats(): { count: number } {\n  return { count: total(TABLE) };\n}\n`,
      );
  }
  if (handlers.has("linked"))
    svc.push(
      `export function linked(): { own: number; other: number } {\n  return { own: total(TABLE), other: otherCount() };\n}\n`,
    );
  const service = svc.join("\n").replace(/\n+$/, "\n");

  // ---- routes
  const svcUse = ["create", "list"];
  if (handlers.has("get")) svcUse.push("get");
  if (handlers.has("update")) svcUse.push("change");
  if (handlers.has("remove")) svcUse.push("drop");
  if (handlers.has("stats")) svcUse.push("stats");
  if (handlers.has("linked")) svcUse.push("linked");
  const rt: string[] = [];
  rt.push(
    `import { Hono } from "hono";`,
    `import { compile, type Schema } from "../../../lib/validation.ts";`,
  );
  rt.push(`import { ${svcUse.sort().join(", ")} } from "./service.ts";`, "");
  rt.push(`export const name = "${name}";`, "");
  rt.push(
    `export const schema: Schema = {`,
    `  name: { type: "string", required: true, min: 1, max: 80 },`,
  );
  extra.forEach((f) => rt.push(`  ${f.key}: ${f.decl},`));
  rt.push(`};`, "");
  rt.push(
    `export function routes(): Hono {`,
    `  const app = new Hono();`,
    `  const validate = compile(schema);`,
    "",
  );
  rt.push(`  app.get("/", (c) => c.json(list()));`);
  if (handlers.has("stats")) rt.push(`  app.get("/stats", (c) => c.json(stats()));`);
  if (handlers.has("linked")) rt.push(`  app.get("/linked", (c) => c.json(linked()));`);
  if (handlers.has("get"))
    rt.push(
      `  app.get("/:id", (c) => {`,
      `    const row = get(c.req.param("id"));`,
      `    return row ? c.json(row) : c.json({ error: "not found" }, 404);`,
      `  });`,
    );
  rt.push(
    `  app.post("/", async (c) => {`,
    `    const result = validate(await c.req.json().catch(() => null));`,
    `    if (!result.ok) return c.json({ errors: result.errors }, 400);`,
    `    return c.json(create(result.value), 201);`,
    `  });`,
  );
  if (handlers.has("update"))
    rt.push(
      `  app.patch("/:id", async (c) => {`,
      `    const result = validate(await c.req.json().catch(() => null), true);`,
      `    if (!result.ok) return c.json({ errors: result.errors }, 400);`,
      `    const row = change(c.req.param("id"), result.value);`,
      `    return row ? c.json(row) : c.json({ error: "not found" }, 404);`,
      `  });`,
    );
  if (handlers.has("remove"))
    rt.push(
      `  app.delete("/:id", (c) => (drop(c.req.param("id")) ? c.body(null, 204) : c.json({ error: "not found" }, 404)));`,
    );
  rt.push(`  return app;`, `}`);
  const routes = rt.join("\n") + "\n";

  // ---- tests
  const validObj = `{ name: "n1"${extra.map((f) => `, ${f.key}: ${f.valid}`).join("")} }`;
  const P = `/${name}`;
  const cases: { count: number; code: string }[] = [];
  const add = (title: string, body: string, count = 1): void => {
    cases.push({ count, code: `  test(${title}, async () => {\n${body}\n  });\n` });
  };
  add(
    `"creates a row"`,
    `    const res = await app.request("${P}", send("POST", valid));\n    expect(res.status).toBe(201);\n    expect((await res.json()).id).toBe("${name}_1");`,
  );
  add(
    `"rejects a missing name"`,
    `    const res = await app.request("${P}", send("POST", {}));\n    expect(res.status).toBe(400);\n    expect((await res.json()).errors).toContain("name is required");`,
  );
  add(
    `"lists nothing at first"`,
    `    const res = await app.request("${P}");\n    expect(await res.json()).toEqual([]);`,
  );
  cases.push({
    count: 3,
    code: `  test.each([1, 2, 3])("lists %i rows", async (n) => {\n    for (let k = 0; k < n; k++) await app.request("${P}", send("POST", valid));\n    const res = await app.request("${P}");\n    expect((await res.json()).length).toBe(n);\n  });\n`,
  });
  for (const f of extra)
    add(
      `"rejects a bad ${f.key}"`,
      `    const res = await app.request("${P}", send("POST", { ...valid, ${f.key}: ${f.invalid} }));\n    expect(res.status).toBe(400);`,
    );
  if (handlers.has("get")) {
    add(
      `"gets a row"`,
      `    await app.request("${P}", send("POST", valid));\n    const res = await app.request("${P}/${name}_1");\n    expect(res.status).toBe(200);\n    expect((await res.json()).name).toBe("n1");`,
    );
    add(
      `"404s on an unknown row"`,
      `    const res = await app.request("${P}/${name}_99");\n    expect(res.status).toBe(404);`,
    );
  }
  if (handlers.has("update")) {
    add(
      `"updates a row"`,
      `    await app.request("${P}", send("POST", valid));\n    const res = await app.request("${P}/${name}_1", send("PATCH", { name: "renamed" }));\n    expect(res.status).toBe(200);\n    expect((await res.json()).name).toBe("renamed");`,
    );
    add(
      `"rejects a bad update"`,
      `    await app.request("${P}", send("POST", valid));\n    const res = await app.request("${P}/${name}_1", send("PATCH", { name: 123 }));\n    expect(res.status).toBe(400);`,
    );
    add(
      `"404s when updating an unknown row"`,
      `    const res = await app.request("${P}/${name}_99", send("PATCH", { name: "x" }));\n    expect(res.status).toBe(404);`,
    );
  }
  if (handlers.has("remove")) {
    add(
      `"deletes a row"`,
      `    await app.request("${P}", send("POST", valid));\n    const res = await app.request("${P}/${name}_1", { method: "DELETE" });\n    expect(res.status).toBe(204);\n    expect((await app.request("${P}")).status).toBe(200);\n    expect((await (await app.request("${P}")).json()).length).toBe(0);`,
    );
    add(
      `"404s when deleting an unknown row"`,
      `    const res = await app.request("${P}/${name}_99", { method: "DELETE" });\n    expect(res.status).toBe(404);`,
    );
  }
  if (handlers.has("stats")) {
    add(
      `"reports empty stats"`,
      `    const res = await app.request("${P}/stats");\n    expect((await res.json()).count).toBe(0);`,
    );
    add(
      `"reports stats after a create"`,
      `    await app.request("${P}", send("POST", valid));\n    const body = await (await app.request("${P}/stats")).json();\n    expect(body.count).toBe(1);${useLine ? `\n    expect(body.valueCents).toBe(750);` : has("active") ? `\n    expect(body.active).toBe(1);` : ""}`,
    );
  }
  if (handlers.has("linked") && other)
    add(
      `"counts rows in ${other}"`,
      `    createOther({ name: "o1" });\n    createOther({ name: "o2" });\n    await app.request("${P}", send("POST", valid));\n    expect(await (await app.request("${P}/linked")).json()).toEqual({ own: 1, other: 2 });`,
    );
  const bulk = int(20, 400);
  add(
    `"handles ${bulk} rows"`,
    `    for (let k = 0; k < ${bulk}; k++) await app.request("${P}", send("POST", { ...valid, name: \`n\${k}\` }));\n    const rows = await (await app.request("${P}")).json();\n    expect(rows.length).toBe(${bulk});`,
  );

  const target = int(4, 20);
  const chosen: string[] = [];
  let have = 0;
  for (const c of cases) {
    if (have + c.count > target && have >= 4) continue;
    chosen.push(c.code);
    have += c.count;
  }
  for (let k = 1; have < target; k++, have++) {
    chosen.push(
      `  test("creates variant ${k}", async () => {\n    const res = await app.request("${P}", send("POST", { ...valid, name: "v${k}" }));\n    expect(res.status).toBe(201);\n  });\n`,
    );
  }
  const head = [`import { describe, expect, test } from "bun:test";`];
  if (chosen.some((c) => c.includes("createOther(")))
    head.push(
      `import { create as createOther } from "../../src/domains/generated/${other}/service.ts";`,
    );
  head.push(
    `import { send, useTestApp } from "../support/app.ts";`,
    "",
    `const app = useTestApp();`,
  );
  head.push(`const valid = ${validObj};`, "", `describe("${name}", () => {`);
  const test = head.join("\n") + "\n" + chosen.join("\n") + `});\n`;
  return { service, routes, test, name };
}

function main(): void {
  const { domains, seed } = parseArgs(process.argv.slice(2));
  const rand = mulberry32(seed);
  const genDir = join(root, "src/domains/generated");
  const testDir = join(root, "test/generated");
  const schemaDir = join(root, "fixtures/schema");
  const seedDir = join(root, "fixtures/seed");
  for (const dir of [genDir, testDir, schemaDir, seedDir]) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  }

  const names: string[] = [];
  for (let i = 0; i < domains; i++) {
    const d = genDomain(i, rand);
    mkdirSync(join(genDir, d.name), { recursive: true });
    writeFileSync(join(genDir, d.name, "service.ts"), d.service);
    writeFileSync(join(genDir, d.name, "routes.ts"), d.routes);
    writeFileSync(join(testDir, `${d.name}.test.ts`), d.test);
    names.push(d.name);
  }

  for (const name of ["orders", "inventory", "customers", ...names]) {
    const f = genFixtures(name, seed);
    writeFileSync(join(schemaDir, `${name}.json`), JSON.stringify(f.schema, null, 2) + "\n");
    writeFileSync(join(seedDir, `${name}.json`), JSON.stringify(f.seed, null, 2) + "\n");
  }

  const all = [
    ...["orders", "inventory", "customers"].map((n) => ({ id: n, path: `./${n}/routes.ts` })),
    ...names.map((n) => ({ id: `g_${n}`, path: `./generated/${n}/routes.ts` })),
  ];
  const index = [
    "// Generated by scripts/gen.ts. Do not edit.",
    ...all.map((d) => `import * as ${d.id} from "${d.path}";`),
    "",
    `export const domains = [${all.map((d) => d.id).join(", ")}];`,
    "",
  ].join("\n");
  writeFileSync(join(root, "src/domains/index.ts"), index);
  console.log(`generated ${domains} domains (seed ${seed})`);
}

main();
