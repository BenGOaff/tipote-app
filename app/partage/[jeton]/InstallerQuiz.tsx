"use client";

// app/partage/[jeton]/InstallerQuiz.tsx
//
// L'aperçu, le bouton, et ce qu'il reste à faire après.
//
// LA LANGUE VIENT DU QUIZ, pas du navigateur ni de la session : celui
// qui reçoit un quiz anglais lit l'anglais, sinon on ne le lui aurait
// pas envoyé. Le raisonnement et les textes vivent dans
// lib/quiz/partageTextes.ts. `?lang=` reste accepté et gagne, comme sur
// le centre d'aide.
//
// UN `ok: false` PRODUIT TOUJOURS QUELQUE CHOSE À L'ÉCRAN (règle du
// 3 août). Chaque raison rendue par le serveur a sa phrase, et une
// raison qu'on ne connaît pas retombe sur celle de la panne : un bouton
// sans effet est la seule chose que la personne retiendrait.

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { AFaire } from "@/lib/quiz/partage";
import {
  estRtl,
  languePartage,
  textesPartage,
  type TextesPartage,
} from "@/lib/quiz/partageTextes";

type Apercu = {
  titre: string;
  sous_titre: string | null;
  mode: string;
  langue: string | null;
  image: string | null;
  couleur: string | null;
  nb_questions: number;
  nb_resultats: number;
  a_personnaliser: AFaire[];
};

type Raison = keyof TextesPartage["raisons"];

export function InstallerQuiz({ jeton }: { jeton: string }) {
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [raison, setRaison] = useState<Raison | null>(null);
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [installe, setInstalle] = useState<{ id: string; aFaire: AFaire[] } | null>(null);
  // La langue demandée à la main, lue une seule fois : elle vient de
  // l'URL, donc de n'importe qui, et `languePartage` la valide.
  const [demandee, setDemandee] = useState<string | null>(null);

  useEffect(() => {
    setDemandee(new URLSearchParams(window.location.search).get("lang"));
  }, []);

  const langue = languePartage(demandee, apercu?.langue);
  const t = textesPartage(langue);
  const rtl = estRtl(langue);

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const r = await fetch(`/api/partage/${jeton}`, { cache: "no-store" });
        const d = await r.json();
        if (!vivant) return;
        if (d?.ok) setApercu(d.apercu as Apercu);
        else setRaison(lireRaison(d?.raison));
      } catch {
        if (vivant) setRaison("panne");
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
    setRaison(null);
    try {
      const r = await fetch(`/api/partage/${jeton}`, { method: "POST" });
      const d = await r.json();
      if (d?.ok) {
        setInstalle({ id: String(d.id), aFaire: (d.a_personnaliser ?? []) as AFaire[] });
      } else if (d?.raison === "non_connecte") {
        // On revient ICI après la connexion, en gardant la langue :
        // sans ça elle atterrit sur son tableau de bord et doit
        // retrouver le lien dans ses emails.
        const retour = `/partage/${jeton}${demandee ? `?lang=${encodeURIComponent(demandee)}` : ""}`;
        window.location.assign(`/login?redirect=${encodeURIComponent(retour)}`);
        return;
      } else {
        setRaison(lireRaison(d?.raison, "installation_impossible"));
      }
    } catch {
      setRaison("installation_impossible");
    } finally {
      setEnvoi(false);
    }
  }

  const cadre = rtl ? ({ dir: "rtl" as const } as const) : {};

  if (chargement) {
    return <p className="text-muted-foreground" {...cadre}>{t.lecture}</p>;
  }

  if (installe) {
    return (
      <div {...cadre}>
        <h1 className="text-2xl font-bold">{t.installeTitre}</h1>
        <p className="mt-3 text-muted-foreground">{t.installeCorps}</p>
        {installe.aFaire.length > 0 && (
          <div className="mt-6 rounded-xl border p-5">
            <p className="font-semibold">{t.avantPublier}</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {installe.aFaire.map((c) => (
                <li key={c}>- {t.aFaire[c] ?? c}</li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">{t.pourquoiVide}</p>
          </div>
        )}
        <Button className="mt-6" onClick={() => window.location.assign(`/quiz/${installe.id}`)}>
          {t.ouvrir}
        </Button>
      </div>
    );
  }

  if (!apercu) {
    return (
      <div {...cadre}>
        <h1 className="text-2xl font-bold">{t.liensMort}</h1>
        <p className="mt-3 text-muted-foreground">{t.raisons[raison ?? "inconnu"]}</p>
      </div>
    );
  }

  return (
    <div {...cadre}>
      <p className="text-sm font-medium text-muted-foreground">{t.surtitre}</p>
      <h1 className="mt-1 text-2xl font-bold">{apercu.titre || "Quiz"}</h1>
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
        // eslint-disable-next-line @next/next/no-img-element
        <img src={apercu.image} alt="" className="mt-5 w-full h-auto rounded-xl" />
      )}
      <p className="mt-5 text-sm text-muted-foreground">
        {t.questions(apercu.nb_questions)}
        {apercu.nb_resultats > 0 ? `, ${t.resultats(apercu.nb_resultats)}` : ""}
        {". "}
        {t.toutModifiable}
      </p>

      {apercu.a_personnaliser.length > 0 && (
        <div className="mt-6 rounded-xl border bg-muted/40 p-5">
          <p className="text-sm font-semibold">{t.resteAToi}</p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {apercu.a_personnaliser.map((c) => (
              <li key={c}>- {t.aFaire[c] ?? c}</li>
            ))}
          </ul>
        </div>
      )}

      <Button className="mt-6" onClick={installer} disabled={envoi}>
        {envoi ? t.installation : t.installer}
      </Button>
      {raison && <p className="mt-3 text-sm text-destructive">{t.raisons[raison]}</p>}
      <p className="mt-4 text-sm text-muted-foreground">{t.compteRequis}</p>
    </div>
  );
}

/** Une raison qu'on ne connaît pas ne doit jamais donner un écran muet. */
function lireRaison(brut: unknown, defaut: Raison = "panne"): Raison {
  const connues: Raison[] = [
    "inconnu",
    "revoque",
    "expire",
    "epuise",
    "panne",
    "non_connecte",
    "limite_quiz",
    "limite_sondage",
    "installation_impossible",
  ];
  const v = String(brut ?? "");
  return (connues as string[]).includes(v) ? (v as Raison) : defaut;
}
