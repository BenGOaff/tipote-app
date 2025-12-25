"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sun, Target, Sparkles, FolderOpen, Settings, BarChart3 } from "lucide-react";

import { cn } from "@/lib/utils";
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
  SidebarRail,
} from "@/components/ui/sidebar";

type NavItem = {
  title: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
};

const mainNav: NavItem[] = [
  { title: "Aujourd’hui", href: "/dashboard", icon: Sun },
  { title: "Stratégie", href: "/strategy", icon: Target },
  { title: "Créer", href: "/create", icon: Sparkles },
  { title: "Mes contenus", href: "/contents", icon: FolderOpen },
  { title: "Analytics", href: "/analytics", icon: BarChart3 },
];

const footerNav: NavItem[] = [{ title: "Paramètres", href: "/settings", icon: Settings }];

function SidebarLink({ title, href, icon: Icon }: NavItem) {
  const pathname = usePathname();

  // Compat : on garde /app comme alias historique du dashboard
  const isDashboardAlias = href === "/dashboard" && pathname === "/app";
  const isActive = isDashboardAlias || pathname === href || (href !== "/" && pathname?.startsWith(`${href}/`));

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} className="rounded-xl">
        <Link href={href} className={cn("flex items-center gap-2")}>
          <Icon className="h-4 w-4" />
          <span className="text-sm font-medium">{title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  return (
    <Sidebar className="border-r">
      <SidebarHeader className="px-3 py-4">
        <Link href="/dashboard" className="flex items-center gap-2 px-2">
          <div className="h-8 w-8 rounded-xl bg-primary/10" />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">Tipote™</span>
            <span className="text-xs text-muted-foreground">Business Buddy IA</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarLink key={item.href} {...item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-3 pb-4">
        <SidebarMenu>
          {footerNav.map((item) => (
            <SidebarLink key={item.href} {...item} />
          ))}
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

export default AppSidebar;
