interface StarRatingProps {
  rating: number; // 0–10
  size?: "sm" | "md" | "lg";
  showNumber?: boolean;
}

export function StarRating({ rating, size = "md", showNumber = true }: StarRatingProps) {
  const stars = rating / 2; // convert 0-10 to 0-5
  const fullStars = Math.floor(stars);
  const hasHalf = stars - fullStars >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);

  const sizeClasses = {
    sm: "w-3.5 h-3.5",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };
  const textClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  const starClass = sizeClasses[size];

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: fullStars }).map((_, i) => (
          <StarFull key={`full-${i}`} className={starClass} />
        ))}
        {hasHalf && <StarHalf className={starClass} />}
        {Array.from({ length: emptyStars }).map((_, i) => (
          <StarEmpty key={`empty-${i}`} className={starClass} />
        ))}
      </div>
      {showNumber && (
        <span className={`font-semibold text-amber-400 ${textClasses[size]}`}>
          {rating.toFixed(1)}
        </span>
      )}
    </div>
  );
}

function StarFull({ className }: { className: string }) {
  return (
    <svg className={`${className} text-amber-400`} viewBox="0 0 20 20" fill="currentColor">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.163c.969 0 1.371 1.24.588 1.81l-3.369 2.448a1 1 0 00-.364 1.118l1.286 3.957c.3.921-.755 1.688-1.54 1.118l-3.369-2.448a1 1 0 00-1.175 0l-3.369 2.448c-.784.57-1.838-.197-1.539-1.118l1.285-3.957a1 1 0 00-.364-1.118L2.05 9.384c-.783-.57-.38-1.81.588-1.81h4.163a1 1 0 00.95-.69l1.286-3.957z" />
    </svg>
  );
}

function StarHalf({ className }: { className: string }) {
  return (
    <svg className={`${className} text-amber-400`} viewBox="0 0 20 20">
      <defs>
        <linearGradient id="half-grad">
          <stop offset="50%" stopColor="currentColor" />
          <stop offset="50%" stopColor="transparent" />
        </linearGradient>
      </defs>
      <path
        fill="url(#half-grad)"
        stroke="currentColor"
        strokeWidth="0.5"
        d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.163c.969 0 1.371 1.24.588 1.81l-3.369 2.448a1 1 0 00-.364 1.118l1.286 3.957c.3.921-.755 1.688-1.54 1.118l-3.369-2.448a1 1 0 00-1.175 0l-3.369 2.448c-.784.57-1.838-.197-1.539-1.118l1.285-3.957a1 1 0 00-.364-1.118L2.05 9.384c-.783-.57-.38-1.81.588-1.81h4.163a1 1 0 00.95-.69l1.286-3.957z"
      />
    </svg>
  );
}

function StarEmpty({ className }: { className: string }) {
  return (
    <svg
      className={`${className} text-gray-600`}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.163c.969 0 1.371 1.24.588 1.81l-3.369 2.448a1 1 0 00-.364 1.118l1.286 3.957c.3.921-.755 1.688-1.54 1.118l-3.369-2.448a1 1 0 00-1.175 0l-3.369 2.448c-.784.57-1.838-.197-1.539-1.118l1.285-3.957a1 1 0 00-.364-1.118L2.05 9.384c-.783-.57-.38-1.81.588-1.81h4.163a1 1 0 00.95-.69l1.286-3.957z" />
    </svg>
  );
}
