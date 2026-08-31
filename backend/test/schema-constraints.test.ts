import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";

/**
 * Asserts the migrated database matches schema.prisma where Prisma's own tools
 * do not look.
 *
 * `prisma migrate diff --to-schema-datamodel` — the drift check CI runs — emits
 * and compares array columns as nullable even for a required String[], so a
 * migration that leaves Game.genres nullable reads as no drift. That is not
 * hypothetical: 20260830010000_labels_not_null existed to fix exactly it, and
 * the squash to 20260830140000_baseline nearly dropped the constraint again
 * because the generated baseline reproduced the leniency.
 *
 * Reading the catalog directly costs one query and has no such blind spot.
 */

interface ColumnRow {
  table_name: string;
  column_name: string;
  is_nullable: "YES" | "NO";
}

describe("database constraints match schema.prisma", () => {
  it("makes every required field NOT NULL and every optional field nullable", async () => {
    const rows = await prisma.$queryRaw<ColumnRow[]>`
      SELECT table_name, column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `;
    const actual = new Map(
      rows.map((r) => [
        `${r.table_name}.${r.column_name}`,
        r.is_nullable === "YES",
      ]),
    );

    const mismatches: string[] = [];
    for (const model of Prisma.dmmf.datamodel.models) {
      const table = model.dbName ?? model.name;
      for (const field of model.fields) {
        // Relation fields are not columns; the scalar they read is checked on
        // its own pass.
        if (field.kind === "object") continue;

        const key = `${table}.${field.dbName ?? field.name}`;
        const isNullable = actual.get(key);
        if (isNullable === undefined) {
          mismatches.push(`${key} is missing from the database`);
          continue;
        }
        if (isNullable === field.isRequired) {
          mismatches.push(
            `${key} is ${isNullable ? "nullable" : "NOT NULL"} but schema.prisma ` +
              `declares it ${field.isRequired ? "required" : "optional"}`,
          );
        }
      }
    }

    expect(mismatches).toEqual([]);
  });

  /**
   * Dropped columns, which the pass above cannot see: it walks schema.prisma
   * and so never asks about a column the datamodel no longer names.
   */
  it("has dropped the columns the schema no longer declares", async () => {
    const rows = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Game'
    `;
    expect(rows.map((r) => r.column_name)).not.toContain("platforms");
  });
});
