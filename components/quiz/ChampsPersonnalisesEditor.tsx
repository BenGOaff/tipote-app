"use client";

// components/quiz/ChampsPersonnalisesEditor.tsx
//
// Les champs personnalisés du formulaire de capture, dans la colonne de
// réglages des DEUX éditeurs (quiz et sondage), et IDENTIQUE dans les deux
// dépôts (Tiquiz et Tipote). Il ne décide de rien : la forme d'un champ,
// ses bornes et son identité vivent dans lib/quiz/champsPersonnalises.ts.
//
// `ns` est le namespace de traduction de l'éditeur qui l'appelle :
// `quizEditor` chez Tiquiz, `quizDetail` chez Tipote. C'est la seule
// différence entre les deux dépôts, et elle est un PARAMÈTRE.

import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import {
  MAX_CHAMPS_PERSONNALISES,
  nouvelIdChamp,
  type ChampPersonnalise,
} from "@/lib/quiz/champsPersonnalises";

type Props = {
  ns: "quizEditor" | "quizDetail";
  champs: ChampPersonnalise[];
  onChange: (champs: ChampPersonnalise[]) => void;
};

export default function ChampsPersonnalisesEditor({ ns, champs, onChange }: Props) {
  const t = useTranslations(ns);
  const complet = champs.length >= MAX_CHAMPS_PERSONNALISES;

  const modifier = (id: string, patch: Partial<ChampPersonnalise>) =>
    onChange(champs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const ajouter = () => {
    if (complet) return;
    // La graine vient d'ici, le format de l'id vient du module : un id
    // écrit à la main dans un composant finirait par diverger du format
    // que le serveur accepte, et le champ serait jeté en silence.
    const id = nouvelIdChamp(Math.random().toString(36).slice(2) + Date.now().toString(36));
    onChange([...champs, { id, label: "", placeholder: "", required: false }]);
  };

  return (
    <div className="space-y-2 pt-2">
      <div>
        <h4 className="text-xs font-semibold text-foreground">{t("customFieldsTitle")}</h4>
        <p className="text-[11px] text-muted-foreground">{t("customFieldsHint")}</p>
      </div>
      {champs.map((c) => (
        <div key={c.id} className="rounded-lg border bg-muted/30 p-2.5 space-y-2">
          {/* LE NOM ET L'EXEMPLE S'ÉCRIVENT DANS L'APERÇU (16 septembre
              2026). Ils avaient leur champ ici, et depuis que le libellé
              est du texte riche posé sur le formulaire, il y avait DEUX
              endroits pour nommer la même chose : le libellé riche gagne
              à l'affichage, donc taper ici n'aurait plus rien changé à
              l'écran, en silence. C'est la mécanique WYSIWYG du reste de
              l'éditeur (le titre, le sous-titre, la case de consentement,
              le bouton), et il n'y a plus qu'une source. Cette colonne
              garde ce que l'aperçu ne peut pas dire : ajouter, retirer,
              rendre obligatoire. */}
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0 text-sm truncate" title={c.label}>
              {c.label.trim() || <span className="text-muted-foreground italic">{t("customFieldNoName")}</span>}
            </div>
            <button
              type="button"
              onClick={() => onChange(champs.filter((x) => x.id !== c.id))}
              className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title={t("customFieldRemove")}
              aria-label={t("customFieldRemove")}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={c.required}
              onChange={(e) => modifier(c.id, { required: e.target.checked })}
              className="h-3.5 w-3.5 accent-primary"
            />
            <span>{t("customFieldRequired")}</span>
          </label>
          {/* Un champ sans nom est gardé (l'autosave passe à chaque frappe)
              mais le visiteur ne le verra pas : on le DIT, sinon la
              créatrice croit son champ en ligne. */}
          {!c.label.trim() && <p className="text-[11px] text-amber-700 dark:text-amber-400">{t("customFieldUnnamed")}</p>}
        </div>
      ))}
      {complet ? (
        <p className="text-[11px] text-muted-foreground">{t("customFieldsMax", { max: MAX_CHAMPS_PERSONNALISES })}</p>
      ) : (
        <button
          type="button"
          onClick={ajouter}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed hover:bg-muted text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> {t("customFieldAdd")}
        </button>
      )}
    </div>
  );
}
