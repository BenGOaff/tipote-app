// components/AppSidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sun, Target, Sparkles, FolderOpen, Settings, BarChart3 } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { TutorialSpotlight } from "@/components/tutorial/TutorialSpotlight";

type NavItem = {
  title: string;
  href: string;
  icon: any;
  tutorialId?: "today" | "create" | "strategy";
};

const mainItems: NavItem[] = [
  { title: "Aujourd'hui", href: "/dashboard", icon: Sun, tutorialId: "today" },
  { title: "Ma Stratégie", href: "/strategy", icon: Target, tutorialId: "strategy" },
  { title: "Créer", href: "/create", icon: Sparkles, tutorialId: "create" },
  { title: "Mes Contenus", href: "/contents", icon: FolderOpen },
];

function NavItemLink({
  href,
  children,
  className,
  activeClassName,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  activeClassName?: string;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== "/" && pathname?.startsWith(href));
  return (
    <Link href={href} className={cn(className, isActive ? activeClassName : "")}>
      {children}
    </Link>
  );
}

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-4">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl gradient-primary flex items-center justify-center text-primary-foreground font-bold">
            ✨
          </div>
          <div>
            <div className="font-display font-bold leading-none">Tipote™</div>
            <div className="text-xs text-muted-foreground">SaaS Business AI</div>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="overflow-y-auto px-3 py-4">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {mainItems.map((item) => {
                const button = (
                  <SidebarMenuButton asChild>
                    <NavItemLink
                      href={item.href}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <item.icon className="w-5 h-5" />
                      <span>{item.title}</span>
                    </NavItemLink>
                  </SidebarMenuButton>
                );

                if (item.tutorialId) {
                  return (
                    <SidebarMenuItem key={item.title}>
                      <TutorialSpotlight elementId={item.tutorialId} tooltipPosition="right">
                        {button}
                      </TutorialSpotlight>
                    </SidebarMenuItem>
                  );
                }

                return <SidebarMenuItem key={item.title}>{button}</SidebarMenuItem>;
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-3 pb-4">
        <SidebarMenu className="space-y-1">
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <NavItemLink
                href="/analytics"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-sidebar-accent"
                activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
              >
                <BarChart3 className="w-5 h-5" />
                <span>Analytics</span>
              </NavItemLink>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <NavItemLink
                href="/settings"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-sidebar-accent"
                activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
              >
                <Settings className="w-5 h-5" />
                <span>Paramètres</span>
              </NavItemLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export default AppSidebar;
