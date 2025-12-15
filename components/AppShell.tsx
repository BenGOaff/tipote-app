// components/AppShell.tsx
"use client";

import type { ReactNode } from "react";

import LogoutButton from "@/components/LogoutButton";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

type Props = {
  userEmail: string;
  children: ReactNode;
};

export default function AppShell({ userEmail, children }: Props) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />

        <div className="flex-1 flex flex-col">
          <header className="h-16 border-b bg-background flex items-center justify-between px-4 lg:px-6">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <span className="text-sm text-muted-foreground hidden sm:inline">Tipote™</span>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-xs text-muted-foreground hidden md:block">{userEmail}</div>
              <LogoutButton />
            </div>
          </header>

          <main className="flex-1 p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
