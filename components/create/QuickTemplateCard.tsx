"use client";

import { Card } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";

export function QuickTemplateCard(props: {
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <Card
      className="p-4 hover:shadow-md transition-all cursor-pointer group"
      onClick={props.onClick}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{props.label}</div>
          <div className="text-sm text-muted-foreground">{props.description}</div>
        </div>
        <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
      </div>
    </Card>
  );
}
