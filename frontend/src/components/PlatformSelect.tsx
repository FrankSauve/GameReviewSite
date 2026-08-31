import { useId } from "react";
import { PLATFORMS } from "../lib/platforms";

interface PlatformSelectProps {
  value: string;
  onChange: (platform: string) => void;
  size?: "sm" | "md";
}

/**
 * The same fixed list for every game: a review records where its author played,
 * not what the game shipped on. "" is no platform, which the server stores null.
 */
export function PlatformSelect({
  value,
  onChange,
  size = "md",
}: PlatformSelectProps) {
  const id = useId();
  const label =
    size === "md" ? "text-base text-gray-400" : "text-sm text-gray-400";

  return (
    <div>
      <label htmlFor={id} className={`block font-medium mb-1.5 ${label}`}>
        Platform
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-field w-full"
      >
        <option value="">Not recorded</option>
        {PLATFORMS.map((platform) => (
          <option key={platform} value={platform}>
            {platform}
          </option>
        ))}
      </select>
    </div>
  );
}
