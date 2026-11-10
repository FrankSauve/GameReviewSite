import { describe, expect, it } from "vitest";
import type { GameHit } from "../src/lib/gameSources/types.js";
import { planSteamId } from "../src/lib/steamIdMatch.js";

const hit = (externalId: string, title: string): GameHit => ({
  externalId,
  title,
  coverUrl: null,
  releaseYear: null,
  genres: [],
  metacritic: null,
});

const none = { skips: new Set<string>(), picks: new Set<string>() };

describe("planSteamId", () => {
  it("links the one game that matches, edition or not", () => {
    expect(
      planSteamId(
        "Disco Elysium",
        [hit("1", "Disco Elysium - The Final Cut"), hit("2", "Bladesong")],
        none,
      ),
    ).toMatchObject({ kind: "link", hit: { externalId: "1" } });
  });

  it("does not link a different game that merely shares words", () => {
    expect(planSteamId("Alan Wake 2", [hit("1", "Alan Wake")], none).kind).toBe(
      "none",
    );
  });

  it("asks a person when several match", () => {
    const plan = planSteamId(
      "Horizon Zero Dawn",
      [
        hit("1", "Horizon Zero Dawn Remastered"),
        hit("2", "Horizon Zero Dawn Complete Edition"),
      ],
      none,
    );
    expect(plan.kind).toBe("choose");
  });

  it("takes a person's pick among several", () => {
    const hits = [hit("1", "BioShock"), hit("2", "BioShock Remastered")];
    expect(
      planSteamId("BioShock", hits, { ...none, picks: new Set(["2"]) }),
    ).toMatchObject({ kind: "link", hit: { externalId: "2" } });
  });

  it("never links an app a person skipped", () => {
    const hits = [hit("1", "Dark Souls Remastered")];
    expect(
      planSteamId("Dark Souls", hits, { ...none, skips: new Set(["1"]) }).kind,
    ).toBe("none");
  });

  it("settles several when a skip leaves one", () => {
    const hits = [hit("1", "Vanquish"), hit("2", "VANQUISH")];
    expect(
      planSteamId("Vanquish", hits, { ...none, skips: new Set(["1"]) }),
    ).toMatchObject({ kind: "link", hit: { externalId: "2" } });
  });
});
