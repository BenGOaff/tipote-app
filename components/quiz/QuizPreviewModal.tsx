"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Smartphone, Tablet, Monitor } from "lucide-react";
import PublicQuizClient from "@/components/quiz/PublicQuizClient";
import type { PublicQuizData } from "@/components/quiz/PublicQuizClient";

type Device = "mobile" | "tablet" | "desktop";

const DEVICE_CONFIG: Record<Device, { width: number; label: string; icon: typeof Smartphone }> = {
  mobile: { width: 375, label: "Mobile", icon: Smartphone },
  tablet: { width: 768, label: "Tablette", icon: Tablet },
  desktop: { width: 1024, label: "Desktop", icon: Monitor },
};

interface QuizPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quizId: string;
  previewData: PublicQuizData;
}

export function QuizPreviewModal({ open, onOpenChange, quizId, previewData }: QuizPreviewModalProps) {
  const [device, setDevice] = useState<Device>("mobile");
  const cfg = DEVICE_CONFIG[device];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[1200px] h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle>Apercu du quiz</DialogTitle>
            <div className="flex gap-1 bg-muted rounded-lg p-1">
              {(Object.keys(DEVICE_CONFIG) as Device[]).map((d) => {
                const Icon = DEVICE_CONFIG[d].icon;
                return (
                  <Button
                    key={d}
                    variant={device === d ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8 px-3 gap-1.5"
                    onClick={() => setDevice(d)}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline text-xs">{DEVICE_CONFIG[d].label}</span>
                  </Button>
                );
              })}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto bg-muted/50 flex items-start justify-center p-6">
          <div
            className="bg-white rounded-lg shadow-xl overflow-hidden transition-all duration-300 border"
            style={{
              width: cfg.width,
              maxWidth: "100%",
              minHeight: 600,
            }}
          >
            <div className="h-full overflow-auto" style={{ maxHeight: "calc(90vh - 120px)" }}>
              <PublicQuizClient quizId={quizId} previewData={previewData} />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
