"use client";

import { useMemo, useState } from "react";

export const inputCls =
  "h-11 w-full rounded-full border border-border bg-white px-4 text-sm outline-none focus:border-primary";
export const labelCls = "mb-1.5 block text-xs font-semibold text-muted";

/* --------------------------- Password input --------------------------- */

function strengthOf(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string; cls: string } {
  if (!pw) return { score: 0, label: "", cls: "" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const capped = Math.min(4, Math.max(1, score)) as 1 | 2 | 3 | 4;
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  const cls = ["", "bg-error", "bg-[#B26A00]", "bg-[#3D5AFE]", "bg-success"];
  return { score: capped, label: labels[capped], cls: cls[capped] };
}

export function PasswordInput({
  value,
  onChange,
  required = false,
  minLength,
  showStrength = false,
  placeholder = "Enter your password",
  autoComplete,
  className = inputCls,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  minLength?: number;
  showStrength?: boolean;
  placeholder?: string;
  autoComplete?: string;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);
  const s = useMemo(() => strengthOf(value), [value]);

  return (
    <div>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          required={required}
          minLength={minLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={`${className} pr-11`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          aria-label={visible ? "Hide password" : "Show password"}
          title={visible ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex items-center pr-4 text-muted hover:text-ink"
        >
          {visible ? (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
              <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
              <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
              <line x1="2" y1="2" x2="22" y2="22" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
      {showStrength && value.length > 0 && (
        <div className="mt-2">
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${i <= s.score ? s.cls : "bg-border"}`}
              />
            ))}
          </div>
          <p className="mt-1 text-[11px] font-medium text-muted">
            Password strength: <span className="font-bold text-ink">{s.label}</span>
          </p>
        </div>
      )}
    </div>
  );
}

/* ---------------------------- Phone input ----------------------------- */

/** Ghana phone field, fixed +233 prefix; user types the remaining digits.
 *  `value`/`onChange` hold the FULL number (e.g. "+233241234567"). */
export function PhoneInput({
  value,
  onChange,
  required = false,
  placeholder = "Enter phone number",
  className = inputCls,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const digits = value.replace(/^\+233/, "").replace(/\D/g, "").slice(0, 9);

  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const d = e.target.value.replace(/\D/g, "").slice(0, 9);
    onChange(`+233${d}`);
  }

  return (
    <div className={`${className} flex items-center gap-0 overflow-hidden p-0`}>
      <span className="flex h-full items-center border-r border-border bg-surface px-3 text-sm font-semibold text-ink">
        +233
      </span>
      <input
        type="tel"
        inputMode="numeric"
        required={required}
        minLength={9}
        maxLength={9}
        value={digits}
        onChange={handle}
        placeholder={placeholder}
        className="h-full flex-1 border-0 bg-transparent px-3 text-sm outline-none"
      />
    </div>
  );
}
