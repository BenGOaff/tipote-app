import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { LayoutTemplate, FileText } from "lucide-react";

interface FunnelModeStepProps {
  onSelectMode: (mode: "visual" | "text_only") => void;
}

export function FunnelModeStep({ onSelectMode }: FunnelModeStepProps) {
  const t = useTranslations("funnelConfig");
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">{t("modeQuestion")}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {t("modeDescription")}
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <button
          onClick={() => onSelectMode("visual")}
          className="group text-left rounded-xl border-2 border-border p-6 hover:border-primary hover:shadow-md transition-all space-y-3"
        >
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <LayoutTemplate className="w-6 h-6 text-primary" />
          </div>
          <h3 className="font-semibold text-lg">{t("modeVisualTitle")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("modeVisualDesc")}
          </p>
          <Badge variant="secondary" className="mt-1">{t("modeRecommended")}</Badge>
        </button>

        <button
          onClick={() => onSelectMode("text_only")}
          className="group text-left rounded-xl border-2 border-border p-6 hover:border-primary hover:shadow-md transition-all space-y-3"
        >
          <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
            <FileText className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg">{t("modeTextTitle")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("modeTextDesc")}
          </p>
        </button>
      </div>
    </div>
  );
}