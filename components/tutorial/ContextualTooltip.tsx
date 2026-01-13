// components/tutorial/ContextualTooltip.tsx
"use client";

import * as React from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTutorial } from "@/hooks/useTutorial";

type Position = "top" | "bottom" | "left" | "right";

export function ContextualTooltip(props: {
  contextKey: string;
  message: string;
  position?: Position;
  children: React.ReactNode;
}) {
  const { contextKey, message, position = "top", children } = props;
  const { hasSeenContext, markContextSeen } = useTutorial();

  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!hasSeenContext(contextKey)) setOpen(true);
  }, [contextKey, hasSeenContext]);

  if (hasSeenContext(contextKey)) return <>{children}</>;

  const side: "top" | "bottom" | "left" | "right" = position;

  return (
    <TooltipProvider>
      <Tooltip
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) markContextSeen(contextKey);
        }}
      >
        <TooltipTrigger
          asChild
          onClick={() => {
            markContextSeen(contextKey);
            setOpen(false);
          }}
        >
          <div>{children}</div>
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs text-sm">
          {message}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
