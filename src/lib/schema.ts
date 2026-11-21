import type { Ajv, ErrorObject, ValidateFunction } from "ajv";
import type { Result, Validator } from "./validation.ts";

// Turns one ajv error (allErrors: false, so there is exactly one) into the 400 error text.
export function describeError(e: ErrorObject): string {
  const field = e.instancePath.slice(1);
  const p = e.params as Record<string, unknown>;
  switch (e.keyword) {
    case "required":
      return `${String(p.missingProperty)} is required`;
    case "type":
      return field ? `${field} must be a ${String(p.type)}` : "body must be an object";
    case "additionalProperties":
      return `${String(p.additionalProperty)} is not allowed`;
    case "minimum":
      return `${field} must be >= ${String(p.limit)}`;
    case "maximum":
      return `${field} must be <= ${String(p.limit)}`;
    case "minLength":
      return `${field} is too short`;
    case "maxLength":
      return `${field} is too long`;
    case "pattern":
      return `${field} has an invalid format`;
    default:
      return `${field || "body"} is invalid`;
  }
}

function run(validate: ValidateFunction, input: unknown): Result {
  if (validate(input)) return { ok: true, value: input as Record<string, unknown> };
  return { ok: false, errors: [describeError(validate.errors![0]!)] };
}

// The compiled validator for a domain's fixtures/schema/<d>.json: the only request-body
// validator its routes use. A partial (PATCH) body ignores `required`; that variant compiles
// from the same schema on first use.
export function compileSchema(ajv: Ajv, schema: object): Validator {
  const full = ajv.compile(schema);
  let partial: ValidateFunction | undefined;
  return (input, isPartial = false) => {
    if (!isPartial) return run(full, input);
    partial ??= ajv.compile({ ...schema, required: [], $id: undefined });
    return run(partial, input);
  };
}
