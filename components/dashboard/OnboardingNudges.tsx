"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowRight } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { callStrategySSE } from "@/lib/strategySSE";

type AnyRecord = Record<string, any>;

function isRecord(v: unknown): v is AnyRecord {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function asRecord(v: unknown): AnyRecord | null {
  return isRecord(v) ? (v as AnyRecord) : null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function cleanString(v: unknown, maxLen = 240): string {
  const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  if (!s) return "";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function pickSelectedIndex(planJson: AnyRecord | null): number | null {
  if (!planJson) return null;

  const idx =
    typeof planJson.selected_offer_pyramid_index === "number"
      ? planJson.selected_offer_pyramid_index
      : typeof planJson.selected_pyramid_index === "number"
        ? planJson.selected_pyramid_index
        : null;

  return typeof idx === "number" && Number.isFinite(idx) ? idx : null;
}

function hasExistingOffers(planJson: AnyRecord | null): boolean {
  if (!planJson) return false;
  const arr = asArray(planJson.offer_pyramids);
  return arr.length >= 1;
}

function hasFullStrategy(planJson: AnyRecord | null): boolean {
  if (!planJson) return false;

  const mission = cleanString(planJson.mission, 80);
  const promise = cleanString(planJson.promise, 80);
  const positioning = cleanString(planJson.positioning, 80);

  const plan90 = asRecord(planJson.plan_90_days) ?? asRecord(planJson.plan90) ?? null;
  const tasksByTf = asRecord(plan90?.tasks_by_timeframe ?? planJson.tasks_by_timeframe) ?? null;

  const d30 = asArray(tasksByTf?.d30).length;
  const d60 = asArray(tasksByTf?.d60).length;
  const d90 = asArray(tasksByTf?.d90).length;

  // ✅ fix TS: (mission || promise || positioning) renvoie une string -> on force boolean
  return Boolean(mission || promise || positioning) && d30 + d60 + d90 >= 6;
}

// postJSON kept for non-strategy endpoints
async function postJSON<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error((json as any)?.error || `HTTP ${res.status}`);
  return json as T;
}

export default function OnboardingNudges(props: { planJson: unknown | null }) {
  const router = useRouter();
  const { toast } = useToast();

  const plan = useMemo(() => (asRecord(props.planJson) ? (props.planJson as AnyRecord) : null), [props.planJson]);

  const offersExist = useMemo(() => hasExistingOffers(plan), [plan]);
  const selectedIndex = useMemo(() => pickSelectedIndex(plan), [plan]);
  const selectedMissing = offersExist && selectedIndex === null;

  const fullReady = useMemo(() => hasFullStrategy(plan), [plan]);
  const needsFull = !selectedMissing && offersExist && selectedIndex !== null && !fullReady;

  const [isGenerating, setIsGenerating] = useState(false);

  const generateFullStrategy = async () => {
    if (isGenerating) return;

    setIsGenerating(true);
    try {
      // Step 1: Generate strategy (may generate offers for "no offers" users)
      await callStrategySSE({});

      // Step 2: Auto-select first pyramid if offers were generated but not selected
      try {
        const checkRes = await fetch("/api/strategy/offer-pyramid")
          .then((r) => r.json())
          .catch(() => ({}));
        const offerPyramids = Array.isArray(checkRes?.offer_pyramids) ? checkRes.offer_pyramids : [];
        const hasSelection = checkRes?.selected_offer_pyramid_index !== null &&
          checkRes?.selected_offer_pyramid_index !== undefined;

        if (offerPyramids.length > 0 && !hasSelection) {
          // Auto-select first pyramid
          await fetch("/api/strategy/offer-pyramid", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ selectedIndex: 0 }),
          }).catch(() => null);

          // Generate full strategy with selected pyramid
          await fetch("/api/strategy/offer-pyramid", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          }).catch(() => null);
        }
      } catch {
        // fail-open
      }

      // Step 3: Sync tasks
      await fetch("/api/tasks/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).catch(() => null);
      router.push("/strategy");
    } catch (e) {
      toast({
        title: "Oups",
        description: e instanceof Error ? e.message : "Impossible de générer la stratégie pour le moment.",
        variant: "destructive",
      });
      router.push("/strategy");
    } finally {
      setIsGenerating(false);
    }
  };

  if (!selectedMissing && !needsFull) return null;

  return (
    <div className="px-6 md:px-8 pt-6 md:pt-8">
      <Card className="p-5 md:p-6 border-border/60">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            {selectedMissing ? (
              <>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">À faire</Badge>
                  <p className="text-sm text-muted-foreground">Dernière étape pour débloquer ta stratégie complète</p>
                </div>
                <h3 className="mt-2 text-lg font-semibold">Choisis tes offres</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Tipote a généré 3 options. Sélectionne celle qui te ressemble le plus pour finaliser le plan 90 jours.
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">À finaliser</Badge>
                  <p className="text-sm text-muted-foreground">On termine la stratégie + le plan d’action</p>
                </div>
                <h3 className="mt-2 text-lg font-semibold">Générer la stratégie complète</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Tes offres prennent vie : mission, positionnement, persona et tâches datées (90 jours).
                </p>
              </>
            )}
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-end md:gap-3">
            {selectedMissing ? (
              <Button onClick={generateFullStrategy} disabled={isGenerating} className="gap-2">
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isGenerating ? "Génération..." : "Générer maintenant"}
              </Button>
            ) : (
              <Button onClick={generateFullStrategy} disabled={isGenerating} className="gap-2">
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Générer maintenant
              </Button>
            )}

            <Button asChild variant="outline">
              <Link href="/strategy">Voir / ajuster</Link>
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
