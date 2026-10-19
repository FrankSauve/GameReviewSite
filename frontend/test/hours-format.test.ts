import { describe, expect, it } from "vitest";
import { formatHours, formatPlaytime } from "../src/lib/playtime";

describe("formatHours", () => {
  it("drops a zero decimal and keeps a real one", () => {
    expect(formatHours(42)).toBe("42h");
    expect(formatHours(47.5)).toBe("47.5h");
    expect(formatHours(47.04)).toBe("47h");
  });

  it("separates thousands with a comma", () => {
    expect(formatHours(999)).toBe("999h");
    expect(formatHours(10000)).toBe("10,000h");
    expect(formatHours(1234.5)).toBe("1,234.5h");
  });

  it("carries the separator into a card's playtime line", () => {
    expect(formatPlaytime(2019, 1500)).toBe("2019 · 1,500h");
  });
});
