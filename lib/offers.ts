/**
 * Shared offer loading utility.
 * Merges offers from 3 sources:
 *  1. business_plan.plan_json.selected_pyramid (AI-generated pyramid)
 *  2. offer_pyramids table (legacy)
 *  3. business_profiles.offers (user's own / affiliate offers from settings)
 */

export type OfferOption = {
  id: string;
  name: string;
  level: string;
  is_flagship?: boolean | null;
  source?: "pyramid" | "user" | "legacy";

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
 * Normalise business_plan.plan_json.selected_pyramid (legacy + new shapes) vers une liste d'offres
 */
function normalizeSelectedPyramid(userId: string, selected: any, updatedAt?: string | null): OfferOption[] {
  const out: OfferOption[] = [];

  const pushOffer = (levelRaw: unknown, offerRaw: any, idxHint?: number) => {
    const o = isRecord(offerRaw) ? offerRaw : null;
    if (!o) return;

    const name =
      safeStringOrNull((o as any).name) ??
      safeStringOrNull((o as any).offer_name) ??
      safeStringOrNull((o as any).offerTitle) ??
      safeStringOrNull((o as any).title) ??
      null;

    if (!name) return;

    const rawId = safeStringOrNull((o as any).id) ?? safeStringOrNull((o as any).offer_id) ?? null;
    const id = rawId || `${userId}:${String(levelRaw ?? "offer")}:${String(idxHint ?? out.length)}`;

    const level =
      safeStringOrNull(levelRaw) ??
      safeStringOrNull((o as any).level) ??
      safeStringOrNull((o as any).offer_level) ??
      "";

    out.push({
      id,
      name,
      level,
      source: "pyramid",
      is_flagship: typeof (o as any).is_flagship === "boolean" ? (o as any).is_flagship : null,
      description: safeStringOrNull((o as any).description) ?? safeStringOrNull((o as any).desc) ?? null,
      promise: safeStringOrNull((o as any).promise) ?? safeStringOrNull((o as any).promesse) ?? null,
      main_outcome: safeStringOrNull((o as any).main_outcome) ?? safeStringOrNull((o as any).outcome) ?? null,
      format: safeStringOrNull((o as any).format) ?? null,
      delivery: safeStringOrNull((o as any).delivery) ?? null,
      target: safeStringOrNull((o as any).target) ?? safeStringOrNull((o as any).target_audience) ?? null,
      price_min: toNumberOrNull((o as any).price_min ?? (o as any).min_price),
      price_max: toNumberOrNull((o as any).price_max ?? (o as any).max_price),
      updated_at: safeStringOrNull((o as any).updated_at) ?? updatedAt ?? null,
    });
  };

  if (!selected) return out;

  const topOffers =
    (Array.isArray((selected as any).offers) && (selected as any).offers) ||
    (Array.isArray((selected as any).pyramid) && (selected as any).pyramid) ||
    null;

  if (Array.isArray(topOffers)) {
    topOffers.forEach((item: any, idx: number) => {
      const isLevelBucket = isRecord(item) && (Array.isArray((item as any).offers) || Array.isArray((item as any).items));
      if (isLevelBucket) {
        const level = (item as any).level ?? (item as any).offer_level ?? (item as any).type ?? (item as any).tier;
        const offersArr = (item as any).offers ?? (item as any).items ?? [];
        if (Array.isArray(offersArr)) {
          offersArr.forEach((o: any, j: number) => pushOffer(level, o, j));
        }
      } else {
        pushOffer((item as any)?.level ?? (item as any)?.offer_level ?? "", item, idx);
      }
    });
    return out;
  }

  if (isRecord(selected) && Array.isArray((selected as any).offers)) {
    const lvl = (selected as any).level ?? (selected as any).offer_level ?? (selected as any).type ?? null;
    (selected as any).offers.forEach((o: any, idx: number) => pushOffer(lvl, o, idx));
    return out;
  }

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
      pushOffer(level, (selected as any)[realKey], level === "lead_magnet" ? 0 : level === "low_ticket" ? 1 : 2);
    }

    if (out.length === 0) {
      const lvl = (selected as any).level ?? (selected as any).offer_level ?? (selected as any).type ?? null;
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
 * Load all offers from 3 sources and merge them into a single list.
 * Call from useEffect in any form component.
 */
export async function loadAllOffers(supabase: any): Promise<OfferOption[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) return [];

  const allOffers: OfferOption[] = [];
  const userId = user.id;

  // ---- Source 1: business_plan.plan_json.selected_pyramid ----
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
        planJson?.pyramid?.selected_pyramid ??
        planJson?.pyramid ??
        planJson?.offer_pyramid ??
        null;

      if (selected) {
        const fromPlan = normalizeSelectedPyramid(userId, selected, safeStringOrNull(planRow?.updated_at));
        allOffers.push(...fromPlan);
      }
    }
  } catch {
    // continue
  }

  // ---- Source 2: offer_pyramids table (legacy) ----
  if (allOffers.length === 0) {
    try {
      const { data, error } = await supabase
        .from("offer_pyramids")
        .select("id,user_id,name,level,is_flagship,description,promise,price_min,price_max,main_outcome,format,delivery,updated_at")
        .eq("user_id", userId)
        .order("is_flagship", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(100);

      if (!error && Array.isArray(data)) {
        for (const r of data) {
          const id = typeof r?.id === "string" ? r.id : "";
          const name = typeof r?.name === "string" ? r.name : "";
          if (!id || !name) continue;

          allOffers.push({
            id,
            name,
            level: typeof r?.level === "string" ? r.level : "",
            source: "legacy",
            is_flagship: typeof r?.is_flagship === "boolean" ? r.is_flagship : null,
            description: typeof r?.description === "string" ? r.description : null,
            promise: typeof r?.promise === "string" ? r.promise : null,
            price_min: toNumberOrNull(r?.price_min),
            price_max: toNumberOrNull(r?.price_max),
            main_outcome: typeof r?.main_outcome === "string" ? r.main_outcome : null,
            format: typeof r?.format === "string" ? r.format : null,
            delivery: typeof r?.delivery === "string" ? r.delivery : null,
            updated_at: typeof r?.updated_at === "string" ? r.updated_at : null,
          });
        }
      }
    } catch {
      // continue
    }
  }

  // ---- Source 3: business_profiles.offers (user's own/affiliate offers) ----
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

        // Skip duplicates (same name already from pyramid/legacy)
        if (existingNames.has(name.toLowerCase())) continue;

        const priceStr = typeof o?.price === "string" ? o.price.trim() : typeof o?.price === "number" ? String(o.price) : "";
        const priceNum = toNumberOrNull(priceStr.replace(/[^\d.,]/g, "").replace(",", "."));

        allOffers.push({
          id: `user:${userId}:${i}`,
          name,
          level: "user_offer",
          source: "user",
          is_flagship: null,
          promise: typeof o?.promise === "string" ? o.promise.trim() : null,
          description: typeof o?.description === "string" ? o.description.trim() : null,
          price_min: priceNum,
          price_max: priceNum,
          main_outcome: typeof o?.main_outcome === "string" ? o.main_outcome.trim() : null,
          link: typeof o?.link === "string" ? o.link.trim() : null,
          updated_at: null,
        });
      }
    }
  } catch {
    // continue
  }

  return allOffers;
}
