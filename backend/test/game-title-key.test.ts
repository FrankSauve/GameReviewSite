import { describe, expect, it } from "vitest";
import { closestGame, titleKey } from "../src/lib/gameMatch.js";

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
    ["Mega Man X", "Mega Man 10"],
    ["X-Men", "10 Men"],
    ["V Rising", "5 Rising"],
    ["ガンダム", "カンタム"],
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

describe("closestGame", () => {
  const game = (title: string, releaseYear: number | null) => ({
    title,
    releaseYear,
  });

  it("matches an edition with the game, a year apart", () => {
    const library = [game("Disco Elysium", 2019)];
    expect(
      closestGame(game("Disco Elysium - The Final Cut", 2020), library),
    ).toBe(library[0]);
  });

  it("keeps a same-titled game of another decade apart", () => {
    expect(closestGame(game("DOOM", 2016), [game("Doom", 1993)])).toBeNull();
  });

  it("still asks when a year is missing", () => {
    expect(
      closestGame(game("Hades", null), [game("Hades", 2020)]),
    ).toBeTruthy();
  });

  it("prefers the matching year over an older row with no year", () => {
    const library = [
      game("Doom", null),
      game("Doom", 2017),
      game("DOOM", 2016),
    ];
    expect(closestGame(game("DOOM", 2016), library)).toBe(library[2]);
  });

  it("prefers a year's drift over a row with no year", () => {
    const library = [game("Doom", null), game("Doom", 2017)];
    expect(closestGame(game("DOOM", 2016), library)).toBe(library[1]);
  });
});
