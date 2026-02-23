// components/strategy/StrategyAutoBootstrap.tsx
"use client";

// Bootstrap silencieux du plan stratégique après onboarding.
// Objectif: quand l'user arrive sur /app, si business_plan n'existe pas encore,
// on lance /api/strategy (SSE stream, idempotent) une seule fois (sessionStorage), sans bloquer l'UI.
// ✅ Ne casse rien : fail-open, aucun UI, aucune redirection.

import { useEffect, useMemo } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { callStrategySSE } from "@/lib/strategySSE";

const SESSION_KEY = "tipote:auto_strategy_bootstrap_v2";

export default function StrategyAutoBootstrap() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        if (typeof window === "undefined") return;

        // Une seule tentative par session navigateur
        const already = window.sessionStorage.getItem(SESSION_KEY);
        if (already === "1") return;
        window.sessionStorage.setItem(SESSION_KEY, "1");

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user?.id || cancelled) return;

        // Si plan déjà présent => rien à faire
        const { data: existingPlan, error: existingPlanError } = await supabase
          .from("business_plan")
          .select("plan_json")
          .eq("user_id", user.id)
          .maybeSingle();

        if (cancelled) return;

        // Si erreur schema/RLS => fail-open (ne jamais casser /app)
        if (existingPlanError) return;

        const planJson = (existingPlan as any)?.plan_json;

        if (planJson) {
          return;
        }

        // No plan_json at all — generate from scratch via SSE stream (heartbeats prevent proxy timeout)
        const result = await callStrategySSE({}).catch(() => null);

        // ✅ Sync tasks after strategy generation so project_tasks is populated
        if (result?.success && !cancelled) {
          await fetch("/api/tasks/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          }).catch(() => null);
        }
      } catch {
        // fail-open
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  return null;
}