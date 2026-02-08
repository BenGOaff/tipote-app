import { Badge } from "@/components/ui/badge";
import { LayoutTemplate, FileText } from "lucide-react";

interface FunnelModeStepProps {
  onSelectMode: (mode: "visual" | "text_only") => void;
}

export function FunnelModeStep({ onSelectMode }: FunnelModeStepProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Que veux-tu créer ?</h3>
        <p className="text-sm text-muted-foreground">
          Choisis si tu veux uniquement le copywriting, ou une page prête à l’emploi (design + textes).
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div
          role="button"
          tabIndex={0}
          onClick={() => onSelectMode("visual")}
          onKeyDown={(e) => (e.key === "Enter" ? onSelectMode("visual") : null)}
          className="group relative rounded-xl border bg-card p-5 text-left shadow-sm transition hover:border-primary hover:shadow-md"
        >
          <div className="mb-3 flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <LayoutTemplate className="h-3.5 w-3.5" />
              Page prête à l’emploi
            </Badge>
          </div>
          <div className="space-y-1">
            <div className="text-base font-semibold">Design + Copywriting</div>
            <div className="text-sm text-muted-foreground">
              Tu choisis un template, l’IA intègre tes infos et te livre une page designée + rédigée.
            </div>
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => onSelectMode("text_only")}
          onKeyDown={(e) => (e.key === "Enter" ? onSelectMode("text_only") : null)}
          className="group relative rounded-xl border bg-card p-5 text-left shadow-sm transition hover:border-primary hover:shadow-md"
        >
          <div className="mb-3 flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <FileText className="h-3.5 w-3.5" />
              Copywriting uniquement
            </Badge>
          </div>
          <div className="space-y-1">
            <div className="text-base font-semibold">Texte prêt à publier</div>
            <div className="text-sm text-muted-foreground">
              Tu récupères le copywriting (structure + sections), avec export PDF et enregistrement.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
