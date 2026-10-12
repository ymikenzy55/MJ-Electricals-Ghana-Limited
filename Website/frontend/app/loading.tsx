export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-7 sm:py-12 sm:px-6" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-56 animate-pulse rounded-full bg-surface" />
      <div className="mt-5 sm:mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-border">
            <div className="aspect-square animate-pulse bg-surface" />
            <div className="space-y-2 p-4"><div className="h-3 w-3/4 animate-pulse rounded bg-surface" /><div className="h-3 w-1/3 animate-pulse rounded bg-surface" /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
