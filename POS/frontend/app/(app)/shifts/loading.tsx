export default function Loading() {
  return (
    <div className="min-h-full bg-[#EDEFF9]">
      <div className="border-b border-[#DADDE6] bg-white px-6 py-4">
        <div className="h-6 w-56 animate-pulse rounded-full bg-[#DADDE6]" />
        <div className="mt-2 h-3 w-80 animate-pulse rounded-full bg-[#EDEFF9]" />
      </div>
      <div className="p-6">
        <div className="mb-6 h-44 animate-pulse rounded-xl bg-white" />
        <div className="h-64 animate-pulse rounded-xl bg-white" />
      </div>
    </div>
  );
}
