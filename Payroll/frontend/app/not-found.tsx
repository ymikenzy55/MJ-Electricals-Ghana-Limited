import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <p className="text-6xl font-black text-primary">404</p>
      <h1 className="mt-4 text-2xl font-black text-ink">Page not found</h1>
      <Link href="/dashboard" className="mt-6 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-white hover:bg-primary-hover">
        Back to Dashboard
      </Link>
    </div>
  );
}
