// Prisma returns Date objects for DateTime fields.
// This helper converts them to ISO-8601 strings so Apollo's String scalar can
// serialise them without falling back to the locale-dependent Date#toString().

type WithDates<T> = T & { createdAt?: Date | string; updatedAt?: Date | string };
type Serialized<T> = Omit<T, "createdAt" | "updatedAt"> & {
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
};

export function serializeDates<T extends object>(obj: WithDates<T>): Serialized<T> {
  return {
    ...obj,
    createdAt:
      obj.createdAt instanceof Date ? obj.createdAt.toISOString() : obj.createdAt,
    updatedAt:
      obj.updatedAt instanceof Date ? obj.updatedAt.toISOString() : obj.updatedAt,
  };
}
