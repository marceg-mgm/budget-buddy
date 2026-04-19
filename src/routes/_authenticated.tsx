import { createFileRoute, Outlet, redirect, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Receipt,
  BarChart3,
  Settings as SettingsIcon,
  LogOut,
  Wallet,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SetupBanner } from "@/components/setup-banner";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/expenses", label: "Expenses", icon: Receipt },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

function AuthenticatedLayout() {
  const { isLoading, user, signOut, isConfigured, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  useEffect(() => {
    if (!isLoading && isConfigured && !user) {
      navigate({ to: "/login" });
    }
  }, [isLoading, user, isConfigured, navigate]);

  if (!isConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="w-full max-w-2xl">
          <SetupBanner />
        </div>
      </div>
    );
  }

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex w-64 flex-col border-r bg-sidebar text-sidebar-foreground">
        <div className="h-16 flex items-center gap-2 px-6 border-b">
          <div className="h-8 w-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
            <Wallet className="h-4 w-4" />
          </div>
          <span className="font-semibold tracking-tight">Ledger</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t space-y-2">
          <div className="px-3 py-2 text-xs">
            <div className="font-medium truncate">{profile?.email ?? user.email}</div>
            <div className="text-muted-foreground">Currency: {profile?.currency ?? "CAD"}</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={async () => {
              await signOut();
              navigate({ to: "/login" });
            }}
          >
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 h-14 border-b bg-background z-40 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
            <Wallet className="h-3.5 w-3.5" />
          </div>
          <span className="font-semibold text-sm">Ledger</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen((o) => !o)}>
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>
      {mobileOpen && (
        <div className="md:hidden fixed top-14 inset-x-0 bottom-0 bg-background z-30 p-4 space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm hover:bg-accent"
              >
                <Icon className="h-4 w-4" /> {item.label}
              </Link>
            );
          })}
          <Button
            variant="ghost"
            className="w-full justify-start mt-4"
            onClick={async () => {
              await signOut();
              navigate({ to: "/login" });
            }}
          >
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      )}

      <main className="flex-1 md:ml-0 mt-14 md:mt-0 min-w-0">
        <div className="max-w-6xl mx-auto p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
