"use client";

import { Card } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export function ContentTypeCard(props: {
  label: string;
  description: string;
  icon: LucideIcon;
  color: string; // ex: "bg-blue-500"
  onClick: () => void;
}) {
  const Icon = props.icon;

  return (
    <Card
      className="p-5 hover:shadow-md transition-all cursor-pointer group"
      onClick={props.onClick}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-xl ${props.color} flex items-center justify-center flex-shrink-0`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="font-semibold">{props.label}</div>
            <div className="text-sm text-muted-foreground">{props.description}</div>
          </div>
        </div>
        <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
      </div>
    </Card>
  );
}
