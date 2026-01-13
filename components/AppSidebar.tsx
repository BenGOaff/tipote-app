// components/AppSidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sun,
  Target,
  Sparkles,
  FolderOpen,
  Settings,
  BarChart3,
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

  const isActive = end ? pathname === to : pathname === to || (to !== "/" && pathname.startsWith(to));

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

export function AppSidebar() {
  const { phase, nextPhase } = useTutorial();

  const handleItemClick = (spotlightId: string | null) => {
    // Si on clique sur l'élément qui est actuellement en spotlight, passer au suivant
    if (spotlightId === "today" && phase === "tour_today") {
      nextPhase();
    } else if (spotlightId === "create" && phase === "tour_create") {
      nextPhase();
    } else if (spotlightId === "strategy" && phase === "tour_strategy") {
      nextPhase();
    }
  };

  return (
    <Sidebar>
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

      <SidebarContent className="overflow-y-auto px-3 py-4">
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
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export default AppSidebar;
