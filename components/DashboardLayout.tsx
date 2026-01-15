"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { BarChart3 } from "lucide-react";

interface DashboardLayoutProps {
  children: ReactNode;
  title: string;
  showAnalyticsLink?: boolean;
  headerActions?: ReactNode;
  contentClassName?: string;
}

export default function DashboardLayout({
  children,
  title,
  showAnalyticsLink = true,
  headerActions,
  contentClassName = "p-6 space-y-6 max-w-7xl mx-auto",
}: DashboardLayoutProps) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <main className="flex-1 overflow-auto bg-muted/30">
          <header className="h-16 border-b border-border flex items-center px-6 bg-background/95 backdrop-blur-sm sticky top-0 z-10">
            <SidebarTrigger />
            <div className="ml-4 flex-1">
              <h1 className="text-xl font-display font-bold">{title}</h1>
            </div>

            {headerActions ? (
              headerActions
            ) : showAnalyticsLink ? (
              <Link href="/analytics">
                <Button variant="outline" size="sm">
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Analytics détaillés
                </Button>
              </Link>
            ) : null}
          </header>

          <div className={contentClassName}>{children}</div>
        </main>
      </div>
    </SidebarProvider>
  );
}
