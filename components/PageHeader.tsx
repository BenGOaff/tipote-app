// components/PageHeader.tsx
// Shared header bar used across all pages: sidebar open button (left) + title + right-side elements
"use client";

import type { ReactNode } from "react";
import { PanelLeftOpen } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { HeaderCredits } from "@/components/HeaderCredits";
import { ProjectSwitcher } from "@/components/ProjectSwitcher";
import { NotificationBell } from "@/components/NotificationBell";
import { UserAvatarMenu } from "@/components/UserAvatarMenu";
import { Button } from "@/components/ui/button";

function SidebarOpenButton() {
  const { open, toggleSidebar, isMobile } = useSidebar();
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

type Props = {
  /** Left side: rendered after sidebar-open button */
  left?: ReactNode;
  /** User email for the avatar menu (optional — omit on server-rendered pages) */
  userEmail?: string;
};

export function PageHeader({ left, userEmail = "" }: Props) {
  return (
    <header className="h-14 flex items-center justify-between px-4 lg:px-6 bg-background sticky top-0 z-10 border-b border-border/40">
      {/* Left: sidebar reopen + page title */}
      <div className="flex items-center gap-2 min-w-0">
        <SidebarOpenButton />
        {left}
      </div>

      {/* Right: global elements only */}
      <div className="flex items-center gap-2 shrink-0">
        <HeaderCredits />
        <ProjectSwitcher />
        <NotificationBell />
        <UserAvatarMenu userEmail={userEmail} />
      </div>
    </header>
  );
}
