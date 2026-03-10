"use client";

import { useState, type ReactNode } from "react";
import { MessageCircle, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AdminSupportTabs({
  ticketsTab,
  articlesTab,
}: {
  ticketsTab: ReactNode;
  articlesTab: ReactNode;
}) {
  const [tab, setTab] = useState<"tickets" | "articles">("tickets");

  return (
    <div>
      {/* Tab selector */}
      <div className="flex gap-1 border-b border-border/50 mb-6">
        <button
          onClick={() => setTab("tickets")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
            tab === "tickets"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <MessageCircle className="w-4 h-4" />
          Tickets
        </button>
        <button
          onClick={() => setTab("articles")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
            tab === "articles"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <BookOpen className="w-4 h-4" />
          Articles
        </button>
      </div>

      {/* Tab content */}
      {tab === "tickets" ? ticketsTab : articlesTab}
    </div>
  );
}
