import { describe, expect, it } from "vitest";
import { mightBeSameGame, titleKey } from "../src/lib/gameMatch.js";

describe("titleKey", () => {
  it.each([
    ["Baldur's Gate III", "Baldur’s Gate 3"],
    ["DARK SOULS™ III", "Dark Souls 3"],
    ["Pokémon Red", "Pokemon Red"],
    ["DOOM (2016)", "Doom"],
    ["Tom & Jerry", "Tom and Jerry"],
    ["Disco Elysium", "Disco Elysium - The Final Cut"],
    [
      "Divinity: Original Sin 2",
      "Divinity: Original Sin 2 - Definitive Edition",
    ],
    ["Batman: Arkham City", "Batman: Arkham City - Game of the Year Edition"],
    ["Dark Souls", "DARK SOULS™: REMASTERED"],
    ["Death Stranding", "Death Stranding: The Director's Cut"],
  ])("treats %s and %s alike", (a, b) => {
    expect(titleKey(a)).toBe(titleKey(b));
  });

  it.each([
    ["Dark Souls II", "Dark Souls III"],
    ["Hades", "Hades II"],
    ["Halo 3", "Halo 3: ODST"],
    ["Alan Wake", "Alan Wake 2"],
    ["ドラゴンクエスト", "ファイナルファンタジー"],
    ["Война и мир", "Тетрис"],
    ["...", "???"],
  ])("keeps %s and %s apart", (a, b) => {
    expect(titleKey(a)).not.toBe(titleKey(b));
  });

  it("does not empty a title that is only an edition's words", () => {
    expect(titleKey("Remastered")).toBe("remastered");
  });
});

describe("mightBeSameGame", () => {
  const game = (title: string, releaseYear: number | null) => ({
    title,
    releaseYear,
  });

  it("matches an edition with the game, a year apart", () => {
    expect(
      mightBeSameGame(
        game("Disco Elysium - The Final Cut", 2020),
        game("Disco Elysium", 2019),
      ),
    ).toBe(true);
  });

  it("keeps a same-titled game of another decade apart", () => {
    expect(mightBeSameGame(game("DOOM", 2016), game("Doom", 1993))).toBe(false);
  });

  it("still asks when a year is missing", () => {
    expect(mightBeSameGame(game("Hades", null), game("Hades", 2020))).toBe(
      true,
    );
  });
});
