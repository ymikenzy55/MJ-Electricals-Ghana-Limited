// Lightweight skeleton loading components - show immediately while data loads.
// These render instantly and don't block the actual content from loading.

export function SkeletonRow({ cols = 5 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 animate-pulse rounded-full bg-[#DADDE6]" style={{ width: `${60 + Math.random() * 40}%` }} />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonTable({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded border border-[#DADDE6] bg-white">
      <table className="w-full text-sm">
        <thead className="bg-[#FAFAFC] text-left text-xs uppercase text-[#4A5060]">
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="px-4 py-2">
                <div className="h-3 w-20 animate-pulse rounded-full bg-[#DADDE6]" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <SkeletonRow key={i} cols={cols} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-[#DADDE6] bg-white p-5">
          <div className="mb-3 h-3 w-24 animate-pulse rounded-full bg-[#DADDE6]" />
          <div className="h-8 w-32 animate-pulse rounded-full bg-[#DADDE6]" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 animate-pulse rounded-full bg-[#DADDE6]" style={{ width: `${70 + Math.random() * 30}%` }} />
      ))}
    </div>
  );
}
