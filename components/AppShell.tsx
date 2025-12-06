// components/AppShell.tsx
// Layout principal Tipote : sidebar + header + contenu.
// Utilisé pour toutes les pages "app" (dashboard, stratégie, blocks, automatisations).

"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";

type AppShellProps = {
  userEmail: string;
  children: ReactNode;
};

// Navigation principale dans la sidebar
const navItems = [
  { href: "/app", label: "Tableau de bord" },
  { href: "/strategy", label: "Stratégie" },
  { href: "/app/blocks", label: "Blocks business" },
  { href: "/app/automations", label: "Automatisations" },
];

export default function AppShell({ userEmail, children }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex md:w-60 lg:w-64 flex-col border-r border-slate-200 bg-white">
        <div className="px-4 py-4 border-b border-slate-200 flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-[#b042b4] flex items-center justify-center text-base font-bold text-white">
            t
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-900">Tipote</p>
            <p className="text-xs text-slate-500">SaaS Business AI</p>
          </div>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname?.startsWith(item.href + "/");

            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-[#b042b4] text-white shadow-sm"
                    : "text-slate-700 hover:bg-slate-100",
                ].join(" ")}
              >
                <span className="inline-block h-2 w-2 rounded-full bg-[#641168]/60" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-slate-200 text-xs text-slate-500">
          <p className="truncate">{userEmail}</p>
        </div>
      </aside>

      {/* Colonne principale */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-14 border-b border-slate-200 bg-white">
          <div className="h-full px-4 flex items-center justify-between gap-3 max-w-5xl mx-auto">
            {/* Logo compact sur mobile */}
            <div className="md:hidden flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-[#b042b4] flex items-center justify-center text-sm font-bold text-white">
                t
              </div>
              <span className="text-sm font-semibold text-slate-900">
                Tipote
              </span>
            </div>

            {/* Email utilisateur */}
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-500">
              <span className="hidden sm:inline">Connecté :</span>
              <span className="font-medium text-slate-700 truncate max-w-[180px] sm:max-w-none">
                {userEmail}
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Link
                href="/onboarding"
                className="hidden sm:inline-flex items-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Refaire l&apos;onboarding
              </Link>
              <LogoutButton />
            </div>
          </div>
        </header>

        {/* Contenu */}
        <main className="flex-1">
          <div className="max-w-5xl mx-auto px-4 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
