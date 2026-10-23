import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { privacy } from "@/content/legal";

export const metadata: Metadata = {
  title: "Forepay privacy policy",
  description: "What Forepay reads from your Google account, what happens to it, and what becomes public.",
  alternates: { canonical: "/privacy" },
};

export default function Privacy() {
  return <LegalPage doc={privacy} />;
}
