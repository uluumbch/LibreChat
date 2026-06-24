import type { Prisma } from '@prisma/client';

/**
 * Bridge typed values into Prisma's `Json` input. Prisma's `InputJsonValue` is structurally
 * incompatible with our discriminated-union content parts (string-literal `type` fields, optional
 * properties), and it forbids `undefined`. Round-tripping through JSON both satisfies the type and
 * strips `undefined`, which is exactly the persisted shape we want. Isolated here so call sites stay
 * clean and typed.
 */
export function toJsonInput(value: unknown): Prisma.InputJsonValue {
  const json: Prisma.InputJsonValue = JSON.parse(JSON.stringify(value ?? null));
  return json;
}

/** Read a Prisma `Json` column back as the shape we wrote ourselves. */
export function fromJson<T>(value: Prisma.JsonValue | null): T {
  return value as unknown as T;
}
