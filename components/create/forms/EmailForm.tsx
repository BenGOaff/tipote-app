"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Wand2, RefreshCw, Save, Calendar, Send, X, Copy, Check, FileDown } from "lucide-react";
import { AIContent } from "@/components/ui/ai-content";
import { copyToClipboard, downloadAsPdf } from "@/lib/content-utils";


import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

interface EmailFormProps {
  onGenerate: (params: any) => Promise<string>;
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
  isGenerating: boolean;
  isSaving: boolean;
}

const emailTypes = [
  { id: "newsletter", label: "Newsletter" },
  { id: "sales", label: "Email(s) de vente" },
  { id: "onboarding", label: "Onboarding (Know/Like/Trust)" },
];

type OfferOption = {
  id: string;
  name: string;
  level: string;
  is_flagship?: boolean | null;

  // détails utiles pour l’IA (et preview UI)
  promise?: string | null;
  description?: string | null;
  price_min?: number | null;
  price_max?: number | null;
  main_outcome?: string | null;
  format?: string | null;
  delivery?: string | null;
  target?: string | null; // quand présent dans plan_json
  updated_at?: string | null;
};

function levelLabel(level: string) {
  const s = String(level ?? "").toLowerCase();
  if (s.includes("lead") || s.includes("free") || s.includes("gratuit")) return "Gratuit (Lead magnet)";
  if (s.includes("low")) return "Low ticket";
  if (s.includes("middle") || s.includes("mid")) return "Middle ticket";
  if (s.includes("high") || s.includes("premium")) return "High ticket";
  return level || "Offre";
}

function splitEmails(raw: string): string[] {
  const s = (raw ?? "").trim();
  if (!s) return [];
  const parts = s
    .split(/\n\s*-----\s*\n/g)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts : [s];
}

function joinEmails(parts: string[]): string {
  const cleaned = (parts ?? []).map((p) => (p ?? "").trim()).filter(Boolean);
  return cleaned.join("\n\n-----\n\n").trim();
}

function isRecord(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function safeStringOrNull(v: unknown): string | null {
  if (typeof v === "string") {
    const s = v.trim();
    return s ? s : null;
  }
  return null;
}

function toNumberOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const s = v.trim().replace(",", ".");
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isLeadMagnetLevel(level: string | null | undefined) {
  const s = String(level ?? "").toLowerCase();
  return s.includes("lead") || s.includes("free") || s.includes("gratuit");
}

/**
 * Normalise business_plan.plan_json.selected_pyramid (legacy + new shapes) vers une liste d'offres
 * Objectif: ne jamais dépendre d'un shape rigide.
 */
function normalizeSelectedPyramid(userId: string, selected: any, updatedAt: string | null): OfferOption[] {
  const out: OfferOption[] = [];

  const pushOffer = (levelRaw: unknown, offerRaw: any, idxHint?: number) => {
    const level = safeStringOrNull(levelRaw) ?? null;
    const o = isRecord(offerRaw) ? offerRaw : null;
    if (!o) return;

    const name =
      safeStringOrNull((o as any).name) ??
      safeStringOrNull((o as any).title) ??
      safeStringOrNull((o as any).offer_name) ??
      safeStringOrNull((o as any).offerTitle) ??
      null;

    if (!name) return;

    const idRaw = safeStringOrNull((o as any).id);
    const id = idRaw ? idRaw : `${userId}:${level ?? "unknown"}:${idxHint ?? 0}`;

    const promise =
      safeStringOrNull((o as any).promise) ??
      safeStringOrNull((o as any).promesse) ??
      safeStringOrNull((o as any).purpose) ??
      safeStringOrNull((o as any).objectif) ??
      safeStringOrNull((o as any).benefit) ??
      null;

    const description = safeStringOrNull((o as any).description) ?? safeStringOrNull((o as any).desc) ?? null;

    const main_outcome =
      safeStringOrNull((o as any).main_outcome) ??
      safeStringOrNull((o as any).mainOutcome) ??
      safeStringOrNull((o as any).outcome) ??
      null;

    const format = safeStringOrNull((o as any).format) ?? null;
    const delivery = safeStringOrNull((o as any).delivery) ?? safeStringOrNull((o as any).livraison) ?? null;
    const target =
      safeStringOrNull((o as any).target) ??
      safeStringOrNull((o as any).public) ??
      safeStringOrNull((o as any).audience) ??
      safeStringOrNull((o as any).who) ??
      null;

    const price_min =
      toNumberOrNull((o as any).price_min) ??
      toNumberOrNull((o as any).priceMin) ??
      toNumberOrNull((o as any).prix_min) ??
      toNumberOrNull((o as any).price) ??
      null;

    const price_max =
      toNumberOrNull((o as any).price_max) ??
      toNumberOrNull((o as any).priceMax) ??
      toNumberOrNull((o as any).prix_max) ??
      null;

    const is_flagship = typeof (o as any).is_flagship === "boolean" ? ((o as any).is_flagship as boolean) : null;

    out.push({
      id,
      name,
      level: level ?? safeStringOrNull((o as any).level) ?? safeStringOrNull((o as any).offer_level) ?? "",
      promise,
      description,
      price_min,
      price_max,
      main_outcome,
      format,
      delivery,
      target,
      is_flagship,
      updated_at: safeStringOrNull((o as any).updated_at) ?? updatedAt,
    });
  };

  // 1) Array shape
  if (Array.isArray(selected)) {
    selected.forEach((item, idx) => {
      const level = isRecord(item)
        ? (item as any).level ?? (item as any).offer_level ?? (item as any).type ?? (item as any).tier
        : null;
      pushOffer(level, item, idx);
    });
    return out;
  }

  // 2) Object shape
  if (isRecord(selected)) {
    const nested =
      (Array.isArray((selected as any).offers) && (selected as any).offers) ||
      (Array.isArray((selected as any).items) && (selected as any).items) ||
      (Array.isArray((selected as any).pyramid) && (selected as any).pyramid) ||
      null;

    if (nested) {
      nested.forEach((item: any, idx: number) => {
        const level = isRecord(item) ? item.level ?? item.offer_level ?? item.type ?? item.tier : null;
        pushOffer(level, item, idx);
      });
      return out;
    }

    // 3) keyed tiers
    const KEY_TO_LEVEL: Array<[string, string]> = [
      ["lead_magnet", "lead_magnet"],
      ["leadmagnet", "lead_magnet"],
      ["free", "lead_magnet"],
      ["gratuit", "lead_magnet"],
      ["low_ticket", "low_ticket"],
      ["lowticket", "low_ticket"],
      ["middle_ticket", "middle_ticket"],
      ["mid_ticket", "middle_ticket"],
      ["midticket", "middle_ticket"],
      ["middle", "middle_ticket"],
      ["high_ticket", "high_ticket"],
      ["highticket", "high_ticket"],
      ["high", "high_ticket"],
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

    // 4) last resort
    if (out.length === 0) {
      const lvl = (selected as any).level ?? (selected as any).offer_level ?? (selected as any).type ?? null;
      pushOffer(lvl, selected, 0);
    }
  }

  return out;
}

function formatPriceRange(offer: OfferOption): string | null {
  const min = typeof offer.price_min === "number" ? offer.price_min : null;
  const max = typeof offer.price_max === "number" ? offer.price_max : null;
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) return `${min}€ – ${max}€`;
  return `${(min ?? max) as number}€`;
}

export function EmailForm({ onGenerate, onSave, onClose, isGenerating, isSaving }: EmailFormProps) {
  const [emailType, setEmailType] = useState("newsletter");

  // Newsletter
  const [newsletterTheme, setNewsletterTheme] = useState("");
  const [newsletterCta, setNewsletterCta] = useState("");

  // Sales
  const [salesMode, setSalesMode] = useState<"single" | "sequence_7">("single");
  const [salesAngle, setSalesAngle] = useState("");
  const [salesCta, setSalesCta] = useState("");

  // Onboarding
  const [onboardingSubject, setOnboardingSubject] = useState("");
  const [leadMagnetLink, setLeadMagnetLink] = useState("");
  const [onboardingCta, setOnboardingCta] = useState("");

  // Common
  const [formality, setFormality] = useState<"tu" | "vous">("vous");
  const [emails, setEmails] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  // ✅ UX: aperçu "beau" + option "texte brut"
  const [showRawEditor, setShowRawEditor] = useState(false);
  const [copied, setCopied] = useState(false);


  const generatedContent = useMemo(() => joinEmails(emails), [emails]);

  /**
   * ✅ Offres: on charge d’abord business_plan.plan_json.selected_pyramid (source de vérité),
   * puis fallback offer_pyramids (legacy) si besoin.
   */
  const [offers, setOffers] = useState<OfferOption[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);

  // Sales: choisir offre à vendre
  const [offerSource, setOfferSource] = useState<"pyramid" | "manual">("pyramid");
  const [offerId, setOfferId] = useState<string>("");

  // Onboarding: choisir lead magnet (optionnel mais recommandé)
  const [onboardingSource, setOnboardingSource] = useState<"pyramid" | "manual">("pyramid");
  const [leadMagnetOfferId, setLeadMagnetOfferId] = useState<string>("");

  // Manual offer specs (fallback)
  const [offerName, setOfferName] = useState("");
  const [offerPromise, setOfferPromise] = useState("");
  const [offerOutcome, setOfferOutcome] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const [offerDescription, setOfferDescription] = useState("");

  // Manual lead magnet specs (onboarding)
  const [leadMagnetName, setLeadMagnetName] = useState("");
  const [leadMagnetPromise, setLeadMagnetPromise] = useState("");

  useEffect(() => {
    let mounted = true;
    const supabase = getSupabaseBrowserClient();

    const loadOffers = async () => {
      setOffersLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!mounted) return;
        if (!user?.id) {
          setOffers([]);
          return;
        }

        // 1) business_plan.plan_json.selected_pyramid
        const { data: planRow, error: planErr } = await supabase
          .from("business_plan")
          .select("plan_json, updated_at")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!mounted) return;

        if (!planErr && planRow?.plan_json) {
          const planJson: any = (planRow as any).plan_json ?? null;
          const selected =
            planJson?.selected_pyramid ?? planJson?.pyramid?.selected_pyramid ?? planJson?.pyramid ?? planJson?.offer_pyramid ?? null;

          if (selected) {
            const fromPlan = normalizeSelectedPyramid(user.id, selected, safeStringOrNull((planRow as any)?.updated_at));
            if (fromPlan.length) {
              setOffers(fromPlan);
              return;
            }
          }
        }

        // 2) fallback legacy: offer_pyramids (on prend le max d’infos utiles)
        const { data, error } = await supabase
          .from("offer_pyramids")
          .select("id,name,level,is_flagship,description,promise,price_min,price_max,main_outcome,format,delivery,updated_at")
          .order("is_flagship", { ascending: false })
          .order("updated_at", { ascending: false })
          .limit(100);

        if (!mounted) return;
        if (error) {
          setOffers([]);
          return;
        }

        const rows = Array.isArray(data) ? data : [];
        const mapped: OfferOption[] = rows
          .map((r: any) => {
            const id = typeof r?.id === "string" ? r.id : "";
            const name = typeof r?.name === "string" ? r.name : "";
            if (!id || !name) return null;

            return {
              id,
              name,
              level: typeof r?.level === "string" ? r.level : "",
              is_flagship: typeof r?.is_flagship === "boolean" ? r.is_flagship : null,
              description: typeof r?.description === "string" ? r.description : null,
              promise: typeof r?.promise === "string" ? r.promise : null,
              price_min: toNumberOrNull(r?.price_min),
              price_max: toNumberOrNull(r?.price_max),
              main_outcome: typeof r?.main_outcome === "string" ? r.main_outcome : null,
              format: typeof r?.format === "string" ? r.format : null,
              delivery: typeof r?.delivery === "string" ? r.delivery : null,
              updated_at: typeof r?.updated_at === "string" ? r.updated_at : null,
            } as OfferOption;
          })
          .filter(Boolean) as OfferOption[];

        setOffers(mapped);
      } catch {
        if (mounted) setOffers([]);
      } finally {
        if (mounted) setOffersLoading(false);
      }
    };

    loadOffers();

    return () => {
      mounted = false;
    };
  }, []);

  const offersByLevel = useMemo(() => {
    const out: Record<string, OfferOption[]> = {};
    (offers ?? []).forEach((o) => {
      const k = o.level || "other";
      out[k] = out[k] || [];
      out[k].push(o);
    });

    // tri stable : flagship d’abord, puis nom
    Object.keys(out).forEach((k) => {
      out[k] = out[k].slice().sort((a, b) => {
        const af = a.is_flagship ? 1 : 0;
        const bf = b.is_flagship ? 1 : 0;
        if (af !== bf) return bf - af;
        return a.name.localeCompare(b.name);
      });
    });

    return out;
  }, [offers]);

  const leadMagnetOffers = useMemo(() => {
    return (offers ?? []).filter((o) => isLeadMagnetLevel(o.level));
  }, [offers]);

  const selectedSalesOffer = useMemo(() => {
    if (offerSource !== "pyramid") return null;
    const id = (offerId ?? "").trim();
    if (!id) return null;
    return offers.find((o) => o.id === id) ?? null;
  }, [offerSource, offerId, offers]);

  const selectedLeadMagnetOffer = useMemo(() => {
    if (onboardingSource !== "pyramid") return null;
    const id = (leadMagnetOfferId ?? "").trim();
    if (!id) return null;
    return offers.find((o) => o.id === id) ?? null;
  }, [onboardingSource, leadMagnetOfferId, offers]);

  // ✅ validations
  const needsSalesOffer =
    emailType === "sales" &&
    (offerSource === "pyramid" ? !offerId : !offerName.trim() && !offerPromise.trim() && !offerOutcome.trim());

  const needsOnboardingLeadMagnet =
    emailType === "onboarding" && onboardingSource === "pyramid" && leadMagnetOffers.length > 0 && !leadMagnetOfferId;

  const canGenerate = useMemo(() => {
    if (emailType === "newsletter") {
      return !!newsletterTheme.trim() && !!newsletterCta.trim();
    }
    if (emailType === "sales") {
      return !!salesAngle.trim() && !needsSalesOffer;
    }
    // onboarding
    return !!onboardingSubject.trim() && !needsOnboardingLeadMagnet && (!!leadMagnetLink.trim() || !!onboardingCta.trim());
  }, [
    emailType,
    newsletterTheme,
    newsletterCta,
    salesAngle,
    needsSalesOffer,
    onboardingSubject,
    needsOnboardingLeadMagnet,
    leadMagnetLink,
    onboardingCta,
  ]);

  // UX: reset quelques champs quand on change de type
  useEffect(() => {
    setEmails([]);
    setScheduledAt("");
    setShowRawEditor(false);
    // ne reset pas title (souvent utile), mais si vide on le remplira au generate
  }, [emailType]);

  const handleGenerate = async () => {
    const payload: any = {
      type: "email",
      emailType,
      formality,
    };

    if (emailType === "newsletter") {
      payload.newsletterTheme = newsletterTheme;
      payload.newsletterCta = newsletterCta;
    }

    if (emailType === "sales") {
      payload.salesMode = salesMode;
      payload.subject = salesAngle;
      payload.salesCta = salesCta;

      if (offerSource === "pyramid") {
        payload.offerId = offerId || undefined;

        // Bonus (fail-open): si le prompt builder côté API n’a pas assez de détails,
        // on envoie aussi un "offerManual" enrichi (il sera utilisé comme fallback).
        if (selectedSalesOffer) {
          payload.offerManual = {
            name: selectedSalesOffer.name || undefined,
            promise: selectedSalesOffer.promise || undefined,
            main_outcome: selectedSalesOffer.main_outcome || undefined,
            description: selectedSalesOffer.description || undefined,
            price: formatPriceRange(selectedSalesOffer) || undefined,
          };
        }
      } else {
        payload.offerManual = {
          name: offerName || undefined,
          promise: offerPromise || undefined,
          main_outcome: offerOutcome || undefined,
          price: offerPrice || undefined,
          description: offerDescription || undefined,
        };
      }
    }

    if (emailType === "onboarding") {
      payload.subject = onboardingSubject;

      // Onboarding = KLT 3 emails + envoi lead magnet
      // ✅ Le backend utilise leadMagnetLink + onboardingCta. On garde ces champs.
      payload.leadMagnetLink = leadMagnetLink || undefined;
      payload.onboardingCta = onboardingCta || undefined;

      // Bonus (fail-open): on enrichit le contexte via offerManual (le backend ignore peut-être
      // hors sales, mais ça ne casse rien et ça aide si buildEmailPrompt l’exploite).
      if (onboardingSource === "pyramid" && selectedLeadMagnetOffer) {
        payload.offerManual = {
          name: selectedLeadMagnetOffer.name || undefined,
          promise: selectedLeadMagnetOffer.promise || undefined,
          main_outcome: selectedLeadMagnetOffer.main_outcome || undefined,
          description: selectedLeadMagnetOffer.description || undefined,
          price: "Gratuit",
        };
      } else if (onboardingSource === "manual" && (leadMagnetName.trim() || leadMagnetPromise.trim())) {
        payload.offerManual = {
          name: leadMagnetName || undefined,
          promise: leadMagnetPromise || undefined,
          main_outcome: undefined,
          description: undefined,
          price: "Gratuit",
        };
      }
    }

    const content = await onGenerate(payload);

    if (content) {
      const blocks = splitEmails(content);
      setEmails(blocks);

      if (!title) {
        if (emailType === "newsletter") setTitle(newsletterTheme || "Newsletter");
        else if (emailType === "sales") setTitle(salesAngle || "Email de vente");
        else setTitle(onboardingSubject || "Onboarding");
      }
    }
  };

  const handleSave = async (status: "draft" | "scheduled" | "published") => {
    await onSave({
      title,
      content: generatedContent,
      type: "email",
      platform: "newsletter",
      status,
      scheduled_at: scheduledAt || undefined,
    });
  };

  const regenerateDisabled = isGenerating || !canGenerate;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Email Marketing</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Type d&apos;email</Label>
            <Select value={emailType} onValueChange={setEmailType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {emailTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {emailType === "newsletter" && (
            <>
              <div className="space-y-2">
                <Label>Thème *</Label>
                <Input
                  placeholder="Ex: Débuter en business en ligne sans budget"
                  value={newsletterTheme}
                  onChange={(e) => setNewsletterTheme(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>CTA *</Label>
                <Input
                  placeholder="Ex: Réponds à cet email avec ton objectif"
                  value={newsletterCta}
                  onChange={(e) => setNewsletterCta(e.target.value)}
                />
              </div>
            </>
          )}

          {emailType === "sales" && (
            <>
              <div className="space-y-2">
                <Label>Format</Label>
                <RadioGroup value={salesMode} onValueChange={(v) => setSalesMode(v as any)} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="single" id="single" />
                    <Label htmlFor="single">1 email de vente</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="sequence_7" id="sequence_7" />
                    <Label htmlFor="sequence_7">Séquence complète (7 emails)</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label>Angle / intention *</Label>
                <Input
                  placeholder="Ex: Relancer les prospects froids"
                  value={salesAngle}
                  onChange={(e) => setSalesAngle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>CTA (optionnel)</Label>
                <Input placeholder="Ex: Clique ici pour voir l'offre" value={salesCta} onChange={(e) => setSalesCta(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Offre à vendre</Label>

                <RadioGroup value={offerSource} onValueChange={(v) => setOfferSource(v as any)} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="pyramid" id="pyramid" />
                    <Label htmlFor="pyramid">Pyramide</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="manual" id="manual" />
                    <Label htmlFor="manual">Manuel</Label>
                  </div>
                </RadioGroup>

                {offerSource === "pyramid" ? (
                  offersLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Chargement de vos offres...
                    </div>
                  ) : offers.length ? (
                    <>
                      <Select value={offerId} onValueChange={setOfferId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choisis une offre de ta pyramide" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(offersByLevel).map(([lvl, list]) => (
                            <div key={lvl}>
                              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{levelLabel(lvl)}</div>
                              {list.map((o) => (
                                <SelectItem key={o.id} value={o.id}>
                                  {o.is_flagship ? "⭐ " : ""}
                                  {o.name}
                                </SelectItem>
                              ))}
                            </div>
                          ))}
                        </SelectContent>
                      </Select>

                      {selectedSalesOffer && (
                        <div className="mt-2 rounded-lg border bg-muted/30 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-medium">
                              {selectedSalesOffer.is_flagship ? "⭐ " : ""}
                              {selectedSalesOffer.name}
                            </div>
                            <div className="text-xs text-muted-foreground">{levelLabel(selectedSalesOffer.level)}</div>
                          </div>

                          {formatPriceRange(selectedSalesOffer) && (
                            <div className="text-xs text-muted-foreground">Prix : {formatPriceRange(selectedSalesOffer)}</div>
                          )}

                          {selectedSalesOffer.promise && (
                            <div className="text-xs">
                              <span className="text-muted-foreground">Promesse : </span>
                              {selectedSalesOffer.promise}
                            </div>
                          )}

                          {selectedSalesOffer.main_outcome && (
                            <div className="text-xs">
                              <span className="text-muted-foreground">Résultat : </span>
                              {selectedSalesOffer.main_outcome}
                            </div>
                          )}

                          {selectedSalesOffer.target && (
                            <div className="text-xs">
                              <span className="text-muted-foreground">Public : </span>
                              {selectedSalesOffer.target}
                            </div>
                          )}

                          {selectedSalesOffer.description && (
                            <div className="text-xs text-muted-foreground line-clamp-4">{selectedSalesOffer.description}</div>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Aucune offre trouvée dans la pyramide. Passe en mode Manuel.
                    </p>
                  )
                ) : (
                  <div className="space-y-2">
                    <Input placeholder="Nom de l'offre *" value={offerName} onChange={(e) => setOfferName(e.target.value)} />
                    <Input placeholder="Promesse (optionnel)" value={offerPromise} onChange={(e) => setOfferPromise(e.target.value)} />
                    <Input placeholder="Résultat principal (optionnel)" value={offerOutcome} onChange={(e) => setOfferOutcome(e.target.value)} />
                    <Input placeholder="Prix (optionnel)" value={offerPrice} onChange={(e) => setOfferPrice(e.target.value)} />
                    <Textarea
                      value={offerDescription}
                      onChange={(e) => setOfferDescription(e.target.value)}
                      rows={4}
                      placeholder="Description (optionnel)"
                      className="resize-none"
                    />
                  </div>
                )}

                {emailType === "sales" && needsSalesOffer && (
                  <p className="text-xs text-muted-foreground">
                    Sélectionne une offre (pyramide) ou renseigne au moins le nom de l&apos;offre.
                  </p>
                )}
              </div>
            </>
          )}

          {emailType === "onboarding" && (
            <>
              <div className="space-y-2">
                <Label>Sujet / intention *</Label>
                <Input
                  placeholder="Ex: Accueillir un nouveau lead et construire la confiance"
                  value={onboardingSubject}
                  onChange={(e) => setOnboardingSubject(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Lead magnet</Label>

                <RadioGroup value={onboardingSource} onValueChange={(v) => setOnboardingSource(v as any)} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="pyramid" id="onb_pyramid" />
                    <Label htmlFor="onb_pyramid">Pyramide</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="manual" id="onb_manual" />
                    <Label htmlFor="onb_manual">Manuel</Label>
                  </div>
                </RadioGroup>

                {onboardingSource === "pyramid" ? (
                  offersLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Chargement de vos offres...
                    </div>
                  ) : leadMagnetOffers.length ? (
                    <>
                      <Select value={leadMagnetOfferId} onValueChange={setLeadMagnetOfferId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choisis ton lead magnet (offre gratuite)" />
                        </SelectTrigger>
                        <SelectContent>
                          {leadMagnetOffers.map((o) => (
                            <SelectItem key={o.id} value={o.id}>
                              {o.is_flagship ? "⭐ " : ""}
                              {o.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {selectedLeadMagnetOffer && (
                        <div className="mt-2 rounded-lg border bg-muted/30 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-medium">
                              {selectedLeadMagnetOffer.is_flagship ? "⭐ " : ""}
                              {selectedLeadMagnetOffer.name}
                            </div>
                            <div className="text-xs text-muted-foreground">{levelLabel(selectedLeadMagnetOffer.level)}</div>
                          </div>

                          {selectedLeadMagnetOffer.promise && (
                            <div className="text-xs">
                              <span className="text-muted-foreground">Promesse : </span>
                              {selectedLeadMagnetOffer.promise}
                            </div>
                          )}

                          {selectedLeadMagnetOffer.main_outcome && (
                            <div className="text-xs">
                              <span className="text-muted-foreground">Résultat : </span>
                              {selectedLeadMagnetOffer.main_outcome}
                            </div>
                          )}

                          {selectedLeadMagnetOffer.target && (
                            <div className="text-xs">
                              <span className="text-muted-foreground">Public : </span>
                              {selectedLeadMagnetOffer.target}
                            </div>
                          )}

                          {selectedLeadMagnetOffer.description && (
                            <div className="text-xs text-muted-foreground line-clamp-4">{selectedLeadMagnetOffer.description}</div>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Aucun lead magnet détecté dans ta pyramide. Passe en mode Manuel.
                    </p>
                  )
                ) : (
                  <div className="space-y-2">
                    <Input
                      placeholder="Nom du lead magnet (optionnel)"
                      value={leadMagnetName}
                      onChange={(e) => setLeadMagnetName(e.target.value)}
                    />
                    <Input
                      placeholder="Promesse du lead magnet (optionnel)"
                      value={leadMagnetPromise}
                      onChange={(e) => setLeadMagnetPromise(e.target.value)}
                    />
                  </div>
                )}

                {needsOnboardingLeadMagnet && (
                  <p className="text-xs text-muted-foreground">
                    Choisis ton lead magnet (pyramide) pour des emails d&apos;onboarding plus alignés.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Lien du lead magnet (ou CTA) *</Label>
                <Input
                  placeholder="Ex: https://... (lien du téléchargement)"
                  value={leadMagnetLink}
                  onChange={(e) => setLeadMagnetLink(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>CTA alternatif (optionnel)</Label>
                <Input
                  placeholder="Ex: Réponds à cet email avec ton objectif"
                  value={onboardingCta}
                  onChange={(e) => setOnboardingCta(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label>Tutoiement / Vouvoiement</Label>
            <RadioGroup value={formality} onValueChange={(v) => setFormality(v as any)} className="flex gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="vous" id="vous" />
                <Label htmlFor="vous">Vous</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="tu" id="tu" />
                <Label htmlFor="tu">Tu</Label>
              </div>
            </RadioGroup>
          </div>

          <Button className="w-full" onClick={handleGenerate} disabled={!canGenerate || isGenerating}>
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Génération...
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4 mr-2" />
                Générer
              </>
            )}
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Titre (pour sauvegarde)</Label>
                        <Input
              placeholder="Titre interne"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
  <div className="flex items-center justify-between gap-2">
    <Label>{emails.length <= 1 ? "Email généré" : `Emails générés (${emails.length})`}</Label>

    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => setShowRawEditor((v) => !v)}
      disabled={!generatedContent?.trim()}
    >
      {showRawEditor ? "Aperçu" : "Texte brut"}
    </Button>
  </div>

  {/* ✅ Aperçu “beau” (markdown) par défaut */}
  {!showRawEditor ? (
    <div className="rounded-xl border bg-background p-4">
      <AIContent content={generatedContent} mode="auto" />
    </div>
  ) : emails.length <= 1 ? (
    <Textarea
      value={emails[0] ?? ""}
      onChange={(e) => setEmails([e.target.value])}
      rows={12}
      placeholder="L'email apparaîtra ici..."
      className="resize-none"
    />
  ) : (
    <div className="space-y-3">
      {emails.map((value, idx) => (
        <div key={idx} className="space-y-2">
          <Label>Email {idx + 1}</Label>
          <Textarea
            value={value}
            onChange={(e) => {
              const next = [...emails];
              next[idx] = e.target.value;
              setEmails(next);
            }}
            rows={10}
            placeholder={`Email ${idx + 1}...`}
            className="resize-none"
          />
        </div>
      ))}
    </div>
  )}
</div>


          {generatedContent && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Programmer (optionnel)</Label>
                <Input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleSave("draft")}
                  disabled={!title || isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-1" />
                  )}
                  Brouillon
                </Button>

                {scheduledAt && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleSave("scheduled")}
                    disabled={!title || isSaving}
                  >
                    <Calendar className="w-4 h-4 mr-1" />
                    Planifier
                  </Button>
                )}

                <Button
                  size="sm"
                  onClick={() => handleSave("published")}
                  disabled={!title || isSaving}
                >
                  <Send className="w-4 h-4 mr-1" />
                  Programmer
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerate}
                  disabled={regenerateDisabled}
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Regénérer
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const ok = await copyToClipboard(generatedContent);
                    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1600); }
                  }}
                  disabled={!generatedContent}
                >
                  {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                  {copied ? "Copié" : "Copier"}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadAsPdf(generatedContent, title || "Email")}
                  disabled={!generatedContent}
                >
                  <FileDown className="w-4 h-4 mr-1" />
                  PDF
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}