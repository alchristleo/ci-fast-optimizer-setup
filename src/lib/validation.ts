export type Result = { ok: true; value: Record<string, unknown> } | { ok: false; errors: string[] };
export type Validator = (input: unknown, partial?: boolean) => Result;
