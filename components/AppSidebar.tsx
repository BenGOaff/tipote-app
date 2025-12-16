"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sun,
  Target,
  Sparkles,
  FolderOpen,
  Settings,
  BarChart3,
  CheckSquare,
} from "lucide-react";

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
  SidebarSeparator,
} from "@/components/ui/sidebar";

type NavItem = {
  title: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
};

const mainNav: NavItem[] = [
  { title: "Aujourd’hui", href: "/app", icon: Sun },
  { title: "Créer", href: "/create", icon: Sparkles },
  { title: "Mes contenus", href: "/contents", icon: FolderOpen },
  { title: "Tâches", href: "/tasks", icon: CheckSquare },
  { title: "Stratégie", href: "/strategy", icon: Target },
  { title: "Analytics", href: "/analytics", icon: BarChart3 },
];

const footerNav: NavItem[] = [{ title: "Settings", href: "/settings", icon: Settings }];

function isActivePath(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarLink({ title, href, icon: Icon }: NavItem) {
  const pathname = usePathname();
  const active = isActivePath(pathname, href);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        tooltip={title}
        className={cn(active && "bg-muted font-semibold")}
      >
        <Link href={href} className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          <span>{title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="px-2 py-2">
          <div className="text-sm font-bold leading-none">Tipote™</div>
          <div className="text-[11px] text-muted-foreground mt-1">Business buddy IA</div>
        </div>
        <SidebarSeparator />
      </SidebarHeader>

      <SidebarContent>
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

      <SidebarFooter>
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
