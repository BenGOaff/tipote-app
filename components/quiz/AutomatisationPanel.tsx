"use client";

// components/quiz/AutomatisationPanel.tsx
//
// L'ONGLET AUTOMATISATION (Béné, 1er septembre 2026).
//
// "Un onglet Automatisation qui explique le workflow et les tags précis à
// créer dans Systeme.io. Pas un truc générique, un truc réel."
//
// LE POINT QUI JUSTIFIE TOUT L'ÉCRAN : poser un tag ne déclenche RIEN
// chez Systeme.io tant qu'aucune règle ne l'écoute. Mesuré le 31 août.
//
// -- LA RECETTE EST DITE UNE FOIS, ET C'EST LE COEUR DE L'ÉCRAN --------
//
// Premier jet : une carte par tag, chacune répétant les trois mêmes
// clics. Béné : "empiler les conseils qui disent la même chose t'es sûr
// que c'est le plus lisible ? Genre 1 : les profils et 2 : le bonus de
// partage. Et ensuite tu ne répètes pas."
//
// Les trois clics sont IDENTIQUES pour tous les tags. Ils vivent donc en
// haut, une seule fois, et chaque groupe ne porte plus que ses noms de
// tags. Un quiz à six profils passait de dix-huit lignes de marche à
// suivre à trois, plus six noms.
//
// -- ET LE NOM D'UN PROFIL N'EST PAS SON TITRE BRUT -------------------
//
// Il porte des balises (`<div class="rt-field-fs" ...>`) et des
// variables. C'est `resultChoiceLabel` qui le nettoie, dans le module
// pur, jamais ici : l'écran affiche ce qu'on lui donne.

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, ExternalLink, Info, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useSioTagsContext } from "@/components/ui/sio-tags-provider";
import {
  cleRelieeDepuisTags,
  construirePlanAutomatisation,
  type GroupeAutomatisation,
  type LigneAutomatisation,
  type ManqueAutomatisation,
  type QuestionPourPlan,
  type QuizPourPlan,
  type ResultatPourPlan,
} from "@/lib/automatisation/planSysteme";

const URL_REGLES = "https://systeme.io/dashboard/automation-rules";

/** Le nom du tag, cliquable pour le copier. */
function Tag({ valeur }: { valeur: string }) {
  const t = useTranslations("automatisation");
  const [copie, setCopie] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(valeur);
          setCopie(true);
          window.setTimeout(() => setCopie(false), 1500);
        } catch {
          // Copie refusée (navigateur strict) : on le DIT, sinon le clic
          // n'a aucun effet visible et on croit le bouton cassé.
          toast.error(t("copyError", { tag: valeur }));
        }
      }}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border bg-muted/60 px-2 py-1 font-mono text-[13px] hover:bg-muted transition-colors"
      title={t("copyTag")}
    >
      {valeur}
      {copie ? (
        <Check className="w-3 h-3 text-green-600" />
      ) : (
        <Copy className="w-3 h-3 opacity-50" />
      )}
    </button>
  );
}

/** Le libellé d'une ligne : ce que le tag désigne, ou rien. */
function useLibelle() {
  const t = useTranslations("automatisation");
  return (l: LigneAutomatisation): string | null => {
    if (l.contexte) return l.contexte;
    // Un profil sans titre reste identifiable par son rang. C'est
    // l'écran qui traduit : le module pur ne parle aucune langue.
    if (l.rang) return t("profilSansNom", { n: l.rang });
    return null;
  };
}

function Groupe({ groupe, numero }: { groupe: GroupeAutomatisation; numero: number | null }) {
  const t = useTranslations("automatisation");
  const libelle = useLibelle();

  const titre = t(`groupe.${groupe.type}.titre`);
  const aide = t(`groupe.${groupe.type}.aide`);

  // "Rien à créer" : une NOTE, pas une tâche. Pas de numéro, pas de
  // tag à copier, et un fond neutre. Une règle de plus ouvrirait
  // l'accès deux fois, et ça ne se voit qu'en recevant deux emails.
  if (groupe.action === "rien") {
    return (
      <section className="rounded-xl border border-dashed p-4">
        <div className="flex items-start gap-2.5">
          <Info className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
          <div className="space-y-1.5 min-w-0">
            <h3 className="font-semibold text-sm">{titre}</h3>
            <p className="text-sm text-muted-foreground">{aide}</p>
            <p className="text-sm">
              {groupe.lignes.map((l) => libelle(l)).filter(Boolean).join(", ")}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border p-4 space-y-3">
      <div className="flex items-baseline gap-2.5">
        {numero !== null && (
          <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold inline-flex items-center justify-center">
            {numero}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="font-semibold">{titre}</h3>
          <p className="text-sm text-muted-foreground">{aide}</p>
        </div>
      </div>

      {/* L'action à choisir à l'étape 3 est la SEULE chose qui change
          d'un groupe à l'autre. On ne la dit que quand elle diffère de
          la recette, sinon on répète ce qui est déjà écrit en haut. */}
      {groupe.action === "email" && (
        <p className="text-sm">{t("actionAutre")}</p>
      )}

      <ul className="divide-y rounded-lg border bg-background">
        {groupe.lignes.map((l) => {
          const nom = libelle(l);
          return (
            <li key={l.cle} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-sm min-w-0 truncate">{nom ?? t("tagSansContexte")}</span>
              <Tag valeur={l.tag} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Manque({ manque }: { manque: ManqueAutomatisation }) {
  const t = useTranslations("automatisation");
  const profil = manque.contexte || (manque.rang ? t("profilSansNom", { n: manque.rang }) : "");
  const texte =
    manque.type === "cle-api"
      ? t("manqueCle")
      : manque.type === "tag-profil"
        ? t("manqueTagProfil", { profil })
        : manque.type === "tag-capture"
          ? t("manqueTagCapture")
          : t("manqueTagPartage");
  return (
    <div
      className={`rounded-lg border p-3 text-sm ${
        manque.bloquant
          ? "border-destructive/40 bg-destructive/5"
          : "border-amber-500/40 bg-amber-500/5"
      }`}
    >
      <div className="flex items-start gap-2">
        <TriangleAlert
          className={`w-4 h-4 mt-0.5 shrink-0 ${manque.bloquant ? "text-destructive" : "text-amber-600"}`}
        />
        <span>{texte}</span>
      </div>
    </div>
  );
}

export function AutomatisationPanel({
  quiz,
  resultats,
  questions,
}: {
  quiz: QuizPourPlan;
  resultats: ResultatPourPlan[];
  questions: QuestionPourPlan[];
}) {
  const t = useTranslations("automatisation");

  // LA CLÉ SE DEMANDE À SYSTEME.IO, ELLE NE SE LIT PAS DANS UNE COLONNE.
  //
  // `quiz.sio_api_key_id` est une SURCHARGE par quiz, pas la clé du
  // compte : vide, elle veut dire "pas de surcharge", et `resolveApiKey`
  // retombe sur la clé par défaut. Le premier jet criait donc "aucune
  // clé reliée" à toute créatrice qui n'avait jamais touché à cette
  // surcharge, c'est à dire à presque tout le monde.
  //
  // Le provider, lui, a VRAIMENT demandé ses tags : il sait. C'est ce
  // panneau qui déclenche le chargement, sinon la réponse n'arriverait
  // que si la créatrice ouvrait un sélecteur de tag.
  const sio = useSioTagsContext();
  const charger = sio?.loadTags;
  useEffect(() => {
    void charger?.();
  }, [charger]);

  const plan = useMemo(
    () =>
      construirePlanAutomatisation(quiz, resultats, questions, {
        cleReliee: cleRelieeDepuisTags({
          tags: sio?.tags ?? null,
          noApiKey: sio?.noApiKey ?? false,
          error: sio?.error ?? false,
        }),
      }),
    [quiz, resultats, questions, sio?.tags, sio?.noApiKey, sio?.error],
  );

  const bloquant = plan.manques.some((m) => m.bloquant);
  const aFaire = plan.groupes.filter((g) => g.action !== "rien");

  // LE SCROLL VIT ICI. L'éditeur est en `h-screen ... overflow-hidden` :
  // sans conteneur défilant, tout ce qui dépasse est simplement
  // inatteignable, et c'est exactement ce que Béné a vu.
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="space-y-2">
          <h2 className="text-xl font-bold">{t("titre")}</h2>
          <p className="text-sm text-muted-foreground">{t("intro")}</p>
          {/* LA PHRASE QUI MANQUAIT PARTOUT : un tag posé ne déclenche
              rien tant qu'aucune règle ne l'écoute. */}
          <p className="text-sm">{t("pourquoi")}</p>
        </div>

        {plan.manques.length > 0 && (
          <div className="space-y-2">
            {plan.manques.map((m, i) => (
              <Manque key={`${m.type}-${i}`} manque={m} />
            ))}
          </div>
        )}

        {!bloquant && plan.groupes.length === 0 && (
          // LE VIDE PARLE : un écran vide se lit "c'est cassé" ou "je
          // n'ai rien à faire ici", et les deux coûtent une créatrice.
          <div className="rounded-lg border border-dashed p-6 text-center space-y-2">
            <p className="font-medium">{t("videTitre")}</p>
            <p className="text-sm text-muted-foreground">{t("videTexte")}</p>
          </div>
        )}

        {plan.groupes.length > 0 && (
          <>
            {aFaire.length > 0 && (
              <div className="rounded-xl border bg-muted/40 p-4 space-y-3">
                <div>
                  <h3 className="font-semibold">{t("recetteTitre")}</h3>
                  <p className="text-sm text-muted-foreground">{t("recetteAide")}</p>
                </div>
                <ol className="space-y-1.5 text-sm">
                  {["recette1", "recette2", "recette3"].map((cle, i) => (
                    <li key={cle} className="flex gap-2">
                      <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                      <span>{t(cle)}</span>
                    </li>
                  ))}
                </ol>
                <Button asChild variant="outline" size="sm">
                  <a href={URL_REGLES} target="_blank" rel="noopener noreferrer">
                    {t("ouvrirSysteme")} <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
                  </a>
                </Button>
              </div>
            )}

            <div className="space-y-4">
              {plan.groupes.map((g, i) => (
                <Groupe
                  key={g.type}
                  groupe={g}
                  numero={g.action === "rien" ? null : i + 1}
                />
              ))}
            </div>

            <p className="text-xs text-muted-foreground">{t("noteFin")}</p>
          </>
        )}
      </div>
    </div>
  );
}
