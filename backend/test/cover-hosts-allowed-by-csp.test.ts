import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COVER_HOSTS as RAWG_HOSTS } from "../src/lib/gameSources/rawg.js";
import { COVER_DOMAIN } from "../src/lib/gameSources/steam.js";
import { COVER_HOSTS as TGDB_HOSTS } from "../src/lib/gameSources/tgdb.js";

/** A host missing from img-src does not error: the cover is just blocked. */
const csp = readFileSync(
  new URL("../../frontend/security-headers.conf", import.meta.url),
  "utf8",
);
const imgSrc =
  /Content-Security-Policy "[^"]*img-src ([^;]+);/.exec(csp)?.[1]?.split(" ") ??
  [];

describe("the CSP's img-src", () => {
  it.each([...RAWG_HOSTS, ...TGDB_HOSTS])("allows %s", (host) => {
    expect(imgSrc).toContain(`https://${host}`);
  });

  it("allows Steam's CDN domain", () => {
    expect(imgSrc).toContain(`https://*${COVER_DOMAIN}`);
  });
});
