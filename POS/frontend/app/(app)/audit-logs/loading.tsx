import { SkeletonTable } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="p-6">
      <div className="mb-4 h-7 w-48 animate-pulse rounded-full bg-[#DADDE6]" />
      <div className="mb-4 h-10 w-80 animate-pulse rounded-full bg-[#DADDE6]" />
      <SkeletonTable rows={8} cols={5} />
    </div>
  );
}
