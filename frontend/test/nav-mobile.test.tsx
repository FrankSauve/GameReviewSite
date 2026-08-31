// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing";
import { MemoryRouter } from "react-router-dom";
import { Navbar } from "../src/components/Navbar";

/** See the note in profile-views.test.tsx: vitest runs without globals here. */
afterEach(cleanup);

function renderNavbar(path = "/") {
  return render(
    <MockedProvider mocks={[]}>
      <MemoryRouter initialEntries={[path]}>
        <Navbar />
      </MemoryRouter>
    </MockedProvider>,
  );
}

/** The only <nav> in the header is the collapsed menu's panel. */
function menu() {
  return screen.queryByRole("navigation");
}

function toggle() {
  return screen.getByRole("button", { name: /navigation/i });
}

describe("collapsed navigation menu", () => {
  it("starts closed", () => {
    renderNavbar();
    expect(menu()).toBeNull();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
  });

  it("points the toggle at the panel it controls", () => {
    renderNavbar();
    fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-controls")).toBe(menu()?.id);
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
  });

  it("opens onto all three destinations", () => {
    renderNavbar();
    fireEvent.click(toggle());
    const links = within(menu() as HTMLElement).getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual([
      "Games",
      "Reviewers",
      "Articles",
    ]);
  });

  it("marks the current page inside the menu", () => {
    renderNavbar("/reviewers");
    fireEvent.click(toggle());
    const current = within(menu() as HTMLElement).getByRole("link", {
      name: "Reviewers",
    });
    expect(current.className).toContain("text-violet-300");
  });

  it("closes again on a second press", () => {
    renderNavbar();
    fireEvent.click(toggle());
    fireEvent.click(toggle());
    expect(menu()).toBeNull();
  });

  it("closes on Escape", () => {
    renderNavbar();
    fireEvent.click(toggle());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(menu()).toBeNull();
  });

  it("closes on a click outside it", () => {
    renderNavbar();
    fireEvent.click(toggle());
    fireEvent.mouseDown(document.body);
    expect(menu()).toBeNull();
  });

  /** Otherwise the panel hangs over the page it just navigated to. */
  it("closes when one of its links is followed", () => {
    renderNavbar();
    fireEvent.click(toggle());
    fireEvent.click(
      within(menu() as HTMLElement).getByRole("link", { name: "Games" }),
    );
    expect(menu()).toBeNull();
  });

  it("closes on the current page's own link, which navigates nowhere", () => {
    renderNavbar("/games");
    fireEvent.click(toggle());
    fireEvent.click(
      within(menu() as HTMLElement).getByRole("link", { name: "Games" }),
    );
    expect(menu()).toBeNull();
  });
});

describe("header at narrow widths", () => {
  /**
   * Tailwind classes do not apply in jsdom, so "shown below sm" is read off
   * the utility classes: `hidden sm:…` is absent on a phone.
   */
  function shownBelowSm(el: Element | null | undefined): boolean {
    return !!el && !el.classList.contains("hidden");
  }

  it("gives the logo a label that survives below sm", () => {
    const { container } = renderNavbar();
    const logo = container.querySelector('a[href="/"]');
    const labels = [...(logo?.children ?? [])].filter(shownBelowSm);
    expect(labels.map((el) => el.textContent).join("")).toBeTruthy();
  });

  it("hides the inline links below sm, where the menu replaces them", () => {
    const { container } = renderNavbar();
    const inline = container.querySelector('a[href="/games"]')?.parentElement;
    expect(shownBelowSm(inline)).toBe(false);
    expect(inline?.className).toContain("sm:flex");
  });

  it("keeps the toggle out of the way from sm up", () => {
    renderNavbar();
    expect(toggle().parentElement?.className).toContain("sm:hidden");
  });
});
