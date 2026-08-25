"use client";

// app/partage/[jeton]/InstallerQuiz.tsx
//
// L'aperçu, le bouton, et ce qu'il reste à faire après.
//
// UN `ok: false` PRODUIT TOUJOURS QUELQUE CHOSE À L'ÉCRAN (règle du
// 3 août). Chaque raison rendue par le serveur a sa phrase, et une
// raison qu'on ne connaît pas en a une aussi : un bouton sans effet est
// la seule chose que la personne retiendrait.

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type Apercu = {
  titre: string;
  sous_titre: string | null;
  mode: string;
  image: string | null;
  couleur: string | null;
  nb_questions: number;
  nb_resultats: number;
  a_personnaliser: string[];
};

/** Le serveur renvoie une RAISON, l'écran choisit la phrase. */
const RAISONS: Record<string, string> = {
  inconnu: "Ce lien de partage n'existe pas, ou le quiz a été supprimé depuis.",
  revoque: "Ce lien a été désactivé par la personne qui vous l'a envoyé.",
  expire: "Ce lien a expiré. Demandez en un nouveau, ça prend dix secondes.",
  epuise: "Ce lien a déjà servi le nombre de fois prévu.",
  panne: "Impossible de lire ce lien pour le moment. Réessayez dans un instant.",
  non_connecte: "Connectez vous à Tiquiz, puis revenez sur ce lien : le quiz s'installera.",
  limite_quiz:
    "Le plan gratuit est limité à 1 quiz. Passez en plan payant, ou supprimez un quiz, puis revenez sur ce lien.",
  limite_sondage:
    "Le plan gratuit est limité à 1 sondage. Passez en plan payant, ou supprimez un sondage, puis revenez sur ce lien.",
  installation_impossible:
    "L'installation n'a pas abouti. Rien n'a été créé, vous pouvez réessayer.",
};

/** Ce qui a été volontairement laissé chez l'expéditeur. */
const A_FAIRE: Record<string, string> = {
  "tags-systeme-io": "Vos tags Systeme.io (ceux du quiz d'origine ne sont pas repris).",
  "url-bouton": "L'adresse de vos boutons d'action.",
  "politique-confidentialite": "Le lien vers VOTRE politique de confidentialité.",
  tracking: "Vos identifiants de suivi (Meta, Google Analytics, Google Ads).",
  "pied-de-page": "Le texte et le lien de votre pied de page.",
};

export function InstallerQuiz({ jeton }: { jeton: string }) {
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [installe, setInstalle] = useState<{ id: string; aFaire: string[] } | null>(null);

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const r = await fetch(`/api/partage/${jeton}`, { cache: "no-store" });
        const d = await r.json();
        if (!vivant) return;
        if (d?.ok) setApercu(d.apercu as Apercu);
        else setErreur(RAISONS[String(d?.raison)] ?? RAISONS.panne);
      } catch {
        if (vivant) setErreur(RAISONS.panne);
      } finally {
        if (vivant) setChargement(false);
      }
    })();
    return () => {
      vivant = false;
    };
  }, [jeton]);

  async function installer() {
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await fetch(`/api/partage/${jeton}`, { method: "POST" });
      const d = await r.json();
      if (d?.ok) {
        setInstalle({ id: String(d.id), aFaire: (d.a_personnaliser ?? []) as string[] });
      } else if (d?.raison === "non_connecte") {
        // On revient ICI après la connexion : sans ça, elle atterrit sur
        // son tableau de bord et doit retrouver le lien dans ses emails.
        window.location.assign(`/login?redirect=${encodeURIComponent(`/partage/${jeton}`)}`);
        return;
      } else {
        setErreur(RAISONS[String(d?.raison)] ?? RAISONS.installation_impossible);
      }
    } catch {
      setErreur(RAISONS.installation_impossible);
    } finally {
      setEnvoi(false);
    }
  }

  if (chargement) {
    return <p className="text-muted-foreground">Lecture du lien...</p>;
  }

  if (installe) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Le quiz est chez vous.</h1>
        <p className="mt-3 text-muted-foreground">
          Il est arrivé en brouillon, avec ses textes, ses images, ses questions et ses
          profils de résultat. Rien n&apos;est publié tant que vous ne le décidez pas.
        </p>
        {installe.aFaire.length > 0 && (
          <div className="mt-6 rounded-xl border p-5">
            <p className="font-semibold">Avant de le publier, à vous de remplir :</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {installe.aFaire.map((c) => (
                <li key={c}>- {A_FAIRE[c] ?? c}</li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">
              Ces champs désignaient le compte de la personne qui vous a envoyé le quiz.
              Les laisser vous aurait envoyé ses visiteurs, et vos leads dans ses
              automatisations.
            </p>
          </div>
        )}
        <Button className="mt-6" onClick={() => window.location.assign(`/quiz/${installe.id}`)}>
          Ouvrir mon quiz
        </Button>
      </div>
    );
  }

  if (!apercu) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Ce lien ne mène nulle part</h1>
        <p className="mt-3 text-muted-foreground">{erreur ?? RAISONS.inconnu}</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground">
        Un quiz vous a été partagé
      </p>
      <h1 className="mt-1 text-2xl font-bold">{apercu.titre || "Quiz sans titre"}</h1>
      {apercu.sous_titre && (
        <div
          className="mt-3 text-muted-foreground"
          // Le sous-titre est du texte riche déjà nettoyé côté serveur au
          // moment de sa sauvegarde (lib/richText.ts).
          dangerouslySetInnerHTML={{ __html: apercu.sous_titre }}
        />
      )}
      {apercu.image && (
        // w-full h-auto : l'image garde SON format (règle du 4 août).
        <img src={apercu.image} alt="" className="mt-5 w-full h-auto rounded-xl" />
      )}
      <p className="mt-5 text-sm text-muted-foreground">
        {apercu.nb_questions} question{apercu.nb_questions > 1 ? "s" : ""}
        {apercu.nb_resultats > 0
          ? `, ${apercu.nb_resultats} profil${apercu.nb_resultats > 1 ? "s" : ""} de résultat`
          : ""}
        . Tout est modifiable une fois installé.
      </p>

      {apercu.a_personnaliser.length > 0 && (
        <div className="mt-6 rounded-xl border bg-muted/40 p-5">
          <p className="text-sm font-semibold">Ce qui restera à vous :</p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {apercu.a_personnaliser.map((c) => (
              <li key={c}>- {A_FAIRE[c] ?? c}</li>
            ))}
          </ul>
        </div>
      )}

      <Button className="mt-6" onClick={installer} disabled={envoi}>
        {envoi ? "Installation..." : "Installer ce quiz chez moi"}
      </Button>
      {erreur && <p className="mt-3 text-sm text-destructive">{erreur}</p>}
      <p className="mt-4 text-sm text-muted-foreground">
        Il faut un compte Tiquiz. Si vous n&apos;êtes pas connecté, on vous y emmène et on
        revient ici.
      </p>
    </div>
  );
}
