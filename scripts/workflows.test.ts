import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

type Step = {
  if?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
};
type Job = {
  name?: string;
  needs?: string | string[];
  if?: string;
  steps?: Step[];
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
const SETUP = ".github/actions/setup/action.yml";
const setupText = readFileSync(SETUP, "utf8");
const setup = parse(setupText) as { runs: { using: string; steps: Step[] } };
const baseline = load("baseline");
const fast = load("fast");
const both = [baseline, fast];
const needsOf = (job: Job) => [job.needs ?? []].flat();

test("fast: fmt, lint, typecheck, build, tooling have no needs and no if", () => {
  for (const id of ["fmt", "lint", "typecheck", "build", "tooling"]) {
    expect(fast.wf.jobs[id], id).toBeDefined();
    expect(needsOf(fast.wf.jobs[id]!), id).toEqual([]);
    expect(fast.wf.jobs[id]!.if, id).toBeUndefined();
  }
});

test("fast: test needs only plan, and plan needs nothing", () => {
  expect(needsOf(fast.wf.jobs.test!)).toEqual(["plan"]);
  expect(needsOf(fast.wf.jobs.plan!)).toEqual([]);
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

const pinned = (step: Step) => {
  if (step.uses?.startsWith("./")) expect(step.uses).toBe("./.github/actions/setup");
  else if (step.uses) expect(step.uses).toMatch(/^[\w.-]+\/[\w.-]+(\/[\w./-]+)?@[0-9a-f]{40}$/);
};

test("every uses: is pinned to a 40-hex SHA or is the local setup action", () => {
  for (const { wf } of both)
    for (const job of Object.values(wf.jobs)) for (const step of job.steps ?? []) pinned(step);
  expect(setup.runs.using).toBe("composite");
  for (const step of setup.runs.steps) pinned(step);
  expect(setup.runs.steps.filter((s) => s.uses).length).toBe(2);
});

test("every job in both workflows sets up through the local action", () => {
  for (const { wf } of both)
    for (const [id, job] of Object.entries(wf.jobs).filter(([id]) => id !== "ci-ok"))
      expect(
        job.steps!.some((s) => s.uses === "./.github/actions/setup"),
        id,
      ).toBe(true);
});

test("no secrets are used", () => {
  for (const text of [...both.map((w) => w.text), setupText])
    expect(text).not.toContain("secrets.");
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

test("fast: ci-ok fails on a failed or cancelled need and reads no needs.<job>.result", () => {
  const ok = fast.wf.jobs["ci-ok"]!;
  const gate = ok.steps!.find((s) => s.if?.includes("needs.*.result"));
  expect(gate!.if).toBe(
    "contains(needs.*.result, 'failure') || contains(needs.*.result, 'cancelled')",
  );
  expect(gate!.run!.trim()).toBe("exit 1");
  expect(JSON.stringify(ok.steps)).not.toMatch(/needs\.\w+\.result/);
});

// Any ${{ }} in a run block is rejected: values reach scripts only through env.
test("no run block interpolates expressions", () => {
  for (const { wf } of both)
    for (const job of Object.values(wf.jobs))
      for (const step of job.steps ?? []) expect(step.run ?? "").not.toMatch(/\$\{\{/);
  for (const step of setup.runs.steps) expect(step.run ?? "").not.toMatch(/\$\{\{/);
});

test("fast: plan checks out full history", () => {
  const checkout = fast.wf.jobs.plan!.steps!.find((s) => s.uses?.startsWith("actions/checkout@"));
  expect(checkout!.with).toEqual({ "fetch-depth": 0 });
});

test("fast: test job is skipped when the plan has no files", () => {
  expect(fast.wf.jobs.test!.if).toBe("needs.plan.outputs.count != '0'");
});

test("fast: plan step runs bun scripts/plan.ts with inputs only through env", () => {
  const step = fast.wf.jobs.plan!.steps!.find((s) => s.run?.includes("plan.ts"));
  expect(step!.run!.trim()).toBe("bun scripts/plan.ts");
  expect(Object.keys(step!.env ?? {}).sort()).toEqual([
    "EVENT",
    "IN_BASE",
    "IN_HEAD",
    "IN_MODE",
    "PR_BASE",
  ]);
});

test("fast: no jq, seq or scripts/shard.ts in the workflow", () => {
  expect(fast.text).not.toMatch(/jq |seq |scripts\/shard\.ts/);
});
