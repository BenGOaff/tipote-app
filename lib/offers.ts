/**
 * Shared offer loading utility.
 * Loads offers from:
 *  1. business_plan.plan_json.selected_pyramid (AI-generated offers)
 *  2. business_profiles.offers (user's own / affiliate offers from settings)
 */

export type OfferOption = {
  id: string;
  name: string;
  level: string;
  is_flagship?: boolean | null;
  source?: "generated" | "user";

  // Details for AI copywriting
  promise?: string | null;
  description?: string | null;
  price_min?: number | null;
  price_max?: number | null;
  main_outcome?: string | null;
  format?: string | null;
  delivery?: string | null;
  target?: string | null;
  updated_at?: string | null;
  link?: string | null;
};

function isRecord(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function safeStringOrNull(v: unknown): string | null {
  const s = typeof v === "string" ? v : typeof v === "number" ? String(v) : null;
  const out = (s ?? "").trim();
  return out ? out : null;
}

function toNumberOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalize a selected pyramid object (from business_plan.plan_json) into a flat list of offers.
 */
function normalizeSelectedOffers(userId: string, selected: any, updatedAt?: string | null): OfferOption[] {
  const out: OfferOption[] = [];

  const pushOffer = (levelRaw: unknown, offerRaw: any, idxHint?: number) => {
    const o = isRecord(offerRaw) ? offerRaw : null;
    if (!o) return;

    const name =
      safeStringOrNull(o.name) ??
      safeStringOrNull(o.offer_name) ??
      safeStringOrNull(o.offerTitle) ??
      safeStringOrNull(o.title) ??
      null;

    if (!name) return;

    const rawId = safeStringOrNull(o.id) ?? safeStringOrNull(o.offer_id) ?? null;
    const id = rawId || `${userId}:${String(levelRaw ?? "offer")}:${String(idxHint ?? out.length)}`;

    const level =
      safeStringOrNull(levelRaw) ??
      safeStringOrNull(o.level) ??
      safeStringOrNull(o.offer_level) ??
      "";

    out.push({
      id,
      name,
      level,
      source: "generated",
      is_flagship: typeof o.is_flagship === "boolean" ? o.is_flagship : null,
      description: safeStringOrNull(o.description) ?? safeStringOrNull(o.desc) ?? null,
      promise: safeStringOrNull(o.promise) ?? safeStringOrNull(o.promesse) ?? null,
      main_outcome: safeStringOrNull(o.main_outcome) ?? safeStringOrNull(o.outcome) ?? null,
      format: safeStringOrNull(o.format) ?? null,
      delivery: safeStringOrNull(o.delivery) ?? null,
      target: safeStringOrNull(o.target) ?? safeStringOrNull(o.target_audience) ?? null,
      price_min: toNumberOrNull(o.price_min ?? o.min_price),
      price_max: toNumberOrNull(o.price_max ?? o.max_price),
      updated_at: safeStringOrNull(o.updated_at) ?? updatedAt ?? null,
    });
  };

  if (!selected) return out;

  // Shape: map { lead_magnet, low_ticket, high_ticket, ... }
  if (isRecord(selected)) {
    const KEY_TO_LEVEL: Array<[string, string]> = [
      ["lead_magnet", "lead_magnet"], ["leadmagnet", "lead_magnet"],
      ["free", "lead_magnet"], ["gratuit", "lead_magnet"],
      ["low_ticket", "low_ticket"], ["lowticket", "low_ticket"],
      ["middle_ticket", "middle_ticket"], ["mid_ticket", "middle_ticket"],
      ["midticket", "middle_ticket"], ["middle", "middle_ticket"],
      ["high_ticket", "high_ticket"], ["highticket", "high_ticket"],
      ["high", "high_ticket"], ["premium", "high_ticket"],
    ];

    const loweredKeys = Object.keys(selected).reduce<Record<string, string>>((acc, k) => {
      acc[k.toLowerCase()] = k;
      return acc;
    }, {});

    for (const [kLower, level] of KEY_TO_LEVEL) {
      const realKey = loweredKeys[kLower];
      if (!realKey) continue;
      pushOffer(level, selected[realKey], level === "lead_magnet" ? 0 : level === "low_ticket" ? 1 : 2);
    }

    if (out.length === 0) {
      const lvl = selected.level ?? selected.offer_level ?? selected.type ?? null;
      pushOffer(lvl, selected, 0);
    }
  }

  return out;
}

export function levelLabel(level: string): string {
  const s = String(level ?? "").toLowerCase();
  if (s === "user_offer" || s === "mes offres") return "Mes offres";
  if (s.includes("lead") || s.includes("free") || s.includes("gratuit")) return "Gratuit (Lead magnet)";
  if (s.includes("low")) return "Low ticket";
  if (s.includes("middle") || s.includes("mid")) return "Middle ticket";
  if (s.includes("high") || s.includes("premium")) return "High ticket";
  return level || "Offre";
}

export function formatPriceRange(offer: OfferOption): string | null {
  const min = typeof offer.price_min === "number" ? offer.price_min : null;
  const max = typeof offer.price_max === "number" ? offer.price_max : null;
  if (min == null && max == null) return null;
  if (min != null && max != null) {
    if (min === max) return `${min}\u20AC`;
    return `${min}\u2013${max}\u20AC`;
  }
  if (min != null) return `\u00E0 partir de ${min}\u20AC`;
  return `jusqu'\u00E0 ${max}\u20AC`;
}

/**
 * Load all offers and merge them into a single list.
 */
export async function loadAllOffers(supabase: any): Promise<OfferOption[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) return [];

  const allOffers: OfferOption[] = [];
  const userId = user.id;

  // ---- Source 1: business_plan.plan_json.selected_pyramid (AI-generated offers) ----
  try {
    let planRow: any = null;
    const { data, error } = await supabase
      .from("business_plan")
      .select("plan_json, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error && String(error?.message || "").toLowerCase().includes("updated_at")) {
      const retry = await supabase.from("business_plan").select("plan_json").eq("user_id", userId).maybeSingle();
      planRow = retry.data;
    } else {
      planRow = data;
    }

    if (planRow?.plan_json) {
      const planJson: any = planRow.plan_json;
      const selected =
        planJson?.selected_pyramid ??
        planJson?.selected_offer_pyramid ??
        null;

      if (selected) {
        const fromPlan = normalizeSelectedOffers(userId, selected, safeStringOrNull(planRow?.updated_at));
        allOffers.push(...fromPlan);
      }
    }
  } catch {
    // continue
  }

  // ---- Source 2: business_profiles.offers (user's own/affiliate offers) ----
  try {
    const { data: profile } = await supabase
      .from("business_profiles")
      .select("offers")
      .eq("user_id", userId)
      .maybeSingle();

    if (profile && Array.isArray(profile.offers)) {
      const existingNames = new Set(allOffers.map((o) => o.name.toLowerCase().trim()));

      for (let i = 0; i < profile.offers.length; i++) {
        const o: any = profile.offers[i];
        const name = typeof o?.name === "string" ? o.name.trim() : "";
        if (!name) continue;

        if (existingNames.has(name.toLowerCase())) continue;

        const priceStr = typeof o?.price === "string" ? o.price.trim() : typeof o?.price === "number" ? String(o.price) : "";
        const priceNum = toNumberOrNull(priceStr.replace(/[^\d.,]/g, "").replace(",", "."));

        allOffers.push({
          id: `user:${userId}:${i}`,
          name,
          level: "user_offer",
          source: "user",
          is_flagship: null,
          promise: typeof o?.promise === "string" ? o.promise.trim() || null : null,
          description: typeof o?.description === "string" ? o.description.trim() || null : null,
          price_min: priceNum,
          price_max: priceNum,
          main_outcome: typeof o?.main_outcome === "string" ? o.main_outcome.trim() || null : null,
          format: typeof o?.format === "string" ? o.format.trim() || null : null,
          target: typeof o?.target === "string" ? o.target.trim() || null : null,
          link: typeof o?.link === "string" ? o.link.trim() || null : null,
          updated_at: null,
        });
      }
    }
  } catch {
    // continue
  }

  return allOffers;
}
