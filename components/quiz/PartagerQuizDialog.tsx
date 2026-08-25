"use client";

// components/quiz/PartagerQuizDialog.tsx
//
// LES LIENS DE PARTAGE D'UN QUIZ, VUS PAR SON PROPRIÉTAIRE.
//
// Un lien par destinataire, avec son libellé, son compteur et son
// interrupteur. Le libellé ("pour Sophie") ne sort JAMAIS chez celui qui
// reçoit : c'est une note pour s'y retrouver, pas un message.
//
// UN `ok: false` PRODUIT TOUJOURS QUELQUE CHOSE À L'ÉCRAN (3 août) : la
// migration peut ne pas être passée, et une liste vide se lirait "tu
// n'as aucun lien" au lieu de "je n'ai pas pu regarder".

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Link2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Lien = {
  id: string;
  token: string;
  label: string | null;
  enabled: boolean;
  expires_at: string | null;
  max_installs: number | null;
  installs_count: number;
};

export function PartagerQuizDialog({
  quizId,
  open,
  onOpenChange,
}: {
  quizId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useTranslations("partageQuiz");
  const [liens, setLiens] = useState<Lien[]>([]);
  const [chargement, setChargement] = useState(false);
  const [libelle, setLibelle] = useState("");
  const [uneSeule, setUneSeule] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [copie, setCopie] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const r = await fetch(`/api/quiz/${quizId}/partage`, { cache: "no-store" });
      const d = await r.json();
      if (d?.ok) setLiens((d.liens ?? []) as Lien[]);
      else toast.error(t("loadError"));
    } catch {
      toast.error(t("loadError"));
    } finally {
      setChargement(false);
    }
  }, [quizId, t]);

  useEffect(() => {
    if (open) void charger();
  }, [open, charger]);

  // L'adresse où navigue vraiment la personne, jamais une constante de
  // build : un `NEXT_PUBLIC_APP_URL` mal renseigné produirait un lien
  // qui pointe sur la machine de celui qui le reçoit (drame Véronique,
  // 2 août).
  const urlDe = (token: string) =>
    typeof window === "undefined" ? "" : `${window.location.origin}/partage/${token}`;

  async function creer() {
    setEnCours(true);
    try {
      const r = await fetch(`/api/quiz/${quizId}/partage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: libelle.trim() || null,
          max_installs: uneSeule ? 1 : null,
        }),
      });
      const d = await r.json();
      if (d?.ok) {
        setLiens((l) => [d.lien as Lien, ...l]);
        setLibelle("");
        await copier((d.lien as Lien).token);
      } else {
        toast.error(t("createError"));
      }
    } catch {
      toast.error(t("createError"));
    } finally {
      setEnCours(false);
    }
  }

  async function copier(token: string) {
    try {
      await navigator.clipboard.writeText(urlDe(token));
      setCopie(token);
      toast.success(t("copied"));
      window.setTimeout(() => setCopie((c) => (c === token ? null : c)), 2000);
    } catch {
      // Le presse papier peut être refusé (permission, contexte non
      // sécurisé). On ne se tait pas : on montre l'adresse à copier.
      toast.error(t("copyError", { url: urlDe(token) }));
    }
  }

  async function basculer(lien: Lien) {
    try {
      const r = await fetch(`/api/quiz/${quizId}/partage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: lien.token, enabled: !lien.enabled }),
      });
      const d = await r.json();
      if (d?.ok) {
        setLiens((l) => l.map((x) => (x.token === lien.token ? (d.lien as Lien) : x)));
      } else {
        toast.error(t("updateError"));
      }
    } catch {
      toast.error(t("updateError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("intro")}</DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          {t("whatTravels")}
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor="partage-libelle">{t("labelField")}</Label>
            <Input
              id="partage-libelle"
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
              placeholder={t("labelPlaceholder")}
              maxLength={120}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={uneSeule}
              onChange={(e) => setUneSeule(e.target.checked)}
            />
            {t("onceOnly")}
          </label>
          <Button onClick={creer} disabled={enCours}>
            <Link2 className="mr-2 h-4 w-4" />
            {enCours ? t("creating") : t("create")}
          </Button>
        </div>

        <div className="mt-2 space-y-2">
          {chargement && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
          {!chargement && liens.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          )}
          {liens.map((l) => (
            <div key={l.id} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {l.label || t("unnamed")}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("installs", { n: l.installs_count })}
                    {l.max_installs ? ` / ${l.max_installs}` : ""}
                    {!l.enabled ? ` - ${t("revoked")}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copier(l.token)}
                    title={t("copy")}
                  >
                    {copie === l.token ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => basculer(l)}>
                    {l.enabled ? t("revoke") : t("reactivate")}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
