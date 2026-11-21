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
// `smoke`: the always-run wiring tests, listed apart from `files`; empty when nothing but docs changed.
export type Affected = { mode: "all" | "some"; files: string[]; smoke: string[] };

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
const isTest = (p: string) =>
  p.endsWith(".test.ts") && SCAN_DIRS.some((d) => p.startsWith(`${d}/`));
const ignored = (p: string) => p.endsWith(".md") || p.startsWith("docs/");
const analysable = (p: string) =>
  p.endsWith(".ts") &&
  SCAN_DIRS.some((d) => p.startsWith(`${d}/`)) &&
  !p.startsWith("test/fixtures/");

export function affectedTests(changed: Change[], graph: ImportGraph): Affected {
  const dependents = new Map<string, string[]>();
  for (const [file, deps] of graph.imports) {
    for (const dep of deps) dependents.set(dep, [...(dependents.get(dep) ?? []), file]);
  }
  const seen = new Set<string>();
  const queue: string[] = [];
  let relevant = false;
  for (const { path } of changed) {
    if (ignored(path)) continue;
    if (!analysable(path) || graph.unsafe.has(path) || RUN_ALL.includes(path))
      return { mode: "all", files: [], smoke: [] };
    queue.push(path);
    relevant = true;
  }
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    queue.push(...(dependents.get(file) ?? []).filter((d) => d !== BARREL));
  }
  const tests = [...seen].filter(isTest);
  return {
    mode: "some",
    files: tests.filter((f) => !isSmoke(f)).sort(),
    smoke: relevant ? [...graph.imports.keys()].filter((f) => isTest(f) && isSmoke(f)).sort() : [],
  };
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

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function mergeGraphs(a: ImportGraph, b: ImportGraph): ImportGraph {
  const imports = new Map(a.imports);
  for (const [file, deps] of b.imports)
    imports.set(file, new Set([...(imports.get(file) ?? []), ...deps]));
  return { imports, unsafe: new Set([...a.unsafe, ...b.unsafe]) };
}

function main(argv: string[]): void {
  const arg = (name: string) => argv[argv.indexOf(name) + 1];
  const base = arg("--base");
  const head = arg("--head");
  if (!base || !head) throw new Error("usage: bun scripts/affected.ts --base <sha> --head <sha>");
  const mergeBase = git("merge-base", base, head).trim();
  const changed = parseNameStatus(git("diff", "--name-status", `${mergeBase}..${head}`));
  let graph = buildGraph(process.cwd());
  if (changed.some((c) => c.status === "D" || c.status === "R")) {
    // Deleted and renamed-away paths are gone from the head graph: add the base graph so their dependents are found.
    const files = git("ls-tree", "-r", "--name-only", mergeBase, ...SCAN_DIRS)
      .split("\n")
      .filter(Boolean);
    graph = mergeGraphs(
      graph,
      graphFrom(files, (p) => git("show", `${mergeBase}:${p}`)),
    );
  }
  const result = affectedTests(changed, graph);
  if (result.mode === "all") console.log("all");
  else {
    // A deleted or renamed-away test is in the graph but gone at head: bun test would fail on it.
    const picked = [...result.files, ...result.smoke].filter((f) => existsSync(f));
    if (picked.length > 0) console.log(picked.join("\n"));
  }
}

if (import.meta.main) main(process.argv.slice(2));
