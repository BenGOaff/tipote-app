// components/AppShell.tsx
// Layout principal conforme au design final de Tipote (doc pages design)
// Sidebar + header + contenu central
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import LogoutButton from "@/components/LogoutButton";

type Props = {
  userEmail: string;
  children: ReactNode;
};

const navItems = [
  { href: "/app", label: "Vue d’ensemble" },
  { href: "/strategy", label: "Stratégie" },
  { href: "/content-hub", label: "Content Hub" },
  { href: "/calendar", label: "Calendrier" },
  { href: "/ai-generator", label: "Génération IA" },
  { href: "/project-tracking", label: "Suivi Projet" },
  { href: "/analytics", label: "Analytics" },
  { href: "/settings/ai", label: "Paramètres IA" },
];

export default function AppShell({ userEmail, children }: Props) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* SIDEBAR */}
      <aside className="hidden md:flex md:w-60 lg:w-64 flex-col bg-white border-r border-slate-200">
        {/* Logo */}
        <div className="px-4 py-4 border-b border-slate-200 flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-[#b042b4] flex items-center justify-center text-base font-bold text-white">
            t
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Tipote</p>
            <p className="text-xs text-slate-500">Workspace</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-1">
          {navItems.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/app" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition",
                  active
                    ? "bg-[#b042b4] text-white shadow-sm"
                    : "text-slate-700 hover:bg-slate-100",
                ].join(" ")}
              >
                <span className="h-2 w-2 rounded-full bg-[#641168]/50" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Email */}
        <div className="px-4 py-4 border-t border-slate-200 text-xs text-slate-500">
          {userEmail}
        </div>
      </aside>

      {/* MAIN */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-14 border-b border-slate-200 bg-white">
          <div className="h-full flex items-center justify-between px-4 max-w-6xl mx-auto">
            {/* Mobile logo */}
            <div className="md:hidden flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-[#b042b4] flex items-center justify-center text-sm font-bold text-white">
                t
              </div>
              <span className="text-sm font-semibold">Tipote</span>
            </div>

            {/* Desktop email */}
            <div className="hidden md:flex text-xs text-slate-500">
              Connecté : <span className="ml-1 font-medium">{userEmail}</span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Link
                href="/app/account"
                className="border border-slate-200 px-3 py-1.5 rounded-lg text-xs hover:bg-slate-50"
              >
                Mon compte
              </Link>
              <LogoutButton />
            </div>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="flex-1 max-w-6xl mx-auto px-4 py-8">{children}</main>
      </div>
    </div>
  );
}
