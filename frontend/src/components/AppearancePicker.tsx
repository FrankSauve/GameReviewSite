import { useCallback, useRef, useState } from "react";
import { useDismiss } from "../hooks/useDismiss";
import { useTheme } from "../contexts/ThemeContext";
import { PALETTES, THEMES } from "../lib/theme";

const MENU_ID = "appearance-menu";

/**
 * Lives in the navbar rather than on the profile page: a signed-out visitor
 * cannot reach a profile, and the look is a viewer preference rather than
 * anything about the account.
 */
export function AppearancePicker() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, close);

  const { theme, palette, setTheme, setPalette } = useTheme();

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Change appearance"
        aria-expanded={open}
        aria-controls={MENU_ID}
        className="btn-icon w-9 h-9"
      >
        <PaletteIcon />
      </button>

      {open && (
        <div
          id={MENU_ID}
          className="absolute top-full right-0 mt-2 w-56 popover z-50 p-3 space-y-3"
        >
          <Group
            label="Theme"
            options={THEMES}
            current={theme}
            onPick={setTheme}
          />
          <Group
            label="Palette"
            options={PALETTES}
            current={palette}
            onPick={setPalette}
          />
        </div>
      )}
    </div>
  );
}

interface GroupProps<K extends string> {
  label: string;
  options: readonly { key: K; label: string }[];
  current: K;
  onPick: (key: K) => void;
}

function Group<K extends string>({
  label,
  options,
  current,
  onPick,
}: GroupProps<K>) {
  return (
    <div>
      <p className="field-label">{label}</p>
      <div className="grid grid-cols-2 gap-1">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => onPick(option.key)}
            aria-pressed={option.key === current}
            data-active={option.key === current}
            className="btn-quiet text-xs px-2 py-1.5"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PaletteIcon() {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 3a9 9 0 100 18h1.5a2.5 2.5 0 002.5-2.5 2.5 2.5 0 012.5-2.5H20a1 1 0 001-1 9 9 0 00-9-12z"
      />
      <circle cx="7.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
