-- NOT NULL by hand: Prisma emits a String[] as a nullable column. See 20260830010000_labels_not_null.
ALTER TABLE "Review" ADD COLUMN     "secondaryGenres" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
