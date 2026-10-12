/** Shared helpers for the Website Management pages. */

export function orderStatusColor(status: string): string {
  switch (status) {
    case "PENDING": return "bg-[#B7791F]/10 text-[#B7791F]";
    case "CONFIRMED": return "bg-[#EDEFF9] text-[#061161]";
    case "PROCESSING": return "bg-[#EDEFF9] text-[#0A1C8C]";
    case "SHIPPED": return "bg-[#2563EB]/10 text-[#2563EB]";
    case "DELIVERED": return "bg-[#16803C]/10 text-[#16803C]";
    case "CANCELLED": return "bg-[#C62828]/10 text-[#C62828]";
    default: return "bg-[#8A8F98]/10 text-[#5F6368]";
  }
}

export const ORDER_STATUSES = [
  "PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED",
];

/** Moves the store may make from each status (mirrors the website backend). */
export const NEXT_STATUSES: Record<string, string[]> = {
  PENDING: ["CONFIRMED", "PROCESSING", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "SHIPPED", "CANCELLED"],
  PROCESSING: ["SHIPPED", "DELIVERED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

/** 12-hour date-time format, e.g. "Sep 15, 2026, 2:43 PM". */
export function fmt12(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}
