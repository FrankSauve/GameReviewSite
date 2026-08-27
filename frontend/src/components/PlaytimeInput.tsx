import { useId } from "react";
import { HOURS_PLAYED_MAX, yearOptions } from "../lib/playtime";

interface PlaytimeInputProps {
  year: number;
  hours: string;
  onYearChange: (year: number) => void;
  /**
   * Hours is held as a string, not a number.
   *
   * A number would have to represent the empty field and the half-typed "1." as
   * something, and every candidate is wrong: 0 is a value the API refuses, and NaN
   * makes the field fight the person typing in it. The parse happens on submit.
   */
  onHoursChange: (hours: string) => void;
  size?: "sm" | "md";
}

export function PlaytimeInput({
  year,
  hours,
  onYearChange,
  onHoursChange,
  size = "md",
}: PlaytimeInputProps) {
  const yearId = useId();
  const hoursId = useId();
  const label = size === "md" ? "text-sm text-gray-400" : "text-xs text-gray-400";

  return (
    <div className="flex gap-3">
      <div className="flex-1">
        <label htmlFor={yearId} className={`block font-medium mb-1.5 ${label}`}>
          Year played
        </label>
        <select
          id={yearId}
          value={year}
          onChange={(e) => onYearChange(Number(e.target.value))}
          className="input-field w-full"
          required
        >
          {yearOptions().map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1">
        <label htmlFor={hoursId} className={`block font-medium mb-1.5 ${label}`}>
          Hours played
        </label>
        <input
          id={hoursId}
          type="number"
          inputMode="decimal"
          min={0.1}
          max={HOURS_PLAYED_MAX}
          step={0.5}
          value={hours}
          onChange={(e) => onHoursChange(e.target.value)}
          placeholder="e.g. 42"
          className="input-field w-full"
          required
        />
      </div>
    </div>
  );
}
