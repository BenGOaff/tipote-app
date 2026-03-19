"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { PageHeader } from "@/components/PageHeader";
import { PageBanner } from "@/components/PageBanner";
import { Card } from "@/components/ui/card";

import { useToast } from "@/hooks/use-toast";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

import { useTranslations } from 'next-intl';
import { Sparkles, FileText, Mail, Video, MessageSquare, Package, Route, ClipboardList, CalendarDays } from "lucide-react";

import { ContentTypeCard } from "@/components/create/ContentTypeCard";

import { PostForm, type PostEditData } from "@/components/create/forms/PostForm";
import { EmailForm } from "@/components/create/forms/EmailForm";
import { ArticleForm } from "@/components/create/forms/ArticleForm";
import { VideoForm } from "@/components/create/forms/VideoForm";
import { OfferForm } from "@/components/create/forms/OfferForm";
import { FunnelForm } from "@/components/create/forms/FunnelForm";
import { QuizForm } from "@/components/quiz/QuizForm";
import { ContentStrategyForm } from "@/components/create/forms/ContentStrategyForm";
import { AIGeneratingOverlay } from "@/components/ui/ai-generating-overlay";

const contentTypes = [
  { id: "post", labelKey: "socialMedia", descriptionKey: "socialMediaDesc", icon: MessageSquare, color: "bg-blue-500" },
  { id: "email", labelKey: "emailMarketing", descriptionKey: "emailMarketingDesc", icon: Mail, color: "bg-green-500" },
  { id: "article", labelKey: "blog", descriptionKey: "blogDesc", icon: FileText, color: "bg-purple-500" },
  { id: "video", labelKey: "videoScripts", descriptionKey: "videoScriptsDesc", icon: Video, color: "bg-red-500" },
  { id: "offer", labelKey: "offers", descriptionKey: "offersDesc", icon: Package, color: "bg-orange-500" },
  { id: "funnel", labelKey: "funnels", descriptionKey: "funnelsDesc", icon: Route, color: "bg-indigo-500" },
  { id: "quiz", labelKey: "quizLeadMagnet", descriptionKey: "quizLeadMagnetDesc", icon: ClipboardList, color: "bg-teal-500" },
  { id: "strategy", labelKey: "contentStrategy", descriptionKey: "contentStrategyDesc", icon: CalendarDays, color: "bg-amber-500" },
] as const;

type ContentType = (typeof contentTypes)[number]["id"] | null;
type AnyParams = Record<string, any>;

type SourceOfferLite = {
  id: string;
  name: string | null;
  level?: string | null;
  description?: string | null;
  promise?: string | null;
  price_min?: number | null;
  price_max?: number | null;
  main_outcome?: string | null;
  format?: string | null;
  delivery?: string | null;
  updated_at?: string | null;
};

function isLeadMagnetLevel(level: string | null | undefined) {
  const s = String(level ?? "").toLowerCase();
  return s.includes("lead") || s.includes("free") || s.includes("gratuit");
}

function toNumberOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const s = v.trim().replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function safeString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

function safeObj(v: unknown): Record<string, any> | null {
  if (!v || typeof v !== "object") return null;
  if (Array.isArray(v)) return null;
  return v as Record<string, any>;
}

/**
 * Normalise plan_json.selected_pyramid (legacy DB key) vers une liste d'offres existantes.
 * Objectif: ne jamais dépendre d'un shape rigide (keys / array / nested).
 */
function normalizeSelectedOffers(userId: string, selected: any, updatedAt: string | null): SourceOfferLite[] {
  const out: SourceOfferLite[] = [];

  const pushOffer = (levelRaw: unknown, offerRaw: any, idxHint?: number) => {
    const level = safeString(levelRaw) ?? null;
    const o = safeObj(offerRaw) ?? (typeof offerRaw === "object" ? offerRaw : null);
    if (!o) return;

    const name =
      safeString(o.name) ??
      safeString(o.title) ??
      safeString(o.offer_name) ??
      safeString(o.offerTitle) ??
      null;

    if (!name) return;

    const description = safeString(o.description) ?? safeString(o.desc) ?? null;
    const promise =
      safeString(o.promise) ??
      safeString(o.promesse) ??
      safeString(o.purpose) ??
      safeString(o.objectif) ??
      safeString(o.benefit) ??
      null;
    const main_outcome = safeString(o.main_outcome) ?? safeString(o.mainOutcome) ?? safeString(o.outcome) ?? null;
    const format = safeString(o.format) ?? null;
    const delivery = safeString(o.delivery) ?? safeString(o.livraison) ?? null;

    const price_min =
      toNumberOrNull(o.price_min) ??
      toNumberOrNull(o.priceMin) ??
      toNumberOrNull(o.prix_min) ??
      toNumberOrNull(o.price) ??
      null;

    const price_max =
      toNumberOrNull(o.price_max) ??
      toNumberOrNull(o.priceMax) ??
      toNumberOrNull(o.prix_max) ??
      null;

    const id = String(o.id ?? `${userId}:${level ?? "unknown"}:${idxHint ?? 0}`);

    out.push({
      id,
      name,
      level,
      description,
      promise,
      price_min,
      price_max,
      main_outcome,
      format,
      delivery,
      updated_at: safeString(o.updated_at) ?? updatedAt,
    });
  };

  // 1) Array shape: [{ level, name, ... }, ...]
  if (Array.isArray(selected)) {
    selected.forEach((item, idx) => {
      const level = (item && (item.level ?? item.offer_level ?? item.type ?? item.tier)) ?? null;
      pushOffer(level, item, idx);
    });
    return out;
  }

  // 2) Object shape: may contain offers array nested
  const selObj = safeObj(selected);
  if (!selObj) return out;

  const nestedOffers =
    (Array.isArray(selObj.offers) && selObj.offers) ||
    (Array.isArray(selObj.items) && selObj.items) ||
    (Array.isArray(selObj.pyramid) && selObj.pyramid) ||
    null;

  if (nestedOffers) {
    nestedOffers.forEach((item: any, idx: number) => {
      const level = (item && (item.level ?? item.offer_level ?? item.type ?? item.tier)) ?? null;
      pushOffer(level, item, idx);
    });
    return out;
  }

  // 3) Keyed shape: lead_magnet / low_ticket / middle_ticket / high_ticket (and variants)
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

  const loweredKeys = Object.keys(selObj).reduce<Record<string, string>>((acc, k) => {
    acc[k.toLowerCase()] = k;
    return acc;
  }, {});

  for (const [kLower, level] of KEY_TO_LEVEL) {
    const realKey = loweredKeys[kLower];
    if (!realKey) continue;
    pushOffer(level, selObj[realKey], level === "lead_magnet" ? 0 : level === "low_ticket" ? 1 : 2);
  }

  // 4) Last resort: if object itself looks like an offer
  if (out.length === 0) {
    const level = selObj.level ?? selObj.offer_level ?? selObj.type ?? null;
    pushOffer(level, selObj, 0);
  }

  return out;
}

function buildFallbackPrompt(params: AnyParams): string {
  const type = typeof params.type === "string" ? params.type : "content";
  const platform = typeof params.platform === "string" ? params.platform : "";
  const title = typeof params.title === "string" ? params.title : "";
  const subject = typeof params.subject === "string" ? params.subject : "";
  const theme = typeof params.theme === "string" ? params.theme : "";
  const tone = typeof params.tone === "string" ? params.tone : "";
  const formality = typeof params.formality === "string" ? params.formality : "";
  const instructions = typeof params.instructions === "string" ? params.instructions : "";
  const brief = typeof params.brief === "string" ? params.brief : "";

  const head = `Génère un contenu de type "${type}"${platform ? ` pour ${platform}` : ""}.`;
  const intent = [
    title ? `Titre: ${title}` : "",
    subject ? `Sujet: ${subject}` : "",
    theme ? `Thème/Objectif: ${theme}` : "",
    tone ? `Ton: ${tone}` : "",
    formality ? `Style: ${formality}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const extra = [brief ? `Brief:\n${brief}` : "", instructions ? `Contraintes:\n${instructions}` : ""]
    .filter(Boolean)
    .join("\n\n");

  return [head, intent, extra].filter(Boolean).join("\n\n").trim();
}

function ensurePrompt(params: AnyParams): AnyParams {
  if (params?.type === "post") {
    const subject = typeof params.subject === "string" ? params.subject.trim() : "";
    const promptLike =
      (typeof params.prompt === "string" && params.prompt.trim()) ||
      (typeof params.brief === "string" && params.brief.trim()) ||
      (typeof params.text === "string" && params.text.trim()) ||
      (typeof params.instructions === "string" && params.instructions.trim()) ||
      "";

    if (!subject && promptLike) {
      return { ...params, subject: promptLike };
    }
    return params;
  }

  const hasPrompt =
    (typeof params.prompt === "string" && params.prompt.trim().length > 0) ||
    (typeof params.brief === "string" && params.brief.trim().length > 0) ||
    (typeof params.text === "string" && params.text.trim().length > 0) ||
    (typeof params.instructions === "string" && params.instructions.trim().length > 0);

  if (hasPrompt) {
    if (!params.prompt && typeof params.instructions === "string" && params.instructions.trim()) {
      return { ...params, prompt: params.instructions.trim() };
    }
    return params;
  }

  return { ...params, prompt: buildFallbackPrompt(params) };
}

function extractGeneratedText(data: any): string {
  if (!data) return "";
  if (typeof data.content === "string") return data.content;
  if (typeof data.text === "string") return data.text;
  if (typeof data.result === "string") return data.result;
  if (typeof data.output === "string") return data.output;
  if (typeof data.message === "string") return data.message;
  return "";
}

async function pollGeneratedContent(
  jobId: string,
  opts?: { timeoutMs?: number; minDelayMs?: number; maxDelayMs?: number },
) {
  const timeoutMs = opts?.timeoutMs ?? 120_000;
  const minDelayMs = opts?.minDelayMs ?? 900;
  const maxDelayMs = opts?.maxDelayMs ?? 2_500;

  const start = Date.now();
  let delay = minDelayMs;
  let didTriggerProcess = false;

  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`/api/content/${encodeURIComponent(jobId)}`, { method: "GET" });
    const raw = await res.text().catch(() => "");
    let data: any = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }

    // ✅ Fallback prod (PM2/VPS): si le job reste bloqué en "generating" trop longtemps,
    // on déclenche une tentative de processing côté serveur (idempotent via lock côté API).
    if (!didTriggerProcess && Date.now() - start > 15_000) {
      didTriggerProcess = true;
      void fetch(`/api/content/${encodeURIComponent(jobId)}?process=1`, { method: "GET" }).catch(() => null);
    }

    if (res.ok && data?.ok && data?.item) {
      const status = String(data.item.status ?? "").toLowerCase();
      const content = typeof data.item.content === "string" ? data.item.content.trim() : "";

      if (content && status !== "generating") {
        return content;
      }
      if (content) return content;
    }

    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(maxDelayMs, Math.floor(delay * 1.2));
  }

  return "";
}

export default function CreateLovableClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const t = useTranslations('createClient');

  const editId = searchParams.get("edit");

  const [selectedType, setSelectedType] = useState<ContentType>(editId ? "post" : null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Edit mode: fetch existing content data
  const [editData, setEditData] = useState<PostEditData | null>(null);
  const [editLoading, setEditLoading] = useState(Boolean(editId));

  useEffect(() => {
    if (!editId) return;
    let cancelled = false;

    const fetchContent = async () => {
      setEditLoading(true);
      try {
        const res = await fetch(`/api/content/${encodeURIComponent(editId)}`);
        const json = await res.json().catch(() => null);

        if (cancelled) return;

        if (res.ok && json?.ok && json?.item) {
          const item = json.item;
          setEditData({
            id: item.id,
            content: item.content ?? null,
            channel: item.channel ?? null,
            title: item.title ?? null,
            status: item.status ?? null,
            scheduled_date: item.scheduled_date ?? null,
            meta: item.meta ?? null,
          });
          setSelectedType("post");
        } else {
          toast({
            title: "Contenu introuvable",
            description: "Impossible de charger ce contenu pour l'éditer.",
            variant: "destructive",
          });
          setEditData(null);
        }
      } catch {
        if (!cancelled) {
          toast({
            title: "Erreur",
            description: "Impossible de charger le contenu.",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setEditLoading(false);
      }
    };

    fetchContent();
    return () => { cancelled = true; };
  }, [editId]);

  const [existingOffers, setPyramidOffers] = useState<SourceOfferLite[]>([]);
  const [sourceLeadMagnet, setPyramidLeadMagnet] = useState<SourceOfferLite | null>(null);
  const [sourcePaidOffer, setPyramidPaidOffer] = useState<SourceOfferLite | null>(null);

  // ✅ PATCH IMPORTANT :
  // On lit d'abord business_plan.plan_json.selected_pyramid (DB key legacy, source de vérité),
  // en supportant les shapes legacy, puis fallback sur offer_pyramids (table legacy).
  // + abonnement realtime => si user modifie ses offres, c'est reflété sans refresh.
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;

    const computeFromOffers = (offers: SourceOfferLite[]) => {
      const normalized = (offers ?? []).filter((o) => o && o.name);
      setPyramidOffers(normalized);

      const lead = normalized.find((o) => isLeadMagnetLevel(o.level ?? null)) ?? null;
      setPyramidLeadMagnet(lead);

      const paid =
        normalized.find((o) => String(o.level ?? "").toLowerCase().includes("low")) ??
        normalized.find((o) => String(o.level ?? "").toLowerCase().includes("middle")) ??
        normalized.find((o) => String(o.level ?? "").toLowerCase().includes("mid")) ??
        normalized.find((o) => String(o.level ?? "").toLowerCase().includes("high")) ??
        normalized.find((o) => !isLeadMagnetLevel(o.level ?? null)) ??
        null;

      setPyramidPaidOffer(paid);
    };

    const load = async () => {
      try {
        const {
          data: { user },
          error: userErr,
        } = await supabase.auth.getUser();

        if (cancelled) return;
        if (userErr || !user?.id) return;

        // 1) Source de vérité : business_plan.plan_json.selected_pyramid (DB key legacy)
        const { data: planRow, error: planErr } = await supabase
          .from("business_plan")
          .select("plan_json, updated_at")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!cancelled && !planErr && planRow?.plan_json) {
          const planJson: any = planRow.plan_json;
          const selected = planJson?.selected_pyramid ?? planJson?.pyramid?.selected_pyramid ?? planJson?.pyramid ?? null;

          if (selected) {
            const offersFromPlan = normalizeSelectedOffers(
              user.id,
              selected,
              safeString((planRow as any)?.updated_at),
            );
            if (offersFromPlan.length > 0) {
              computeFromOffers(offersFromPlan);
              return; // ✅ si source de vérité existe et exploitable, on s’arrête ici
            }
          }
        }

        // 2) Fallback legacy : offer_pyramids (table legacy)
        const { data, error } = await supabase
          .from("offer_pyramids")
          .select("id,user_id,name,level,description,promise,price_min,price_max,main_outcome,format,delivery,updated_at")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false });

        if (cancelled) return;
        if (error) return;

        const offers = (data as any[] | null) ?? [];
        const normalized: SourceOfferLite[] = offers.map((o) => ({
          id: String(o.id),
          name: (o.name ?? null) as any,
          level: (o.level ?? null) as any,
          description: (o.description ?? null) as any,
          promise: (o.promise ?? null) as any,
          price_min: toNumberOrNull(o.price_min),
          price_max: toNumberOrNull(o.price_max),
          main_outcome: (o.main_outcome ?? null) as any,
          format: (o.format ?? null) as any,
          delivery: (o.delivery ?? null) as any,
          updated_at: (o.updated_at ?? null) as any,
        }));

        computeFromOffers(normalized);
      } catch {
        // fail-open
      }
    };

    let channel: any = null;

    (async () => {
      await load();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;
      if (!user?.id) return;

      // Realtime: si l'utilisateur modifie business_plan ou offer_pyramids, on reload.
      channel = supabase
        .channel(`existing-offers:${user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "business_plan", filter: `user_id=eq.${user.id}` }, () => {
          load();
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "offer_pyramids", filter: `user_id=eq.${user.id}` }, () => {
          load();
        })
        .subscribe();
    })();

    return () => {
      cancelled = true;
      try {
        if (channel) supabase.removeChannel(channel);
      } catch {
        // ignore
      }
    };
  }, []);

  const handleGenerate = async (params: any): Promise<{ text: string; contentId: string | null }> => {
    setIsGenerating(true);
    try {
      const payload = ensurePrompt(params);

      const res = await fetch("/api/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const rawText = await res.text();
      let data: any = null;
      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        data = null;
      }

      if (!res.ok) {
        const apiMsg = (data && (data.error || data.message)) || rawText || t('generateError');
        throw new Error(apiMsg);
      }

      const jobId = typeof data?.jobId === "string" ? data.jobId.trim() : "";
      if (jobId) {
        // Offers use 12K tokens + large prompt → need longer polling timeout
        const pollTimeout = payload.type === "offer" ? 250_000 : 120_000;
        const final = await pollGeneratedContent(jobId, { timeoutMs: pollTimeout });
        if (!final) {
          toast({
            title: t('generation'),
            description: t('generationTimeout'),
            variant: "destructive",
          });
        }
        return { text: final || "", contentId: jobId };
      }

      const text = extractGeneratedText(data);

      if (!text) {
        toast({
          title: t('generation'),
          description: t('noContent'),
          variant: "destructive",
        });
      }

      return { text: text || "", contentId: null };
    } catch (e: any) {
      toast({
        title: t('error'),
        description: e?.message || t('generateError'),
        variant: "destructive",
      });
      return { text: "", contentId: null };
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async (payload: any): Promise<string | null> => {
    // Auto-fill title if missing
    if (!payload?.title?.trim()) {
      payload.title = payload.subject || payload.platform || t('newContent');
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/contents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || t('saveError'));
      }

      const contentId = (json?.id as string) ?? null;

      // If _skipRedirect flag is set (used by publish flow), don't redirect
      if (!payload?._skipRedirect) {
        setSelectedType(null);
        router.push("/contents");
      }

      return contentId;
    } catch (e: any) {
      toast({
        title: t('error'),
        description: e?.message || t('saveError'),
        variant: "destructive",
      });
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const ActiveForm = useMemo(() => {
    if (!selectedType) return null;

    const onClose = () => setSelectedType(null);
    // handleSave returns string|null for PostForm (needs contentId), void-compatible for others
    const onSaveVoid = async (data: any): Promise<string | null> => { return await handleSave(data); };

    const common = {
      onGenerate: handleGenerate,
      onSave: onSaveVoid,
      onClose,
      isGenerating,
      isSaving,
    };

    const onCloseEdit = () => {
      if (editId) {
        router.push("/contents");
      } else {
        onClose();
      }
    };

    // ✅ FIX: render overlay ON TOP of the form instead of replacing it,
    // so the form keeps its local state (generatedContent, articleStep, etc.)
    const showOverlay = isGenerating && ["post", "email", "article", "video", "offer", "funnel"].includes(selectedType);

    let form: React.ReactElement | null = null;
    switch (selectedType) {
      case "post":
        form = <PostForm onGenerate={handleGenerate} onSave={handleSave} onClose={onCloseEdit} isGenerating={isGenerating} isSaving={isSaving} editData={editData} />;
        break;
      case "email":
        form = <EmailForm {...common} />;
        break;
      case "article":
        form = <ArticleForm {...common} />;
        break;
      case "video":
        form = <VideoForm {...common} />;
        break;
      case "offer":
        form = <OfferForm {...common} />;
        break;
      case "funnel":
        // ✅ FunnelForm accepte existingOffers (dropdown offres existantes)
        form = <FunnelForm {...common} existingOffers={existingOffers} />;
        break;
      case "quiz":
        form = <QuizForm onClose={common.onClose} />;
        break;
      case "strategy":
        form = <ContentStrategyForm onClose={common.onClose} />;
        break;
      default:
        return null;
    }

    return (
      <>
        {showOverlay && <AIGeneratingOverlay />}
        <div style={showOverlay ? { visibility: "hidden", height: 0, overflow: "hidden" } : undefined}>
          {form}
        </div>
      </>
    );
  }, [selectedType, isGenerating, isSaving, existingOffers, sourceLeadMagnet, sourcePaidOffer, editData, editId]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <main className="flex-1 overflow-auto bg-muted/30 flex flex-col">
          <PageHeader left={<h1 className="text-lg font-display font-bold truncate">{editId ? "Modifier le post" : t('create')}</h1>} />

          <div className="flex-1 p-4 sm:p-5 lg:p-6"><div className="max-w-[1200px] mx-auto w-full space-y-5">
            {editLoading ? (
              <Card className="p-12 flex items-center justify-center">
                <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
              </Card>
            ) : !selectedType ? (
              <>
                <PageBanner icon={<Sparkles className="w-5 h-5" />} title={t('whatContent')} subtitle={t('aiAligned')} />

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {contentTypes.map((type) => (
                    <ContentTypeCard
                      key={type.id}
                      label={t(type.labelKey)}
                      description={t(type.descriptionKey)}
                      icon={type.icon}
                      color={type.color}
                      onClick={() => {
                        if (type.id === "funnel") {
                          router.push("/pages");
                        } else {
                          setSelectedType(type.id);
                        }
                      }}
                    />
                  ))}
                </div>

              </>
            ) : (
              <Card className="p-6">{ActiveForm}</Card>
            )}
          </div></div>
        </main>
      </div>
    </SidebarProvider>
  );
}
