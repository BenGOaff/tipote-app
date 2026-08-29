"use client";

// app/affiliate/admin/affilies/ImportSio.tsx
//
// Coller la liste des affiliés Systeme.io pour qu'ils EXISTENT chez
// nous, avec leur identifiant Systeme.io comme clé et un code public
// à eux. C'est ce qui réunit les deux portes d'entrée (`?sa=` et
// `?ref=`) sur une seule personne.
//
// APERÇU D'ABORD, TOUJOURS. Chaque ligne crée quelqu'un qui pourra être
// payé : une liste collée de travers ne doit pas se découvrir après
// l'écriture.

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Refusee = { ligne: number; contenu: string; raison: string };
type Apercu = {
  affilies: { sa: string; email: string; nom: string | null }[];
  refusees: Refusee[];
};
type Resultat = { crees: number; existants: number; refusees: Refusee[]; erreurs: { sa: string; message: string }[] };

const RAISONS: Record<string, string> = {
  "sa-invalide": "identifiant Systeme.io illisible",
  "email-invalide": "adresse email illisible",
  "colonnes-manquantes": "ni identifiant ni adresse sur la ligne",
  doublon: "identifiant déjà présent plus haut dans la liste",
};

export function ImportSio() {
  const [liste, setListe] = useState("");
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function appeler(appliquer: boolean) {
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await fetch("/api/affiliate/admin/import-sio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ liste, appliquer }),
      });
      const j = await r.json();
      if (!j.ok) {
        setErreur("L'import n'a pas abouti.");
        return;
      }
      if (j.apercu) {
        setApercu({ affilies: j.affilies, refusees: j.refusees });
        setResultat(null);
      } else {
        setResultat(j as Resultat);
        setApercu(null);
      }
    } catch {
      setErreur("L'import n'a pas abouti.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-5">
        <div>
          <h2 className="text-lg font-semibold">Importer les affiliés Systeme.io</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Une ligne par affilié : son identifiant Systeme.io et son adresse email, dans
            l&apos;ordre que tu veux, séparés par une tabulation, un point-virgule ou une virgule.
            Chacun reçoit un code public, donc ses liens <code>?ref=</code> comme ses anciens
            liens <code>?sa=</code> le désignent lui.
          </p>
        </div>

        <textarea
          value={liste}
          onChange={(e) => setListe(e.target.value)}
          rows={8}
          spellCheck={false}
          className="w-full rounded-lg border p-3 font-mono text-xs"
          placeholder={"sa0134...;eric@exemple.fr;Eric\nsa0280...;jocelyne@exemple.fr;Jocelyne"}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => void appeler(false)} disabled={envoi || !liste.trim()}>
            Prévisualiser
          </Button>
          {apercu && apercu.affilies.length > 0 && (
            <Button onClick={() => void appeler(true)} disabled={envoi}>
              Importer {apercu.affilies.length} affilié{apercu.affilies.length > 1 ? "s" : ""}
            </Button>
          )}
          {erreur && <span className="text-sm text-destructive">{erreur}</span>}
        </div>

        {apercu && (
          <div className="space-y-2 text-sm">
            <p className="font-medium">
              {apercu.affilies.length} ligne{apercu.affilies.length > 1 ? "s" : ""} comprise
              {apercu.affilies.length > 1 ? "s" : ""}, {apercu.refusees.length} refusée
              {apercu.refusees.length > 1 ? "s" : ""}.
            </p>
            {apercu.affilies.slice(0, 10).map((a) => (
              <p key={a.sa} className="font-mono text-xs text-muted-foreground">
                {a.sa} · {a.email}
                {a.nom ? ` · ${a.nom}` : ""}
              </p>
            ))}
            {apercu.affilies.length > 10 && (
              <p className="text-xs text-muted-foreground">
                et {apercu.affilies.length - 10} autres.
              </p>
            )}
            {/* CE QUI EST REFUSÉ SE DIT, avec son numéro de ligne : sinon
                l'affilié absent se découvre au moment de le payer. */}
            {apercu.refusees.map((r) => (
              <p key={r.ligne} className="text-xs text-amber-700 dark:text-amber-300">
                Ligne {r.ligne} : {RAISONS[r.raison] ?? r.raison}
              </p>
            ))}
          </div>
        )}

        {resultat && (
          <div className="space-y-1 text-sm">
            <p className="font-medium text-emerald-700 dark:text-emerald-300">
              {resultat.crees} créé{resultat.crees > 1 ? "s" : ""}, {resultat.existants} déjà
              présent{resultat.existants > 1 ? "s" : ""} (inchangé
              {resultat.existants > 1 ? "s" : ""}, code public assuré).
            </p>
            {resultat.erreurs.map((e) => (
              <p key={e.sa} className="font-mono text-xs text-destructive">
                {e.sa} : {e.message}
              </p>
            ))}
            {resultat.refusees.map((r) => (
              <p key={r.ligne} className="text-xs text-amber-700 dark:text-amber-300">
                Ligne {r.ligne} : {RAISONS[r.raison] ?? r.raison}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
