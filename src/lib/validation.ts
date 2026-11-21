export type Field = {
  type: "string" | "number" | "boolean";
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
};
export type Schema = Record<string, Field>;
export type Result = { ok: true; value: Record<string, unknown> } | { ok: false; errors: string[] };
export type Validator = (input: unknown, partial?: boolean) => Result;

type Check = (value: unknown) => string | null;

function compileField(name: string, field: Field): Check {
  const re = field.pattern ? new RegExp(field.pattern) : null;
  return (value) => {
    if (typeof value !== field.type) return `${name} must be a ${field.type}`;
    if (typeof value === "number") {
      if (field.min !== undefined && value < field.min) return `${name} must be >= ${field.min}`;
      if (field.max !== undefined && value > field.max) return `${name} must be <= ${field.max}`;
    }
    if (typeof value === "string") {
      if (field.min !== undefined && value.length < field.min) return `${name} is too short`;
      if (field.max !== undefined && value.length > field.max) return `${name} is too long`;
      if (re && !re.test(value)) return `${name} has an invalid format`;
    }
    return null;
  };
}

export function compile(schema: Schema): Validator {
  const checks = Object.entries(schema).map(
    ([name, field]) => [name, field, compileField(name, field)] as const,
  );
  return (input, partial = false) => {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return { ok: false, errors: ["body must be an object"] };
    }
    const source = input as Record<string, unknown>;
    const errors: string[] = [];
    const value: Record<string, unknown> = {};
    for (const [name, field, check] of checks) {
      if (source[name] === undefined) {
        if (field.required && !partial) errors.push(`${name} is required`);
        continue;
      }
      const problem = check(source[name]);
      if (problem) errors.push(problem);
      else value[name] = source[name];
    }
    return errors.length > 0 ? { ok: false, errors } : { ok: true, value };
  };
}
