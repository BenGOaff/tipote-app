// app/affiliate/components/AffiliateNav.tsx
//
// Header avec navigation horizontale pour les pages authentifiées du
// dashboard affiliation. Pas affiché sur /login ni /signup.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Megaphone, Wallet, CreditCard, HelpCircle, LogOut, Gift } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const NAV: NavItem[] = [
  { href: "/", label: "Vue d'ensemble", icon: LayoutDashboard },
  { href: "/promouvoir", label: "Promouvoir", icon: Megaphone },
  { href: "/trial-tipote", label: "Trial Tipote", icon: Gift },
  { href: "/revenus", label: "Revenus", icon: Wallet },
  { href: "/paiement", label: "Paiement", icon: CreditCard },
  { href: "/support", label: "Support", icon: HelpCircle },
];

export function AffiliateNav({ displayName }: { displayName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <header className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <span className="text-2xl font-bold">
            Tipote<span className="text-primary">™</span>
          </span>
          <span className="text-xs text-muted-foreground uppercase tracking-widest border-l border-border pl-3">
            Affiliation
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground hidden md:inline">
            {displayName}
          </span>
          <Button variant="ghost" size="sm" onClick={handleLogout} title="Déconnexion">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <nav className="max-w-6xl mx-auto px-6 flex items-center gap-1 overflow-x-auto">
        {NAV.map((item) => {
          // pathname relatif au sous-domaine (le rewrite next.config map déjà
          // affiliate.tipote.com → /affiliate/), donc le pathname côté browser
          // ne contient PAS le préfixe /affiliate.
          const isActive =
            item.href === "/"
              ? pathname === "/" || pathname === "/affiliate"
              : pathname.startsWith(item.href) ||
                pathname.startsWith(`/affiliate${item.href}`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition whitespace-nowrap ${
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
