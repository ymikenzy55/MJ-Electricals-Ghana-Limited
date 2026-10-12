import type { ReactNode } from "react";
import AuthIllustration from "./AuthIllustration";

/**
 * Sign in / sign up layout. On large screens the illustration fills the left
 * half; phones and tablets show only the form.
 */
export default function AuthShell({ children, heading, text }: { children: ReactNode; heading: string; text: string }) {
  return (
    <div className="lg:grid lg:min-h-[calc(100vh-9rem)] lg:grid-cols-2">
      <aside className="hidden flex-col items-center justify-center gap-6 bg-[#F6F7FB] px-10 py-12 lg:flex">
        <AuthIllustration className="w-full max-w-lg" />
        <div className="max-w-md text-center">
          <h2 className="text-2xl font-black text-ink">{heading}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
        </div>
      </aside>
      <div className="flex items-start justify-center lg:items-center">{children}</div>
    </div>
  );
}
