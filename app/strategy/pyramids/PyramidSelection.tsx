"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Gift, Zap, Crown, Check, ArrowRight } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { useToast } from "@/components/ui/use-toast";

interface PyramidOffer {
  title: string;
  composition: string;
  purpose: string;
  format: string;
}

interface Pyramid {
  id: string;
  name: string;
  strategy_summary: string;
  lead_magnet: PyramidOffer;
  low_ticket: PyramidOffer;
  high_ticket: PyramidOffer;
}

function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return "";
}

function normalizeNewSchema(p: any, idx: number): Pyramid {
  return {
    id: String(p?.id ?? idx),
    name: String(p?.name ?? `Stratégie ${idx + 1}`),
    strategy_summary: String(p?.strategy_summary ?? ""),
    lead_magnet: {
      title: asString(p?.lead_magnet?.title ?? ""),
      composition: asString(p?.lead_magnet?.composition ?? ""),
      purpose: asString(p?.lead_magnet?.purpose ?? ""),
      format: asString(p?.lead_magnet?.format ?? ""),
    },
    low_ticket: {
      title: asString(p?.low_ticket?.title ?? ""),
      composition: asString(p?.low_ticket?.composition ?? ""),
      purpose: asString(p?.low_ticket?.purpose ?? ""),
      format: asString(p?.low_ticket?.format ?? ""),
    },
    high_ticket: {
      title: asString(p?.high_ticket?.title ?? ""),
      composition: asString(p?.high_ticket?.composition ?? ""),
      purpose: asString(p?.high_ticket?.purpose ?? ""),
      format: asString(p?.high_ticket?.format ?? ""),
    },
  };
}

/**
 * Legacy schema support (ce que tu as dans business_plan.plan_json aujourd’hui):
 * offer_pyramids: [{ scenario, rationale, offers: [{name,type,price,description?}, ...] }]
 *
 * Mapping:
 * - lead_magnet = offers[0]
 * - low_ticket  = offers[1]
 * - high_ticket = last offer
 */
function normalizeLegacySchema(p: any, idx: number): Pyramid {
  const offers = Array.isArray(p?.offers) ? p.offers : [];
  const lead = offers[0] ?? {};
  const low = offers[1] ?? offers[0] ?? {};
  const high = offers.length ? offers[offers.length - 1] : offers[1] ?? offers[0] ?? {};

  const scenario = asString(p?.scenario ?? `Scénario ${idx + 1}`);
  const rationale = asString(p?.rationale ?? "");

  const toOffer = (o: any): PyramidOffer => ({
    title: asString(o?.name ?? o?.title ?? ""),
    composition: asString(o?.description ?? ""),
    purpose: "",
    format: asString(o?.type ?? o?.format ?? ""),
  });

  return {
    id: String(idx),
    name: scenario,
    strategy_summary: rationale,
    lead_magnet: toOffer(lead),
    low_ticket: toOffer(low),
    high_ticket: toOffer(high),
  };
}

function looksLikeNewSchema(p: any): boolean {
  return !!p && (p.lead_magnet || p.low_ticket || p.high_ticket);
}

export default function PyramidSelection() {
  const router = useRouter();
  const { toast } = useToast();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [pyramids, setPyramids] = useState<Pyramid[]>([]);
  const [selectedPyramid, setSelectedPyramid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function loadFromPlan() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/");
      router.refresh();
      return { ok: false as const, reason: "no_user" as const };
    }

    const { data: planRow, error: planError } = await supabase
      .from("business_plan")
      .select("plan_json")
      .eq("user_id", user.id)
      .maybeSingle();

    if (planError) throw planError;

    const planJson = (planRow?.plan_json ?? null) as any;
    const offerPyramids = Array.isArray(planJson?.offer_pyramids) ? planJson.offer_pyramids : [];

    if (!offerPyramids.length) {
      return { ok: false as const, reason: "no_pyramids" as const };
    }

    const normalized: Pyramid[] = offerPyramids.slice(0, 3).map((p: any, idx: number) => {
      if (looksLikeNewSchema(p)) return normalizeNewSchema(p, idx);
      return normalizeLegacySchema(p, idx);
    });

    setPyramids(normalized);
    return { ok: true as const };
  }

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        setLoading(true);

        // 1) tenter de charger depuis plan
        const firstTry = await loadFromPlan();
        if (firstTry.ok) return;

        if (firstTry.reason === "no_user") return;

        // 2) si pas de pyramides, générer puis recharger
        await fetch("/api/strategy", { method: "POST" }).catch(() => null);

        const secondTry = await loadFromPlan();
        if (!secondTry.ok) {
          toast({
            title: "Génération en cours...",
            description: "Nous préparons tes 3 stratégies. Réessaie dans quelques secondes.",
          });
        }
      } catch (error) {
        console.error("Error loading pyramids:", error);
        toast({
          title: "Erreur",
          description: "Impossible de charger les pyramides. Réessaie.",
          variant: "destructive",
        });
      } finally {
        if (mounted) setLoading(false);
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, [router, supabase, toast]);

  const selected = useMemo(() => {
    if (!selectedPyramid) return null;
    return pyramids.find((p) => p.id === selectedPyramid) ?? null;
  }, [pyramids, selectedPyramid]);

  const handleSelectPyramid = async () => {
    if (!selected) return;

    try {
      setSubmitting(true);

      const selectedIndex = pyramids.findIndex((p) => p.id === selected.id);
      if (selectedIndex < 0) throw new Error("Index de pyramide introuvable.");

      const patchRes = await fetch("/api/strategy/offer-pyramid", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedIndex, pyramid: selected }),
      });

      const patchJson = await patchRes.json().catch(() => ({} as any));
      if (!patchRes.ok) {
        throw new Error(patchJson?.error || "Impossible de sauvegarder votre choix.");
      }

      const syncRes = await fetch("/api/tasks/sync", { method: "POST" });
      const syncJson = await syncRes.json().catch(() => ({} as any));
      if (!syncRes.ok || syncJson?.ok === false) {
        throw new Error(syncJson?.error || "Impossible de générer les tâches.");
      }

      toast({
        title: "Stratégie sélectionnée ✅",
        description: "Tes tâches ont été générées. Bienvenue dans Tipote™ !",
      });

      router.push("/app");
      router.refresh();
    } catch (error) {
      console.error("Error selecting pyramid:", error);
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de sauvegarder votre choix.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // === UI Lovable (structure JSX + className) ===
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-primary/5 flex flex-col items-center justify-center p-6">
        <div className="text-center space-y-6">
          <div className="flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Création de ta stratégie...</h1>
            <p className="text-muted-foreground max-w-md">
              Nous préparons 3 scénarios de pyramide d’offres adaptés à ton business.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-primary/5">
      <main className="container mx-auto px-4 py-10 max-w-6xl">
        <div className="space-y-8">
          <div className="text-center space-y-3">
            <div className="flex items-center justify-center gap-2">
              <Sparkles className="w-6 h-6 text-primary" />
              <h1 className="text-3xl font-bold tracking-tight">Choisis ta pyramide d’offres</h1>
            </div>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Tipote™ te propose 3 scénarios. Choisis celui qui te ressemble le plus pour générer ton plan d’action.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {pyramids.map((pyramid, idx) => {
              const isSelected = selectedPyramid === pyramid.id;

              const Icon = idx === 0 ? Gift : idx === 1 ? Zap : Crown;
              const badge =
                idx === 0 ? "Accessible" : idx === 1 ? "Ambitieux" : "Premium";

              return (
                <Card
                  key={pyramid.id}
                  className={`relative transition-all cursor-pointer hover:shadow-lg ${
                    isSelected ? "ring-2 ring-primary shadow-lg" : ""
                  }`}
                  onClick={() => setSelectedPyramid(pyramid.id)}
                >
                  <CardHeader className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Icon className="w-5 h-5 text-primary" />
                          </div>
                          <Badge variant="secondary">{badge}</Badge>
                        </div>
                        <CardTitle className="text-xl">{pyramid.name}</CardTitle>
                        <CardDescription className="text-sm">
                          {pyramid.strategy_summary}
                        </CardDescription>
                      </div>

                      {isSelected && (
                        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-4 h-4 text-primary-foreground" />
                        </div>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <div className="rounded-lg border bg-card p-3">
                        <p className="text-xs font-medium text-muted-foreground">Lead magnet</p>
                        <p className="font-semibold">{pyramid.lead_magnet.title}</p>
                        <p className="text-sm text-muted-foreground">{pyramid.lead_magnet.composition}</p>
                      </div>

                      <div className="rounded-lg border bg-card p-3">
                        <p className="text-xs font-medium text-muted-foreground">Low ticket</p>
                        <p className="font-semibold">{pyramid.low_ticket.title}</p>
                        <p className="text-sm text-muted-foreground">{pyramid.low_ticket.composition}</p>
                      </div>

                      <div className="rounded-lg border bg-card p-3">
                        <p className="text-xs font-medium text-muted-foreground">High ticket</p>
                        <p className="font-semibold">{pyramid.high_ticket.title}</p>
                        <p className="text-sm text-muted-foreground">{pyramid.high_ticket.composition}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="flex flex-col items-center gap-4">
            <Button
              size="lg"
              disabled={!selectedPyramid || submitting}
              onClick={handleSelectPyramid}
              className="w-full max-w-md"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Validation...
                </>
              ) : (
                <>
                  Valider cette stratégie
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              Vous pourrez modifier vos offres à tout moment dans les paramètres.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
