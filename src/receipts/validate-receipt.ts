import { canonicalSha256 } from "../domain/evaluation";
import receiptSchemaJson from "./receipt.schema.json";
import type { EvidenceReceipt } from "./types";
import { receiptDigestPayload } from "./digest-payload";

type SchemaNode = Readonly<Record<string, unknown>>;

export interface ReceiptValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

const receiptSchema = receiptSchemaJson as SchemaNode;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function resolveReference(reference: string): SchemaNode | null {
  const prefix = "#/$defs/";
  if (!reference.startsWith(prefix)) return null;
  const definitions = receiptSchema.$defs;
  if (!isPlainObject(definitions)) return null;
  const resolved = definitions[reference.slice(prefix.length)];
  return isPlainObject(resolved) ? resolved : null;
}

function validateNode(
  value: unknown,
  schema: SchemaNode,
  path: string,
): readonly string[] {
  if (typeof schema.$ref === "string") {
    const resolved = resolveReference(schema.$ref);
    return resolved
      ? validateNode(value, resolved, path)
      : [`${path} references unsupported schema ${schema.$ref}.`];
  }

  if (Array.isArray(schema.oneOf)) {
    const branches = schema.oneOf.filter(isPlainObject);
    const matches = branches.map((branch) => validateNode(value, branch, path));
    return matches.filter((errors) => errors.length === 0).length === 1
      ? []
      : [`${path} must match exactly one declared shape.`];
  }

  if ("const" in schema && !Object.is(value, schema.const)) {
    return [`${path} must equal ${JSON.stringify(schema.const)}.`];
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => Object.is(item, value))) {
    return [`${path} contains a value outside the allowlist.`];
  }

  const type = schema.type;
  if (type === "null") return value === null ? [] : [`${path} must be null.`];
  if (type === "boolean" && typeof value !== "boolean") {
    return [`${path} must be a boolean.`];
  }
  if (type === "integer") {
    if (!Number.isInteger(value)) return [`${path} must be an integer.`];
    const number = value as number;
    if (typeof schema.minimum === "number" && number < schema.minimum) {
      return [`${path} is below its minimum.`];
    }
    if (typeof schema.maximum === "number" && number > schema.maximum) {
      return [`${path} is above its maximum.`];
    }
    return [];
  }
  if (type === "string") {
    if (typeof value !== "string") return [`${path} must be a string.`];
    const errors: string[] = [];
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push(`${path} is shorter than allowed.`);
    }
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      errors.push(`${path} is longer than allowed.`);
    }
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path} does not match the required pattern.`);
    }
    if (
      schema.format === "date-time"
      && (Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value)
    ) {
      errors.push(`${path} must be a canonical ISO 8601 timestamp.`);
    }
    return errors;
  }
  if (type === "array") {
    if (!Array.isArray(value)) return [`${path} must be an array.`];
    const errors: string[] = [];
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push(`${path} has too few items.`);
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      errors.push(`${path} has too many items.`);
    }
    if (isPlainObject(schema.items)) {
      value.forEach((item, index) => {
        errors.push(...validateNode(item, schema.items as SchemaNode, `${path}[${index}]`));
      });
    }
    return errors;
  }
  if (type === "object") {
    if (!isPlainObject(value)) return [`${path} must be a plain object.`];
    const errors: string[] = [];
    const properties = isPlainObject(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required)
      ? schema.required.filter((item): item is string => typeof item === "string")
      : [];
    for (const key of required) {
      if (!(key in value)) errors.push(`${path}.${key} is required.`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) errors.push(`${path}.${key} is not allowlisted.`);
      }
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (key in value && isPlainObject(propertySchema)) {
        errors.push(...validateNode(value[key], propertySchema, `${path}.${key}`));
      }
    }
    return errors;
  }

  return [];
}

export function validateEvidenceReceipt(value: unknown): ReceiptValidation {
  const errors = validateNode(value, receiptSchema, "$receipt");
  return { valid: errors.length === 0, errors };
}

export async function verifyEvidenceReceipt(value: unknown): Promise<ReceiptValidation> {
  const schemaValidation = validateEvidenceReceipt(value);
  if (!schemaValidation.valid || !isPlainObject(value)) return schemaValidation;
  const receipt = value as unknown as EvidenceReceipt;
  const expected = await canonicalSha256(receiptDigestPayload(receipt));
  const { receiptDigest } = receipt;
  if (receiptDigest !== expected) {
    return {
      valid: false,
      errors: ["$receipt.receiptDigest does not match the canonical receipt payload."],
    };
  }
  return schemaValidation;
}

export function isEvidenceReceipt(value: unknown): value is EvidenceReceipt {
  return validateEvidenceReceipt(value).valid;
}
