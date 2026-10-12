import type { Metadata } from "next";
import TrackClient from "./TrackClient";

export const metadata: Metadata = {
  title: "Track your order",
  description: "Check the status of your MJ Electricals order with your order number and email or phone number.",
  robots: { index: false },
};

export default function TrackPage() {
  return <TrackClient />;
}
