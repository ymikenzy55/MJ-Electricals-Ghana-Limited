export default function Logo({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/MJ_Logo.jpg" alt="MJ Electricals" className="h-9 w-9 flex-shrink-0 rounded-lg" />
      {!compact && (
        <span className="leading-tight">
          <span className={`block text-[15px] font-black tracking-wide ${light ? "text-white" : "text-primary"}`}>
            MJ ELECTRICALS
          </span>
          <span className={`block text-[10px] font-medium tracking-[0.18em] ${light ? "text-white/60" : "text-muted"}`}>
            GHANA LIMITED
          </span>
        </span>
      )}
    </span>
  );
}
