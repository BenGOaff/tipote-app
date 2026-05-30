// lib/visualStudio/brandLoader.ts
//
// Charge, pour l'utilisateur Tipote connecté, son IDENTITÉ DE MARQUE (couleurs,
// logo, police) au format `BrandKit` attendu par le Studio visuel, PLUS un
// bundle "voix de marque" (tonalité, offres + puces promesses, persona,
// storytelling) qu'on injecte à l'IA pour que la copy générée colle à SA marque.
//
// Source de vérité = `business_profiles` (scopé projet actif) + `personas`
// (client idéal). On réutilise les mêmes colonnes que le branding des quiz
// (brand_color_base / brand_color_accent / brand_logo_url / brand_font) pour
// rester cohérent avec le reste de l'app — zéro nouvelle colonne.

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  DEFAULT_BRAND_COLOR_PRIMARY,
  DEFAULT_BRAND_COLOR_BACKGROUND,
} from "@/lib/quizBranding";
import type { BrandKit } from "@/lib/visualStudio/types";

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
function hex(raw: unknown, fallback: string): string {
  return typeof raw === "string" && HEX_RE.test(raw.trim()) ? raw.trim() : fallback;
}

/** Puce promesse aplatie pour le prompt (bénéfice + angle). */
export interface BrandPromise {
  benefit: string;
  angle?: string;
}

/** Offre simplifiée pour le prompt IA. */
export interface BrandOffer {
  name: string;
  promise?: string;
  target?: string;
  bullets: BrandPromise[];
}

/** Voix de marque : tout ce qui aide l'IA à écrire DANS le ton de l'user. */
export interface BrandVoice {
  toneOfVoice: string | null;
  offers: BrandOffer[];
  persona: { title: string; pains: string[]; desires: string[] } | null;
}

export interface BrandBundle {
  brand: BrandKit;
  voice: BrandVoice;
}

function asStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((x) => String(x)).filter(Boolean).slice(0, 12);
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean).slice(0, 12);
    } catch {
      /* pas du JSON → on renvoie la chaîne brute comme une entrée */
    }
    return [s];
  }
  return [];
}

/**
 * Assemble le brand kit + la voix de marque de l'utilisateur. Robuste aux
 * profils incomplets : tout champ manquant retombe sur un défaut Tipote (le
 * studio reste pleinement utilisable même sans branding configuré).
 */
export async function loadBrandBundle(
  userId: string,
  projectId: string | null,
): Promise<BrandBundle> {
  let q = supabaseAdmin
    .from("business_profiles")
    .select(
      "first_name, brand_font, brand_color_base, brand_color_accent, brand_logo_url, brand_tone_of_voice, offers",
    )
    .eq("user_id", userId);
  if (projectId) q = q.eq("project_id", projectId);
  const { data: profile } = await q.maybeSingle();

  const p = (profile ?? {}) as Record<string, unknown>;

  const primary = hex(p.brand_color_base, DEFAULT_BRAND_COLOR_PRIMARY);
  const accent = hex(p.brand_color_accent, primary);
  // Pas de fallback "Tipote" : on laisse vide quand l'user n'a pas
  // de first_name → le client affiche le label traduit (t("myBrand"))
  // côté UI. Évite d'avoir "Tipote" en dur dans une UI espagnole.
  const name =
    (typeof p.first_name === "string" && p.first_name.trim()) || "";

  const brand: BrandKit = {
    name: String(name),
    logoUrl:
      typeof p.brand_logo_url === "string" && p.brand_logo_url.trim()
        ? p.brand_logo_url.trim()
        : null,
    primaryColor: primary,
    // Les quiz n'utilisent que 2 couleurs : on dérive un texte foncé lisible et
    // garde le fond clair par défaut. Le studio recalcule le contraste lui-même.
    textColor: DEFAULT_BRAND_COLOR_PRIMARY === primary ? "#2E386E" : "#2E386E",
    accentColor: accent,
    backgroundColor: DEFAULT_BRAND_COLOR_BACKGROUND,
    font: typeof p.brand_font === "string" && p.brand_font.trim() ? p.brand_font.trim() : "Inter",
  };

  // ── Offres + puces promesses (sales_arguments.bullets) ──
  const offersRaw = Array.isArray(p.offers) ? p.offers : [];
  const offers: BrandOffer[] = offersRaw.slice(0, 6).map((raw) => {
    const o = (raw ?? {}) as Record<string, unknown>;
    const sa = (o.sales_arguments ?? {}) as Record<string, unknown>;
    const bulletsRaw = Array.isArray(sa.bullets) ? sa.bullets : [];
    const bullets: BrandPromise[] = bulletsRaw.slice(0, 6).map((b) => {
      const bb = (b ?? {}) as Record<string, unknown>;
      return {
        benefit: String(bb.benefit ?? "").slice(0, 300),
        angle: bb.angle ? String(bb.angle).slice(0, 80) : undefined,
      };
    }).filter((b) => b.benefit);
    return {
      name: String(o.name ?? "").slice(0, 200),
      promise: o.promise ? String(o.promise).slice(0, 500) : undefined,
      target: o.target ? String(o.target).slice(0, 300) : undefined,
      bullets,
    };
  }).filter((o) => o.name || o.promise);

  // ── Persona client idéal (douleurs / désirs) ──
  let persona: BrandVoice["persona"] = null;
  let pq = supabaseAdmin
    .from("personas")
    .select("name, pains, desires")
    .eq("user_id", userId)
    .eq("role", "client_ideal");
  if (projectId) pq = pq.eq("project_id", projectId);
  const { data: personaRows } = await pq.order("updated_at", { ascending: false }).limit(1);
  const prow = personaRows?.[0] as Record<string, unknown> | undefined;
  if (prow) {
    persona = {
      title: String(prow.name ?? "Client idéal"),
      pains: asStringArray(prow.pains),
      desires: asStringArray(prow.desires),
    };
  }

  return {
    brand,
    voice: {
      toneOfVoice:
        typeof p.brand_tone_of_voice === "string" && p.brand_tone_of_voice.trim()
          ? p.brand_tone_of_voice.trim()
          : null,
      offers,
      persona,
    },
  };
}

/** Condense la voix de marque en un bloc texte court à injecter dans un prompt
 *  IA (copy d'image / carrousel). Borné pour ne pas exploser le contexte. */
export function brandVoiceToPromptHint(voice: BrandVoice): string {
  const parts: string[] = [];
  if (voice.toneOfVoice) parts.push(`Brand tone of voice: ${voice.toneOfVoice}.`);
  if (voice.persona) {
    const pains = voice.persona.pains.slice(0, 4).join("; ");
    const desires = voice.persona.desires.slice(0, 4).join("; ");
    if (pains) parts.push(`Audience pains: ${pains}.`);
    if (desires) parts.push(`Audience desires: ${desires}.`);
  }
  const promises = voice.offers
    .flatMap((o) => [o.promise, ...o.bullets.map((b) => b.benefit)])
    .filter((x): x is string => !!x)
    .slice(0, 6);
  if (promises.length) parts.push(`Key promises to lean on: ${promises.join("; ")}.`);
  return parts.join("\n").slice(0, 1200);
}
