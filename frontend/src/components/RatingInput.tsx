import { useId } from "react";
import {
  RATING_MAX,
  RATING_MIN,
  RATING_STEP,
  formatRating,
  ratingColor,
} from "../lib/rating";

interface RatingInputProps {
  value: number;
  onChange: (rating: number) => void;
  /** `sm` is the inline edit form on a review card, `md` the write form. */
  size?: "sm" | "md";
}

/**
 * A range input rather than a row of buttons: `step` makes an off-scale value
 * unrepresentable rather than merely validated, and the keyboard handling comes
 * for free.
 */
export function RatingInput({ value, onChange, size = "md" }: RatingInputProps) {
  const id = useId();
  const readout = size === "md" ? "text-4xl" : "text-2xl";

  return (
    <div className="flex items-center gap-4">
      <div className="flex-1">
        <input
          id={id}
          type="range"
          min={RATING_MIN}
          max={RATING_MAX}
          step={RATING_STEP}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full accent-amber-500 cursor-pointer"
          aria-label="Score out of 10"
          aria-valuetext={`${formatRating(value)} out of ${RATING_MAX}`}
        />
        <div className="flex justify-between text-sm text-gray-600 mt-0.5 select-none">
          <span>{RATING_MIN}</span>
          <span>{RATING_MAX}</span>
        </div>
      </div>

      <div className="flex items-baseline gap-1 shrink-0 w-20 justify-end">
        <span className={`${readout} font-extrabold tabular-nums ${ratingColor(value)}`}>
          {formatRating(value)}
        </span>
        <span className="text-sm text-gray-600">/ {RATING_MAX}</span>
      </div>
    </div>
  );
}
