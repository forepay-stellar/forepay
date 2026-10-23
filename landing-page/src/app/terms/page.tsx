import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { terms } from "@/content/legal";

export const metadata: Metadata = {
  title: "Forepay terms of service",
  description: "The terms for using Forepay, a demo on Stellar testnet.",
  alternates: { canonical: "/terms" },
};

export default function Terms() {
  return <LegalPage doc={terms} />;
}
