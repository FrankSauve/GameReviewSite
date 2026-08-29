import { describe, expect, it } from "vitest";
import { applyCommand, type Selection } from "../src/lib/markdownCommands";

/**
 * `|` marks a caret and `[...]` a selection, so each case reads as what the
 * writer had and what they got. Where the selection lands is most of the point:
 * a toolbar that formats the right text but drops the cursor somewhere arbitrary
 * is one you have to re-aim after every click.
 */
function parse(spec: string): Selection {
  const start = spec.indexOf("[");
  const end = spec.indexOf("]");
  if (start !== -1 && end !== -1) {
    return {
      text: spec.slice(0, start) + spec.slice(start + 1, end) + spec.slice(end + 1),
      start,
      end: end - 1,
    };
  }
  const caret = spec.indexOf("|");
  return { text: spec.slice(0, caret) + spec.slice(caret + 1), start: caret, end: caret };
}

function show({ text, start, end }: Selection): string {
  if (start === end) return text.slice(0, start) + "|" + text.slice(start);
  return text.slice(0, start) + "[" + text.slice(start, end) + "]" + text.slice(end);
}

const run = (name: Parameters<typeof applyCommand>[0], spec: string) =>
  show(applyCommand(name, parse(spec)));

describe("applyCommand", () => {
  describe("wrapping", () => {
    it("wraps the selection and keeps it selected", () => {
      expect(run("bold", "a [word] here")).toBe("a **[word]** here");
    });

    it("inserts a placeholder when nothing is selected", () => {
      expect(run("bold", "a |")).toBe("a **[bold text]**");
    });

    it("uses the right marker for each command", () => {
      expect(run("italic", "[x]")).toBe("*[x]*");
      expect(run("strikethrough", "[x]")).toBe("~~[x]~~");
      expect(run("code", "[x]")).toBe("`[x]`");
      expect(run("spoiler", "[x]")).toBe("||[x]||");
    });

    it("unwraps when the markers are inside the selection", () => {
      expect(run("bold", "a [**word**] here")).toBe("a [word] here");
    });

    /** Pressing the same button twice should be a round trip. */
    it("unwraps when the markers sit just outside the selection", () => {
      expect(run("bold", "a **[word]** here")).toBe("a [word] here");
    });

    /**
     * `*` is a prefix of `**`, so a naive toggle would read bold as italic and
     * quietly demote it on the way past.
     */
    it("does not mistake bold for italic", () => {
      expect(run("italic", "[**word**]")).toBe("*[**word**]*");
    });

    it("does not treat a marker-length string as already wrapped", () => {
      expect(run("bold", "[*]")).toBe("**[*]**");
    });
  });

  describe("line prefixes", () => {
    it("prefixes the line the caret is on", () => {
      expect(run("quote", "he|llo")).toBe("> he|llo");
    });

    it("prefixes every line the selection touches", () => {
      expect(run("bullet", "[one\ntwo]")).toBe("- [one\n- two]");
    });

    it("removes the prefix when every line already has it", () => {
      expect(run("bullet", "- [one\n- two]")).toBe("[one\ntwo]");
    });

    /** Half-prefixed becomes fully prefixed, not half-unprefixed. */
    it("adds when only some lines have the prefix", () => {
      expect(run("bullet", "[- one\ntwo]")).toBe("- [- one\n- two]");
    });

    it("uses h3, the largest heading the renderer allows", () => {
      expect(run("heading", "|Verdict")).toBe("### |Verdict");
    });

    it("leaves earlier lines alone", () => {
      expect(run("quote", "first\nsec|ond")).toBe("first\n> sec|ond");
    });
  });

  describe("links", () => {
    it("keeps the selection as the label and selects the URL", () => {
      expect(run("link", "see [the wiki] now")).toBe("see [the wiki]([url]) now");
    });

    it("inserts a whole link when nothing is selected", () => {
      expect(run("link", "see |")).toBe("see [[text]](url)");
    });
  });
});
