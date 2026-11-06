import { describe, expect, it } from "vitest";
import { titleKey } from "../src/lib/gameMatch.js";

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
  ])("treats %s and %s alike", (a, b) => {
    expect(titleKey(a)).toBe(titleKey(b));
  });

  it.each([
    ["Dark Souls II", "Dark Souls III"],
    ["Hades", "Hades II"],
    ["Halo 3", "Halo 3: ODST"],
    ["Alan Wake", "Alan Wake 2"],
  ])("keeps %s and %s apart", (a, b) => {
    expect(titleKey(a)).not.toBe(titleKey(b));
  });

  it("does not empty a title that is only an edition's words", () => {
    expect(titleKey("Remastered")).toBe("remastered");
  });
});
