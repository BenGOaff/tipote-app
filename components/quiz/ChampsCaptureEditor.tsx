"use client";

// components/quiz/ChampsCaptureEditor.tsx
//
// TOUT le formulaire de capture se règle ICI, en UN SEUL endroit (Béné,
// 17 septembre 2026) : « pour les infos demandées : un seul endroit où on
// trouve TOUT : prénom, nom, téléphone, champ personnalisé etc. »
//
// Avant, la colonne portait DEUX blocs : une rangée de pastilles pour les
// champs intégrés, puis une section « Champs personnalisés » avec son
// titre, son explication, ses cartes et son propre bouton d'ajout. Deux
// endroits pour la même question (« qu'est-ce que je demande au
// visiteur ? »), et un nom de champ rendu en 14px au milieu d'une colonne
// écrite en 12px.
//
// Et ce bloc était RECOPIÉ dans les quatre éditeurs (quiz et sondage, des
// deux dépôts) : le pilote du prénom demandé à l'accueil n'existait que
// côté quiz, et Tipote y portait un libellé écrit en dur EN FRANÇAIS dans
// une interface qui existe en 7 langues. Une règle recopiée finit toujours
// par en oublier un : il n'y a plus qu'un composant, identique à l'octet
// près dans les deux dépôts.
//
// Il ne décide de RIEN sur la donnée : la forme d'un champ personnalisé,
// ses bornes et son identité vivent dans lib/quiz/champsPersonnalises.ts,
// et le libellé montré au visiteur vient de lib/quiz/champsCapture.ts.
//
// `ns` est le namespace de traduction de l'éditeur qui l'appelle :
// `quizEditor` chez Tiquiz, `quizDetail` chez Tipote. C'est le SEUL
// paramètre qui diffère entre les deux dépôts : les clés des libellés
// sont les mêmes des deux côtés (Tipote portait `pillEmail` et compagnie,
// renommées le 17 septembre 2026), donc le composant les résout lui même
// et aucun appelant n'écrit de phrase.

import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import {
  MAX_CHAMPS_PERSONNALISES,
  nouvelIdChamp,
  type ChampPersonnalise,
} from "@/lib/quiz/champsPersonnalises";

// Un champ intégré du formulaire. `setActif` absent = la pastille est
// VERROUILLÉE : c'est le cas du prénom déjà demandé sur l'écran d'accueil,
// qui est bien récupéré sur le lead mais que le visiteur ne revoit pas
// ici. Une pastille verrouillée n'a pas de case « obligatoire » : elle
// décrirait un champ qui n'est pas sur cet écran.
export type ChampIntegre = {
  actif: boolean;
  setActif?: (v: boolean) => void;
  obligatoire: boolean;
  setObligatoire: (v: boolean) => void;
};

type Props = {
  ns: "quizEditor" | "quizDetail";
  prenom: ChampIntegre;
  nom: ChampIntegre;
  telephone: ChampIntegre;
  pays: ChampIntegre;
  champs: ChampPersonnalise[];
  onChangeChamps: (champs: ChampPersonnalise[]) => void;
};

// L'ASTÉRISQUE SE CALCULE, il ne s'écrit plus dans le libellé (Béné,
// 17 septembre 2026). « Nom* » était figé dans la traduction alors que le
// nom n'est obligatoire que si la case est cochée : la pastille annonçait
// une contrainte que le visiteur ne subissait pas. Maintenant l'étoile dit
// la vérité, et elle la dit pour un champ personnalisé comme pour un champ
// intégré.
function avecEtoile(label: string, obligatoire: boolean) {
  return obligatoire ? `${label} *` : label;
}

function Pastille({
  label,
  titre,
  etat,
  sansNom,
  onClick,
}: {
  label: string;
  titre?: string;
  etat: "verrouille" | "actif" | "inactif";
  sansNom?: boolean;
  onClick?: () => void;
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors border max-w-full";
  const texte = <span className={`truncate ${sansNom ? "italic opacity-70" : ""}`}>{label}</span>;
  if (etat === "verrouille") {
    return (
      <span className={`${base} bg-muted text-muted-foreground border-border`} title={titre ?? label}>
        {texte}
      </span>
    );
  }
  if (etat === "actif") {
    return (
      <button
        type="button"
        onClick={onClick}
        title={titre ?? label}
        className={`${base} bg-primary/10 text-primary border-primary/30 hover:bg-primary/15`}
      >
        {texte}
        <X className="w-3 h-3 shrink-0 opacity-60" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={titre ?? label}
      className={`${base} bg-background text-muted-foreground border-dashed border-border hover:text-foreground hover:border-primary/30`}
    >
      <Plus className="w-3 h-3 shrink-0" />
      {texte}
    </button>
  );
}

export default function ChampsCaptureEditor({
  ns,
  prenom,
  nom,
  telephone,
  pays,
  champs,
  onChangeChamps,
}: Props) {
  const t = useTranslations(ns);
  const complet = champs.length >= MAX_CHAMPS_PERSONNALISES;

  const integres: Array<ChampIntegre & { cle: string; label: string; labelVerrouille?: string; labelObligatoire: string }> = [
    { cle: "prenom", label: t("fieldFirstName"), labelVerrouille: t("fieldFirstNameFromIntro"), labelObligatoire: t("fieldFirstNameRequiredToggle"), ...prenom },
    { cle: "nom", label: t("fieldLastName"), labelObligatoire: t("fieldLastNameRequiredToggle"), ...nom },
    { cle: "telephone", label: t("fieldPhone"), labelObligatoire: t("fieldPhoneRequired"), ...telephone },
    { cle: "pays", label: t("fieldCountry"), labelObligatoire: t("fieldCountryRequiredToggle"), ...pays },
  ];

  const ajouter = () => {
    if (complet) return;
    // La graine vient d'ici, le format de l'id vient du module : un id
    // écrit à la main dans un composant finirait par diverger du format
    // que le serveur accepte, et le champ serait jeté en silence.
    const id = nouvelIdChamp(Math.random().toString(36).slice(2) + Date.now().toString(36));
    onChangeChamps([...champs, { id, label: "", placeholder: "", required: false }]);
  };

  const modifier = (id: string, patch: Partial<ChampPersonnalise>) =>
    onChangeChamps(champs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const nomDuChamp = (c: ChampPersonnalise) => c.label.trim();
  const ilManqueUnNom = champs.some((c) => !nomDuChamp(c));
  // Aucune case à cocher = pas de bloc du tout : un conteneur vide laisse
  // une marge qui se lit comme un trou dans la colonne.
  const aDesCases = integres.some((c) => c.setActif && c.actif) || champs.length > 0;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-1.5">
        {/* L'email est toujours obligatoire : son étoile est vraie par
            construction, elle ne se coche pas. */}
        <Pastille label={avecEtoile(t("fieldEmail"), true)} etat="verrouille" />
        {integres.map((c) =>
          !c.setActif ? (
            <Pastille key={c.cle} label={c.labelVerrouille ?? c.label} etat="verrouille" />
          ) : (
            <Pastille
              key={c.cle}
              label={avecEtoile(c.label, c.actif && c.obligatoire)}
              etat={c.actif ? "actif" : "inactif"}
              onClick={() => c.setActif?.(!c.actif)}
            />
          ),
        )}
        {/* LES CHAMPS PERSONNALISÉS SONT DANS LA MÊME RANGÉE. Ils ne sont
            pas d'une autre nature pour la créatrice : c'est une info de
            plus demandée au visiteur, comme le téléphone. Leur nom se tape
            dans l'aperçu (WYSIWYG), donc la pastille ne fait que
            l'afficher, et la croix RETIRE le champ. */}
        {champs.map((c) => {
          const n = nomDuChamp(c);
          return (
            <Pastille
              key={c.id}
              label={n ? avecEtoile(n, c.required) : t("customFieldNoName")}
              titre={n || t("customFieldNoName")}
              sansNom={!n}
              etat="actif"
              onClick={() => onChangeChamps(champs.filter((x) => x.id !== c.id))}
            />
          );
        })}
      </div>
      {/* UN SEUL BOUTON, ET IL AJOUTE UN CHAMP PERSONNALISÉ. L'ancien
          « Ajouter un élément » rallumait le premier champ intégré éteint,
          c'est à dire exactement ce que fait déjà la pastille en pointillés
          juste au dessus : deux gestes pour une seule chose. */}
      {complet ? (
        <p className="text-[11px] text-muted-foreground">{t("customFieldsMax", { max: MAX_CHAMPS_PERSONNALISES })}</p>
      ) : (
        <button
          type="button"
          onClick={ajouter}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-muted/60 hover:bg-muted text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> {t("addField")}
        </button>
      )}
      {/* Les cases « obligatoire », intégrés et personnalisés dans la MÊME
          liste, dans l'ordre des pastilles. L'email reste obligatoire
          d'office : il n'a pas de case. */}
      {aDesCases && (<div className="flex flex-col gap-1.5">
        {integres.map((c) =>
          c.setActif && c.actif ? (
            <label key={c.cle} className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={c.obligatoire}
                onChange={(e) => c.setObligatoire(e.target.checked)}
                className="h-3.5 w-3.5 accent-primary"
              />
              <span>{c.labelObligatoire}</span>
            </label>
          ) : null,
        )}
        {champs.map((c) => {
          const n = nomDuChamp(c);
          return (
            <label key={c.id} className="flex items-center gap-2 min-w-0 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={c.required}
                onChange={(e) => modifier(c.id, { required: e.target.checked })}
                className="h-3.5 w-3.5 accent-primary"
              />
              <span className="truncate">{n ? t("customFieldRequiredNamed", { nom: n }) : t("customFieldRequired")}</span>
            </label>
          );
        })}
      </div>)}
      {/* Un champ sans nom est gardé (l'autosave passe à chaque frappe)
          mais le visiteur ne le verra pas : on le DIT, sinon la créatrice
          croit son champ en ligne. */}
      {ilManqueUnNom && <p className="text-[11px] text-amber-700 dark:text-amber-400">{t("customFieldUnnamed")}</p>}
    </div>
  );
}
