// components/settings/SettingsTabsShell.tsx
"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import {
  User,
  Globe,
  Brain,
  CreditCard,
  Save,
  Linkedin,
  Instagram,
  Youtube,
  Link as LinkIcon,
  AlertTriangle,
  RotateCcw,
  Plus,
  Trash2,
  Sparkles,
  Loader2,
  Shield,
  Key,
  Plug,
  FileText,
  Paintbrush,
  Target,
  Pencil,
  Eye,
} from "lucide-react";

import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import AiCreditsPanel from "@/components/settings/AiCreditsPanel";
import BrandingSettings from "@/components/settings/BrandingSettings";
import type { BrandingData } from "@/components/settings/BrandingSettings";
import CompetitorAnalysisSection from "@/components/settings/CompetitorAnalysisSection";
import SocialConnections from "@/components/settings/SocialConnections";
import LegalDocGenerator from "@/components/settings/legal/LegalDocGenerator";
import type { DocType } from "@/components/settings/legal/types";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

import { useToast } from "@/hooks/use-toast";
import SetPasswordForm from "@/components/SetPasswordForm";
import BillingSection from "@/components/settings/BillingSection";
import { AutoCommentSettings } from "@/components/settings/AutoCommentSettings";
import { AIContent } from "@/components/ui/ai-content";
import LogoutButton from "@/components/LogoutButton";

type TabKey = "profile" | "connections" | "settings" | "positioning" | "branding" | "ai" | "pricing";

type Props = {
  userEmail: string;
  activeTab: TabKey;
};

function normalizeTab(v: string | null): TabKey {
  const s = (v ?? "").trim().toLowerCase();
  if (s === "profile" || s === "connections" || s === "settings" || s === "positioning" || s === "branding" || s === "ai") return s;
  // compat ancien: tab=billing
  if (s === "billing" || s === "pricing") return "pricing";
  return "profile";
}

type OfferItem = {
  name: string;
  price: string;
  link: string;
  promise: string;
  description: string;
  target: string;
  format: string;
};

type ProfileRow = {
  first_name?: string | null;
  niche?: string | null;
  mission?: string | null;
  offers?: OfferItem[] | null;
  privacy_url?: string | null;
  terms_url?: string | null;
  cgv_url?: string | null;
  sio_user_api_key?: string | null;
  content_locale?: string | null;
  linkedin_url?: string | null;
  instagram_url?: string | null;
  youtube_url?: string | null;
  website_url?: string | null;
  // Branding
  brand_font?: string | null;
  brand_color_base?: string | null;
  brand_color_accent?: string | null;
  brand_logo_url?: string | null;
  brand_author_photo_url?: string | null;
  brand_tone_of_voice?: string | null;
  // Onboarding tone (fallback for brand_tone_of_voice)
  preferred_tone?: string | null;
  // Diagnostic profile (contains niche components from onboarding)
  diagnostic_profile?: Record<string, any> | null;
};

/**
 * Formate un résumé persona plat en markdown structuré.
 * Détecte les labels "Douleurs principales :", "Désirs :", etc.
 * et les convertit en titres + listes à puces.
 */
function formatPersonaSummary(text: string): string {
  if (!text?.trim()) return text;
  // Si déjà formaté en markdown (contient des titres ou des listes), ne pas reformater
  if (/^##?\s/m.test(text) || /^\s*[-*]\s/m.test(text)) return text;

  // Labels de sections connus (insensible à la casse, avec ou sans ":")
  const sectionLabels = [
    "Douleurs principales",
    "Douleurs",
    "Points de douleur",
    "Désirs",
    "Objectifs",
    "Motivations",
    "Objections fréquentes",
    "Objections",
    "Canaux préférés",
    "Canaux",
    "Déclencheurs d'achat",
    "Déclencheurs",
    "Phrases exactes",
    "Phrases types",
  ];

  // Build regex: match "Label :" or "Label:" anywhere in text
  const labelPattern = sectionLabels
    .map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const regex = new RegExp(`(?:^|(?<=[\\.!?]\\s*))\\s*(${labelPattern})\\s*:\\s*`, "gi");

  // Find all section matches
  const matches: { label: string; index: number; endIndex: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    matches.push({ label: m[1], index: m.index, endIndex: m.index + m[0].length });
  }

  if (matches.length === 0) return text;

  // Extract intro (text before first section)
  const intro = text.slice(0, matches[0].index).replace(/[\s.]+$/, "").trim();

  const parts: string[] = [];
  if (intro) parts.push(intro + "\n");

  for (let i = 0; i < matches.length; i++) {
    const label = matches[i].label;
    const start = matches[i].endIndex;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const content = text.slice(start, end).replace(/[\s.]+$/, "").trim();

    parts.push(`\n## ${label}\n`);

    // Split items on ";" or "," (for channels)
    const items = content
      .split(/\s*;\s*/)
      .flatMap((item) => {
        // If an item contains no ";" but has comma-separated items (like channels), split on ","
        // Only do this for short items (channels-like), not descriptions
        return [item];
      })
      .map((item) => item.replace(/^\s*\.?\s*$/, "").trim())
      .filter(Boolean);

    if (items.length > 1) {
      for (const item of items) {
        parts.push(`- ${item}`);
      }
    } else if (items.length === 1) {
      parts.push(`- ${items[0]}`);
    }
  }

  return parts.join("\n");
}

export default function SettingsTabsShell({ userEmail, activeTab }: Props) {
  const tSettings = useTranslations("settings");
  const tSP = useTranslations("settingsPage");
  const router = useRouter();
  const sp = useSearchParams();
  const { toast } = useToast();

  const [tab, setTab] = useState<TabKey>(activeTab);
  useEffect(() => setTab(activeTab), [activeTab]);

  const queryBase = useMemo(() => {
    const params = new URLSearchParams();
    sp.forEach((value, key) => {
      if (key === "tab") return;
      params.set(key, value);
    });
    return params;
  }, [sp]);

  const onTabChange = (next: string) => {
    const t = normalizeTab(next);
    setTab(t);

    // URL compat: historiquement Tipote utilisait tab=billing
    const urlTab = t === "pricing" ? "billing" : t;

    const params = new URLSearchParams(queryBase);
    params.set("tab", urlTab);
    const qs = params.toString();
    router.push(qs ? `/settings?${qs}` : "/settings");
  };

  // -------------------------
  // User plan (from profiles table — for feature gating)
  // -------------------------
  const [userPlan, setUserPlan] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getSupabaseBrowserClient } = await import("@/lib/supabaseBrowser");
        const supabase = getSupabaseBrowserClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled || !user) return;
        const { data: profile } = await supabase
          .from("profiles")
          .select("plan")
          .eq("id", user.id)
          .maybeSingle();
        if (!cancelled && profile) setUserPlan(profile.plan ?? "free");
      } catch {
        // fail-open
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // -------------------------
  // Profil (connecté à /api/profile)
  // -------------------------
  const [profileLoading, setProfileLoading] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [mission, setMission] = useState("");
  // Niche formula broken into 4 fields
  const [nicheTarget, setNicheTarget] = useState("");
  const [nicheObjective, setNicheObjective] = useState("");
  const [nicheMechanism, setNicheMechanism] = useState("");
  const [nicheMarker, setNicheMarker] = useState("");
  const [pendingProfile, startProfileTransition] = useTransition();
  const [pendingPositioning, startPositioningTransition] = useTransition();

  const [privacyUrl, setPrivacyUrl] = useState("");
  const [termsUrl, setTermsUrl] = useState("");
  const [cgvUrl, setCgvUrl] = useState("");
  const [pendingLegal, startLegalTransition] = useTransition();
  const [legalGenOpen, setLegalGenOpen] = useState(false);
  const [legalGenDocType, setLegalGenDocType] = useState<DocType>("mentions");

  const [sioApiKey, setSioApiKey] = useState("");
  const [pendingSio, startSioTransition] = useTransition();

  const [contentLocale, setContentLocale] = useState("fr");
  const [pendingLocale, startLocaleTransition] = useTransition();

  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [pendingLinks, startLinksTransition] = useTransition();

  const [offers, setOffers] = useState<OfferItem[]>([]);
  const [initialOffers, setInitialOffers] = useState<OfferItem[]>([]);
  const [pendingOffers, startOffersTransition] = useTransition();

  const [initialProfile, setInitialProfile] = useState<ProfileRow | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setProfileLoading(true);
      try {
        const res = await fetch("/api/profile", { method: "GET" });
        const json = (await res.json().catch(() => null)) as any;
        if (cancelled) return;
        if (!json?.ok) throw new Error(json?.error || "Erreur");

        const row = (json.profile ?? null) as ProfileRow | null;
        setInitialProfile(row);
        setFirstName(row?.first_name ?? "");
        setMission(row?.mission ?? "");
        // Parse niche formula into 4 sub-fields
        // Priority 1: use individual components from diagnostic_profile (onboarding source of truth)
        const diag = row?.diagnostic_profile;
        const diagTarget = typeof diag?.nicheTarget === "string" ? diag.nicheTarget.trim() : "";
        const diagObjective = typeof diag?.nicheObjective === "string" ? diag.nicheObjective.trim() : "";
        const diagMechanism = typeof diag?.nicheMechanism === "string" ? diag.nicheMechanism.trim() : "";
        const diagTimeframe = typeof diag?.nicheTimeframe === "string" ? diag.nicheTimeframe.trim() : "";

        if (diagTarget || diagObjective) {
          setNicheTarget(diagTarget);
          setNicheObjective(diagObjective);
          setNicheMechanism(diagMechanism);
          setNicheMarker(diagTimeframe);
        } else {
          // Priority 2: parse from niche string (supports "grâce à" and "avec")
          const nicheStr = row?.niche ?? "";
          const nicheMatch = nicheStr.match(
            /j['']aide les (.+?) à (.+?)(?:\s+(?:grâce à|avec)\s+(.+?))?(?:\s+en\s+(.+))?$/i
          );
          if (nicheMatch) {
            setNicheTarget(nicheMatch[1]?.trim() ?? "");
            setNicheObjective(nicheMatch[2]?.trim() ?? "");
            setNicheMechanism(nicheMatch[3]?.trim() ?? "");
            setNicheMarker(nicheMatch[4]?.trim() ?? "");
          } else {
            setNicheTarget(nicheStr);
            setNicheObjective("");
            setNicheMechanism("");
            setNicheMarker("");
          }
        }
        setPrivacyUrl(row?.privacy_url ?? "");
        setTermsUrl(row?.terms_url ?? "");
        setCgvUrl(row?.cgv_url ?? "");
        setSioApiKey(row?.sio_user_api_key ?? "");
        setContentLocale(row?.content_locale ?? "fr");
        setLinkedinUrl(row?.linkedin_url ?? "");
        setInstagramUrl(row?.instagram_url ?? "");
        setYoutubeUrl(row?.youtube_url ?? "");
        setWebsiteUrl(row?.website_url ?? "");

        const loadedOffers = Array.isArray(row?.offers)
          ? row.offers.map((o: any) => ({
              name: String(o?.name ?? ""),
              price: String(o?.price ?? ""),
              link: String(o?.link ?? ""),
              promise: String(o?.promise ?? ""),
              description: String(o?.description ?? ""),
              target: String(o?.target ?? ""),
              format: String(o?.format ?? ""),
            }))
          : [];
        setOffers(loadedOffers);
        setInitialOffers(loadedOffers);
      } catch (e: any) {
        if (!cancelled) {
          toast({
            title: "Impossible de charger le profil",
            description: e?.message ?? "Erreur inconnue",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const profileDirty = useMemo(() => {
    const i = initialProfile;
    return (i?.first_name ?? "") !== firstName;
  }, [initialProfile, firstName]);

  const assembledNiche = useMemo(() => {
    if (!nicheTarget && !nicheObjective && !nicheMechanism && !nicheMarker) return "";
    const parts = [`J'aide les ${nicheTarget || "…"} à ${nicheObjective || "…"}`];
    if (nicheMechanism) parts.push(`grâce à ${nicheMechanism}`);
    if (nicheMarker) parts.push(`en ${nicheMarker}`);
    return parts.join(" ");
  }, [nicheTarget, nicheObjective, nicheMechanism, nicheMarker]);

  const positioningDirty = useMemo(() => {
    const i = initialProfile;
    return assembledNiche !== (i?.niche ?? "") || mission !== (i?.mission ?? "");
  }, [initialProfile, assembledNiche, mission]);

  const saveProfile = () => {
    startProfileTransition(async () => {
      try {
        const body: any = {};
        if ((initialProfile?.first_name ?? "") !== firstName) body.first_name = firstName;

        const res = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const json = (await res.json().catch(() => null)) as any;
        if (!json?.ok) throw new Error(json?.error || "Erreur");

        const row = (json.profile ?? null) as ProfileRow | null;
        setInitialProfile(row);

        toast({ title: "Profil mis à jour" });
      } catch (e: any) {
        toast({
          title: "Enregistrement impossible",
          description: e?.message ?? "Erreur inconnue",
          variant: "destructive",
        });
      }
    });
  };

  const savePositioning = () => {
    startPositioningTransition(async () => {
      try {
        const body: any = { niche: assembledNiche, mission };

        const res = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const json = (await res.json().catch(() => null)) as any;
        if (!json?.ok) throw new Error(json?.error || "Erreur");

        const row = (json.profile ?? null) as ProfileRow | null;
        setInitialProfile(row);

        toast({ title: "Positionnement enregistré" });
      } catch (e: any) {
        toast({
          title: "Enregistrement impossible",
          description: e?.message ?? "Erreur inconnue",
          variant: "destructive",
        });
      }
    });
  };

  // -------------------------
  // Offers management
  // -------------------------
  const offersDirty = useMemo(() => {
    if (offers.length !== initialOffers.length) return true;
    return offers.some(
      (o, i) =>
        o.name !== initialOffers[i]?.name ||
        o.price !== initialOffers[i]?.price ||
        o.link !== initialOffers[i]?.link ||
        o.promise !== initialOffers[i]?.promise ||
        o.description !== initialOffers[i]?.description ||
        o.target !== initialOffers[i]?.target ||
        o.format !== initialOffers[i]?.format,
    );
  }, [offers, initialOffers]);

  const addOffer = () => setOffers((prev) => [...prev, { name: "", price: "", link: "", promise: "", description: "", target: "", format: "" }]);

  const removeOffer = (idx: number) => setOffers((prev) => prev.filter((_, i) => i !== idx));

  const updateOffer = (idx: number, field: keyof OfferItem, value: string) => {
    setOffers((prev) => prev.map((o, i) => (i === idx ? { ...o, [field]: value } : o)));
  };

  const saveOffers = () => {
    startOffersTransition(async () => {
      try {
        const cleaned = offers.filter((o) => o.name.trim());
        const res = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offers: cleaned }),
        });
        const json = (await res.json().catch(() => null)) as any;
        if (!json?.ok) throw new Error(json?.error || "Erreur");

        const row = (json.profile ?? null) as ProfileRow | null;
        const saved = Array.isArray(row?.offers)
          ? row.offers.map((o: any) => ({
              name: String(o?.name ?? ""),
              price: String(o?.price ?? ""),
              link: String(o?.link ?? ""),
              promise: String(o?.promise ?? ""),
              description: String(o?.description ?? ""),
              target: String(o?.target ?? ""),
              format: String(o?.format ?? ""),
            }))
          : cleaned;
        setOffers(saved);
        setInitialOffers(saved);

        toast({ title: "Offres enregistrées" });
      } catch (e: any) {
        toast({ title: "Impossible d'enregistrer", description: e?.message ?? "Erreur", variant: "destructive" });
      }
    });
  };

  // -------------------------
  // Persona enrichment
  // -------------------------
  const [enriching, setEnriching] = useState(false);
  const [personaDetailedMarkdown, setPersonaDetailedMarkdown] = useState<string | null>(null);
  const [competitorInsightsMarkdown, setCompetitorInsightsMarkdown] = useState<string | null>(null);
  const [narrativeSynthesisMarkdown, setNarrativeSynthesisMarkdown] = useState<string | null>(null);
  const [personaDetailTab, setPersonaDetailTab] = useState<"summary" | "detailed" | "synthesis">("summary");
  const [summaryEditMode, setSummaryEditMode] = useState(false);

  // Load existing persona detailed data on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/persona", { method: "GET" });
        const json = (await res.json().catch(() => null)) as any;
        if (cancelled || !json?.ok || !json?.persona) return;
        if (json.persona.persona_detailed_markdown) setPersonaDetailedMarkdown(json.persona.persona_detailed_markdown);
        if (json.persona.competitor_insights_markdown) setCompetitorInsightsMarkdown(json.persona.competitor_insights_markdown);
        if (json.persona.narrative_synthesis_markdown) setNarrativeSynthesisMarkdown(json.persona.narrative_synthesis_markdown);
      } catch {
        // non-blocking
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const enrichPersona = async () => {
    setEnriching(true);
    try {
      const res = await fetch("/api/persona/enrich", { method: "POST" });

      const contentType = res.headers.get("content-type") ?? "";

      // ── SSE stream mode (heartbeats prevent proxy 504) ──
      if (contentType.includes("text/event-stream")) {
        const reader = res.body?.getReader();
        if (!reader) throw new Error("Stream non disponible");

        const decoder = new TextDecoder();
        let buffer = "";
        let finalResult: any = null;
        let finalError: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const eventBlock of events) {
            const lines = eventBlock.split("\n");
            let eventType = "";
            let eventData = "";
            for (const line of lines) {
              if (line.startsWith("event: ")) eventType = line.slice(7);
              if (line.startsWith("data: ")) eventData = line.slice(6);
            }
            if (!eventData) continue;
            try {
              const parsed = JSON.parse(eventData);
              if (eventType === "result") finalResult = parsed;
              else if (eventType === "error") finalError = parsed.error || "Erreur inconnue";
            } catch { /* skip malformed */ }
          }
        }

        if (finalError) {
          if (finalError === "NO_CREDITS") {
            toast({
              title: "Crédits insuffisants",
              description: "L'enrichissement du persona coûte 1 crédit.",
              variant: "destructive",
            });
            return;
          }
          throw new Error(finalError);
        }

        if (finalResult?.ok) {
          if (finalResult.persona_summary) setMission(finalResult.persona_summary);
          if (finalResult.persona_detailed_markdown) setPersonaDetailedMarkdown(finalResult.persona_detailed_markdown);
          if (finalResult.competitor_insights_markdown) setCompetitorInsightsMarkdown(finalResult.competitor_insights_markdown);
          if (finalResult.narrative_synthesis_markdown) setNarrativeSynthesisMarkdown(finalResult.narrative_synthesis_markdown);
          if (finalResult.persona_detailed_markdown) setPersonaDetailTab("detailed");
          setInitialProfile((prev) => ({
            ...prev,
            mission: finalResult.persona_summary || prev?.mission,
          }));
          toast({ title: "Persona enrichi avec succès" });
        } else {
          throw new Error("Aucun résultat reçu");
        }
        return;
      }

      // ── Fallback JSON mode (pre-auth errors return JSON directly) ──
      const json = (await res.json().catch(() => null)) as any;
      if (!json?.ok) {
        if (json?.error === "NO_CREDITS") {
          toast({
            title: "Crédits insuffisants",
            description: "L'enrichissement du persona coûte 1 crédit.",
            variant: "destructive",
          });
          return;
        }
        throw new Error(json?.error || "Erreur");
      }

      if (json.persona_summary) setMission(json.persona_summary);
      if (json.persona_detailed_markdown) setPersonaDetailedMarkdown(json.persona_detailed_markdown);
      if (json.competitor_insights_markdown) setCompetitorInsightsMarkdown(json.competitor_insights_markdown);
      if (json.narrative_synthesis_markdown) setNarrativeSynthesisMarkdown(json.narrative_synthesis_markdown);
      if (json.persona_detailed_markdown) setPersonaDetailTab("detailed");
      setInitialProfile((prev) => ({
        ...prev,
        mission: json.persona_summary || prev?.mission,
      }));
      toast({ title: "Persona enrichi avec succès" });
    } catch (e: any) {
      toast({
        title: "Erreur lors de l'enrichissement",
        description: e?.message ?? "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setEnriching(false);
    }
  };

  // -------------------------
  // Legal URLs
  // -------------------------
  const legalDirty = useMemo(() => {
    const i = initialProfile;
    return (i?.privacy_url ?? "") !== privacyUrl || (i?.terms_url ?? "") !== termsUrl || (i?.cgv_url ?? "") !== cgvUrl;
  }, [initialProfile, privacyUrl, termsUrl, cgvUrl]);

  const saveLegalUrls = () => {
    startLegalTransition(async () => {
      try {
        const body: any = {};
        if ((initialProfile?.privacy_url ?? "") !== privacyUrl) body.privacy_url = privacyUrl;
        if ((initialProfile?.terms_url ?? "") !== termsUrl) body.terms_url = termsUrl;
        if ((initialProfile?.cgv_url ?? "") !== cgvUrl) body.cgv_url = cgvUrl;

        const res = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const json = (await res.json().catch(() => null)) as any;
        if (!json?.ok) throw new Error(json?.error || "Erreur");

        const row = (json.profile ?? null) as ProfileRow | null;
        setInitialProfile(row);
        setPrivacyUrl(row?.privacy_url ?? "");
        setTermsUrl(row?.terms_url ?? "");
        setCgvUrl(row?.cgv_url ?? "");

        toast({ title: "URLs légales enregistrées" });
      } catch (e: any) {
        toast({
          title: "Enregistrement impossible",
          description: e?.message ?? "Erreur inconnue",
          variant: "destructive",
        });
      }
    });
  };

  // -------------------------
  // Systeme.io API Key
  // -------------------------
  const sioDirty = useMemo(() => {
    return (initialProfile?.sio_user_api_key ?? "") !== sioApiKey;
  }, [initialProfile, sioApiKey]);

  const saveSioKey = () => {
    startSioTransition(async () => {
      try {
        const res = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sio_user_api_key: sioApiKey }),
        });

        const json = (await res.json().catch(() => null)) as any;
        if (!json?.ok) throw new Error(json?.error || "Erreur");

        const row = (json.profile ?? null) as ProfileRow | null;
        setInitialProfile(row);
        setSioApiKey(row?.sio_user_api_key ?? "");

        toast({ title: "Clé API Systeme.io enregistrée" });
      } catch (e: any) {
        toast({
          title: "Enregistrement impossible",
          description: e?.message ?? "Erreur inconnue",
          variant: "destructive",
        });
      }
    });
  };

  // -------------------------
  // Content Locale
  // -------------------------
  const localeDirty = useMemo(() => {
    return (initialProfile?.content_locale ?? "fr") !== contentLocale;
  }, [initialProfile, contentLocale]);

  const saveContentLocale = () => {
    startLocaleTransition(async () => {
      try {
        const res = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content_locale: contentLocale }),
        });

        const json = (await res.json().catch(() => null)) as any;
        if (!json?.ok) throw new Error(json?.error || "Erreur");

        const row = (json.profile ?? null) as ProfileRow | null;
        setInitialProfile(row);
        setContentLocale(row?.content_locale ?? "fr");

        toast({ title: "Langue du contenu enregistrée" });
      } catch (e: any) {
        toast({
          title: "Enregistrement impossible",
          description: e?.message ?? "Erreur inconnue",
          variant: "destructive",
        });
      }
    });
  };

  // -------------------------
  // Social Links
  // -------------------------
  const linksDirty = useMemo(() => {
    const i = initialProfile;
    return (
      (i?.linkedin_url ?? "") !== linkedinUrl ||
      (i?.instagram_url ?? "") !== instagramUrl ||
      (i?.youtube_url ?? "") !== youtubeUrl ||
      (i?.website_url ?? "") !== websiteUrl
    );
  }, [initialProfile, linkedinUrl, instagramUrl, youtubeUrl, websiteUrl]);

  const saveLinks = () => {
    startLinksTransition(async () => {
      try {
        const body: any = {};
        if ((initialProfile?.linkedin_url ?? "") !== linkedinUrl) body.linkedin_url = linkedinUrl;
        if ((initialProfile?.instagram_url ?? "") !== instagramUrl) body.instagram_url = instagramUrl;
        if ((initialProfile?.youtube_url ?? "") !== youtubeUrl) body.youtube_url = youtubeUrl;
        if ((initialProfile?.website_url ?? "") !== websiteUrl) body.website_url = websiteUrl;

        const res = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const json = (await res.json().catch(() => null)) as any;
        if (!json?.ok) throw new Error(json?.error || "Erreur");

        const row = (json.profile ?? null) as ProfileRow | null;
        setInitialProfile(row);
        setLinkedinUrl(row?.linkedin_url ?? "");
        setInstagramUrl(row?.instagram_url ?? "");
        setYoutubeUrl(row?.youtube_url ?? "");
        setWebsiteUrl(row?.website_url ?? "");

        toast({ title: "Liens enregistrés" });
      } catch (e: any) {
        toast({
          title: "Enregistrement impossible",
          description: e?.message ?? "Erreur inconnue",
          variant: "destructive",
        });
      }
    });
  };

  // -------------------------
  // ✅ Reset Tipote (connecté à /api/account/reset)
  // -------------------------
  const [resetting, setResetting] = useState(false);

  async function onResetAccount() {
    try {
      const ok1 = window.confirm(
        "⚠️ Réinitialiser ton Tipote ?\n\nTous les contenus, toutes les tâches et toutes les personnalisations seront effacés. C’est définitif.",
      );
      if (!ok1) return;

      const confirmWord = window.prompt('Tape "RESET" pour confirmer :');
      if ((confirmWord ?? "").trim().toUpperCase() !== "RESET") {
        toast({
          title: "Réinitialisation annulée",
          description: 'Tu dois taper "RESET" pour confirmer.',
          variant: "destructive",
        });
        return;
      }

      setResetting(true);

      const res = await fetch("/api/account/reset", { method: "POST" });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

      if (!res.ok || !json?.ok) {
        toast({
          title: "Reset impossible",
          description: json?.error || "Erreur inconnue",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Tipote réinitialisé ✅",
        description: "On te renvoie vers l’onboarding.",
      });

      window.location.href = "/onboarding";
    } catch (e) {
      toast({
        title: "Reset impossible",
        description: e instanceof Error ? e.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setResetting(false);
    }
  }

  return (
    <Tabs defaultValue="profile" value={tab} onValueChange={onTabChange} className="w-full">
      <TabsList className="mb-6 flex-wrap h-auto gap-1">
        <TabsTrigger value="profile" className="gap-2">
          <User className="w-4 h-4" />
          {tSettings("tabs.profile")}
        </TabsTrigger>
        <TabsTrigger value="connections" className="gap-2">
          <Plug className="w-4 h-4" />
          {tSettings("tabs.connections")}
        </TabsTrigger>
        <TabsTrigger value="settings" className="gap-2">
          <Globe className="w-4 h-4" />
          {tSettings("tabs.settings")}
        </TabsTrigger>
        <TabsTrigger value="positioning" className="gap-2">
          <Target className="w-4 h-4" />
          {tSP("positioning")}
        </TabsTrigger>
        <TabsTrigger value="branding" className="gap-2">
          <Paintbrush className="w-4 h-4" />
          {tSettings("tabs.branding")}
        </TabsTrigger>
        <TabsTrigger value="ai" className="gap-2">
          <Brain className="w-4 h-4" />
          {tSettings("tabs.ai")}
        </TabsTrigger>
        <TabsTrigger value="pricing" className="gap-2">
          <CreditCard className="w-4 h-4" />
          {tSettings("tabs.pricing")}
        </TabsTrigger>
      </TabsList>

      {/* PROFIL */}
      <TabsContent value="profile" className="space-y-6">
        <Card className="p-6">
          <h3 className="text-lg font-bold mb-6">{tSP("profile.title")}</h3>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">{tSP("profile.email")}</Label>
              <Input id="email" type="email" value={userEmail} disabled />
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">{tSP("profile.firstName")}</Label>
              <Input id="name" value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={profileLoading} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{tSP("profile.password")}</Label>
              <div className="flex gap-2">
                <Input id="password" type="password" value="••••••••" disabled className="flex-1" />

                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline">{tSP("profile.changePassword")}</Button>
                  </DialogTrigger>

                  <DialogContent className="sm:max-w-[520px]">
                    <DialogHeader>
                      <DialogTitle>{tSP("profile.password")}</DialogTitle>
                      <DialogDescription className="sr-only">
                        {tSP("profile.passwordDialog.description")}
                      </DialogDescription>
                    </DialogHeader>

                    <SetPasswordForm mode="reset" />
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">{tSP("profile.timezoneLabel")}</Label>
              <Select defaultValue="europe-paris">
                <SelectTrigger id="timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="europe-paris">Europe/Paris (UTC+1)</SelectItem>
                  <SelectItem value="europe-london">Europe/London (UTC)</SelectItem>
                  <SelectItem value="america-new-york">America/New_York (UTC-5)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button className="mt-6" onClick={saveProfile} disabled={!profileDirty || pendingProfile}>
            <Save className="w-4 h-4 mr-2" />
            {pendingProfile ? tSP("profile.saving") : tSP("profile.save")}
          </Button>
        </Card>

        {/* Déconnexion */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">{tSP("profile.logoutTitle")}</h3>
              <p className="text-sm text-muted-foreground">{tSP("profile.logoutDesc")}</p>
            </div>
            <LogoutButton />
          </div>
        </Card>

        {/* ✅ ZONE DANGER */}
        <Card className="p-6 border border-red-200 bg-red-50/40">
          <div className="flex items-start gap-3 mb-3">
            <div className="mt-0.5 rounded-full bg-red-100 p-2 text-red-600">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-red-700">{tSP("profile.danger.title")}</h3>
              <p className="text-sm font-medium text-red-700/90">{tSP("profile.danger.subtitle")}</p>
            </div>
          </div>

          <p className="text-sm text-red-700/80">
            {tSP("profile.danger.desc")}
          </p>

          <Button variant="destructive" className="mt-4 gap-2" onClick={onResetAccount} disabled={resetting}>
            <RotateCcw className="h-4 h-4" />
            {resetting ? tSP("profile.danger.resetting") : tSP("profile.danger.reset")}
          </Button>
        </Card>
      </TabsContent>

      {/* CONNEXIONS */}
      <TabsContent value="connections" className="space-y-6">
        <SocialConnections />

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <Key className="w-5 h-5 text-muted-foreground" />
            <h3 className="text-lg font-bold">Systeme.io</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            {tSP("connections.sioDesc")}{" "}
            <a
              href="https://aide.systeme.io/article/2322-comment-creer-une-cle-api-publique-sur-systeme-io"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-primary hover:text-primary/80"
            >
              {tSP("connections.sioApiHelp")}
            </a>
          </p>

          <div className="space-y-2">
            <Label>{tSP("connections.sioLabel")}</Label>
            <Input
              type="password"
              placeholder={tSP("connections.sioPlaceholder")}
              value={sioApiKey}
              onChange={(e) => setSioApiKey(e.target.value)}
              disabled={profileLoading}
            />
          </div>

          <Button variant="outline" className="mt-4" onClick={saveSioKey} disabled={!sioDirty || pendingSio}>
            <Save className="w-4 h-4 mr-2" />
            {pendingSio ? tSP("connections.saving") : tSP("connections.save")}
          </Button>
        </Card>
      </TabsContent>

      {/* RÉGLAGES */}
      <TabsContent value="settings" className="space-y-6">
        <Card className="p-6">
          <h3 className="text-lg font-bold mb-6">{tSP("reglages.langTitle")}</h3>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{tSP("reglages.uiLangLabel")}</Label>
              <p className="text-xs text-muted-foreground">{tSP("reglages.uiLangDesc")}</p>
              <LanguageSwitcher variant="settings" />
            </div>

            <div className="space-y-2">
              <Label>{tSP("reglages.contentLangLabel")}</Label>
              <Select value={contentLocale} onValueChange={setContentLocale} disabled={profileLoading}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                  <SelectItem value="it">Italiano</SelectItem>
                  <SelectItem value="pt">Português</SelectItem>
                  <SelectItem value="de">Deutsch</SelectItem>
                  <SelectItem value="nl">Nederlands</SelectItem>
                  <SelectItem value="ar">العربية</SelectItem>
                  <SelectItem value="tr">Türkçe</SelectItem>
                  <SelectItem value="pl">Polski</SelectItem>
                  <SelectItem value="ro">Română</SelectItem>
                  <SelectItem value="ru">Русский</SelectItem>
                  <SelectItem value="ja">日本語</SelectItem>
                  <SelectItem value="zh">中文</SelectItem>
                  <SelectItem value="ko">한국어</SelectItem>
                  <SelectItem value="hi">हिन्दी</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{tSP("reglages.addressLabel")}</Label>
              <Select defaultValue="tu">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tu">{tSP("reglages.tu")}</SelectItem>
                  <SelectItem value="vous">{tSP("reglages.vous")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button variant="outline" className="mt-4" onClick={saveContentLocale} disabled={!localeDirty || pendingLocale}>
            <Save className="w-4 h-4 mr-2" />
            {pendingLocale ? tSP("reglages.saving") : tSP("reglages.saveLang")}
          </Button>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <Shield className="w-5 h-5 text-muted-foreground" />
            <h3 className="text-lg font-bold">{tSP("reglages.legalTitle")}</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            {tSP("reglages.legalDesc")}
          </p>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{tSP("reglages.privacy")}</Label>
              <div className="flex gap-2">
                <Input
                  placeholder={tSP("reglages.privacyPlaceholder")}
                  value={privacyUrl}
                  onChange={(e) => setPrivacyUrl(e.target.value)}
                  disabled={profileLoading}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 shrink-0"
                  onClick={() => { setLegalGenDocType("privacy"); setLegalGenOpen(true); }}
                >
                  <FileText className="w-3.5 h-3.5" />
                  {tSP("reglages.generate")}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{tSP("reglages.mentions")}</Label>
              <div className="flex gap-2">
                <Input
                  placeholder={tSP("reglages.mentionsPlaceholder")}
                  value={termsUrl}
                  onChange={(e) => setTermsUrl(e.target.value)}
                  disabled={profileLoading}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 shrink-0"
                  onClick={() => { setLegalGenDocType("mentions"); setLegalGenOpen(true); }}
                >
                  <FileText className="w-3.5 h-3.5" />
                  {tSP("reglages.generate")}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{tSP("reglages.cgv")}</Label>
              <div className="flex gap-2">
                <Input
                  placeholder={tSP("reglages.cgvPlaceholder")}
                  value={cgvUrl}
                  onChange={(e) => setCgvUrl(e.target.value)}
                  disabled={profileLoading}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 shrink-0"
                  onClick={() => { setLegalGenDocType("cgv"); setLegalGenOpen(true); }}
                >
                  <FileText className="w-3.5 h-3.5" />
                  {tSP("reglages.generate")}
                </Button>
              </div>
            </div>
          </div>

          <Button variant="outline" className="mt-4" onClick={saveLegalUrls} disabled={!legalDirty || pendingLegal}>
            <Save className="w-4 h-4 mr-2" />
            {pendingLegal ? tSP("reglages.saving") : tSP("reglages.save")}
          </Button>
        </Card>

        <LegalDocGenerator
          open={legalGenOpen}
          onOpenChange={setLegalGenOpen}
          docType={legalGenDocType}
        />

        <Card className="p-6">
          <h3 className="text-lg font-bold mb-6">{tSP("reglages.linksTitle")}</h3>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Linkedin className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <Input
                placeholder="https://linkedin.com/in/..."
                className="flex-1"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                disabled={profileLoading}
              />
            </div>
            <div className="flex items-center gap-3">
              <Instagram className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <Input
                placeholder="https://instagram.com/..."
                className="flex-1"
                value={instagramUrl}
                onChange={(e) => setInstagramUrl(e.target.value)}
                disabled={profileLoading}
              />
            </div>
            <div className="flex items-center gap-3">
              <Youtube className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <Input
                placeholder="https://youtube.com/@..."
                className="flex-1"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                disabled={profileLoading}
              />
            </div>
            <div className="flex items-center gap-3">
              <LinkIcon className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <Input
                placeholder="https://monsite.com"
                className="flex-1"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                disabled={profileLoading}
              />
            </div>
          </div>

          <Button variant="outline" className="mt-4" onClick={saveLinks} disabled={!linksDirty || pendingLinks}>
            <Save className="w-4 h-4 mr-2" />
            {pendingLinks ? tSP("reglages.saving") : tSP("reglages.save")}
          </Button>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-bold mb-4">{tSP("reglages.offersTitle")}</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {tSP("reglages.offersDesc")}
          </p>

          <div className="space-y-4">
            {offers.map((offer, idx) => (
              <div key={idx} className="rounded-lg border bg-muted/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">{tSP("reglages.offerN", { n: idx + 1 })}</span>
                  <Button variant="ghost" size="icon" onClick={() => removeOffer(idx)} disabled={profileLoading}>
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{tSP("reglages.offerName")}</Label>
                    <Input
                      placeholder={tSP("reglages.offerNamePlaceholder")}
                      value={offer.name}
                      onChange={(e) => updateOffer(idx, "name", e.target.value)}
                      disabled={profileLoading}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{tSP("reglages.offerPrice")}</Label>
                    <Input
                      placeholder={tSP("reglages.offerPricePlaceholder")}
                      value={offer.price}
                      onChange={(e) => updateOffer(idx, "price", e.target.value)}
                      disabled={profileLoading}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{tSP("reglages.offerPromise")}</Label>
                  <Input
                    placeholder={tSP("reglages.offerPromisePlaceholder")}
                    value={offer.promise}
                    onChange={(e) => updateOffer(idx, "promise", e.target.value)}
                    disabled={profileLoading}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{tSP("reglages.offerTarget")}</Label>
                  <Input
                    placeholder={tSP("reglages.offerTargetPlaceholder")}
                    value={offer.target}
                    onChange={(e) => updateOffer(idx, "target", e.target.value)}
                    disabled={profileLoading}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{tSP("reglages.offerDesc")}</Label>
                  <Textarea
                    placeholder={tSP("reglages.offerDescPlaceholder")}
                    value={offer.description}
                    onChange={(e) => updateOffer(idx, "description", e.target.value)}
                    disabled={profileLoading}
                    className="min-h-[60px]"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{tSP("reglages.offerFormat")}</Label>
                    <Input
                      placeholder={tSP("reglages.offerFormatPlaceholder")}
                      value={offer.format}
                      onChange={(e) => updateOffer(idx, "format", e.target.value)}
                      disabled={profileLoading}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{tSP("reglages.offerLink")}</Label>
                    <Input
                      placeholder="https://..."
                      value={offer.link}
                      onChange={(e) => updateOffer(idx, "link", e.target.value)}
                      disabled={profileLoading}
                    />
                  </div>
                </div>
              </div>
            ))}

            <Button variant="outline" size="sm" onClick={addOffer} disabled={profileLoading} className="gap-1">
              <Plus className="w-4 h-4" />
              {tSP("reglages.addOffer")}
            </Button>
          </div>

          <Button variant="outline" className="mt-4" onClick={saveOffers} disabled={!offersDirty || pendingOffers}>
            <Save className="w-4 h-4 mr-2" />
            {pendingOffers ? tSP("reglages.saving") : tSP("reglages.saveOffers")}
          </Button>
        </Card>
      </TabsContent>

      {/* POSITIONNEMENT */}
      <TabsContent value="positioning" className="space-y-6">
        {/* Niche formula */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-5 h-5 text-muted-foreground" />
            <h3 className="text-lg font-bold">{tSP("positioningTab.nicheTitle")}</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-5">
            {tSP("positioningTab.nicheDesc")}
          </p>

          <div className="rounded-lg border bg-muted/30 px-4 py-3 mb-5 text-sm font-medium">
            J&apos;aide les{" "}
            <span className="font-semibold text-primary">{nicheTarget || "[cible]"}</span>{" "}
            à{" "}
            <span className="font-semibold text-primary">{nicheObjective || "[objectif]"}</span>
            {(nicheMechanism || !nicheTarget) && (
              <>
                {" "}grâce à{" "}
                <span className="font-semibold text-primary">{nicheMechanism || "[mécanisme unique]"}</span>
              </>
            )}
            {(nicheMarker || !nicheTarget) && (
              <>
                {" "}en{" "}
                <span className="font-semibold text-primary">{nicheMarker || "[marqueur temporel]"}</span>
              </>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">{tSP("positioningTab.cible")}</Label>
              <Input
                placeholder={tSP("positioningTab.ciblePlaceholder")}
                value={nicheTarget}
                onChange={(e) => setNicheTarget(e.target.value)}
                disabled={profileLoading}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">{tSP("positioningTab.objectif")}</Label>
              <Input
                placeholder={tSP("positioningTab.objectifPlaceholder")}
                value={nicheObjective}
                onChange={(e) => setNicheObjective(e.target.value)}
                disabled={profileLoading}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">{tSP("positioningTab.mecanisme")}</Label>
              <Input
                placeholder={tSP("positioningTab.mecanismePlaceholder")}
                value={nicheMechanism}
                onChange={(e) => setNicheMechanism(e.target.value)}
                disabled={profileLoading}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">{tSP("positioningTab.marqueur")}</Label>
              <Input
                placeholder={tSP("positioningTab.marqueurPlaceholder")}
                value={nicheMarker}
                onChange={(e) => setNicheMarker(e.target.value)}
                disabled={profileLoading}
              />
            </div>
          </div>

          <Button variant="outline" className="mt-5" onClick={savePositioning} disabled={!positioningDirty || pendingPositioning}>
            <Save className="w-4 h-4 mr-2" />
            {pendingPositioning ? tSP("positioningTab.saving") : tSP("positioningTab.save")}
          </Button>
        </Card>

        {/* Persona */}
        <Card className="p-6">
          <h3 className="text-lg font-bold mb-2">{tSP("positioningTab.personaTitle")}</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {tSP("positioningTab.personaDesc")}
          </p>

          {/* Sub-tabs for persona views */}
          <div className="flex gap-1 mb-4 border-b">
            <button
              onClick={() => setPersonaDetailTab("summary")}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                personaDetailTab === "summary"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Résumé
            </button>
            <button
              onClick={() => setPersonaDetailTab("detailed")}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                personaDetailTab === "detailed"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Persona détaillé
            </button>
            <button
              onClick={() => setPersonaDetailTab("synthesis")}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                personaDetailTab === "synthesis"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Synthèse narrative
            </button>
          </div>

          {personaDetailTab === "summary" && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => setSummaryEditMode((v) => !v)}
                >
                  {summaryEditMode ? (
                    <>
                      <Eye className="w-3.5 h-3.5" />
                      Aperçu
                    </>
                  ) : (
                    <>
                      <Pencil className="w-3.5 h-3.5" />
                      Modifier
                    </>
                  )}
                </Button>
              </div>
              {summaryEditMode ? (
                <Textarea
                  value={mission}
                  onChange={(e) => setMission(e.target.value)}
                  rows={12}
                  className="resize-y min-h-[300px] font-mono text-sm"
                  disabled={profileLoading}
                  placeholder={tSP("positioningTab.personaPlaceholder")}
                />
              ) : mission ? (
                <div className="rounded-lg border bg-background">
                  <AIContent
                    content={formatPersonaSummary(mission)}
                    mode="markdown"
                    scroll
                    maxHeight="70vh"
                    className="p-5"
                  />
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground rounded-lg border bg-background">
                  <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-50" />
                  <p className="text-sm font-medium mb-1">Pas encore de résumé persona</p>
                  <p className="text-xs">Clique sur &quot;Enrichir avec l&apos;IA&quot; pour générer un résumé de ton client idéal.</p>
                </div>
              )}
            </div>
          )}

          {personaDetailTab === "detailed" && (
            <div className="rounded-lg border bg-background">
              {personaDetailedMarkdown ? (
                <AIContent
                  content={personaDetailedMarkdown}
                  mode="markdown"
                  scroll
                  maxHeight="70vh"
                  className="p-5"
                />
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-50" />
                  <p className="text-sm font-medium mb-1">Pas encore de persona détaillé</p>
                  <p className="text-xs">Clique sur &quot;Enrichir avec l&apos;IA&quot; pour générer un profil persona ultra-détaillé de ton client idéal.</p>
                </div>
              )}
              {competitorInsightsMarkdown && (
                <>
                  <hr className="border-border" />
                  <div className="p-5">
                    <h4 className="text-base font-bold mb-3">Mécanisme unique &amp; analyse concurrentielle</h4>
                    <AIContent
                      content={competitorInsightsMarkdown}
                      mode="markdown"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {personaDetailTab === "synthesis" && (
            <div className="rounded-lg border bg-background">
              {narrativeSynthesisMarkdown ? (
                <AIContent
                  content={narrativeSynthesisMarkdown}
                  mode="markdown"
                  scroll
                  maxHeight="70vh"
                  className="p-5"
                />
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-50" />
                  <p className="text-sm font-medium mb-1">Pas encore de synthèse narrative</p>
                  <p className="text-xs">Clique sur &quot;Enrichir avec l&apos;IA&quot; pour générer une synthèse complète.</p>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-3 mt-4">
            <Button variant="outline" onClick={savePositioning} disabled={!positioningDirty || pendingPositioning}>
              <Save className="w-4 h-4 mr-2" />
              {pendingPositioning ? tSP("positioningTab.saving") : tSP("positioningTab.save")}
            </Button>
            <Button variant="outline" onClick={enrichPersona} disabled={enriching}>
              {enriching ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              {enriching ? tSP("positioningTab.enriching") : tSP("positioningTab.enrich")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {tSP("positioningTab.enrichDesc")}
          </p>
        </Card>

        {/* Analyse concurrentielle */}
        <CompetitorAnalysisSection />
      </TabsContent>

      {/* BRANDING */}
      <TabsContent value="branding" className="space-y-6">
        <BrandingSettings
          initial={initialProfile as BrandingData | null}
          loading={profileLoading}
          onSaved={(data) => {
            setInitialProfile((prev) => ({ ...prev, ...data }));
          }}
        />
      </TabsContent>

      {/* IA & CRÉDITS */}
      <TabsContent value="ai" className="space-y-6">
        <AiCreditsPanel />
        <AutoCommentSettings userPlan={userPlan} />
      </TabsContent>

      {/* ABONNEMENT */}
      <TabsContent value="pricing" className="space-y-6">
        <BillingSection email={userEmail} />
      </TabsContent>
    </Tabs>
  );
}
