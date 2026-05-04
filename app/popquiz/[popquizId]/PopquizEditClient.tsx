"use client";

// Popquiz edit form. Same chrome and visual language as
// PopquizNewClient (AppShell, gradient banner, shadcn cards) so
// the create / edit flows feel like one product.
//
// Differences vs the new flow:
//   • Loads with the existing popquiz state (title, slug, cues,
//     publish toggle).
//   • Video URL is read-only — swapping the source is destructive
//     enough to warrant deleting + re-creating instead of an
//     in-place edit. Surfaced as a small read-only display.
//   • Save = PATCH /api/popquiz/[id]; cues are sent as a full
//     replace-set (matches the API's PUT-style cues field).
//   • Embed code section appears once published, with a copy
//     button right in the page (no extra dialog).
//
// Same TypeScript discipline as the new client — every cue object
// constructed in client code is annotated `: DraftCue` so the
// literal `"block" | "optional"` is preserved through array spreads.

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  Save,
  Sparkles,
  Video,
  EyeOff,
  Eye,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PopquizPlayer } from "@/components/popquiz/PopquizPlayer";
import { buildEmbedSnippet } from "@/components/popquiz/EmbedCodeDialog";
import type { Popquiz, PopquizCue } from "@/lib/popquiz";
import { toast } from "sonner";

interface QuizOption {
  id: string;
  title: string;
  status: string;
}

interface DraftCue {
  localId: string;
  quizId: string;
  timestampMs: number;
  behavior: "block" | "optional";
}

function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function TimelineStrip({
  durationMs,
  cues,
  onAddAt,
  onRemove,
  primaryColor,
}: {
  durationMs: number | null;
  cues: DraftCue[];
  onAddAt: (ms: number) => void;
  onRemove: (localId: string) => void;
  primaryColor: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hoverPct, setHoverPct] = useState<number | null>(null);

  const usableDuration = durationMs && durationMs > 0 ? durationMs : null;

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!ref.current) return;
    if (!usableDuration) {
      toast.message(
        "Lance la lecture une seconde pour que la durée de la vidéo soit détectée.",
      );
      return;
    }
    const rect = ref.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onAddAt(Math.round(pct * usableDuration));
  }

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!ref.current || !usableDuration) return;
    const rect = ref.current.getBoundingClientRect();
    setHoverPct(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label className="text-sm">Timeline</Label>
        <span className="text-[11px] text-muted-foreground">
          {usableDuration
            ? "Clique sur la barre pour ajouter un marqueur"
            : "Lance la lecture pour activer la barre"}
        </span>
      </div>
      <div
        ref={ref}
        onClick={handleClick}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverPct(null)}
        className={`relative h-12 rounded-lg ring-1 ring-border bg-gradient-to-r from-muted/60 to-muted/30 ${
          usableDuration ? "cursor-crosshair" : "cursor-not-allowed opacity-60"
        }`}
        role="button"
        tabIndex={usableDuration ? 0 : -1}
        aria-label="Cliquer pour ajouter un marqueur"
      >
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground">
          0:00
        </span>
        {usableDuration ? (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground">
            {formatMs(usableDuration)}
          </span>
        ) : null}

        {hoverPct !== null && usableDuration ? (
          <>
            <div
              className="absolute top-0 bottom-0 w-px bg-foreground/30 pointer-events-none"
              style={{ left: `${hoverPct * 100}%` }}
            />
            <div
              className="absolute -top-7 -translate-x-1/2 px-2 py-0.5 rounded bg-foreground text-background text-[10px] font-mono pointer-events-none whitespace-nowrap"
              style={{ left: `${hoverPct * 100}%` }}
            >
              {formatMs(hoverPct * usableDuration)}
            </div>
          </>
        ) : null}

        {usableDuration
          ? cues.map((c) => {
              const pct = (c.timestampMs / usableDuration) * 100;
              if (pct < 0 || pct > 100) return null;
              return (
                <button
                  key={c.localId}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(c.localId);
                  }}
                  className="group absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-3 rounded-full ring-2 ring-white shadow-md hover:scale-125 transition-transform"
                  style={{ left: `${pct}%`, background: primaryColor }}
                  title={`Marqueur à ${formatMs(c.timestampMs)} — cliquer pour supprimer`}
                  aria-label={`Marqueur à ${formatMs(c.timestampMs)}, cliquer pour supprimer`}
                />
              );
            })
          : null}
      </div>
    </div>
  );
}

export default function PopquizEditClient({
  userEmail,
  popquiz,
  quizzes,
}: {
  userEmail: string;
  popquiz: Popquiz;
  quizzes: QuizOption[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(popquiz.title);
  const [slug, setSlug] = useState(popquiz.slug ?? "");
  const [description, setDescription] = useState(popquiz.description ?? "");
  const [isPublished, setIsPublished] = useState(popquiz.isPublished);

  const initialCues: DraftCue[] = popquiz.cues.map<DraftCue>((c) => ({
    localId: c.id,
    quizId: c.quizId,
    timestampMs: c.timestampMs,
    behavior: c.behavior,
  }));
  const [cues, setCues] = useState<DraftCue[]>(initialCues);
  const [durationMs, setDurationMs] = useState<number | null>(
    popquiz.video.durationMs,
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  // The popquiz handed in already carries hydrated branding; for
  // the editor preview we override accent so timeline markers
  // match the player.
  const markerColor = popquiz.branding.primaryColor ?? "hsl(var(--primary))";

  function addCueAt(timestampMs: number) {
    if (quizzes.length === 0) {
      setError("Crée d'abord un quiz dans Mes projets.");
      return;
    }
    setError(null);
    setCues((prev) => {
      let ts = timestampMs;
      while (prev.some((c) => c.timestampMs === ts)) ts += 250;
      const next: DraftCue = {
        localId: genId(),
        quizId: quizzes[0].id,
        timestampMs: ts,
        behavior: "block",
      };
      return [...prev, next].sort((a, b) => a.timestampMs - b.timestampMs);
    });
  }

  function removeCue(localId: string) {
    setCues((prev) => prev.filter((c) => c.localId !== localId));
  }

  function updateCue(localId: string, patch: Partial<DraftCue>) {
    setCues((prev) =>
      prev
        .map((c) => (c.localId === localId ? { ...c, ...patch } : c))
        .sort((a, b) => a.timestampMs - b.timestampMs),
    );
  }

  async function handleSave() {
    setError(null);
    if (!title.trim()) {
      setError("Le titre ne peut pas être vide.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/popquiz/${popquiz.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          slug: slug.trim(),
          description: description.trim() || null,
          is_published: isPublished,
          cues: cues.map((c) => ({
            quiz_id: c.quizId,
            timestamp_ms: c.timestampMs,
            behavior: c.behavior,
          })),
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Erreur lors de la sauvegarde");
        return;
      }
      toast.success("Modifications enregistrées");
      // Soft-refresh so the server-rendered shell picks up the new
      // slug / publish state without a full reload.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  // Build URLs from the latest persisted slug. We use popquiz.slug
  // (server-supplied) instead of the current input so the URL only
  // "updates" once the user actually saves.
  const handle = popquiz.slug ?? popquiz.id;
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  const publicUrl = `${origin}/pq/${handle}`;
  const embedUrl = `${origin}/embed/pq/${handle}`;
  const embedSnippet = buildEmbedSnippet(embedUrl);

  async function copyPublicUrl() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopiedUrl(true);
      toast.success("Lien copié");
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      toast.error("Impossible de copier");
    }
  }

  async function copyEmbed() {
    try {
      await navigator.clipboard.writeText(embedSnippet);
      setCopiedEmbed(true);
      toast.success("Code copié");
      setTimeout(() => setCopiedEmbed(false), 2000);
    } catch {
      toast.error("Impossible de copier");
    }
  }

  // Build a draft view of the popquiz so the same PopquizPlayer
  // can render the live preview — we just feed it the current cue
  // list (mapped back to the public PopquizCue shape).
  const previewPopquiz: Popquiz = useMemo(
    () => ({
      ...popquiz,
      title,
      cues: cues.map<PopquizCue>((c, i) => ({
        id: c.localId,
        quizId: c.quizId,
        timestampMs: c.timestampMs,
        behavior: c.behavior,
        displayOrder: i,
      })),
    }),
    [popquiz, title, cues],
  );

  return (
    <AppShell userEmail={userEmail} headerTitle="Modifier le popquiz">
      <div className="gradient-primary rounded-xl px-5 py-4 md:px-6 md:py-5 flex items-center gap-4 text-white">
        <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center">
          <Video className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold truncate">{title || "Popquiz"}</h2>
          <p className="text-sm text-white/80">
            {isPublished
              ? "Publié — visible à l'adresse partagée."
              : "Brouillon — non visible publiquement."}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="py-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Titre</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">
              Description{" "}
              <span className="text-muted-foreground font-normal">
                (optionnelle, utilisée dans les aperçus de partage)
              </span>
            </Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explique en une phrase ce que la vidéo apporte"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Vidéo source</Label>
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <Video className="size-4 text-muted-foreground shrink-0" />
              <span className="flex-1 min-w-0 truncate text-muted-foreground">
                {popquiz.video.externalUrl ?? popquiz.video.hlsPath ?? "—"}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {popquiz.video.source}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Pour changer de vidéo, supprime ce popquiz et crées-en un
              nouveau.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slug">
              Lien personnalisé{" "}
              <span className="text-muted-foreground font-normal">
                (optionnel)
              </span>
            </Label>
            <div className="flex items-stretch rounded-md border bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring">
              <span className="px-2.5 flex items-center text-xs text-muted-foreground bg-muted/50 border-r">
                /pq/
              </span>
              <input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="onboarding-q1"
                className="flex-1 px-3 py-1.5 text-sm bg-transparent outline-none"
                autoComplete="off"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Lettres minuscules, chiffres et tirets. Vide → on retombe
              sur l'identifiant généré.
            </p>
          </div>

          <div className="flex items-start gap-3 rounded-md border bg-muted/30 px-3 py-2">
            <button
              type="button"
              onClick={() => setIsPublished((v) => !v)}
              className={`mt-0.5 size-9 grid place-items-center rounded-full transition-colors ${
                isPublished
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
              aria-label={isPublished ? "Dépublier" : "Publier"}
            >
              {isPublished ? (
                <Eye className="size-4" />
              ) : (
                <EyeOff className="size-4" />
              )}
            </button>
            <div className="flex-1">
              <p className="text-sm font-medium">
                {isPublished ? "Publié" : "Brouillon"}
              </p>
              <p className="text-xs text-muted-foreground">
                {isPublished
                  ? "Toute personne avec le lien peut voir la vidéo."
                  : "Seul toi peux voir la vidéo tant qu'elle n'est pas publiée."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="py-5 space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <Label className="text-sm">Aperçu</Label>
            <span className="text-[11px] text-muted-foreground">
              Le quiz lié s'affichera à chaque marqueur en lecture finale.
            </span>
          </div>
          <PopquizPlayer
            popquiz={previewPopquiz}
            onDurationChange={setDurationMs}
            renderOverlay={({ cue, onSkipped }) => {
              const linked = quizzes.find((q) => q.id === cue.quizId);
              return (
                <div className="absolute inset-0 grid place-items-center p-6">
                  <div className="max-w-md w-full rounded-2xl bg-white shadow-2xl p-6 space-y-3">
                    <h3 className="text-base font-semibold">
                      Marqueur à {formatMs(cue.timestampMs)} —{" "}
                      {linked?.title ?? "Quiz inconnu"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      En lecture finale, le quiz lié s'affichera ici.
                      Clique sur la croix pour reprendre la vidéo.
                    </p>
                    {cue.behavior === "optional" ? (
                      <Button size="sm" variant="outline" onClick={onSkipped}>
                        Passer
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            }}
          />
          <TimelineStrip
            durationMs={durationMs}
            cues={cues}
            onAddAt={addCueAt}
            onRemove={removeCue}
            primaryColor={markerColor}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Marqueurs</h2>
              <p className="text-xs text-muted-foreground">
                Le quiz se déclenche à ce moment de la vidéo.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() =>
                addCueAt(durationMs ? Math.min(5000, durationMs / 6) : 5000)
              }
              type="button"
            >
              <Plus className="size-4 mr-1" /> Ajouter
            </Button>
          </div>

          {cues.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Aucun marqueur. Clique sur la timeline ou sur « Ajouter ».
            </p>
          ) : (
            <ul className="space-y-2">
              {cues.map((cue) => {
                const linked = quizzes.find((q) => q.id === cue.quizId);
                const isDraftQuiz = linked && linked.status !== "active";
                return (
                  <li
                    key={cue.localId}
                    className="flex flex-wrap items-center gap-2 rounded-md border p-3"
                  >
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={Math.floor(cue.timestampMs / 1000)}
                      onChange={(e) =>
                        updateCue(cue.localId, {
                          timestampMs:
                            Math.max(0, Number(e.target.value) || 0) * 1000,
                        })
                      }
                      className="w-24"
                      aria-label="Timestamp en secondes"
                    />
                    <span className="text-xs text-muted-foreground">s</span>

                    <select
                      value={cue.quizId}
                      onChange={(e) =>
                        updateCue(cue.localId, { quizId: e.target.value })
                      }
                      className="flex-1 min-w-[200px] h-9 rounded-md border bg-background px-2 text-sm"
                      aria-label="Quiz lié"
                    >
                      {quizzes.map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.title}
                          {q.status !== "active" ? " (brouillon)" : ""}
                        </option>
                      ))}
                    </select>

                    <select
                      value={cue.behavior}
                      onChange={(e) =>
                        updateCue(cue.localId, {
                          behavior: e.target.value as "block" | "optional",
                        })
                      }
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                      aria-label="Comportement"
                    >
                      <option value="block">Bloquant</option>
                      <option value="optional">Optionnel</option>
                    </select>

                    {isDraftQuiz ? (
                      <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                        Brouillon — sera publié automatiquement quand tu publieras ce popquiz
                      </span>
                    ) : null}

                    <Button
                      size="icon"
                      variant="ghost"
                      type="button"
                      onClick={() => removeCue(cue.localId)}
                      aria-label="Supprimer"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {popquiz.isPublished ? (
        <Card>
          <CardContent className="py-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold">Partage & intégration</h2>
              <p className="text-xs text-muted-foreground">
                Lien direct à partager ou code à coller dans une page.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Lien direct
              </Label>
              <div className="flex items-center gap-1.5 rounded-lg border bg-muted/40 p-1.5">
                <code className="text-xs flex-1 min-w-0 truncate font-mono px-2">
                  {publicUrl}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={copyPublicUrl}
                  type="button"
                  className="shrink-0"
                >
                  {copiedUrl ? (
                    <Check className="size-4 text-green-600" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Code d'intégration
              </Label>
              <textarea
                readOnly
                value={embedSnippet}
                rows={6}
                className="w-full rounded-md border bg-muted/40 p-3 text-xs font-mono whitespace-pre-wrap break-all resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
              />
              <Button
                onClick={copyEmbed}
                size="sm"
                variant="outline"
                type="button"
                className="w-full"
              >
                {copiedEmbed ? (
                  <>
                    <Check className="size-4 mr-2 text-green-600" />
                    Code copié
                  </>
                ) : (
                  <>
                    <Copy className="size-4 mr-2" />
                    Copier le code
                  </>
                )}
              </Button>
            </div>

            <Button asChild size="sm" variant="outline" className="w-full">
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="size-4 mr-2" />
                Ouvrir la page publique
              </a>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 justify-end">
        <Button
          variant="outline"
          disabled={saving}
          onClick={() => router.push("/quizzes")}
          type="button"
        >
          Retour aux projets
        </Button>
        <Button disabled={saving} onClick={handleSave} type="button">
          {isPublished ? (
            <Save className="size-4 mr-2" />
          ) : (
            <Sparkles className="size-4 mr-2" />
          )}
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </AppShell>
  );
}
