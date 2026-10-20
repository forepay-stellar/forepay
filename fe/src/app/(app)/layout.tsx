import { AppShell } from "@/components/layout/AppShell";
import { WalletGuard } from "@/components/layout/WalletGuard";

// Every screen after onboarding: a connected wallet is required, and the AppShell frames the screen.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <WalletGuard>
      <AppShell>{children}</AppShell>
    </WalletGuard>
  );
}
