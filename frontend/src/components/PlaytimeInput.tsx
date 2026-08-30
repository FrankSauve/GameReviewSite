import { useId } from "react";
import { yearOptions } from "../lib/playtime";

interface PlaytimeInputProps {
  year: number;
  hours: string;
  onYearChange: (year: number) => void;
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
  const label = size === "md" ? "text-base text-gray-400" : "text-sm text-gray-400";

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
          type="text"
          inputMode="decimal"
          value={hours}
          onChange={(e) => {
            const val = e.target.value;
            // allow empty, digits, and up to one decimal point with up to 2 decimals
            if (/^\d*\.?\d{0,2}$/.test(val)) {
              onHoursChange(val);
            }
          }}
          placeholder="e.g. 42"
          className="input-field w-full"
          required
        />
      </div>
    </div>
  );
}
