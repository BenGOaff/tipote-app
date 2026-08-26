"use client";

// app/affiliate/components/NouveautesProgramme.tsx
//
// CE QUI A CHANGÉ DANS LE PROGRAMME, DIT À L'AFFILIÉ.
//
// Béné, 26 août 2026 : "je ne vois toujours rien des nouveaux liens ni
// nouveaux système ni rien sur affiliate : en l'état je peux pas dire à
// mes users allez sur affiliate vous verrez tout est à jour et
// expliqué !"
//
// Elle avait raison sur le fond, et le diagnostic est plus intéressant
// que le symptôme : **tout était corrigé, et rien n'était annoncé.** Les
// écrans disaient les bons chiffres, les liens portaient le bon format,
// le versement existait vraiment. Mais un affilié qui revient sur son
// espace voit exactement la même page qu'avant, donc pour lui il ne
// s'est rien passé.
//
// C'est la leçon du 3 août, transposée à l'affiliation : une nouveauté
// qu'on ne montre pas n'existe pas, et la personne finit par bricoler
// autour, ou par continuer d'utiliser son ancien lien.
//
// -- POURQUOI ÇA SE FERME, ET POURQUOI ÇA SE SOUVIENT ------------------
//
// Un bandeau permanent devient du mobilier : on cesse de le lire au bout
// de deux visites, et il pousse vers le bas ce qui compte vraiment (ses
// liens, ses chiffres). Il se ferme donc, et le choix est retenu dans
// `localStorage`, par affilié.
//
// Pas de colonne, pas de migration : c'est une préférence d'affichage,
// pas une donnée métier. Et la lecture se fait APRÈS le montage, sinon
// le serveur rendrait le bandeau et le client le retirerait aussitôt,
// ce qui casse l'hydratation.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AffiliateDict } from "../i18n/types";

/** Une clé par affilié : deux personnes sur le même navigateur ne se
 *  masquent pas l'annonce l'une à l'autre. */
function cleMemoire(sa: string): string {
  return `tipote:affiliate:nouveautes:2026-08-26:${sa}`;
}

export default function NouveautesProgramme({
  t,
  sa,
  conditionsUrl,
}: {
  t: AffiliateDict;
  sa: string;
  conditionsUrl: string;
}) {
  const [monte, setMonte] = useState(false);
  const [masque, setMasque] = useState(false);

  useEffect(() => {
    try {
      setMasque(window.localStorage.getItem(cleMemoire(sa)) === "1");
    } catch {
      // Navigation privée, stockage refusé : on affiche. Une annonce en
      // trop ne coûte rien, une annonce jamais vue coûte un affilié qui
      // continue avec son ancien lien.
      setMasque(false);
    }
    setMonte(true);
  }, [sa]);

  if (!monte || masque) return null;

  const fermer = () => {
    setMasque(true);
    try {
      window.localStorage.setItem(cleMemoire(sa), "1");
    } catch {
      /* rien à faire : la fermeture vaut pour cette visite */
    }
  };

  const points = [
    [t.nouveautes.p1_titre, t.nouveautes.p1_corps],
    [t.nouveautes.p2_titre, t.nouveautes.p2_corps],
    [t.nouveautes.p3_titre, t.nouveautes.p3_corps],
    [t.nouveautes.p4_titre, t.nouveautes.p4_corps],
    [t.nouveautes.p5_titre, t.nouveautes.p5_corps],
  ] as const;

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardContent className="pt-6 space-y-5">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold tracking-tight">{t.nouveautes.titre}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t.nouveautes.intro}</p>
          </div>
          <button
            type="button"
            onClick={fermer}
            aria-label={t.nouveautes.masquer}
            className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="space-y-3">
          {points.map(([titre, corps]) => (
            <li key={titre} className="text-sm">
              <span className="font-semibold text-foreground">{titre}.</span>{" "}
              <span className="text-muted-foreground">{corps}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild size="sm">
            <Link href="/liens">{t.nouveautes.cta_liens}</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/paiement">{t.nouveautes.cta_paiement}</Link>
          </Button>
          {/* Les conditions vivent sur le domaine de Tiquiz : lien
              EXTERNE, donc `<a target="_blank">` et jamais `<Link>`.
              Un affilié qui va lire les conditions ne doit pas perdre
              l'écran d'où il vient (règle du 24 août). */}
          <Button asChild size="sm" variant="ghost">
            <a href={conditionsUrl} target="_blank" rel="noopener noreferrer">
              {t.nouveautes.cta_conditions}
            </a>
          </Button>
          <Button size="sm" variant="ghost" onClick={fermer} className="ml-auto">
            {t.nouveautes.masquer}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
