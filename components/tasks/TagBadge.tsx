"use client";

interface TagBadgeProps {
  name: string;
  color: string;
  size?: "sm" | "md";
  onRemove?: () => void;
}

export function TagBadge({ name, color, size = "sm", onRemove }: TagBadgeProps) {
  const sizeClasses = size === "sm" ? "text-[11px] px-2 py-0.5" : "text-xs px-2.5 py-1";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeClasses}`}
      style={{
        backgroundColor: `${color}18`,
        color: color,
        border: `1px solid ${color}30`,
      }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="ml-0.5 hover:opacity-70"
        >
          &times;
        </button>
      )}
    </span>
  );
}
