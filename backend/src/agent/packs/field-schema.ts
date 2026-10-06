import type { PackField } from "@pakka/types";
import { z } from "zod";

// The Zod schema for leads.fields, generated from a pack's field list (docs/handover.md, "Vertical
// pack system": industry answers live in leads.fields, validated against the pack's fields).
//
// Every key is optional: answers arrive over time, and which fields are *required* is the decide
// step's business, not the schema's. Keys the pack does not declare are stripped. Values from the LLM
// arrive as string, number or boolean, so numbers and booleans also accept their text form.
// Formats of range_inr and date_range_or_month are not defined anywhere yet: any non-empty string (and,
// for a range, any finite number) is accepted, with no further checks.

const text = z.string().trim().min(1);
const integer = z.union([z.int(), z.string().trim().regex(/^-?\d+$/).transform(Number).pipe(z.int())]);
const boolean = z.union([z.boolean(), z.enum(["true", "false"]).transform((value) => value === "true")]);
const range = z.union([z.string().trim().min(1), z.number()]);

function valueSchema(field: PackField): z.ZodType {
  switch (field.type) {
    case "text":
      return text;
    case "int":
      return integer;
    case "boolean":
      return boolean;
    case "range_inr":
      return range;
    case "date_range_or_month":
      return text;
    case "enum":
      // PackField requires options for an enum; if there are none, nothing is valid rather than a throw.
      return field.options && field.options.length > 0 ? z.enum(field.options as [string, ...string[]]) : z.never();
  }
}

export function buildFieldSchema(fields: PackField[]): z.ZodObject {
  const shape: Record<string, z.ZodType> = {};
  for (const field of fields) shape[field.key] = valueSchema(field).optional();
  return z.object(shape);
}
