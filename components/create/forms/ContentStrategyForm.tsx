"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Loader2,
  CalendarDays,
  Sparkles,
  CheckCircle2,
  Edit,
  Download,
  Eye,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from "lucide-react";

/* ───────── Types ───────── */

type DayPlan = {
  day: number;
  theme: string;
  contentType: string;
  platform: string;
  hook: string;
  cta: string;
};

type StrategyResult = {
  title: string;
  days: DayPlan[];
};

type GeneratedContent = {
  day: number;
  jobId: string;
  content: string;
  status: "pending" | "generating" | "done" | "error";
  type: string;
  platform: string;
  theme: string;
};

type OfferItem = {
  name: string;
  price: string;
  promise: string;
  target: string;
  description: string;
  format: string;
  link: string;
};

/* ───────── Constants ───────── */

const DURATION_OPTIONS = [
  { value: "7", label: "7 jours" },
  { value: "14", label: "14 jours" },
  { value: "30", label: "30 jours" },
];

const PLATFORM_OPTIONS = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "threads", label: "Threads" },
  { value: "tiktok", label: "TikTok" },
  { value: "email", label: "Email" },
];

const GOAL_OPTIONS = [
  { value: "visibility", label: "Visibilité & notoriété" },
  { value: "leads", label: "Génération de leads" },
  { value: "sales", label: "Ventes & conversions" },
  { value: "authority", label: "Autorité & expertise" },
  { value: "engagement", label: "Engagement communauté" },
];

/** Max concurrent generation requests to avoid overwhelming the server */
const MAX_CONCURRENT = 3;

/* ───────── Helpers ───────── */

async function safeFetchJson(url: string, opts: RequestInit): Promise<any> {
  const res = await fetch(url, opts);
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    throw new Error(`Erreur serveur (${res.status}). Réessaye.`);
  }
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error || `Erreur (${res.status})`);
  }
  return json;
}

/**
 * Call /api/content/generate for a single content piece.
 * Returns the jobId (content is generated async on server).
 */
async function requestGeneration(payload: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch("/api/content/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return null;
    const json = await res.json();
    return json?.jobId ?? null;
  } catch {
    return null;
  }
}

/**
 * Poll a content_item by jobId until it's done generating.
 * Same pattern as CreateLovableClient.pollGeneratedContent.
 */
async function pollContent(
  jobId: string,
  onContent: (content: string) => void,
  timeoutMs = 180_000,
): Promise<boolean> {
  const start = Date.now();
  let delay = 1200;
  let didTriggerProcess = false;

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`/api/content/${encodeURIComponent(jobId)}`);
      const raw = await res.text().catch(() => "");
      let data: any = null;
      try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }

      // Fallback: trigger server-side processing if stuck
      if (!didTriggerProcess && Date.now() - start > 15_000) {
        didTriggerProcess = true;
        void fetch(`/api/content/${encodeURIComponent(jobId)}?process=1`).catch(() => null);
      }

      if (res.ok && data?.ok && data?.item) {
        const status = String(data.item.status ?? "").toLowerCase();
        const content = typeof data.item.content === "string" ? data.item.content.trim() : "";
        if (content && status !== "generating") {
          onContent(content);
          return true;
        }
      }
    } catch { /* retry */ }

    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(3000, Math.floor(delay * 1.15));
  }
  return false;
}

/** Run promises with concurrency limit */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let idx = 0;

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/* ───────── Component ───────── */

type Step = "config" | "plan" | "generating" | "review";

interface ContentStrategyFormProps {
  onClose: () => void;
}

export function ContentStrategyForm({ onClose }: ContentStrategyFormProps) {
  const { toast } = useToast();
  const router = useRouter();

  // Step
  const [step, setStep] = useState<Step>("config");

  // Config
  const [duration, setDuration] = useState("7");
  const [platforms, setPlatforms] = useState<string[]>(["linkedin"]);
  const [goals, setGoals] = useState<string[]>(["visibility"]);
  const [context, setContext] = useState("");
  const [generating, setGenerating] = useState(false);

  // Offers (loaded from settings)
  const [offers, setOffers] = useState<OfferItem[]>([]);
  const [selectedOfferIdx, setSelectedOfferIdx] = useState<number>(-1);

  // Plan (Step 2)
  const [strategy, setStrategy] = useState<StrategyResult | null>(null);

  // Generated content (Step 3-4)
  const [contents, setContents] = useState<GeneratedContent[]>([]);

  // Content review
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  // Track abort
  const abortRef = useRef(false);

  // Load offers on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/profile");
        const json = await res.json().catch(() => null);
        const profile = json?.profile ?? json?.data ?? json;
        if (Array.isArray(profile?.offers)) {
          setOffers(
            profile.offers
              .filter((o: any) => o?.name?.trim())
              .map((o: any) => ({
                name: String(o.name ?? ""),
                price: String(o.price ?? ""),
                promise: String(o.promise ?? ""),
                target: String(o.target ?? ""),
                description: String(o.description ?? ""),
                format: String(o.format ?? ""),
                link: String(o.link ?? ""),
              })),
          );
        }
      } catch { /* non-blocking */ }
    })();
  }, []);

  const togglePlatform = (p: string) =>
    setPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);

  const toggleGoal = (g: string) =>
    setGoals((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]);

  // Progress
  const doneCount = contents.filter((c) => c.status === "done").length;
  const errorCount = contents.filter((c) => c.status === "error").length;
  const totalCount = contents.length;
  const progress = totalCount > 0 ? Math.round(((doneCount + errorCount) / totalCount) * 100) : 0;

  // ── STEP 1: Generate strategy plan ──
  const handleGeneratePlan = async () => {
    if (platforms.length === 0) {
      toast({ title: "Sélectionne au moins une plateforme", variant: "destructive" });
      return;
    }
    if (goals.length === 0) {
      toast({ title: "Sélectionne au moins un objectif", variant: "destructive" });
      return;
    }

    setGenerating(true);
    try {
      const json = await safeFetchJson("/api/content/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          duration: Number(duration),
          platforms,
          goals,
          context: context.trim() || undefined,
        }),
      });

      if (!json.ok || !json.strategy) {
        throw new Error(json.error || "Erreur lors de la génération");
      }

      setStrategy(json.strategy);
      setStep("plan");
      toast({ title: "Plan stratégique généré !" });
    } catch (e: any) {
      toast({
        title: "Erreur",
        description: e?.message || "Impossible de générer la stratégie",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  // ── STEP 2: Generate ALL content (client-side orchestration) ──
  const handleGenerateAll = async () => {
    if (!strategy) return;
    abortRef.current = false;

    const offer = selectedOfferIdx >= 0 ? offers[selectedOfferIdx] : null;

    // Initialize content entries
    const initial: GeneratedContent[] = strategy.days.map((day) => ({
      day: day.day,
      jobId: "",
      content: "",
      status: "pending" as const,
      type: day.contentType === "email" ? "email" : "post",
      platform: day.platform || "linkedin",
      theme: day.theme || "",
    }));
    setContents(initial);
    setStep("generating");

    // Build generation tasks
    const tasks = strategy.days.map((day, idx) => async () => {
      if (abortRef.current) return;

      const type = day.contentType === "email" ? "email" : "post";
      const channel = day.platform || "linkedin";

      // Build brief
      const briefLines: string[] = [];
      briefLines.push(`CONTEXTE STRATÉGIE : ${strategy.title} — Jour ${day.day}`);
      briefLines.push(`THÈME DU JOUR : ${day.theme}`);
      briefLines.push(`HOOK (accroche à utiliser) : ${day.hook}`);
      briefLines.push(`CTA (appel à l'action) : ${day.cta}`);
      briefLines.push(`PLATEFORME : ${channel}`);

      if (offer) {
        briefLines.push("");
        briefLines.push("OFFRE DE RÉFÉRENCE :");
        if (offer.name) briefLines.push(`Nom: ${offer.name}`);
        if (offer.promise) briefLines.push(`Promesse: ${offer.promise}`);
        if (offer.target) briefLines.push(`Public cible: ${offer.target}`);
        if (offer.price) briefLines.push(`Prix: ${offer.price}`);
        if (offer.description) briefLines.push(`Description: ${offer.description}`);
        if (offer.link) briefLines.push(`Lien: ${offer.link}`);
      }

      briefLines.push("");
      briefLines.push(`Génère un contenu de type "${type}" prêt à publier, adapté à la plateforme ${channel}.`);
      briefLines.push("Utilise le hook et le CTA fournis. Le contenu doit être directement utilisable, pas de titre, pas de markdown.");

      // Mark as generating
      setContents((prev) =>
        prev.map((c, i) => (i === idx ? { ...c, status: "generating" as const } : c)),
      );

      // 1) Request generation → get jobId
      const jobId = await requestGeneration({
        type,
        channel,
        prompt: briefLines.join("\n"),
      });

      if (!jobId) {
        setContents((prev) =>
          prev.map((c, i) => (i === idx ? { ...c, status: "error" as const } : c)),
        );
        return;
      }

      // Store jobId
      setContents((prev) =>
        prev.map((c, i) => (i === idx ? { ...c, jobId } : c)),
      );

      // 2) Poll until content is ready
      const ok = await pollContent(jobId, (content) => {
        setContents((prev) =>
          prev.map((c, i) => (i === idx ? { ...c, content, status: "done" as const } : c)),
        );
      });

      if (!ok) {
        setContents((prev) =>
          prev.map((c, i) => (i === idx && c.status !== "done" ? { ...c, status: "error" as const } : c)),
        );
      }
    });

    // Run with concurrency limit (3 at a time)
    await runWithConcurrency(tasks, MAX_CONCURRENT);

    setStep("review");
  };

  // ── Save edited content ──
  const handleSaveEdit = async (dayIdx: number) => {
    const item = contents[dayIdx];
    if (!item?.jobId) return;

    try {
      await safeFetchJson(`/api/content/${item.jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editText }),
      });
      setContents((prev) =>
        prev.map((c, i) => (i === dayIdx ? { ...c, content: editText } : c)),
      );
      setEditingDay(null);
      toast({ title: "Contenu mis à jour !" });
    } catch {
      toast({ title: "Erreur lors de la sauvegarde", variant: "destructive" });
    }
  };

  // ── Download all as text file (no jspdf dependency) ──
  const handleDownloadText = useCallback(() => {
    const doneItems = contents.filter((c) => c.status === "done");
    if (doneItems.length === 0) return;

    const lines: string[] = [];
    lines.push(strategy?.title || "Stratégie de contenu");
    lines.push("=".repeat(50));
    lines.push("");

    for (const item of doneItems) {
      lines.push(`── Jour ${item.day} — ${item.theme} (${item.platform}) ──`);
      lines.push("");
      lines.push(item.content);
      lines.push("");
      lines.push("");
    }

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `strategie-${(strategy?.title || "contenu").replace(/[^a-zA-Z0-9àéèùâêîôû]/gi, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [contents, strategy]);

  const handleOpenContent = (jobId: string) => router.push(`/contents/${jobId}`);

  // ═════════════════════════════════════════════
  // STEP 1: Configuration
  // ═════════════════════════════════════════════
  if (step === "config") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <CalendarDays className="w-5 h-5" />
              Stratégie de contenu
            </h2>
            <p className="text-sm text-muted-foreground">
              Génère tous tes contenus en quelques clics
            </p>
          </div>
        </div>

        <Card className="p-6 space-y-6">
          <div className="space-y-2">
            <Label>Durée du plan</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Plateformes</Label>
            <div className="flex flex-wrap gap-2">
              {PLATFORM_OPTIONS.map((p) => (
                <Badge
                  key={p.value}
                  variant={platforms.includes(p.value) ? "default" : "outline"}
                  className="cursor-pointer select-none"
                  onClick={() => togglePlatform(p.value)}
                >
                  {p.label}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Objectifs</Label>
            <div className="flex flex-wrap gap-2">
              {GOAL_OPTIONS.map((g) => (
                <Badge
                  key={g.value}
                  variant={goals.includes(g.value) ? "default" : "outline"}
                  className="cursor-pointer select-none"
                  onClick={() => toggleGoal(g.value)}
                >
                  {g.label}
                </Badge>
              ))}
            </div>
          </div>

          {offers.length > 0 && (
            <div className="space-y-2">
              <Label>Offre de référence (optionnel)</Label>
              <Select
                value={selectedOfferIdx >= 0 ? String(selectedOfferIdx) : "none"}
                onValueChange={(v) => setSelectedOfferIdx(v === "none" ? -1 : Number(v))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Aucune offre" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune offre</SelectItem>
                  {offers.map((o, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {o.name}{o.price ? ` — ${o.price}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Contexte supplémentaire (optionnel)</Label>
            <Textarea
              placeholder="Lancement d'offre prévu, événement à promouvoir, thématique spécifique..."
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={3}
            />
          </div>

          <Button
            onClick={handleGeneratePlan}
            disabled={generating}
            className="w-full"
            size="lg"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Création du plan...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Générer le plan stratégique
              </>
            )}
          </Button>
        </Card>
      </div>
    );
  }

  // ═════════════════════════════════════════════
  // STEP 2: Plan validation
  // ═════════════════════════════════════════════
  if (step === "plan" && strategy) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setStep("config")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h2 className="text-xl font-bold">{strategy.title}</h2>
              <p className="text-sm text-muted-foreground">
                Valide le plan puis génère tous les contenus
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {strategy.days.map((day) => (
            <Card key={day.day} className="p-4">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">J{day.day}</span>
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium">{day.theme}</p>
                    <Badge variant="secondary" className="text-xs">{day.platform}</Badge>
                    <Badge variant="outline" className="text-xs">{day.contentType}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{day.hook}</p>
                  <p className="text-xs text-muted-foreground">CTA: {day.cta}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="flex gap-3">
          <Button
            onClick={handleGenerateAll}
            className="flex-1"
            size="lg"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Générer tous les contenus ({strategy.days.length} contenus = {strategy.days.length} crédits)
          </Button>
          <Button variant="outline" onClick={() => setStep("config")}>
            Modifier
          </Button>
        </div>
      </div>
    );
  }

  // ═════════════════════════════════════════════
  // STEP 3: Generating all content (background)
  // ═════════════════════════════════════════════
  if (step === "generating") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin" />
          <div>
            <h2 className="text-xl font-bold">Génération en cours...</h2>
            <p className="text-sm text-muted-foreground">
              {doneCount}/{totalCount} contenus prêts
            </p>
          </div>
        </div>

        <Card className="p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span>Progression</span>
              <span className="font-medium">{progress}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
              <div
                className="bg-primary h-3 rounded-full transition-all duration-700 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {contents.map((item) => (
                <div key={item.day} className="flex items-center gap-3 text-sm py-1">
                  {item.status === "pending" && (
                    <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />
                  )}
                  {item.status === "generating" && (
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  )}
                  {item.status === "done" && (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  )}
                  {item.status === "error" && (
                    <AlertCircle className="w-4 h-4 text-red-500" />
                  )}
                  <span className={item.status === "done" ? "text-foreground" : "text-muted-foreground"}>
                    J{item.day} — {item.theme}
                  </span>
                  <Badge variant="outline" className="text-xs ml-auto">{item.platform}</Badge>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // ═════════════════════════════════════════════
  // STEP 4: Review all generated content
  // ═════════════════════════════════════════════
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold">{strategy?.title}</h2>
            <p className="text-sm text-muted-foreground">
              {doneCount} contenus générés{errorCount > 0 ? `, ${errorCount} erreurs` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {doneCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleDownloadText}>
              <Download className="w-4 h-4 mr-1" />
              Télécharger
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => router.push("/contents")}>
            Mes contenus
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {contents.map((item, idx) => {
          const isExpanded = expandedDay === idx;
          return (
            <Card key={item.day} className="overflow-hidden">
              <div
                className="p-4 flex items-center gap-4 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => item.status === "done" && setExpandedDay(isExpanded ? null : idx)}
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">J{item.day}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{item.theme}</p>
                    <Badge variant="secondary" className="text-xs shrink-0">{item.platform}</Badge>
                    {item.status === "done" && (
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    )}
                    {item.status === "error" && (
                      <Badge variant="destructive" className="text-xs">Erreur</Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {item.status === "done" && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => { e.stopPropagation(); handleOpenContent(item.jobId); }}
                        title="Voir / Planifier / Publier"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => { e.stopPropagation(); setEditingDay(idx); setEditText(item.content); }}
                        title="Modifier"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                  {item.status === "done" && (
                    isExpanded
                      ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
              </div>

              {isExpanded && item.status === "done" && (
                <div className="px-4 pb-4 border-t">
                  <div className="pt-3 whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed">
                    {item.content}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleOpenContent(item.jobId)}>
                      <Eye className="w-3 h-3 mr-1" />
                      Planifier / Publier
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => { setEditingDay(idx); setEditText(item.content); }}>
                      <Edit className="w-3 h-3 mr-1" />
                      Modifier
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Edit dialog */}
      <Dialog open={editingDay !== null} onOpenChange={(open) => !open && setEditingDay(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingDay !== null && contents[editingDay]
                ? `Modifier — Jour ${contents[editingDay].day} : ${contents[editingDay].theme}`
                : "Modifier"}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={15}
            className="font-mono text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditingDay(null)}>
              Annuler
            </Button>
            <Button onClick={() => editingDay !== null && handleSaveEdit(editingDay)}>
              Enregistrer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
