"use client";

// components/MilestoneToastListener.tsx
//
// Composant client monté UNE seule fois dans `DashboardLayout` (donc
// jamais sur les routes publiques `/q/`, `/p/`, `/pq/`, `/[publicSlug]`).
//
// Au mount, fetch `/api/milestones/unseen`. Si la liste n'est pas vide,
// affiche un toast sonner par milestone (espacés de 1.5s pour éviter
// l'effet "popup wall"), puis POST `/api/milestones/seen` pour marquer
// la liste comme vue.
//
// Volontairement minimaliste — c'est un side-effect, pas une UI :
// retourne `null` côté JSX, ne s'abonne à aucun event runtime, ne poll
// pas. Le user verra ses prochains milestones au prochain mount du
// dashboard (refresh, navigation, etc.).

import { useEffect, useRef } from "react";
import { toast } from "sonner";

interface UnseenMilestone {
  id: string;
  key: string;
  emoji: string;
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  unlockedAt: string;
}

interface UnseenResponse {
  ok: boolean;
  milestones?: UnseenMilestone[];
  error?: string;
}

export function MilestoneToastListener() {
  const ranRef = useRef(false);

  useEffect(() => {
    // StrictMode dev double-effect protection : on ne fetch qu'une fois
    // par mount réel. Le serveur reste idempotent (RLS + UPDATE filtré
    // sur seen_at IS NULL) mais on évite un round-trip inutile.
    if (ranRef.current) return;
    ranRef.current = true;

    let cancelled = false;

    const run = async () => {
      try {
        const res = await fetch("/api/milestones/unseen", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as UnseenResponse;
        if (cancelled || !data?.ok || !data.milestones || data.milestones.length === 0) {
          return;
        }

        const milestones = data.milestones;
        const ids = milestones.map((m) => m.id);

        milestones.forEach((m, index) => {
          window.setTimeout(() => {
            toast.success(`${m.emoji} ${m.title}`, {
              description: m.body,
              duration: 8000,
              action:
                m.ctaLabel && m.ctaUrl
                  ? {
                      label: m.ctaLabel,
                      onClick: () => {
                        if (m.ctaUrl) {
                          window.location.href = m.ctaUrl;
                        }
                      },
                    }
                  : undefined,
            });
          }, index * 1500);
        });

        // Marque seen côté serveur dès qu'on a programmé les toasts.
        // Si l'user navigue avant la fin de l'animation, les milestones
        // ne re-popperont pas (au prix d'un toast loupé — acceptable).
        await fetch("/api/milestones/seen", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        }).catch(() => {});
      } catch (err) {
        // Silencieux côté user : un toast manquant n'a pas à perturber
        // l'expérience dashboard.
        console.error("[MilestoneToastListener]", err);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
