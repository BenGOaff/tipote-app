"use client";

import { Card } from "@/components/ui/card";
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
    <button
      onClick={props.onClick}
      className="group text-left"
    >
      <Card className="p-5 transition-all hover:shadow-md hover:border-primary/30 cursor-pointer h-full">
        <div className={`w-11 h-11 rounded-xl ${props.color} flex items-center justify-center mb-3`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="font-semibold text-sm group-hover:text-primary transition-colors">
          {props.label}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {props.description}
        </div>
      </Card>
    </button>
  );
}
