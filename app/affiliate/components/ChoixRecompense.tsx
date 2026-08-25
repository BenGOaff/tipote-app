"use client";

// app/affiliate/components/ChoixRecompense.tsx
//
// LE CHOIX DE L'AFFILIÉ, ET CE QU'IL GAGNE.
//
// Béné, 25 août 2026 : "on pourra laisser le choix à l'affilié : soit
// réduire le prix de son abonnement, soit augmenter ses commissions
// quand il a des affiliés. C'est lui qui choisit quand il remplit son
// profil et il peut switcher quand il veut de l'un à l'autre (ce sera
// pris en compte pour le mois suivant)."
//
// L'écran montre les DEUX. Sans la comparaison, choisir revient à
// parier : il ne peut pas savoir si ses filleuls valent mieux en remise
// ou en commission, donc il ne changera jamais et le choix ne sert à
// rien.
//
// Et il dit franchement que le changement vaut pour le mois suivant. Un
// écran qui laisserait croire à un effet immédiat produirait un ticket
// de support par personne, le lendemain.

import { useEffect, useState } from "react";

type Etat = {
  choix: "commissions" | "abonnement";
  filleuls: number;
  remiseAboPct: number;
  commissionPct: number;
  calculeeLe: string | null;
  aVenir: { remiseAboPct: number; commissionPct: number };
  autreChoix: { choix: string; remiseAboPct: number; commissionPct: number };
  prochaine: { manque: number; valeur: number } | null;
  indisponible?: boolean;
};

export default function ChoixRecompense() {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const res = await fetch("/api/affiliate/recompense");
        const j = (await res.json()) as Etat & { ok?: boolean };
        if (vivant && j.ok) setEtat(j);
      } catch {
        // Silencieux : ce bloc est un bonus sur la page de paiement, il
        // ne doit pas afficher une erreur rouge si le réseau tousse.
      }
    })();
    return () => {
      vivant = false;
    };
  }, []);

  if (!etat) return null;

  const basculer = async (choix: "commissions" | "abonnement") => {
    if (choix === etat.choix) return;
    setEnvoi(true);
    setMsg(null);
    try {
      const res = await fetch("/api/affiliate/recompense", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choix }),
      });
      const j = (await res.json()) as Etat & { ok?: boolean; effet?: string };
      // Un `ok: false` produit TOUJOURS quelque chose à l'écran.
      if (!j.ok) {
        setMsg("Ton choix n'a pas été enregistré. Réessaie dans un instant.");
        return;
      }
      setEtat(j);
      setMsg(
        j.effet === "le-mois-prochain"
          ? "C'est noté. Ça prend effet au prochain calcul, le mois prochain : ce mois-ci, rien ne change."
          : "C'était déjà ton choix.",
      );
    } catch {
      setMsg("Réseau indisponible. Rien n'a été enregistré.");
    } finally {
      setEnvoi(false);
    }
  };

  const carte = (
    choix: "commissions" | "abonnement",
    titre: string,
    valeur: string,
    detail: string,
  ) => (
    <button
      type="button"
      onClick={() => void basculer(choix)}
      disabled={envoi}
      className={`flex-1 rounded-xl border p-4 text-left transition ${
        etat.choix === choix
          ? "border-primary bg-primary/5"
          : "hover:border-primary/40 hover:bg-muted/40"
      }`}
    >
      <div className="text-sm font-semibold">{titre}</div>
      <div className="mt-1 text-2xl font-bold">{valeur}</div>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      {etat.choix === choix && (
        <p className="mt-2 text-xs font-medium text-primary">C&apos;est ton choix actuel.</p>
      )}
    </button>
  );

  return (
    <div className="rounded-xl border p-4 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Ta récompense</h2>
        <p className="text-sm text-muted-foreground">
          {etat.filleuls === 0
            ? "Dès que des personnes que tu as amenées sont abonnées et paient, tu gagnes une récompense. À toi de choisir laquelle."
            : `${etat.filleuls} ${etat.filleuls > 1 ? "personnes que tu as amenées sont abonnées" : "personne que tu as amenée est abonnée"} et paie. Tu choisis comment on te le rend.`}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        {carte(
          "commissions",
          "Des commissions plus fortes",
          `${etat.choix === "commissions" ? etat.commissionPct : etat.autreChoix.commissionPct} %`,
          "Sur chaque mois payé par les personnes que tu amènes. Ça marche même si tu n'es pas abonné toi-même.",
        )}
        {carte(
          "abonnement",
          "Ton abonnement moins cher",
          `-${etat.choix === "abonnement" ? etat.remiseAboPct : etat.autreChoix.remiseAboPct} %`,
          "Sur ton propre abonnement Tiquiz. À 100 personnes, il est offert. Sans abonnement, cette option ne te donne rien.",
        )}
      </div>

      {etat.prochaine && (
        <p className="text-sm">
          Encore <strong>{etat.prochaine.manque}</strong>{" "}
          {etat.prochaine.manque > 1 ? "abonnés" : "abonné"} et tu passes à{" "}
          <strong>
            {etat.choix === "abonnement"
              ? `-${etat.prochaine.valeur} %`
              : `${etat.prochaine.valeur} %`}
          </strong>
          .
        </p>
      )}

      {/* ON NE CACHE PAS QUE LES DEUX NE SE CUMULENT PAS. C'est la même
          récompense versée de deux façons, et laisser croire au cumul
          serait une déception au premier virement. */}
      <p className="text-xs text-muted-foreground">
        Une seule des deux à la fois : c&apos;est la même récompense, versée d&apos;un côté
        ou de l&apos;autre. Tu peux changer quand tu veux, et ça prend effet au calcul
        du mois suivant.
        {etat.calculeeLe
          ? ` Dernier calcul : ${new Date(etat.calculeeLe).toLocaleDateString("fr-FR")}.`
          : ""}
      </p>

      {msg && <p className="text-sm font-medium">{msg}</p>}
    </div>
  );
}
