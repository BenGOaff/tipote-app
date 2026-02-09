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
        <p className="text-sm text-muted-foreground mt-1">
          Choisis le format qui correspond à ton besoin.
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
          <h3 className="font-semibold text-lg">Page prête à l'emploi</h3>
          <p className="text-sm text-muted-foreground">
            Une page complète avec design + texte. Tu choisis un template, l'IA rédige le contenu
            et tu obtiens un fichier HTML prêt à utiliser.
          </p>
          <Badge variant="secondary" className="mt-1">Recommandé</Badge>
        </button>

        <button
          onClick={() => onSelectMode("text_only")}
          className="group text-left rounded-xl border-2 border-border p-6 hover:border-primary hover:shadow-md transition-all space-y-3"
        >
          <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
            <FileText className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg">Juste le copywriting</h3>
          <p className="text-sm text-muted-foreground">
            L'IA génère uniquement le texte de ta page. Tu pourras le copier-coller
            dans Systeme.io ou n'importe quel outil.
          </p>
        </button>
      </div>
    </div>
  );
}