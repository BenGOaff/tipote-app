// components/AppShell.tsx
"use client";

import type { ReactNode } from "react";

import LogoutButton from "@/components/LogoutButton";
import { AppSidebar } from "@/components/AppSidebar";
import { ProjectSwitcher } from "@/components/ProjectSwitcher";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

type Props = {
  userEmail: string;
  children: ReactNode;
  headerTitle?: ReactNode;
  headerRight?: ReactNode;
  contentClassName?: string;
};

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
          <header className="h-16 border-b border-border flex items-center justify-between px-4 lg:px-6 bg-background sticky top-0 z-10">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <ProjectSwitcher />
            </div>

            <div className="flex-1 px-4">
              {headerTitle ? (
                <div className="text-xl font-display font-bold">{headerTitle}</div>
              ) : (
                <div className="text-sm text-muted-foreground hidden sm:block">
                  Tipote™
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {headerRight ? (
                headerRight
              ) : (
                <>
                  <div className="text-xs text-muted-foreground hidden md:block">
                    {userEmail}
                  </div>
                  <LogoutButton />
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
