"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Sparkles,
  Gift,
  Zap,
  Crown,
  Check,
  ArrowRight,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { useToast } from "@/components/ui/use-toast";


interface OfferDetail {
  title: string;
  composition: string;
  purpose: string;
  format: string;
}

interface OfferSet {
  id: string;
  name: string;
  strategy_summary: string;
  lead_magnet: OfferDetail;
  low_ticket: OfferDetail;
  high_ticket: OfferDetail;
}

function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return "";
}

function normalizeNewSchema(p: any, idx: number): OfferSet {
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
 * Legacy schema support (ce que tu as dans business_plan.plan_json aujourd'hui):
 * offer_pyramids (DB key): [{ scenario, rationale, offers: [{name,type,price,description?}, ...] }]
 *
 * Mapping:
 * - lead_magnet = offers[0]
 * - low_ticket  = offers[1]
 * - high_ticket = last offer
 */
function normalizeLegacySchema(p: any, idx: number): OfferSet {
  const offers = Array.isArray(p?.offers) ? p.offers : [];
  const lead = offers[0] ?? {};
  const low = offers[1] ?? offers[0] ?? {};
  const high =
    offers.length ? offers[offers.length - 1] : offers[1] ?? offers[0] ?? {};

  const scenario = asString(p?.scenario ?? `Scénario ${idx + 1}`);
  const rationale = asString(p?.rationale ?? "");

  const toOffer = (o: any): OfferDetail => ({
    title: asString(o?.name ?? o?.title ?? ""),
    composition: asString(o?.description ?? o?.composition ?? ""),
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

// -------------------------
// ✅ Fallback anti-timeout / 504
// -------------------------
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function strategyExistsForUser(supabase: any, userId: string) {
  try {
    // Table/colonne : chez toi c’est "strategies" + "user_id" (vu dans ton Supabase)
    const { data, error } = await supabase
      .from("strategies")
      .select("id")
      .eq("user_id", userId)
      .limit(1);

    if (error) return false;
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

async function ensureStrategyAfterTimeout(supabase: any, userId: string) {
  // 3 tentatives ~6-7 sec : suffisant pour le cas “504 mais la route a fini en DB”
  for (let i = 0; i < 3; i++) {
    await sleep(2200);
    const ok = await strategyExistsForUser(supabase, userId);
    if (ok) return true;
  }
  return false;
}

export default function PyramidSelection() {
  const router = useRouter();
  const { toast } = useToast();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [offerSets, setOfferSets] = useState<OfferSet[]>([]);
  const [selectedOfferSetId, setSelectedOfferSetId] = useState<string | null>(null);
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
    const rawOfferSets = Array.isArray(planJson?.offer_pyramids)
      ? planJson.offer_pyramids
      : [];

    if (!rawOfferSets.length) {
      return { ok: false as const, reason: "no_offers" as const };
    }

    const normalized: OfferSet[] = rawOfferSets
      .slice(0, 3)
      .map((p: any, idx: number) => {
        if (looksLikeNewSchema(p)) return normalizeNewSchema(p, idx);
        return normalizeLegacySchema(p, idx);
      });

    setOfferSets(normalized);
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

        // 2) si pas d'offres, générer puis recharger
        await fetch("/api/strategy", { method: "POST" }).catch(() => null);

        const secondTry = await loadFromPlan();
        if (!secondTry.ok) {
          toast({
            title: "Génération en cours.",
            description:
              "Nous préparons tes 3 stratégies. Réessaie dans quelques secondes.",
          });
        }
      } catch (error) {
        console.error("Error loading offer sets:", error);
        toast({
          title: "Erreur",
          description: "Impossible de charger les offres. Réessaie.",
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
    if (!selectedOfferSetId) return null;
    return offerSets.find((p) => p.id === selectedOfferSetId) ?? null;
  }, [offerSets, selectedOfferSetId]);

  const handleSelectOfferSet = async () => {
    if (!selected) return;

    try {
      setSubmitting(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/");
        router.refresh();
        return;
      }

      const selectedIndex = offerSets.findIndex((p) => p.id === selected.id);
      if (selectedIndex < 0) throw new Error("Index d'offres introuvable.");

      const patchRes = await fetch("/api/strategy/offer-pyramid", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedIndex, pyramid: selected }),
      });

      const patchJson = await patchRes.json().catch(() => ({} as any));
      if (!patchRes.ok) {
        throw new Error(patchJson?.error || "Impossible de sauvegarder votre choix.");
      }

      // ✅ Générer la stratégie complète (idempotent)
      let fullRes: Response | null = null;
      let fullJson: any = null;

      try {
        fullRes = await fetch("/api/strategy", { method: "POST" });
        fullJson = await fullRes.json().catch(() => null);
      } catch {
        fullRes = null;
        fullJson = null;
      }

      const fullOk = Boolean(fullRes?.ok && fullJson?.ok !== false);
      if (!fullOk) {
        // ✅ fallback spécial timeouts (ex: 504) : la stratégie peut exister malgré tout
        const recovered = await ensureStrategyAfterTimeout(supabase, user.id);
        if (!recovered) {
          throw new Error(fullJson?.error || "Impossible de générer la stratégie complète.");
        }
      }

      // ✅ Puis seulement synchroniser les tâches depuis le plan (idempotent)
      const syncRes = await fetch("/api/tasks/sync", { method: "POST" });
      const syncJson = await syncRes.json().catch(() => ({} as any));
      if (!syncRes.ok || syncJson?.ok === false) {
        throw new Error(syncJson?.error || "Impossible de générer les tâches.");
      }

      toast({
        title: "Stratégie sélectionnée ✅",
        description:
          "Ta stratégie complète et tes tâches sont prêtes. Bienvenue dans Tipote™ !",
      });

      router.push("/app");
      router.refresh();
    } catch (error) {
      console.error("Error selecting offer set:", error);
      toast({
        title: "Erreur",
        description:
          error instanceof Error ? error.message : "Impossible de sauvegarder votre choix.",
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
              Nous préparons 3 scénarios d'offres adaptés à ton business.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-primary/5">
      <main className="container mx-auto px-4 py-10 max-w-6xl">
        <div className="text-center space-y-4 mb-10">
          <div className="flex items-center justify-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <span className="text-primary font-medium">Étape 1</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Choisis tes offres</h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Nous avons généré 3 stratégies différentes. Choisis celle qui correspond le mieux à ton style et à tes objectifs.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-10">
          {offerSets.map((offerSet) => (
            <Card
              key={offerSet.id}
              className={`relative overflow-hidden transition-all cursor-pointer border ${
                selectedOfferSetId === offerSet.id
                  ? "ring-2 ring-primary shadow-lg bg-primary/5 border-primary/30"
                  : "hover:shadow-md bg-background border-border"
              }`}

              onClick={() => setSelectedOfferSetId(offerSet.id)}
            >
              {selectedOfferSetId === offerSet.id && (
                <div className="absolute top-4 right-4 w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                  <Check className="w-5 h-5 text-primary-foreground" />
                </div>
              )}

              <CardHeader className="pb-4">
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      offerSet.id === "A"
                        ? "bg-primary/10"
                        : offerSet.id === "B"
                          ? "bg-secondary/10"
                          : "bg-accent/10"
                    }`}
                  >
                    {offerSet.id === "A" ? (
                      <Gift className="w-6 h-6 text-primary" />
                    ) : offerSet.id === "B" ? (
                      <Zap className="w-6 h-6 text-secondary" />
                    ) : (
                      <Crown className="w-6 h-6 text-accent" />
                    )}
                  </div>
                  <div>
                    <CardTitle className="text-xl">{offerSet.name}</CardTitle>
                    <Badge
                      variant="outline"
                      className={`mt-1 ${
                        offerSet.id === "A"
                          ? "border-primary/20 text-primary"
                          : offerSet.id === "B"
                            ? "border-secondary/20 text-secondary"
                            : "border-accent/20 text-accent"
                      }`}
                    >
                      {offerSet.id === "A"
                        ? "Simplicité"
                        : offerSet.id === "B"
                          ? "Expertise"
                          : "Scalabilité"}
                    </Badge>
                  </div>
                </div>
                <CardDescription className="text-sm">{offerSet.strategy_summary}</CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Lead Magnet
                    </p>
                    <p className="font-medium text-sm">{offerSet.lead_magnet.title}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Low Ticket
                    </p>
                    <p className="font-medium text-sm">{offerSet.low_ticket.title}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      High Ticket
                    </p>
                    <p className="font-medium text-sm">{offerSet.high_ticket.title}</p>
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    variant={selectedOfferSetId === offerSet.id ? "default" : "outline"}
                    className="w-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedOfferSetId(offerSet.id);
                    }}
                  >
                    {selectedOfferSetId === offerSet.id ? "Sélectionné" : "Choisir cette stratégie"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center space-y-4">
          <Button
            size="lg"
            className="px-8"
            disabled={!selectedOfferSetId || submitting}
            onClick={handleSelectOfferSet}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Validation...
              </>
            ) : (
              <>
                Continuer avec cette stratégie
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>

          <p className="text-sm text-muted-foreground">
            Tu pourras modifier tes offres plus tard dans l'onglet "Ma Stratégie".
          </p>
        </div>
      </main>
    </div>
  );
}
