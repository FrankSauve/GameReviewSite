/**
 * The constraint names a unique-constraint violation (P2002) reports, or null
 * for any other error. Through the pg driver adapter the constraint sits under
 * `meta.driverAdapterError.cause.constraint`, as either its fields or its index
 * name, not under `meta.target`.
 */
export function uniqueViolationTargets(err: unknown): string[] | null {
  if ((err as { code?: unknown } | null)?.code !== "P2002") return null;
  const constraint = (
    err as {
      meta?: {
        driverAdapterError?: {
          cause?: { constraint?: { fields?: unknown; index?: unknown } };
        };
      };
    }
  ).meta?.driverAdapterError?.cause?.constraint;
  if (Array.isArray(constraint?.fields)) return constraint.fields.map(String);
  if (typeof constraint?.index === "string") return [constraint.index];
  return [];
}

/** Matches loosely: an index name such as `Game_rawgId_key` contains its field. */
export function violatesUniqueOn(err: unknown, field: string): boolean {
  const targets = uniqueViolationTargets(err);
  return (
    targets !== null &&
    targets.some((name) => name.toLowerCase().includes(field.toLowerCase()))
  );
}
