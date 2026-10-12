"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api, type QrInfo } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Card, Modal, PageHeader, Spinner } from "@/components/ui";
import AttendanceTabs from "@/components/AttendanceTabs";

export default function QrPage() {
  const { token } = useAuth();
  const [info, setInfo] = useState<QrInfo | null>(null);
  const [img, setImg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (token) api.qr(token).then(setInfo).catch((e) => setError(e.message)); }, [token]);
  useEffect(() => {
    if (!info) return;
    QRCode.toDataURL(info.payload, { width: 900, margin: 2, errorCorrectionLevel: "H", color: { dark: "#061161", light: "#FFFFFF" } }).then(setImg).catch(() => setError("Could not draw the code"));
  }, [info]);

  async function rotate() {
    if (!token) return;
    setBusy(true);
    try { setInfo(await api.rotateQr(token)); setConfirm(false); } catch (e) { setError(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="print:hidden"><PageHeader title="Attendance" subtitle="One code on the office wall. Workers scan it inside this system." /><AttendanceTabs /></div>
      {error && <p className="mb-4 rounded-lg bg-error/10 px-3 py-2 text-sm text-error print:hidden">{error}</p>}
      {!info ? <Spinner /> : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
          <div className="rounded-2xl border border-border p-6 text-center print:border-0">
            <p className="text-lg font-black text-primary">{info.office_name}</p>
            <p className="mb-3 text-sm text-muted">Scan to record your attendance</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {img ? <img src={img} alt="Attendance QR code" className="mx-auto w-full max-w-[22rem]" /> : <Spinner />}
            <p className="mt-3 text-xs text-faint">Open the MJ Attendance app, sign in and tap Scan. Other scanners will not work.</p>
          </div>
          <div className="space-y-4 print:hidden">
            <Card title="How it works">
              <ol className="list-decimal space-y-1.5 px-5 py-4 pl-9 text-sm text-muted">
                <li>Print this page and stick the code on the wall at the office.</li>
                <li>Workers sign in on their phone and open Scan inside the app.</li>
                <li>Each scan records the time and the phone&apos;s location. Scans too far from the office are refused.</li>
              </ol>
            </Card>
            <Card title="Office location">
              <div className="space-y-1 px-5 py-4 text-sm text-muted">
                <p>Scans must be within <b className="text-ink">{info.radius_m} m</b> of the office.</p>
                <p>{info.lat.toFixed(6)}, {info.lng.toFixed(6)} {info.maps_url && <a className="ml-2 font-semibold text-primary hover:underline" href={info.maps_url} target="_blank" rel="noopener noreferrer">Open map</a>}</p>
                <p>Change the location or distance in Settings.</p>
              </div>
            </Card>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => window.print()}>Print code</Button>
              <Button variant="secondary" onClick={() => setConfirm(true)}>Generate a new code</Button>
            </div>
          </div>
        </div>
      )}
      {confirm && (
        <Modal title="Generate a new code?" onClose={() => setConfirm(false)}>
          <p className="text-sm text-muted">The printed code on the wall will stop working straight away. Use this only if the code was copied or leaked, then print and replace it.</p>
          <div className="mt-5 flex justify-end gap-3"><Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button><Button variant="danger" onClick={rotate} disabled={busy}>{busy ? "Working…" : "Generate new code"}</Button></div>
        </Modal>
      )}
    </div>
  );
}
