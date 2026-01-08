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
  price_range?: string;
}

interface Pyramid {
  id: string;
  name: string;
  strategy_summary: string;
  lead_magnet: PyramidOffer;
  low_ticket: PyramidOffer;
  high_ticket: PyramidOffer;
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

    const normalized: Pyramid[] = offerPyramids.slice(0, 3).map((p: any, idx: number) => ({
      id: String(p?.id ?? idx),
      name: String(p?.name ?? `Stratégie ${idx + 1}`),
      strategy_summary: String(p?.strategy_summary ?? ""),
      lead_magnet: p?.lead_magnet ?? {},
      low_ticket: p?.low_ticket ?? {},
      high_ticket: p?.high_ticket ?? {},
    }));

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

  const handleSelectPyramid = async () => {
    if (!selectedPyramid) return;
    const pyramid = pyramids.find((p) => p.id === selectedPyramid);
    if (!pyramid) return;

    setSubmitting(true);

    try {
      const selectedIndex = pyramids.findIndex((p) => p.id === selectedPyramid);

      const patchRes = await fetch("/api/strategy/offer-pyramid", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedIndex, pyramid }),
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
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col items-center justify-center p-6">
        <div className="text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto animate-pulse">
            <Sparkles className="w-8 h-8 text-primary-foreground" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-display font-bold">Génération de vos stratégies...</h2>
            <p className="text-muted-foreground">
              L&apos;IA analyse votre profil pour créer 3 pyramides d&apos;offres personnalisées
            </p>
          </div>
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
      <header className="p-6 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-xl">Tipote™</span>
          </div>
          <Badge variant="secondary">Dernière étape</Badge>
        </div>
      </header>

      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="text-center space-y-3">
            <h1 className="text-3xl font-display font-bold">Choisissez votre stratégie</h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Basé sur votre profil, l&apos;IA a créé 3 pyramides d&apos;offres adaptées à votre situation. Choisissez celle qui
              correspond le mieux à votre vision.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {pyramids.map((pyramid) => (
              <Card
                key={pyramid.id}
                className={`cursor-pointer transition-all duration-300 hover:shadow-lg ${
                  selectedPyramid === pyramid.id ? "ring-2 ring-primary shadow-lg scale-[1.02]" : "hover:scale-[1.01]"
                }`}
                onClick={() => setSelectedPyramid(pyramid.id)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{pyramid.name}</CardTitle>
                    {selectedPyramid === pyramid.id && (
                      <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-4 h-4 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                  <CardDescription className="text-sm italic">&quot;{pyramid.strategy_summary}&quot;</CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                    <div className="flex items-center gap-2">
                      <Gift className="w-4 h-4 text-green-500" />
                      <span className="text-xs font-medium uppercase text-muted-foreground">Lead Magnet</span>
                      <Badge variant="outline" className="text-xs ml-auto">
                        Gratuit
                      </Badge>
                    </div>
                    <p className="font-medium text-sm">{pyramid.lead_magnet?.title}</p>
                    <p className="text-xs text-muted-foreground">{pyramid.lead_magnet?.format}</p>
                    <p className="text-xs">{pyramid.lead_magnet?.purpose}</p>
                  </div>

                  <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-blue-500" />
                      <span className="text-xs font-medium uppercase text-muted-foreground">Low Ticket</span>
                      <Badge variant="outline" className="text-xs ml-auto">
                        {pyramid.low_ticket?.price_range}
                      </Badge>
                    </div>
                    <p className="font-medium text-sm">{pyramid.low_ticket?.title}</p>
                    <p className="text-xs text-muted-foreground">{pyramid.low_ticket?.format}</p>
                    <p className="text-xs">{pyramid.low_ticket?.purpose}</p>
                  </div>

                  <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                    <div className="flex items-center gap-2">
                      <Crown className="w-4 h-4 text-amber-500" />
                      <span className="text-xs font-medium uppercase text-muted-foreground">High Ticket</span>
                      <Badge variant="outline" className="text-xs ml-auto">
                        {pyramid.high_ticket?.price_range}
                      </Badge>
                    </div>
                    <p className="font-medium text-sm">{pyramid.high_ticket?.title}</p>
                    <p className="text-xs text-muted-foreground">{pyramid.high_ticket?.format}</p>
                    <p className="text-xs">{pyramid.high_ticket?.purpose}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex justify-center pt-4">
            <Button
              size="lg"
              disabled={!selectedPyramid || submitting}
              onClick={handleSelectPyramid}
              className="min-w-[250px]"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Création des tâches...
                </>
              ) : (
                <>
                  Choisir cette stratégie
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Vous pourrez modifier vos offres à tout moment dans les paramètres.
          </p>
        </div>
      </main>
    </div>
  );
}
