"use client";

// app/affiliate/apercu/liens/AffiliatePreviewClient.tsx
//
// L'écran de chantier : choisir son code, voir ses liens.
//
// Il n'est PAS traduit et c'est volontaire : il n'est visible que par
// Béné, et le traduire en six langues avant que la page de vente et le
// paiement soient posés reviendrait à figer des mots qui vont encore
// bouger. La traduction se fera au moment de l'ouverture aux affiliées,
// en une passe, quand le vocabulaire sera stable.

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Link2, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

/** Les raisons que le serveur renvoie, traduites ici et nulle part ailleurs. */
const RAISONS: Record<string, string> = {
  empty: "Écris un code.",
  too_short: "Trop court : 3 caractères au minimum.",
  too_long: "Trop long : 20 caractères au maximum.",
  charset: "Lettres, chiffres et tirets uniquement.",
  reserved: "Ce mot est déjà un chemin de l'application.",
  taken: "Ce code est déjà pris.",
  write_failed: "L'enregistrement a échoué. Réessaie.",
  invalid_body: "Requête illisible.",
  not_found: "Cet écran n'est pas ouvert.",
};

type Destination = { slug: string; label: string };

function Copier({ valeur }: { valeur: string }) {
  const [fait, setFait] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(valeur);
          setFait(true);
          setTimeout(() => setFait(false), 2000);
        } catch {
          // Le presse-papier peut être refusé : on ne casse rien, le
          // lien reste sélectionnable à la main juste à côté.
        }
      }}
    >
      {fait ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}

export default function AffiliatePreviewClient({
  baseUrl,
  refInitial,
  destinations,
}: {
  baseUrl: string;
  refInitial: string;
  destinations: Destination[];
}) {
  const [saisie, setSaisie] = useState(refInitial);
  const [refActif, setRefActif] = useState(refInitial);
  const [canal, setCanal] = useState("");
  const [verif, setVerif] = useState<{ chargement: boolean; libre: boolean | null; raison: string | null }>({
    chargement: false,
    libre: null,
    raison: null,
  });
  const [enregistrement, setEnregistrement] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Vérification de disponibilité, en différé : on ne lance pas une
  // requête par frappe.
  useEffect(() => {
    const propre = saisie.trim();
    if (!propre || propre === refActif) {
      setVerif({ chargement: false, libre: null, raison: null });
      return;
    }
    setVerif({ chargement: true, libre: null, raison: null });
    const minuteur = setTimeout(async () => {
      try {
        const r = await fetch(`/api/affiliate/ref?ref=${encodeURIComponent(propre)}`);
        const data = (await r.json()) as { available?: boolean; reason?: string | null };
        setVerif({
          chargement: false,
          libre: data.available ?? false,
          raison: data.reason ?? null,
        });
      } catch {
        setVerif({ chargement: false, libre: null, raison: null });
      }
    }, 400);
    return () => clearTimeout(minuteur);
  }, [saisie, refActif]);

  async function enregistrer() {
    setEnregistrement(true);
    setMessage(null);
    try {
      const r = await fetch("/api/affiliate/ref", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: saisie.trim() }),
      });
      const data = (await r.json()) as { ok?: boolean; ref?: string; reason?: string; previousRef?: string | null };
      // Un `ok: false` produit TOUJOURS quelque chose à l'écran
      // (règle du 3 août) : un échec silencieux envoie chercher au
      // mauvais endroit.
      if (!data.ok) {
        setMessage(RAISONS[data.reason ?? ""] ?? "Enregistrement impossible.");
        return;
      }
      setRefActif(data.ref ?? saisie.trim());
      setMessage(
        data.previousRef
          ? `Code enregistré. Ton ancien lien (${data.previousRef}) continue de fonctionner pour toujours.`
          : "Code enregistré.",
      );
    } catch {
      setMessage("Le réseau a coupé. Réessaie.");
    } finally {
      setEnregistrement(false);
    }
  }

  const canalPropre = useMemo(
    () => canal.trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24),
    [canal],
  );

  const liens = useMemo(() => {
    if (!refActif) return [];
    return destinations.map((d) => ({
      ...d,
      url: `${baseUrl}/go/${refActif}/${d.slug}${canalPropre ? `/${canalPropre}` : ""}`,
    }));
  }, [refActif, destinations, baseUrl, canalPropre]);

  const peutEnregistrer =
    saisie.trim().length > 0 && saisie.trim() !== refActif && verif.libre === true && !enregistrement;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            Ton code
          </CardTitle>
          <CardDescription>
            Il devient ton lien. Tu peux le changer quand tu veux : les anciens
            continuent de fonctionner et de t&apos;attribuer les ventes, pour
            toujours.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{baseUrl}/go/</span>
            <Input
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              placeholder="jocelyne"
              className="max-w-[16rem]"
            />
            <Button onClick={enregistrer} disabled={!peutEnregistrer}>
              {enregistrement ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
            </Button>
          </div>

          {verif.chargement && (
            <p className="text-xs text-muted-foreground">Vérification...</p>
          )}
          {!verif.chargement && verif.libre === true && (
            <p className="text-xs text-emerald-600">Disponible.</p>
          )}
          {!verif.chargement && verif.libre === false && (
            <p className="text-xs text-destructive">
              {RAISONS[verif.raison ?? ""] ?? "Indisponible."}
            </p>
          )}
          {message && <p className="text-sm">{message}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tes liens</CardTitle>
          <CardDescription>
            Le canal est facultatif : il sert à comparer ce qui marche
            (youtube, newsletter, story-mardi). Sans canal, la provenance est
            quand même devinée à partir du site d&apos;où vient le clic.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Canal :</span>
            <Input
              value={canal}
              onChange={(e) => setCanal(e.target.value)}
              placeholder="youtube"
              className="max-w-[14rem]"
            />
            {canalPropre && <Badge variant="secondary">{canalPropre}</Badge>}
          </div>

          {!refActif && (
            <p className="text-sm text-muted-foreground">
              Choisis d&apos;abord ton code au dessus.
            </p>
          )}

          {liens.map((l) => (
            <div key={l.slug} className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <span className="text-sm font-medium min-w-[12rem]">{l.label}</span>
              <code className="text-xs bg-muted rounded px-2 py-1 break-all flex-1">{l.url}</code>
              <Copier valeur={l.url} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
