"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
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
  Star,
  Check,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Package,
  Target,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { useToast } from "@/components/ui/use-toast";
import { callStrategySSE } from "@/lib/strategySSE";
import { callOfferPyramidSSE } from "@/lib/offerPyramidSSE";
import type { PyramidSet, PyramidOffer } from "@/lib/offerPyramidSSE";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(asString).filter(Boolean);
  return [];
}

function normalizePyramid(p: any, idx: number): PyramidSet {
  const normalizeOffer = (raw: any): PyramidOffer | null => {
    if (!raw) return null;
    return {
      title: asString(raw.title ?? raw.nom),
      titles: asArray(raw.titles ?? raw.title_options).length > 0
        ? asArray(raw.titles ?? raw.title_options)
        : [asString(raw.title ?? raw.nom)].filter(Boolean),
      pitch: asString(raw.pitch ?? raw.description),
      problem: asString(raw.problem ?? raw.probleme),
      transformation: asString(raw.transformation ?? raw.result),
      format: asString(raw.format ?? raw.type),
      price: typeof raw.price === "number" ? raw.price : undefined,
      bonuses: asArray(raw.bonuses ?? raw.bonus),
      guarantee: asString(raw.guarantee ?? raw.garantie),
      cta: asString(raw.cta ?? raw.call_to_action),
    };
  };

  return {
    id: String(p?.id ?? idx),
    name: asString(p?.name ?? `Pyramide ${idx + 1}`),
    strategy_summary: asString(p?.strategy_summary ?? p?.logique ?? ""),
    lead_magnet: normalizeOffer(p?.lead_magnet ?? p?.leadMagnet),
    low_ticket: normalizeOffer(p?.low_ticket ?? p?.lowTicket),
    middle_ticket: normalizeOffer(p?.middle_ticket ?? p?.middleTicket),
    high_ticket: normalizeOffer(p?.high_ticket ?? p?.highTicket),
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function strategyExistsForUser(supabase: any, userId: string) {
  try {
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
  for (let i = 0; i < 3; i++) {
    await sleep(2200);
    const ok = await strategyExistsForUser(supabase, userId);
    if (ok) return true;
  }
  return false;
}

// ─── Level icons ──────────────────────────────────────────────────────────────

const LEVEL_CONFIG = {
  lead_magnet: { icon: Gift, label: "Lead Magnet", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200", badge: "Gratuit" },
  low_ticket: { icon: Zap, label: "Low Ticket", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200", badge: "7€–97€" },
  middle_ticket: { icon: Star, label: "Middle Ticket", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", badge: "97€–497€" },
  high_ticket: { icon: Crown, label: "High Ticket", color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-200", badge: "497€+" },
} as const;

// ─── Offer card sub-component ─────────────────────────────────────────────────

function OfferCard({ offer, level, expanded, onToggle }: {
  offer: PyramidOffer;
  level: keyof typeof LEVEL_CONFIG;
  expanded: boolean;
  onToggle: () => void;
}) {
  const cfg = LEVEL_CONFIG[level];
  const Icon = cfg.icon;
  const priceLabel = typeof offer.price === "number"
    ? offer.price === 0 ? "Gratuit" : `${offer.price}€`
    : cfg.badge;

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg}/30 overflow-hidden transition-all`}>
      {/* Header — always visible */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/50 transition-colors"
      >
        <div className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg ${cfg.bg} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${cfg.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold uppercase tracking-wide ${cfg.color}`}>{cfg.label}</span>
            <Badge variant="outline" className={`text-[10px] ${cfg.border} ${cfg.color}`}>{priceLabel}</Badge>
          </div>
          <p className="font-semibold text-sm mt-1 leading-snug">{offer.title}</p>
        </div>
        <div className="flex-shrink-0 mt-1">
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/30 pt-3">
          {/* Alt titles */}
          {offer.titles.length > 1 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Titres alternatifs :</p>
              <div className="flex flex-wrap gap-1.5">
                {offer.titles.map((t, i) => (
                  <Badge key={i} variant="secondary" className="text-xs font-medium">{t}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Problem */}
          {offer.problem && (
            <div className="flex items-start gap-2">
              <Target className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-muted-foreground">Problème urgent :</p>
                <p className="text-sm">{offer.problem}</p>
              </div>
            </div>
          )}

          {/* Pitch */}
          {offer.pitch && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Pitch :</p>
              <p className="text-sm leading-relaxed">{offer.pitch}</p>
            </div>
          )}

          {/* Transformation */}
          {offer.transformation && (
            <div className="flex items-start gap-2">
              <ArrowRight className="w-3.5 h-3.5 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-muted-foreground">Transformation :</p>
                <p className="text-sm font-medium text-green-700">{offer.transformation}</p>
              </div>
            </div>
          )}

          {/* Format */}
          {offer.format && (
            <div className="flex items-center gap-2">
              <Package className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <p className="text-sm"><span className="text-muted-foreground">Format :</span> {offer.format}</p>
            </div>
          )}

          {/* Bonuses */}
          {offer.bonuses.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Bonus inclus :</p>
              <ul className="space-y-1">
                {offer.bonuses.map((b, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-sm">
                    <Check className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Guarantee */}
          {offer.guarantee && (
            <div className="flex items-start gap-2 bg-green-50 rounded-lg px-3 py-2">
              <ShieldCheck className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-green-700">Garantie :</p>
                <p className="text-sm text-green-800">{offer.guarantee}</p>
              </div>
            </div>
          )}

          {/* CTA */}
          {offer.cta && (
            <div className="rounded-lg bg-primary/5 px-3 py-2">
              <p className="text-sm font-semibold text-primary">{offer.cta}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PyramidSelection() {
  const router = useRouter();
  const { toast } = useToast();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [offerSets, setOfferSets] = useState<PyramidSet[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [progressStep, setProgressStep] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [bootStep, setBootStep] = useState(0);
  const [genError, setGenError] = useState(false);
  const [expandedOffers, setExpandedOffers] = useState<Record<string, boolean>>({});

  const BOOT_STEPS = [
    "Je sauvegarde ta sélection…",
    "Je construis ta stratégie personnalisée…",
    "Je génère tes premières tâches…",
    "Je peaufine ton espace…",
  ] as const;

  const toggleOffer = useCallback((key: string) => {
    setExpandedOffers((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  async function loadPyramids(): Promise<{ ok: boolean; reason?: string }> {
    try {
      const res = await fetch("/api/strategy/offer-pyramid");
      if (!res.ok) return { ok: false, reason: "fetch_error" };
      const json = await res.json();
      if (!json.success) return { ok: false, reason: "api_error" };

      const rawSets = Array.isArray(json.offer_pyramids) ? json.offer_pyramids : [];
      if (!rawSets.length) return { ok: false, reason: "no_offers" };

      const normalized = rawSets.slice(0, 3).map((p: any, idx: number) => normalizePyramid(p, idx));
      setOfferSets(normalized);
      return { ok: true };
    } catch {
      return { ok: false, reason: "network_error" };
    }
  }

  async function generateAndLoad() {
    setLoading(true);
    setGenError(false);
    setProgressStep("");

    try {
      const firstTry = await loadPyramids();
      if (firstTry.ok) { setLoading(false); return; }
      if (firstTry.reason === "no_user") { setLoading(false); return; }

      // Generate via SSE
      try {
        await callOfferPyramidSSE({
          onProgress: (step) => setProgressStep(step),
        });
      } catch (err) {
        console.error("Pyramid generation error:", err);
      }

      // Server may still be writing — retry with short delay
      const secondTry = await loadPyramids();
      if (secondTry.ok) return;
      await new Promise((r) => setTimeout(r, 2000));
      const thirdTry = await loadPyramids();
      if (!thirdTry.ok) setGenError(true);
    } catch (error) {
      console.error("Error loading offer sets:", error);
      setGenError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { generateAndLoad(); }, []);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return offerSets.find((p) => p.id === selectedId) ?? null;
  }, [offerSets, selectedId]);

  const handleSelect = async () => {
    if (!selected) return;

    try {
      setSubmitting(true);
      setBootStep(0);

      const safetyTimeout = setTimeout(() => router.replace("/app"), 120_000);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { clearTimeout(safetyTimeout); router.push("/"); return; }

      const selectedIndex = offerSets.findIndex((p) => p.id === selected.id);
      if (selectedIndex < 0) throw new Error("Index introuvable.");

      // Step 0: Save selection
      const patchRes = await fetch("/api/strategy/offer-pyramid", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedIndex, pyramid: selected }),
      });
      const patchJson = await patchRes.json().catch(() => ({} as any));
      if (!patchRes.ok) throw new Error(patchJson?.error || "Impossible de sauvegarder.");

      // Step 1: Generate full strategy
      setBootStep(1);
      let fullOk = false;
      try {
        const result = await callStrategySSE({});
        fullOk = Boolean(result?.success);
      } catch {
        fullOk = false;
      }
      if (!fullOk) {
        const recovered = await ensureStrategyAfterTimeout(supabase, user.id);
        if (!recovered) throw new Error("Impossible de générer la stratégie.");
      }

      // Step 2: Sync tasks
      setBootStep(2);
      try {
        await Promise.race([
          fetch("/api/tasks/sync", { method: "POST" }).then((r) => r.json()),
          new Promise((_, r) => setTimeout(() => r(new Error("timeout")), 20_000)),
        ]);
      } catch {/* fail-open */}

      // Step 3: Finalize
      setBootStep(3);
      await sleep(900);

      clearTimeout(safetyTimeout);
      router.push("/app");
      router.refresh();
    } catch (error) {
      console.error("Error selecting:", error);
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de sauvegarder.",
        variant: "destructive",
      });
      setSubmitting(false);
    }
  };

  // ── Boot overlay (after pyramid selection) ─────────────────────────────────
  if (submitting) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center">
          <div className="mb-6 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          </div>
          <h2 className="text-xl font-semibold">Je construis ta stratégie…</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {BOOT_STEPS[bootStep]}
          </p>
          <div className="mt-6 space-y-2">
            {BOOT_STEPS.map((label, idx) => (
              <div key={idx} className="flex items-center gap-3 text-sm">
                <div className={`h-2.5 w-2.5 shrink-0 rounded-full transition-colors ${
                  idx < bootStep ? "bg-primary" :
                  idx === bootStep ? "animate-pulse bg-primary/60" :
                  "bg-muted-foreground/20"
                }`} />
                <span className={idx === bootStep ? "text-foreground" : "text-muted-foreground"}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-primary/5 flex flex-col items-center justify-center p-6">
        <div className="text-center space-y-6 max-w-lg">
          <div className="flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Tipote crée tes pyramides d'offres...</h1>
            <p className="text-muted-foreground">
              {progressStep || "Analyse de ton profil et création de 3 pyramides d'offres percutantes."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (genError && offerSets.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-primary/5 flex flex-col items-center justify-center p-6">
        <div className="text-center space-y-6 max-w-md">
          <div className="flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-destructive" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Génération en cours</h1>
            <p className="text-muted-foreground">
              La création de tes pyramides prend un peu plus de temps. Clique ci-dessous pour réessayer.
            </p>
          </div>
          <Button size="lg" onClick={() => generateAndLoad()}>
            <ArrowRight className="w-4 h-4 mr-2" />
            Réessayer
          </Button>
        </div>
      </div>
    );
  }

  // ── Selection UI ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-primary/5">
      <main className="container mx-auto px-4 py-10 max-w-7xl">
        {/* Header */}
        <div className="text-center space-y-4 mb-10">
          <div className="flex items-center justify-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <span className="text-primary font-medium">Choisis ta direction</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Tes 3 pyramides d'offres
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Tipote a généré 3 pyramides sous des angles différents. Explore chaque offre en détail, puis choisis celle qui te correspond le mieux.
          </p>
        </div>

        {/* Pyramid cards */}
        <div className="grid lg:grid-cols-3 gap-6 mb-10">
          {offerSets.map((offerSet, pyramidIdx) => {
            const isSelected = selectedId === offerSet.id;
            const pyramidLetters = ["A", "B", "C"];
            const pyramidColors = [
              { ring: "ring-blue-500", iconBg: "bg-blue-100", iconColor: "text-blue-600" },
              { ring: "ring-amber-500", iconBg: "bg-amber-100", iconColor: "text-amber-600" },
              { ring: "ring-purple-500", iconBg: "bg-purple-100", iconColor: "text-purple-600" },
            ];
            const colors = pyramidColors[pyramidIdx] ?? pyramidColors[0];

            return (
              <Card
                key={offerSet.id}
                className={`relative overflow-hidden transition-all cursor-pointer ${
                  isSelected
                    ? `ring-2 ${colors.ring} shadow-xl bg-white border-transparent`
                    : "hover:shadow-lg bg-background border-border"
                }`}
                onClick={() => setSelectedId(offerSet.id)}
              >
                {/* Selection indicator */}
                {isSelected && (
                  <div className="absolute top-4 right-4 w-8 h-8 bg-primary rounded-full flex items-center justify-center z-10">
                    <Check className="w-5 h-5 text-primary-foreground" />
                  </div>
                )}

                {/* Pyramid header */}
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colors.iconBg}`}>
                      <span className={`text-lg font-bold ${colors.iconColor}`}>
                        {pyramidLetters[pyramidIdx] ?? (pyramidIdx + 1)}
                      </span>
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-lg leading-snug">{offerSet.name}</CardTitle>
                    </div>
                  </div>
                  {offerSet.strategy_summary && (
                    <CardDescription className="text-sm leading-relaxed">
                      {offerSet.strategy_summary}
                    </CardDescription>
                  )}
                </CardHeader>

                {/* Offer levels */}
                <CardContent className="space-y-3 pt-0">
                  {offerSet.lead_magnet && (
                    <OfferCard
                      offer={offerSet.lead_magnet}
                      level="lead_magnet"
                      expanded={!!expandedOffers[`${offerSet.id}:lm`]}
                      onToggle={() => toggleOffer(`${offerSet.id}:lm`)}
                    />
                  )}
                  {offerSet.low_ticket && (
                    <OfferCard
                      offer={offerSet.low_ticket}
                      level="low_ticket"
                      expanded={!!expandedOffers[`${offerSet.id}:lt`]}
                      onToggle={() => toggleOffer(`${offerSet.id}:lt`)}
                    />
                  )}
                  {offerSet.middle_ticket && offerSet.middle_ticket.title && (
                    <OfferCard
                      offer={offerSet.middle_ticket}
                      level="middle_ticket"
                      expanded={!!expandedOffers[`${offerSet.id}:mt`]}
                      onToggle={() => toggleOffer(`${offerSet.id}:mt`)}
                    />
                  )}
                  {offerSet.high_ticket && (
                    <OfferCard
                      offer={offerSet.high_ticket}
                      level="high_ticket"
                      expanded={!!expandedOffers[`${offerSet.id}:ht`]}
                      onToggle={() => toggleOffer(`${offerSet.id}:ht`)}
                    />
                  )}

                  {/* Select button */}
                  <div className="pt-3">
                    <Button
                      variant={isSelected ? "default" : "outline"}
                      className="w-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(offerSet.id);
                      }}
                    >
                      {isSelected ? (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          Sélectionnée
                        </>
                      ) : (
                        "Choisir cette pyramide"
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Confirm button */}
        <div className="text-center space-y-4">
          <Button
            size="lg"
            className="px-10"
            disabled={!selectedId}
            onClick={handleSelect}
          >
            Valider et générer ma stratégie
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>

          <p className="text-sm text-muted-foreground">
            Tu pourras modifier tes offres plus tard dans ton dashboard.
          </p>
        </div>
      </main>
    </div>
  );
}
