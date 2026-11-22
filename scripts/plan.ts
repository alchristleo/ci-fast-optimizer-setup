import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { Glob } from "bun";
import { selectFiles } from "./affected.ts";
import { planShards } from "./shard.ts";

export type Mode = { mode: "full" | "pr"; base: string; head: string };
type Env = Record<string, string | undefined>;

export function resolveMode(env: Env, head: string): Mode {
  if (env.EVENT === "pull_request") return { mode: "pr", base: env.PR_BASE ?? "", head };
  if (env.EVENT === "workflow_dispatch" && env.IN_MODE === "pr") {
    const base = env.IN_BASE ?? "";
    const inHead = env.IN_HEAD ?? "";
    if (!base || !inHead) throw new Error("pr mode needs base and head");
    return { mode: "pr", base, head: inHead };
  }
  return { mode: "full", base: "", head };
}

export function planMatrix(
  files: string[],
  timings: Record<string, number>,
  maxShards = 4,
): { count: number; matrix: { include: { shard: number; files: string }[] } } {
  const bad = files.find((f) => /\s/.test(f));
  if (bad !== undefined) throw new Error(`whitespace in test path: ${JSON.stringify(bad)}`);
  const shards = planShards(files, timings, maxShards);
  return {
    count: shards.length,
    matrix: { include: shards.map((s, shard) => ({ shard, files: s.join(" ") })) },
  };
}

// Code-unit order (JS default sort), not the locale order of `sort`.
const listTests = (cwd: string) =>
  [...new Glob("test/**/*.test.ts").scanSync({ cwd, dot: true })].sort();

const SHA = /^[0-9a-f]{7,40}$/i;

export function planFiles({ mode, base, head }: Mode, cwd: string): string[] {
  if (mode === "pr" && !(SHA.test(base) && SHA.test(head)))
    throw new Error("base and head must be commit SHAs");
  const picked = mode === "pr" ? selectFiles(base, head, cwd) : "all";
  return picked === "all" ? listTests(cwd) : picked;
}

function main(env: Env): void {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const resolved = resolveMode(env, head);
  const files = planFiles(resolved, process.cwd());
  let timings: Record<string, number> = {};
  try {
    timings = JSON.parse(readFileSync(".ci/test-timings.json", "utf8"));
  } catch {}
  const { count, matrix } = planMatrix(files, timings);
  console.log(`mode=${resolved.mode} files=${files.length} shards=${count}`);
  appendFileSync(env.GITHUB_OUTPUT!, `count=${count}\nmatrix=${JSON.stringify(matrix)}\n`);
}

if (import.meta.main) main(process.env);
