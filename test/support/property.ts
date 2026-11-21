import type { Parameters } from "fast-check";

// One shared seed and run count for every property test. fast-check prints the seed on failure.
export const SEED = 20261121;
export const RUNS = 4000;

// `scale` multiplies the run count for the heavier domains.
export function params(scale = 1): Parameters<unknown> {
  return { seed: SEED, numRuns: RUNS * scale };
}
