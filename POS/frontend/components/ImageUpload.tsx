"use client";

/**
 * Cloudinary unsigned-upload button for product images.
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
 *   NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET  (unsigned preset "mj_products")
 *
 * The API secret never reaches the browser, uploads go straight to
 * Cloudinary's unsigned endpoint.
 */

import { useRef, useState } from "react";

const CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";
const PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "";

export function ImageUpload({
  onUploaded,
  onError,
  className = "",
}: {
  onUploaded: (url: string) => void;
  onError?: (msg: string) => void;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const configured = Boolean(CLOUD && PRESET);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      onError?.("Please choose an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      onError?.("Image must be under 5 MB");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("upload_preset", PRESET);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Upload failed");
      onUploaded(data.secure_url as string);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      <button
        type="button"
        disabled={busy || !configured}
        onClick={() => inputRef.current?.click()}
        title={configured ? "Upload an image file" : "Cloudinary is not configured"}
        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#DADDE6] bg-white px-4 py-2 text-[13px] font-medium text-[#061161] transition hover:bg-[#FAFAFC] disabled:opacity-50 ${className}`}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="M17 8l-5-5-5 5" />
          <path d="M12 3v12" />
        </svg>
        {busy ? "Uploading…" : "Upload"}
      </button>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* ImagePicker, picker-first image field: preview + upload button,    */
/* with an optional "paste URL" fallback.                               */
/* ------------------------------------------------------------------ */

export function ImagePicker({
  value,
  onChange,
  onError,
}: {
  value: string;
  onChange: (url: string) => void;
  onError?: (msg: string) => void;
}) {
  const [showUrl, setShowUrl] = useState(false);
  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#DADDE6] bg-[#EDEFF9]">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="Product" className="h-full w-full object-cover" />
          ) : (
            <svg className="h-6 w-6 text-[#6B7183]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" />
            </svg>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <ImageUpload onUploaded={onChange} onError={onError} />
          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => setShowUrl((s) => !s)}
              className="font-medium text-[#4A5060] underline-offset-2 hover:text-[#061161] hover:underline"
            >
              {showUrl ? "Hide URL field" : "Paste image URL instead"}
            </button>
            {value && (
              <button
                type="button"
                onClick={() => onChange("")}
                className="font-medium text-[#C62828] hover:underline"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>
      {showUrl && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://example.com/product.jpg"
          className="mt-2 w-full rounded-full border border-[#DADDE6] px-4 py-2 text-sm"
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* MultiImagePicker, up to `max` extra website images, each with an   */
/* optional label (e.g. a bulb's glow colour, a cable's colour). The   */
/* label rides along to the storefront and into orders.                 */
/* ------------------------------------------------------------------ */

export interface ExtraImage {
  url: string;
  label: string;
}

export function MultiImagePicker({
  value,
  onChange,
  onError,
  max = 5,
}: {
  value: ExtraImage[];
  onChange: (imgs: ExtraImage[]) => void;
  onError?: (msg: string) => void;
  max?: number;
}) {
  function setLabel(i: number, label: string) {
    onChange(value.map((img, j) => (j === i ? { ...img, label } : img)));
  }
  function remove(i: number) {
    onChange(value.filter((_, j) => j !== i));
  }
  function addUrl(url: string) {
    if (!url || value.length >= max) return;
    onChange([...value, { url, label: "" }]);
  }

  return (
    <div>
      <div className="space-y-2">
        {value.map((img, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-[#DADDE6] bg-white p-2">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#DADDE6] bg-[#EDEFF9]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.label || `Extra image ${i + 1}`} className="h-full w-full object-cover" />
            </div>
            <input
              value={img.label}
              onChange={(e) => setLabel(i, e.target.value)}
              placeholder="Label (optional), e.g. Warm White, Red 1.5mm"
              maxLength={100}
              className="flex-1 rounded border border-[#DADDE6] px-3 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remove image ${i + 1}`}
              className="flex h-7 w-7 items-center justify-center rounded-full text-[#6B7183] hover:bg-[#C62828]/10 hover:text-[#C62828]"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
      {value.length < max && (
        <div className="mt-2 flex items-center gap-3">
          <ImageUpload onUploaded={addUrl} onError={onError} />
          <span className="text-xs text-[#6B7183]">
            {value.length}/{max} extra images, shown on the website only
          </span>
        </div>
      )}
    </div>
  );
}
