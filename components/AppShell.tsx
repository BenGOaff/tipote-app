// components/AppShell.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import LogoutButton from "@/components/LogoutButton";

type Props = {
  userEmail: string;
  children: ReactNode;
};

type NavItem = {
  href: string;
  label: string;
  icon: (props: { className?: string }) => JSX.Element;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function IconToday({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("h-5 w-5", className)} fill="none" aria-hidden="true">
      <path
        d="M8 7V5m8 2V5M6.5 9.5h11M7 19h10a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M8 14h3M8 16.5h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconStrategy({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("h-5 w-5", className)} fill="none" aria-hidden="true">
      <path
        d="M12 21s7-4.5 7-11V6l-7-3-7 3v4c0 6.5 7 11 7 11Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 12.2 11.2 14l3.6-4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCreate({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("h-5 w-5", className)} fill="none" aria-hidden="true">
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function IconContent({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("h-5 w-5", className)} fill="none" aria-hidden="true">
      <path
        d="M8 7h8M8 11h8M8 15h5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function IconAnalytics({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("h-5 w-5", className)} fill="none" aria-hidden="true">
      <path
        d="M6 20V10M12 20V4M18 20v-7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M4 20h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconSettings({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("h-5 w-5", className)} fill="none" aria-hidden="true">
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M19.4 15a8.6 8.6 0 0 0 .1-1l2-1.2-2-3.4-2.3.7a8.3 8.3 0 0 0-1.7-1l-.3-2.4H10.8l-.3 2.4c-.6.3-1.2.6-1.7 1l-2.3-.7-2 3.4 2 1.2a8.6 8.6 0 0 0 0 2l-2 1.2 2 3.4 2.3-.7c.5.4 1.1.7 1.7 1l.3 2.4h4.4l.3-2.4c.6-.3 1.2-.6 1.7-1l2.3.7 2-3.4-2-1.2Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const primaryNav: NavItem[] = [
  { href: "/app", label: "Aujourd’hui", icon: IconToday },
  { href: "/strategy", label: "Ma Stratégie", icon: IconStrategy },
  { href: "/create", label: "Créer", icon: IconCreate },
  { href: "/contents", label: "Mes Contenus", icon: IconContent },
];

const footerNav: NavItem[] = [
  { href: "/analytics", label: "Analytics", icon: IconAnalytics },
  { href: "/settings", label: "Paramètres", icon: IconSettings },
];

function isActive(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function AppShell({ userEmail, children }: Props) {
  const pathname = usePathname();

  const pageTitle =
    [...primaryNav, ...footerNav].find((i) => isActive(pathname, i.href))?.label ?? "Tipote";

  const showAnalyticsCta = pathname === "/app";

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="flex min-h-screen">
        {/* SIDEBAR */}
        <aside className="hidden md:flex w-64 flex-col border-r border-zinc-200 bg-white">
          {/* Brand */}
          <div className="px-5 py-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-[#b042b4] flex items-center justify-center text-white">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
                  <path
                    d="M12 3l1.6 4.8H18l-3.7 2.7 1.4 4.9L12 12.8 8.3 15.4l1.4-4.9L6 7.8h4.4L12 3Z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="leading-tight">
                <p className="text-sm font-semibold text-zinc-900">Tipote™</p>
                <p className="text-xs text-zinc-500">Saas Business AI</p>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="px-3">
            <div className="space-y-1">
              {primaryNav.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                      active ? "bg-zinc-100 text-zinc-900" : "text-zinc-600 hover:bg-zinc-50"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-xl",
                        active ? "bg-white text-[#b042b4] shadow-sm" : "bg-zinc-50 text-zinc-500"
                      )}
                    >
                      <Icon />
                    </span>
                    <span className={cn("font-medium", active ? "text-zinc-900" : "text-zinc-700")}>
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </nav>

          <div className="mt-auto">
            <div className="px-3 py-3">
              <div className="h-px w-full bg-zinc-100" />
            </div>

            <nav className="px-3 pb-3">
              <div className="space-y-1">
                {footerNav.map((item) => {
                  const active = isActive(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                        active ? "bg-zinc-100 text-zinc-900" : "text-zinc-600 hover:bg-zinc-50"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-xl",
                          active ? "bg-white text-[#b042b4] shadow-sm" : "bg-zinc-50 text-zinc-500"
                        )}
                      >
                        <Icon />
                      </span>
                      <span className={cn("font-medium", active ? "text-zinc-900" : "text-zinc-700")}>
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </nav>

            <div className="px-5 pb-5">
              <p className="text-xs text-zinc-400 truncate">{userEmail}</p>
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Topbar */}
          <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
              <div className="flex items-center gap-2">
                <div className="hidden md:flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-zinc-700" fill="none" aria-hidden="true">
                    <path
                      d="M7 7h10M7 12h10M7 17h6"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-base font-semibold text-zinc-900">{pageTitle}</p>
                  <p className="text-xs text-zinc-500 hidden sm:block">Connecté : {userEmail}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {showAnalyticsCta && (
                  <Link
                    href="/analytics"
                    className="hidden sm:inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Analytics détaillés
                  </Link>
                )}

                <Link
                  href="/settings"
                  className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Mon compte
                </Link>

                <LogoutButton />
              </div>
            </div>
          </header>

          {/* Content */}
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
