"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Sun,
  Target,
  Sparkles,
  FolderOpen,
  BarChart3,
  Zap,
  Users,
  Briefcase,
  Video,
  Bell,
  PanelLeftClose,
  HelpCircle,
} from "lucide-react";
import { TutorialSpotlight } from "@/components/tutorial/TutorialSpotlight";
import { TutorialNudge } from "@/components/tutorial/TutorialNudge";
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
  useSidebar,
} from "@/components/ui/sidebar";

import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { usePepitesUnread } from "@/lib/pepites/usePepitesUnread";
import { Button } from "@/components/ui/button";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

// NavLink with active detection
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

// Menu item style: semibold 600, color #5a5a7a
const MENU_ITEM_CLASS =
  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-sidebar-accent relative z-40 font-semibold text-[#5a5a7a]";
const MENU_ITEM_ACTIVE_CLASS = "bg-sidebar-accent !text-primary font-semibold";

const MAIN_ITEM_CONFIG = [
  { key: "today" as const, url: "/app", icon: Sun, spotlightId: "today" },
  { key: "strategy" as const, url: "/strategy", icon: Target, spotlightId: "strategy" },
  { key: "create" as const, url: "/create", icon: Sparkles, spotlightId: "create" },
  { key: "contents" as const, url: "/contents", icon: FolderOpen, spotlightId: "contents" },
{ key: "automations" as const, url: "/automations", icon: Zap, spotlightId: "automations" },
  { key: "leads" as const, url: "/leads", icon: Users, spotlightId: "leads" },
  { key: "clients" as const, url: "/clients", icon: Briefcase, spotlightId: "clients" },
  { key: "webinars" as const, url: "/webinars", icon: Video, spotlightId: "webinars" },
  { key: "widgets" as const, url: "/widgets", icon: Bell, spotlightId: "widgets" },
];

function PepitesSidebarItem() {
  const t = useTranslations("nav");
  const ts = useTranslations("sidebar");
  const { loading, hasUnread } = usePepitesUnread();

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild>
        <NavLink
          to="/pepites"
          className={MENU_ITEM_CLASS}
          activeClassName={MENU_ITEM_ACTIVE_CLASS}
        >
          <div className="relative">
            <Sparkles className="w-5 h-5" />
            {!loading && hasUnread ? (
              <span
                className="absolute -top-1 -right-1 inline-flex h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-sidebar"
                aria-label={ts("newPepite")}
                title={ts("newPepite")}
              />
            ) : null}
          </div>
          <span>{t("pepites")}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** Small button to collapse sidebar */
function SidebarCollapseButton() {
  const { toggleSidebar } = useSidebar();
  const t = useTranslations("sidebar");

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 text-muted-foreground hover:text-foreground"
      onClick={toggleSidebar}
      aria-label={t("collapse")}
      title={t("collapse")}
    >
      <PanelLeftClose className="h-4 w-4" />
    </Button>
  );
}

export function AppSidebar() {
  const t = useTranslations("nav");
  const { phase, nextPhase } = useTutorial();

  const mainItems = MAIN_ITEM_CONFIG.map((cfg) => ({
    title: t(cfg.key),
    url: cfg.url,
    icon: cfg.icon,
    spotlightId: cfg.spotlightId,
  }));

  const handleItemClick = (spotlightId: string | null) => {
    const phaseMap: Record<string, string> = {
      today: "tour_today",
      strategy: "tour_strategy",
      create: "tour_create",
      contents: "tour_contents",
      templates: "tour_templates",
      automations: "tour_automations",
      analytics: "tour_analytics",
      pepites: "tour_pepites",
    };
    if (spotlightId && phaseMap[spotlightId] === phase) {
      nextPhase();
    }
  };

  return (
    <Sidebar collapsible="offcanvas">
      {/* Header: logo + collapse toggle — no separator border */}
      <SidebarHeader className="p-4 flex flex-row items-center justify-between">
        <Link href="/app" className="block">
          <Image
            src="/logo-normal.png"
            alt="Tipote"
            width={120}
            height={40}
            className="h-10 w-auto"
            priority
          />
        </Link>
        <SidebarCollapseButton />
      </SidebarHeader>

      {/* Main nav — no overflow clip for tooltips */}
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
                        end={item.url === "/app"}
                        className={MENU_ITEM_CLASS}
                        activeClassName={MENU_ITEM_ACTIVE_CLASS}
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

      {/* Footer: analytics + pepites + language switch — no separator border */}
      <SidebarFooter className="p-4 space-y-1">
        <TutorialNudge />

        <SidebarMenu>
          <TutorialSpotlight elementId="analytics" tooltipPosition="right" showNextButton>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <NavLink
                  to="/analytics"
                  className={MENU_ITEM_CLASS}
                  activeClassName={MENU_ITEM_ACTIVE_CLASS}
                  onClick={() => handleItemClick("analytics")}
                >
                  <BarChart3 className="w-5 h-5" />
                  <span>{t("analytics")}</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </TutorialSpotlight>

          <TutorialSpotlight elementId="pepites" tooltipPosition="right" showNextButton>
            <PepitesSidebarItem />
          </TutorialSpotlight>
        </SidebarMenu>

        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <a
                href="/support"
                target="_blank"
                rel="noopener noreferrer"
                className={MENU_ITEM_CLASS}
              >
                <HelpCircle className="w-5 h-5" />
                <span>{t("support") ?? "Aide"}</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <div className="px-1 pt-1">
          <LanguageSwitcher variant="sidebar" />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export default AppSidebar;
