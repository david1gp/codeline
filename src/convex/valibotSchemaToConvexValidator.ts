import { type Validator, v } from "convex/values"

type UnknownSchema = {
  type: string
  wrapped?: UnknownSchema
  entries?: Record<string, UnknownSchema>
  item?: UnknownSchema
  options?: unknown[]
  pipe?: unknown[]
  key?: UnknownSchema
  value?: UnknownSchema
  literal?: unknown
  enum?: Record<string, unknown>
}

export function valibotSchemaToConvexValidator(schema: unknown): Validator<any, any, any> {
  return valibotSchemaToConvexValidatorUnknown(schema as UnknownSchema)
}

function valibotSchemaToConvexValidatorUnknown(schemaParam: UnknownSchema): Validator<any, any, any> {
  const schema = unwrapSchema(schemaParam)

  switch (schema.type) {
    case "string":
      return v.string()
    case "number":
      return v.number()
    case "boolean":
      return v.boolean()
    case "null":
      return v.null()
    case "unknown":
    case "any":
      return v.any()
    case "literal":
      return literalToConvex(schema.literal)
    case "enum":
      return enumToConvex(schema.enum)
    case "picklist":
      return picklistToConvex(schema.options)
    case "array":
      if (schema.item === undefined) throw new Error("valibot-to-convex: array schema is missing `item`")
      return v.array(valibotSchemaToConvexValidatorUnknown(schema.item))
    case "record":
      if (schema.key === undefined || schema.value === undefined) {
        throw new Error("valibot-to-convex: record schema is missing `key` or `value`")
      }
      return v.record(
        valibotSchemaToConvexValidatorUnknown(schema.key),
        valibotSchemaToConvexValidatorUnknown(schema.value),
      )
    case "object":
    case "strict_object":
      if (schema.entries === undefined) throw new Error("valibot-to-convex: object schema is missing `entries`")
      return v.object(valibotFieldsToConvexFields(schema.entries))
    case "optional":
    case "exact_optional":
    case "undefinedable":
      if (schema.wrapped === undefined) throw new Error(`valibot-to-convex: ${schema.type} is missing \`wrapped\``)
      return v.optional(valibotSchemaToConvexValidatorUnknown(schema.wrapped))
    case "nullable":
      if (schema.wrapped === undefined) throw new Error("valibot-to-convex: nullable schema is missing `wrapped`")
      return v.nullable(valibotSchemaToConvexValidatorUnknown(schema.wrapped))
    case "nullish":
      if (schema.wrapped === undefined) throw new Error("valibot-to-convex: nullish schema is missing `wrapped`")
      return v.optional(v.nullable(valibotSchemaToConvexValidatorUnknown(schema.wrapped)))
    case "union":
    case "variant":
      if (schema.options === undefined || schema.options.length === 0) {
        throw new Error(`valibot-to-convex: ${schema.type} schema is missing \`options\``)
      }
      return v.union(
        ...schema.options.map((option) =>
          isSchema(option) ? valibotSchemaToConvexValidatorUnknown(option) : literalToConvex(option),
        ),
      )
    default:
      throw new Error(`valibot-to-convex: unsupported valibot schema type "${schema.type}"`)
  }
}

function valibotFieldsToConvexFields(fields: Record<string, UnknownSchema>): Record<string, Validator<any, any, any>> {
  const output: Record<string, Validator<any, any, any>> = {}
  for (const [key, schema] of Object.entries(fields)) {
    output[key] = valibotSchemaToConvexValidatorUnknown(schema)
  }
  return output
}

function unwrapSchema(schema: UnknownSchema): UnknownSchema {
  if (Array.isArray(schema.pipe) && schema.pipe.length > 0 && isSchema(schema.pipe[0])) {
    return unwrapSchema(schema.pipe[0])
  }
  return schema
}

function literalToConvex(value: unknown): Validator<any, "required", any> {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return v.literal(value)
  }
  throw new Error(`valibot-to-convex: unsupported literal type "${typeof value}"`)
}

function enumToConvex(enumObject: UnknownSchema["enum"]): Validator<any, "required", any> {
  if (enumObject === undefined) throw new Error("valibot-to-convex: enum schema is missing `enum`")
  return picklistToConvex(Object.values(enumObject))
}

function picklistToConvex(options: unknown[] | undefined): Validator<any, "required", any> {
  if (options === undefined || options.length === 0) throw new Error("valibot-to-convex: picklist has no values")
  const members = options.map(literalToConvex)
  if (members.length === 1) {
    const member = members[0]
    if (member === undefined) throw new Error("valibot-to-convex: picklist has no validator members")
    return member
  }
  return v.union(...members)
}

function isSchema(value: unknown): value is UnknownSchema {
  return !!value && typeof value === "object" && "type" in value
}
