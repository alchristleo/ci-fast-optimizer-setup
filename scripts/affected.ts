import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";

export type Change = { path: string; status: string };
export type ImportGraph = {
  // file -> files it imports (type-only edges included)
  imports: Map<string, Set<string>>;
  // files with a non-literal or unresolvable import: a change there cannot be analysed
  unsafe: Set<string>;
};
const SCAN_DIRS = ["src", "test"];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:'"`])\/\/.*$/gm, "$1");
}

// Scanned from source text, not transpiler output: Bun.Transpiler.scanImports drops type-only edges.
function scan(src: string): { specs: string[]; unsafe: boolean } {
  const text = stripComments(src);
  const specs: string[] = [];
  for (const m of text.matchAll(/\b(?:import|export)\b[^'";`]*?\bfrom\s*(['"])([^'"]+)\1/g))
    specs.push(m[2]!);
  for (const m of text.matchAll(/\bimport\s*(['"])([^'"]+)\1/g)) specs.push(m[2]!);
  let unsafe = false;
  for (const m of text.matchAll(/\b(import|require)\s*\(\s*(['"])?([^'")]*)/g)) {
    if (m[2]) specs.push(m[3]!);
    else unsafe = true;
  }
  return { specs, unsafe };
}

function resolve(from: string, spec: string, has: (p: string) => boolean): string | undefined {
  const base = posix.normalize(posix.join(posix.dirname(from), spec));
  return [base, `${base}.ts`, `${base}/index.ts`].find(has);
}

function listFiles(root: string, dir: string): string[] {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).flatMap((entry) => {
    const rel = `${dir}/${entry}`;
    return statSync(join(root, rel)).isDirectory() ? listFiles(root, rel) : [rel];
  });
}

export function graphFrom(files: string[], read: (p: string) => string): ImportGraph {
  const known = new Set(files);
  const imports = new Map<string, Set<string>>();
  const unsafe = new Set<string>();
  for (const file of files.filter((f) => f.endsWith(".ts"))) {
    const { specs, unsafe: dynamic } = scan(read(file));
    const deps = new Set<string>();
    let bad = dynamic;
    for (const spec of specs) {
      if (!spec.startsWith(".")) continue; // packages and bun:/node: builtins
      const target = resolve(file, spec, (p) => known.has(p));
      if (target) deps.add(target);
      else bad = true;
    }
    imports.set(file, deps);
    if (bad) unsafe.add(file);
  }
  return { imports, unsafe };
}

export function buildGraph(root: string): ImportGraph {
  const files = SCAN_DIRS.flatMap((d) => listFiles(root, d));
  return graphFrom(files, (p) => readFileSync(join(root, p), "utf8"));
}

// Reverse edges through the registry are not walked (every domain test imports its own domain),
// so a change to either file runs everything instead.
const BARREL = "src/domains/index.ts";
const RUN_ALL = [BARREL, "src/app.ts"];
const isSmoke = (p: string) => p.startsWith("test/smoke/");
const isMeta = (p: string) => p.startsWith("test/meta/");
// A domain dir: src/domains/<d>/ or src/domains/generated/<d>/. Tests import service.ts only, so a
// routes.ts change must also queue its siblings.
const DOMAIN_FILE = /^(src\/domains\/(?:generated\/)?[^/]+)\/[^/]+$/;
const isTest = (p: string) =>
  p.endsWith(".test.ts") && SCAN_DIRS.some((d) => p.startsWith(`${d}/`));
const ignored = (p: string) => p.endsWith(".md") || p.startsWith("docs/");
const analysable = (p: string) =>
  p.endsWith(".ts") &&
  SCAN_DIRS.some((d) => p.startsWith(`${d}/`)) &&
  !p.startsWith("test/fixtures/");

// "all", or the sorted non-smoke tests followed by the sorted smoke tests (smoke only when something but docs changed).
export function affectedTests(changed: Change[], graph: ImportGraph): string[] | "all" {
  const dependents = new Map<string, string[]>();
  for (const [file, deps] of graph.imports) {
    for (const dep of deps) dependents.set(dep, [...(dependents.get(dep) ?? []), file]);
  }
  const seen = new Set<string>();
  const queue: string[] = [];
  let relevant = false;
  for (const { path } of changed) {
    if (ignored(path)) continue;
    if (!analysable(path) || RUN_ALL.includes(path)) return "all";
    queue.push(path);
    const dir = DOMAIN_FILE.exec(path)?.[1];
    if (dir) queue.push(...[...graph.imports.keys()].filter((f) => posix.dirname(f) === dir));
    relevant = true;
  }
  if (relevant && graph.unsafe.size > 0) return "all";
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    queue.push(...(dependents.get(file) ?? []).filter((d) => d !== BARREL));
  }
  if (relevant) for (const f of graph.imports.keys()) if (isMeta(f) && isTest(f)) seen.add(f);
  const tests = [...seen].filter(isTest);
  const smoke = relevant ? [...graph.imports.keys()].filter((f) => isTest(f) && isSmoke(f)) : [];
  return [...tests.filter((f) => !isSmoke(f)).sort(), ...smoke.sort()];
}

// `git diff --name-status` lines; a rename or copy lists both paths.
export function parseNameStatus(out: string): Change[] {
  return out
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      const [status = "", ...paths] = line.split("\t");
      return paths.map((path) => ({ path, status: status[0]! }));
    });
}

function gitIn(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

// `a` is the head graph, `b` the base graph. A base file left importing a deleted path looks unsafe at
// head only because of that deletion, so head-unsafe counts only for new or changed files.
function mergeGraphs(a: ImportGraph, b: ImportGraph, changed: Set<string>): ImportGraph {
  const imports = new Map(a.imports);
  for (const [file, deps] of b.imports)
    imports.set(file, new Set([...(imports.get(file) ?? []), ...deps]));
  const headUnsafe = [...a.unsafe].filter((f) => !b.imports.has(f) || changed.has(f));
  return { imports, unsafe: new Set([...headUnsafe, ...b.unsafe]) };
}

export function selectFiles(base: string, head: string, cwd = process.cwd()): string[] | "all" {
  const git = (...args: string[]) => gitIn(cwd, ...args);
  const mergeBase = git("merge-base", base, head).trim();
  const changed = parseNameStatus(git("diff", "--name-status", `${mergeBase}..${head}`));
  let graph = buildGraph(cwd);
  if (changed.some((c) => c.status === "D" || c.status === "R")) {
    // Deleted and renamed-away paths are gone from the head graph: add the base graph so their dependents are found.
    const files = git("ls-tree", "-r", "--name-only", mergeBase, ...SCAN_DIRS)
      .split("\n")
      .filter(Boolean);
    graph = mergeGraphs(
      graph,
      graphFrom(files, (p) => git("show", `${mergeBase}:${p}`)),
      new Set(changed.map((c) => c.path)),
    );
  }
  const result = affectedTests(changed, graph);
  // A deleted or renamed-away test is in the graph but gone at head: bun test would fail on it.
  return result === "all" ? result : result.filter((f) => existsSync(join(cwd, f)));
}

function main(argv: string[]): void {
  const arg = (name: string) => argv[argv.indexOf(name) + 1];
  const base = arg("--base");
  const head = arg("--head");
  if (!base || !head) throw new Error("usage: bun scripts/affected.ts --base <sha> --head <sha>");
  const picked = selectFiles(base, head);
  if (picked === "all") console.log("all");
  else if (picked.length > 0) console.log(picked.join("\n"));
}

if (import.meta.main) main(process.argv.slice(2));
