// app/affiliate/components/AffiliateSidebar.tsx
//
// Barre latérale gauche du dashboard affilié — remplace l'ancienne
// nav horizontale (AffiliateNav) pour une expérience cohérente avec
// la sidebar de l'app principale. Montée une seule fois dans le
// layout (partagée par toutes les pages authentifiées).
//
// Responsive : sidebar persistante sur lg+, drawer overlay sur mobile
// (toggle via le bouton hamburger d'une top bar fine). Même pattern
// mobile que les éditeurs.

"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Megaphone, Library, HelpCircle,
  LogOut, Gift, Menu, X, ShieldCheck,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { Button } from "@/components/ui/button";
import { useDict } from "../i18n/context";
import { LocaleSwitcher } from "./LocaleSwitcher";

type NavItem = {
  href: string;
  key: "overview" | "promouvoir" | "contenus" | "trial" | "support";
  icon: React.ComponentType<{ className?: string }>;
};

const NAV: NavItem[] = [
  { href: "/", key: "overview", icon: LayoutDashboard },
  { href: "/promouvoir", key: "promouvoir", icon: Megaphone },
  { href: "/contenus", key: "contenus", icon: Library },
  { href: "/trial-tiquiz", key: "trial", icon: Gift },
  { href: "/support", key: "support", icon: HelpCircle },
];

export function AffiliateSidebar({ displayName, isAdmin = false }: { displayName: string; isAdmin?: boolean }) {
  const t = useDict();
  const pathname = usePathname();
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [open, setOpen] = useState(false);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/" || pathname === "/affiliate";
    return pathname.startsWith(href) || pathname.startsWith(`/affiliate${href}`);
  }

  const navList = (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
      {NAV.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon className="w-5 h-5 shrink-0" />
            <span>{t.nav[item.key]}</span>
          </Link>
        );
      })}
      {isAdmin && (
        <>
          <Link
            href="/admin/contenus"
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive("/admin/contenus")
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <ShieldCheck className="w-5 h-5 shrink-0" />
            <span>Admin - Contenus</span>
          </Link>
          <Link
            href="/admin/links"
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive("/admin/links")
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <ShieldCheck className="w-5 h-5 shrink-0" />
            <span>Admin - Liens</span>
          </Link>
          <Link
            href="/admin/diagnostic"
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive("/admin/diagnostic")
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <ShieldCheck className="w-5 h-5 shrink-0" />
            <span>Admin - Diagnostic</span>
          </Link>
        </>
      )}
    </nav>
  );

  const sidebarInner = (
    <>
      {/* Logo / titre */}
      <div className="px-5 py-4 flex items-center justify-between">
        <Link href="/" onClick={() => setOpen(false)} className="block">
          <span className="text-xl font-bold">
            Tipote<span className="text-primary">™</span>
          </span>
          <span className="block text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">
            {t.layout.space_subtitle}
          </span>
        </Link>
        {/* Croix de fermeture — mobile uniquement */}
        <button
          className="lg:hidden text-muted-foreground hover:text-foreground"
          onClick={() => setOpen(false)}
          aria-label={t.common.close}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {navList}

      {/* Footer : langue + nom + déconnexion */}
      <div className="border-t border-border p-3 space-y-2">
        <LocaleSwitcher />
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-muted-foreground truncate">{displayName}</span>
          <Button variant="ghost" size="sm" onClick={handleLogout} title={t.nav.logout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Top bar mobile (lg:hidden) — logo + hamburger */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/95 backdrop-blur px-4 py-2.5">
        <Link href="/" className="text-lg font-bold">
          Tipote<span className="text-primary">™</span>
        </Link>
        <button
          onClick={() => setOpen(true)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Menu"
        >
          <Menu className="w-6 h-6" />
        </button>
      </header>

      {/* Backdrop mobile */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar : overlay sur mobile, persistante sur lg+ */}
      <aside
        className={`fixed lg:sticky top-0 z-50 lg:z-auto h-screen w-64 shrink-0 border-r border-border bg-background flex flex-col transition-transform lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarInner}
      </aside>
    </>
  );
}
