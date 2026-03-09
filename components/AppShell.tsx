// components/AppShell.tsx
"use client";

import type { ReactNode } from "react";
import { PanelLeftOpen } from "lucide-react";

import { AppSidebar } from "@/components/AppSidebar";
import { ProjectSwitcher } from "@/components/ProjectSwitcher";
import { HeaderCredits } from "@/components/HeaderCredits";
import { NotificationBell } from "@/components/NotificationBell";
import { UserAvatarMenu } from "@/components/UserAvatarMenu";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

type Props = {
  userEmail: string;
  children: ReactNode;
  headerTitle?: ReactNode;
  headerRight?: ReactNode;
  contentClassName?: string;
};

/** Small button to reopen sidebar when collapsed (desktop) or open sheet (mobile) */
function SidebarOpenButton() {
  const { open, toggleSidebar, isMobile } = useSidebar();

  // On desktop, only show when sidebar is collapsed
  if (!isMobile && open) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 shrink-0"
      onClick={toggleSidebar}
      aria-label="Open sidebar"
    >
      <PanelLeftOpen className="h-5 w-5 text-muted-foreground" />
    </Button>
  );
}

export default function AppShell({
  userEmail,
  children,
  headerTitle,
  headerRight,
  contentClassName,
}: Props) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <main className="flex-1 overflow-auto bg-muted/30 flex flex-col">
          {/* Header — no border-b (removed per design) */}
          <header className="h-14 flex items-center justify-between px-4 lg:px-6 bg-background sticky top-0 z-10">
            {/* Left: sidebar reopen button (when collapsed) + page title */}
            <div className="flex items-center gap-2 min-w-0">
              <SidebarOpenButton />
              {headerTitle ? (
                <h1 className="text-lg font-display font-bold truncate">{headerTitle}</h1>
              ) : null}
            </div>

            {/* Right: credits, project switch, bell, avatar */}
            <div className="flex items-center gap-2 shrink-0">
              {headerRight ?? (
                <>
                  <HeaderCredits />
                  <ProjectSwitcher />
                  <NotificationBell />
                  <UserAvatarMenu userEmail={userEmail} />
                </>
              )}
            </div>
          </header>

          <div className={contentClassName ?? "flex-1 p-4 lg:p-6"}>
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
