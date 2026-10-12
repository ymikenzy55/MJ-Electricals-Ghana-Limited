import AppShell from "@/components/AppShell";
import { OfflineProvider } from "@/lib/offline-context";
import { UserProvider } from "@/lib/user-context";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <OfflineProvider>
        <AppShell>{children}</AppShell>
      </OfflineProvider>
    </UserProvider>
  );
}
