"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sun,
  Target,
  Sparkles,
  FolderOpen,
  Settings,
  BarChart3,
  Coins,
  HelpCircle,
  Book,
  RotateCcw,
} from "lucide-react";
import { TutorialSpotlight } from "@/components/tutorial/TutorialSpotlight";
import { useTutorial } from "@/hooks/useTutorial";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useCreditsBalance } from "@/lib/credits/useCreditsBalance";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

// Equivalent Lovable de <NavLink />
function NavLink(props: {
  to: string;
  end?: boolean;
  className?: string;
  activeClassName?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const { to, end, className, activeClassName, onClick, children } = props;
  const pathname = usePathname();

  const isActive = end
    ? pathname === to
    : pathname === to || (to !== "/" && pathname.startsWith(to));

  return (
    <Link
      href={to}
      className={cx(className, isActive ? activeClassName : "")}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}

const mainItems = [
  { title: "Aujourd'hui", url: "/dashboard", icon: Sun, spotlightId: "today" },
  { title: "Ma Stratégie", url: "/strategy", icon: Target, spotlightId: "strategy" },
  { title: "Créer", url: "/create", icon: Sparkles, spotlightId: "create" },
  { title: "Mes Contenus", url: "/contents", icon: FolderOpen, spotlightId: null },
] as const;

function useAnimatedNumber(value: number, durationMs = 900) {
  const [display, setDisplay] = useState<number>(value);
  const rafRef = useRef<number | null>(null);
  const fromRef = useRef<number>(value);
  const toRef = useRef<number>(value);
  const startRef = useRef<number>(0);

  useEffect(() => {
    toRef.current = value;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    fromRef.current = display;
    startRef.current = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - startRef.current) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(fromRef.current + (toRef.current - fromRef.current) * eased);
      setDisplay(next);

      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs]);

  return display;
}

function CreditsSidebarBadge() {
  const { loading, balance, error } = useCreditsBalance();

  const remaining = useMemo(() => balance?.total_remaining ?? 0, [balance]);
  const animatedRemaining = useAnimatedNumber(remaining, 900);

  return (
    <Link
      href="/settings?tab=billing"
      className="mx-3 mb-3 block rounded-lg border border-primary/15 bg-primary/10 hover:bg-primary/15 transition-colors"
      aria-label="Voir mes crédits IA"
      title="Voir mes crédits IA"
    >
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
            <Coins className="w-4 h-4 text-primary-foreground" />
          </div>
          <div className="leading-tight">
            <p className="text-xs text-muted-foreground">Crédits</p>
            <p className="text-sm font-medium text-foreground">
              {loading ? "…" : error ? "—" : `${animatedRemaining}`}
              <span className="text-xs font-normal text-muted-foreground"> crédits</span>
            </p>
          </div>
        </div>

        <div className="text-xs text-muted-foreground">{loading ? "" : error ? "" : ">"}</div>
      </div>
    </Link>
  );
}

function TutorialMenuItem() {
  const { tutorialOptOut, resetTutorial, setShowWelcome, setPhase } = useTutorial();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton className="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors hover:bg-sidebar-accent">
          <HelpCircle className="w-5 h-5" />
          <span>Aide & tour guidé</span>
        </SidebarMenuButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuItem
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => {
            if (tutorialOptOut) {
              resetTutorial();
              return;
            }
            setShowWelcome(true);
            setPhase("welcome");
          }}
        >
          {tutorialOptOut ? <RotateCcw className="w-4 h-4" /> : <Book className="w-4 h-4" />}
          {tutorialOptOut ? "Réactiver le tour guidé" : "Refaire le tour guidé"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppSidebar() {
  const { phase, nextPhase } = useTutorial();

  const handleItemClick = (spotlightId: string | null) => {
    if (spotlightId === "today" && phase === "tour_today") {
      nextPhase();
    } else if (spotlightId === "create" && phase === "tour_create") {
      nextPhase();
    } else if (spotlightId === "strategy" && phase === "tour_strategy") {
      nextPhase();
    }
  };

  return (
    <Sidebar collapsible="none">
      <SidebarHeader className="border-b border-sidebar-border p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold">Tipote™</h2>
            <p className="text-xs text-muted-foreground">SaaS Business AI</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="overflow-y-auto overflow-x-visible px-3 py-4">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {mainItems.map((item) => {
                const menuItem = (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={item.url === "/dashboard"}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-sidebar-accent relative z-40"
                        activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        onClick={() => handleItemClick(item.spotlightId)}
                      >
                        <item.icon className="w-5 h-5" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );

                if (item.spotlightId) {
                  return (
                    <TutorialSpotlight
                      key={item.title}
                      elementId={item.spotlightId}
                      tooltipPosition="right"
                      showNextButton
                    >
                      {menuItem}
                    </TutorialSpotlight>
                  );
                }

                return menuItem;
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4 space-y-1">
        <CreditsSidebarBadge />

        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <NavLink
                to="/analytics"
                className="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors hover:bg-sidebar-accent"
                activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
              >
                <BarChart3 className="w-5 h-5" />
                <span>Analytics</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <TutorialSpotlight elementId="settings" tooltipPosition="right" showNextButton>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <NavLink
                  to="/settings"
                  className="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors hover:bg-sidebar-accent relative z-40"
                  activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  onClick={() => handleItemClick("settings")}
                >
                  <Settings className="w-5 h-5" />
                  <span>Paramètres</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </TutorialSpotlight>

          {/* ✅ Remplace la bulle flottante : ne bloque plus la sidebar */}
          <SidebarMenuItem>
            <TutorialMenuItem />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export default AppSidebar;
