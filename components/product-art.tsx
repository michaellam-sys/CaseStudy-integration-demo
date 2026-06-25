export function ProductArt({
  color,
  compact = false,
}: {
  color: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`relative mx-auto rounded-[2rem] border border-black/10 shadow-sm ${
        compact ? "h-28 w-20" : "h-48 w-36"
      }`}
      style={{ backgroundColor: color }}
      aria-hidden="true"
    >
      <div className="absolute left-4 top-4 h-8 w-8 rounded-xl bg-black/20" />
      <div className="absolute inset-x-8 top-3 h-2 rounded-full bg-white/35" />
      <div className="absolute inset-x-5 bottom-6 h-8 rounded-2xl bg-white/15" />
    </div>
  );
}
