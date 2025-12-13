// components/AppShell.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import LogoutButton from "@/components/LogoutButton";

type Props = {
  userEmail: string;
  children: ReactNode;
};

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode; // ✅ évite JSX.Element (cause de ton erreur)
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function IconSparkles(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={props.className} aria-hidden="true">
      <path
        d="M12 2l1.2 4.1c.2.8.8 1.4 1.6 1.6L19 9l-4.2 1.3c-.8.2-1.4.8-1.6 1.6L12 16l-1.2-4.1c-.2-.8-.8-1.4-1.6-1.6L5 9l4.2-1.3c.8-.2 1.4-.8 1.6-1.6L12 2z"
        fill="currentColor"
      />
      <path
        d="M6 14l.6 2.1c.1.4.4.7.8.8L9.5 17l-2.1.7c-.4.1-.7.4-.8.8L6 20l-.6-1.5c-.1-.4-.4-.7-.8-.8L3 17l1.6-.1c.4-.1.7-.4.8-.8L6 14z"
        fill="currentColor"
        opacity="0.7"
      />
    </svg>
  );
}

function IconTarget(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={props.className} aria-hidden="true">
      <path
        d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zm0-2a7 7 0 1 0 0-14 7 7 0 0 0 0 14z"
        fill="currentColor"
      />
      <path d="M12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-2a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

function IconPlus(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={props.className} aria-hidden="true">
      <path d="M11 5a1 1 0 0 1 2 0v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6V5z" fill="currentColor" />
    </svg>
  );
}

function IconDocs(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={props.className} aria-hidden="true">
      <path
        d="M7 3h7l3 3v15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
        fill="currentColor"
        opacity="0.15"
      />
      <path
        d="M14 3v4a1 1 0 0 0 1 1h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M8 12h8M8 16h8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function AppShell({ userEmail, children }: Props) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems: NavItem[] = useMemo(
    () => [
      { href: "/app", label: "Aujourd'hui", icon: <IconSparkles className="h-4 w-4" /> },
      { href: "/strategy", label: "Ma Stratégie", icon: <IconTarget className="h-4 w-4" /> },
      { href: "/create", label: "Créer", icon: <IconPlus className="h-4 w-4" /> },
      { href: "/contents", label: "Mes Contenus", icon: <IconDocs className="h-4 w-4" /> },
    ],
    [],
  );

  const SidebarInner = (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground grid place-items-center font-bold">
            ✦
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Tipote™</div>
            <div className="text-xs text-muted-foreground">SaaS Business AI</div>
          </div>
        </div>
      </div>

      <div className="mt-5 px-3">
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                  active
                    ? "bg-muted text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                )}
                onClick={() => setMobileOpen(false)}
              >
                <span
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-lg",
                    active ? "bg-primary/10 text-primary" : "bg-transparent text-muted-foreground",
                  )}
                >
                  {item.icon}
                </span>
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto px-4 pb-4 pt-6">
        <div className="rounded-2xl border bg-card p-3 text-xs text-muted-foreground">
          <div className="truncate">{userEmail}</div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <Link href="/settings" className="text-foreground hover:underline">
              Paramètres
            </Link>
            <LogoutButton />
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-svh bg-background">
      {/* Layout desktop */}
      <div className="mx-auto flex w-full max-w-[1280px] gap-6 px-4 py-4">
        {/* Sidebar */}
        <aside className="hidden w-[260px] shrink-0 rounded-3xl border bg-card md:block">
          {SidebarInner}
        </aside>

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Topbar */}
          <header className="flex items-center justify-between gap-3 rounded-2xl bg-background/80 px-2 py-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="grid h-10 w-10 place-items-center rounded-xl border bg-card md:hidden"
                aria-label="Ouvrir le menu"
              >
                <span className="text-lg">≡</span>
              </button>
              <div className="leading-tight">
                <div className="text-base font-semibold">Aujourd&apos;hui</div>
                <div className="text-xs text-muted-foreground">Connecté : {userEmail}</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/analytics"
                className="hidden rounded-xl border bg-card px-3 py-2 text-sm font-medium hover:bg-muted md:inline-flex"
              >
                Analytics détaillés
              </Link>
              <Link
                href="/settings"
                className="rounded-xl border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
              >
                Mon compte
              </Link>
              <div className="hidden md:block">
                <LogoutButton />
              </div>
            </div>
          </header>

          {/* Page content */}
          <main className="mt-4 min-w-0">{children}</main>
        </div>
      </div>

      {/* Drawer mobile */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-3 top-3 h-[calc(100svh-24px)] w-[280px] overflow-hidden rounded-3xl border bg-card shadow-lg">
            {SidebarInner}
          </div>
        </div>
      ) : null}
    </div>
  );
}
