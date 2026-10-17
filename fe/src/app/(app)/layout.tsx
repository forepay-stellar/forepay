import { WalletGuard } from "@/components/layout/WalletGuard";

// The AppShell (top nav, tab bar) arrives with #20 and #21. For now the group only keeps a creator
// without a connected wallet out.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <WalletGuard>{children}</WalletGuard>;
}
