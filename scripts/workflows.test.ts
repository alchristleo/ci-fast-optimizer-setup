import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

type Job = {
  name?: string;
  needs?: string | string[];
  if?: string;
  steps?: { uses?: string; run?: string; with?: Record<string, unknown> }[];
};
type Workflow = {
  on: Record<string, unknown>;
  permissions?: Record<string, string>;
  concurrency?: { "cancel-in-progress"?: unknown };
  jobs: Record<string, Job>;
};

const load = (name: string) => {
  const text = readFileSync(`.github/workflows/${name}.yml`, "utf8");
  return { text, wf: parse(text) as Workflow };
};
const baseline = load("baseline");
const fast = load("fast");
const both = [baseline, fast];
const needsOf = (job: Job) => [job.needs ?? []].flat();

test("fast: fmt, lint, typecheck, build, tooling have no needs", () => {
  for (const id of ["fmt", "lint", "typecheck", "build", "tooling"]) {
    expect(fast.wf.jobs[id], id).toBeDefined();
    expect(needsOf(fast.wf.jobs[id]!), id).toEqual([]);
  }
});

test("fast: test needs only plan, and plan needs nothing", () => {
  expect(needsOf(fast.wf.jobs.test!)).toEqual(["plan"]);
  expect(needsOf(fast.wf.jobs.plan!)).toEqual([]);
});

test("fast: ci-ok and timings exist", () => {
  expect(fast.wf.jobs["ci-ok"]).toBeDefined();
  expect(fast.wf.jobs.timings).toBeDefined();
});

test("baseline: exactly one job, named test", () => {
  const ids = Object.keys(baseline.wf.jobs);
  expect(ids).toEqual(["test"]);
  expect(baseline.wf.jobs.test!.name).toStartWith("test");
});

test("triggers are push, pull_request, workflow_dispatch only", () => {
  for (const { wf, text } of both) {
    expect(Object.keys(wf.on).sort()).toEqual(["pull_request", "push", "workflow_dispatch"]);
    expect(text).not.toContain("pull_request_target");
  }
});

test("top-level permissions are contents: read only", () => {
  for (const { wf } of both) expect(wf.permissions).toEqual({ contents: "read" });
});

test("every uses: is pinned to a 40-hex SHA", () => {
  for (const { wf } of both)
    for (const job of Object.values(wf.jobs))
      for (const step of job.steps ?? [])
        if (step.uses) expect(step.uses).toMatch(/^[\w.-]+\/[\w.-]+(\/[\w./-]+)?@[0-9a-f]{40}$/);
});

test("no secrets are used", () => {
  for (const { text } of both) expect(text).not.toContain("secrets.");
});

test("fast: timings runs only on push", () => {
  expect(fast.wf.jobs.timings!.if).toContain("github.event_name == 'push'");
});

test("fast: cancel-in-progress only for pull_request", () => {
  expect(fast.wf.concurrency?.["cancel-in-progress"]).toBe(
    "${{ github.event_name == 'pull_request' }}",
  );
});

test("fast: ci-ok runs always and needs every other job", () => {
  const ok = fast.wf.jobs["ci-ok"]!;
  expect(ok.if).toBe("always()");
  const others = Object.keys(fast.wf.jobs).filter((id) => id !== "ci-ok" && id !== "timings");
  expect(needsOf(ok).sort()).toEqual(others.sort());
});

// Any ${{ }} in a run block is rejected: values reach scripts only through env.
test("no run block interpolates expressions", () => {
  for (const { wf } of both)
    for (const job of Object.values(wf.jobs))
      for (const step of job.steps ?? []) expect(step.run ?? "").not.toMatch(/\$\{\{/);
});

test("fast: plan checks out full history", () => {
  const checkout = fast.wf.jobs.plan!.steps!.find((s) => s.uses?.startsWith("actions/checkout@"));
  expect(checkout!.with).toEqual({ "fetch-depth": 0 });
});

test("fast: test job is skipped when the plan has no files", () => {
  expect(fast.wf.jobs.test!.if).toBe("needs.plan.outputs.count != '0'");
});
