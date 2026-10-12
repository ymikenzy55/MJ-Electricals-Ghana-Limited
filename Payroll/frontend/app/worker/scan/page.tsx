"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { api, ApiError, fmtTime, type ScanResult } from "@/lib/api";
import { getDeviceId, getWorkerToken } from "@/lib/worker";
import { flushScanQueue, isNetworkError, queueScan, readHomeCache } from "@/lib/offline-scan";
import type { WorkerHome } from "@/lib/api";
import WorkerShell from "@/components/WorkerShell";

type Loc = { lat: number; lng: number; accuracy: number };
type Perm = "checking" | "prompt" | "granted" | "denied" | "unsupported" | "insecure";

const PREFIX = "MJATT1.";

function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000, r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export default function WorkerScanPage() {
  const [perm, setPerm] = useState<Perm>("checking");
  const [loc, setLoc] = useState<Loc | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [camOn, setCamOn] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; data?: ScanResult } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const watchRef = useRef<number | null>(null);
  const handlingRef = useRef(false);

  // ---- location -----------------------------------------------------------
  const startWatch = useCallback(() => {
    if (watchRef.current !== null) return;
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => {
        setPerm("granted");
        setLocError(null);
        setLoc({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setPerm("denied");
        else setLocError("Can't get a location fix yet. Move near a window or outside.");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.isSecureContext) { setPerm("insecure"); return; }
    if (!navigator.geolocation) { setPerm("unsupported"); return; }
    let cancelled = false;
    navigator.permissions?.query({ name: "geolocation" as PermissionName }).then((st) => {
      if (cancelled) return;
      if (st.state === "granted") { setPerm("granted"); startWatch(); }
      else if (st.state === "denied") setPerm("denied");
      else setPerm("prompt");
      st.onchange = () => {
        if (st.state === "granted") { setPerm("granted"); startWatch(); }
        else if (st.state === "denied") setPerm("denied");
      };
    }).catch(() => setPerm("prompt"));
    if (!navigator.permissions) setPerm("prompt");
    return () => {
      cancelled = true;
      if (watchRef.current !== null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; }
    };
  }, [startWatch]);

  function enableLocation() { setLocError(null); startWatch(); }

  // ---- camera -------------------------------------------------------------
  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const freshPosition = useCallback((): Promise<Loc> => new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject(e),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  }), []);

  const submit = useCallback(async (code: string) => {
    const token = getWorkerToken();
    if (!token) { window.location.href = "/worker"; return; }
    setBusy(true);
    try {
      let pos: Loc;
      try { pos = await freshPosition(); }
      catch { pos = loc as Loc; }
      if (!pos) { setResult({ ok: false, text: "We couldn't read your location. Turn on location and try again." }); return; }
      const office = readHomeCache<WorkerHome>()?.data.office;
      if (!navigator.onLine && office) {
        const d = distanceM(pos.lat, pos.lng, office.lat, office.lng);
        if (d > office.radius_m + Math.min(pos.accuracy || 0, 50)) {
          setResult({ ok: false, text: `You're about ${d >= 1000 ? (d / 1000).toFixed(1) + " km" : Math.round(d) + " m"} away from the company. Please go to the company and scan again.` });
          return;
        }
      }
      try {
        const data = await api.workerScan(token, { code, lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy, device_id: getDeviceId() });
        setResult({ ok: true, text: data.message, data });
        flushScanQueue();
      } catch (e) {
        if (!isNetworkError(e)) throw e;
        queueScan({ code, lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy, device_id: getDeviceId() });
        setResult({ ok: true, text: "No internet right now, so your scan is saved on this phone. It is sent automatically when you have signal, with the time you scanned." });
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { window.location.href = "/worker"; return; }
      setResult({ ok: false, text: e instanceof ApiError ? e.message : "Could not reach the server. Try again." });
    } finally { setBusy(false); }
  }, [freshPosition, loc]);

  const tick = useCallback(() => {
    const v = videoRef.current, c = canvasRef.current;
    if (v && c && v.readyState === v.HAVE_ENOUGH_DATA && !handlingRef.current) {
      const w = v.videoWidth, h = v.videoHeight;
      const scale = Math.min(1, 640 / Math.max(w, h));
      c.width = Math.round(w * scale); c.height = Math.round(h * scale);
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const img = ctx.getImageData(0, 0, c.width, c.height);
        const q = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
        if (q && q.data) {
          handlingRef.current = true;
          if (q.data.startsWith(PREFIX)) {
            stopCamera();
            submit(q.data).finally(() => { handlingRef.current = false; });
            return;
          }
          setResult({ ok: false, text: "That isn't the MJ Electricals attendance code. Scan the one on the office wall." });
          stopCamera();
          handlingRef.current = false;
          return;
        }
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [stopCamera, submit]);

  async function startCamera() {
    setResult(null); setCamError(null);
    if (!navigator.mediaDevices?.getUserMedia) { setCamError("This browser can't open the camera."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      setCamOn(true);
      requestAnimationFrame(async () => {
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        v.setAttribute("playsinline", "true");
        try { await v.play(); } catch { /* autoplay guard */ }
        rafRef.current = requestAnimationFrame(tick);
      });
    } catch (e) {
      const name = (e as DOMException).name;
      setCamError(name === "NotAllowedError" ? "Camera access is blocked. Allow the camera for this site in your browser settings, then try again." : "Could not start the camera.");
    }
  }

  const locReady = perm === "granted" && !!loc;
  const weak = loc && loc.accuracy > 200;

  return (
    <WorkerShell title="Scan attendance" back>
      {/* Location gate */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${locReady ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold text-[#111318]">
              {locReady ? "Location is on" : perm === "denied" ? "Location is blocked" : "Location needed"}
            </p>
            {perm === "checking" && <p className="text-[#5F6368]">Checking…</p>}
            {perm === "insecure" && <p className="text-[#5F6368]">Scanning needs a secure (https) connection. Open the attendance site using its https address.</p>}
            {perm === "unsupported" && <p className="text-[#5F6368]">This device can&apos;t share its location, so it can&apos;t be used to scan.</p>}
            {perm === "prompt" && (
              <>
                <p className="text-[#5F6368]">Your location is recorded with each scan so the office can confirm you are at work.</p>
                <button onClick={enableLocation} className="mt-2.5 rounded-lg bg-[#061161] px-4 py-2 text-xs font-semibold text-white">Turn on location</button>
              </>
            )}
            {perm === "denied" && <p className="text-[#5F6368]">Allow location for this site in your browser settings, then reload this page.</p>}
            {perm === "granted" && !loc && <p className="text-[#5F6368]">Getting your position…{locError ? ` ${locError}` : ""}</p>}
            {locReady && <p className={weak ? "text-amber-700" : "text-[#5F6368]"}>{weak ? `Signal is weak (about ${Math.round(loc!.accuracy)} m). Step outside for a better fix.` : `Position found (accurate to about ${Math.round(loc!.accuracy)} m).`}</p>}
          </div>
        </div>
      </section>

      {/* Result */}
      {result && (
        <section role="alert" className={`mt-4 rounded-2xl p-4 shadow-sm ${result.ok ? "bg-emerald-50 ring-1 ring-emerald-200" : "bg-red-50 ring-1 ring-red-200"}`}>
          <div className="flex items-start gap-3">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${result.ok ? "bg-emerald-600" : "bg-red-600"} text-white`}>
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{result.ok ? <path d="M20 6L9 17l-5-5" /> : <path d="M18 6L6 18M6 6l12 12" />}</svg>
            </span>
            <div className="text-sm">
              <p className={`font-bold ${result.ok ? "text-emerald-800" : "text-red-800"}`}>{result.ok ? (!result.data ? "Saved offline" : result.data.kind === "CHECK_OUT" ? "Checked out" : "Checked in") : "Scan not accepted"}</p>
              <p className={result.ok ? "text-emerald-700" : "text-red-700"}>{result.text}</p>
              {result.data && <p className="mt-1 text-xs text-emerald-700">Recorded at {fmtTime(result.data.at)} · {Math.round(result.data.distance_m)} m from the office</p>}
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            {result.ok ? <Link href="/worker/home" className="rounded-lg bg-[#061161] px-4 py-2 text-xs font-semibold text-white">Back to home</Link>
              : <button onClick={startCamera} className="rounded-lg bg-[#061161] px-4 py-2 text-xs font-semibold text-white">Scan again</button>}
          </div>
        </section>
      )}

      {/* Scanner */}
      {!result?.ok && (
        <section className="mt-4">
          <div className="relative overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: "1 / 1" }}>
            {camOn ? (
              <>
                <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
                <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/80" />
                <p className="absolute inset-x-0 bottom-3 text-center text-xs font-medium text-white">Point at the QR code on the wall</p>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-white/80">
                {busy ? <p className="text-sm">Checking your scan…</p> : (
                  <>
                    <svg className="h-12 w-12" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 7V5a1 1 0 011-1h2M17 4h2a1 1 0 011 1v2M20 17v2a1 1 0 01-1 1h-2M7 20H5a1 1 0 01-1-1v-2" /><rect x="8" y="8" width="8" height="8" rx="1" /></svg>
                    <p className="text-sm">{locReady ? "Ready. Open the camera to scan." : "Turn on location first."}</p>
                  </>
                )}
              </div>
            )}
            <canvas ref={canvasRef} className="hidden" />
          </div>
          {camError && <p className="mt-2 text-sm text-red-700" role="alert">{camError}</p>}
          {camOn ? (
            <button onClick={stopCamera} className="mt-3 w-full rounded-xl border border-[#E6E7EB] bg-white py-3 text-sm font-semibold text-[#111318]">Cancel</button>
          ) : (
            <button onClick={startCamera} disabled={!locReady || busy} className="mt-3 w-full rounded-xl bg-[#061161] py-3 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? "Please wait…" : "Open camera and scan"}
            </button>
          )}
          <p className="mt-3 text-center text-xs text-[#8A8F98]">Only scans made inside this page count. A photo or a scan from another app is not accepted.</p>
        </section>
      )}
    </WorkerShell>
  );
}
