export default function Loading() {
  return (
    <div className="p-6">
      <div className="mb-6 h-8 w-48 animate-pulse rounded-full bg-[#DADDE6]" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl border border-[#DADDE6] bg-white" />
        ))}
      </div>
    </div>
  );
}
