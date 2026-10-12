import Link from "next/link";

export default function KioskRetired() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#061161] px-5">
      <div className="max-w-sm rounded-2xl bg-white p-7 text-center shadow-2xl">
        <h1 className="text-lg font-bold text-[#111318]">Attendance now uses a wall QR code</h1>
        <p className="mt-2 text-sm text-[#5F6368]">Workers sign in on their phone and scan the code at the office. The old kiosk screen is no longer used.</p>
        <Link href="/worker" className="mt-5 inline-block rounded-xl bg-[#061161] px-6 py-2.5 text-sm font-medium text-white">Worker sign in</Link>
      </div>
    </main>
  );
}
