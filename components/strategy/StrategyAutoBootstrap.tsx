// components/strategy/StrategyAutoBootstrap.tsx
"use client";

// Bootstrap silencieux du plan stratégique après onboarding.
// Objectif: quand l'user arrive sur /app, si business_plan n'existe pas encore,
// on lance /api/strategy (idempotent) une seule fois (sessionStorage), sans bloquer l'UI.
// ✅ Ne casse rien : fail-open, aucun UI, aucune redirection.

import { useEffect, useMemo } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

const SESSION_KEY = "tipote:auto_strategy_bootstrap_v1";

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

        if ((existingPlan as any)?.plan_json) return;

        // Génération idempotente (le backend skip si déjà généré)
        const stratRes = await fetch("/api/strategy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }).catch(() => null);

        // ✅ Sync tasks after strategy generation so project_tasks is populated
        if (stratRes?.ok && !cancelled) {
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
