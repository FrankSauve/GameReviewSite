interface LabelChipsProps {
  labels?: string[];
  /** How many to show before collapsing the rest into a "+N". */
  limit?: number;
  className: string;
  /** Applied to the "+N" chip, which is deliberately quieter than the rest. */
  overflowClassName?: string;
}

export function LabelChips({
  labels,
  limit,
  className,
  overflowClassName = "bg-gray-800 text-gray-500 border border-gray-700",
}: LabelChipsProps) {
  if (!labels || labels.length === 0) return null;

  const shown = limit ? labels.slice(0, limit) : labels;
  const hidden = labels.length - shown.length;

  return (
    <>
      {shown.map((label) => (
        <span key={label} className={className}>
          {label}
        </span>
      ))}
      {hidden > 0 && (
        <span className={overflowClassName} title={labels.join(", ")}>
          +{hidden}
        </span>
      )}
    </>
  );
}
