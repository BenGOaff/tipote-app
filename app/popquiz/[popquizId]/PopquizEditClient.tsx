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

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  autosaveKey,
  saveAutosave,
  loadAutosave,
  clearAutosave,
} from "@/lib/popquiz/autosave";
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
  Link as LinkIcon,
  Square as SquareIcon,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { PageBanner } from "@/components/PageBanner";
import { PageContainer } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PopquizPlayer } from "@/components/popquiz/PopquizPlayer";
import { PopquizAppearanceForm } from "@/components/popquiz/PopquizAppearanceForm";
import {
  buildPlayerWrapperClassName,
  buildPlayerWrapperStyle,
  buildPageBackgroundStyle,
} from "@/lib/popquiz/appearance";
import { buildEmbedSnippet } from "@/components/popquiz/EmbedCodeDialog";
import { ThumbnailPicker } from "@/components/popquiz/ThumbnailPicker";
import { RichTextEdit } from "@/components/ui/rich-text-edit";
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

  // Thumbnail state — preview URL + source flag. The thumbnailUrl is
  // the signed playback URL minted by lib/popquiz/repo.ts; we just
  // detect "is this the custom one?" from the path it points at.
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(
    popquiz.video.thumbnailUrl ?? null,
  );
  const [thumbnailSource, setThumbnailSource] = useState<"auto" | "custom">(
    typeof popquiz.video.thumbnailUrl === "string" &&
      popquiz.video.thumbnailUrl.includes("thumbnail-custom")
      ? "custom"
      : "auto",
  );

  // Apparence de la page publique (titre / fond / bordure / ombre /
  // bouton play). Tous defaults = rendu propre minimal.
  const [displayTitle, setDisplayTitle] = useState(
    popquiz.appearance.displayTitle ?? "",
  );
  const [displaySubtitle, setDisplaySubtitle] = useState(
    popquiz.appearance.displaySubtitle ?? "",
  );
  const [bgStyle, setBgStyle] = useState<"transparent" | "solid" | "gradient">(
    popquiz.appearance.bgStyle,
  );
  const [bgColor, setBgColor] = useState(popquiz.appearance.bgColor ?? "#0f172a");
  const [bgColor2, setBgColor2] = useState(popquiz.appearance.bgColor2 ?? "#1e293b");
  const [borderWidth, setBorderWidth] = useState(popquiz.appearance.borderWidth);
  const [borderColor, setBorderColor] = useState(popquiz.appearance.borderColor ?? "#ffffff");
  const [shadowIntensity, setShadowIntensity] = useState<"none" | "soft" | "medium" | "strong">(
    popquiz.appearance.shadowIntensity,
  );
  const [playButtonColor, setPlayButtonColor] = useState(popquiz.appearance.playButtonColor ?? "");
  const [playButtonShape, setPlayButtonShape] = useState<"circle" | "rounded" | "square">(
    popquiz.appearance.playButtonShape,
  );
  const [showCreatorBranding, setShowCreatorBranding] = useState(
    popquiz.appearance.showCreatorBranding,
  );

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

  // Aperçu : mode "lien direct" (avec titre/sous-titre/fond/branding)
  // ou "iframe" (vidéo seule). Ne sert qu'à visualiser le rendu sans
  // toucher à la persistance — les valeurs saisies sont les mêmes.
  const [previewMode, setPreviewMode] = useState<"direct" | "iframe">("direct");

  // ─── Autosave silencieux ────────────────────────────────────────
  // Même pattern que PopquizNewClient mais clé scopée par popquiz ID
  // pour ne pas mélanger les brouillons de plusieurs popquizzes.
  // Vignette : la persistance d'un Blob serveur n'a pas de sens ici
  // (l'image est déjà uploadée), on ne stocke que les champs édités.
  const AUTOSAVE_KEY = autosaveKey(popquiz.id);
  const [autosaveHydrated, setAutosaveHydrated] = useState(false);

  useEffect(() => {
    type Saved = {
      title: string;
      slug: string;
      description: string;
      cues: DraftCue[];
      displayTitle: string;
      displaySubtitle: string;
      bgStyle: "transparent" | "solid" | "gradient";
      bgColor: string;
      bgColor2: string;
      borderWidth: number;
      borderColor: string;
      shadowIntensity: "none" | "soft" | "medium" | "strong";
      playButtonColor: string;
      playButtonShape: "circle" | "rounded" | "square";
      showCreatorBranding: boolean;
      previewMode: "direct" | "iframe";
    };
    const saved = loadAutosave<Saved>(AUTOSAVE_KEY);
    if (saved) {
      setTitle(saved.title);
      setSlug(saved.slug);
      setDescription(saved.description);
      setCues(saved.cues);
      setDisplayTitle(saved.displayTitle);
      setDisplaySubtitle(saved.displaySubtitle);
      setBgStyle(saved.bgStyle);
      setBgColor(saved.bgColor);
      setBgColor2(saved.bgColor2);
      setBorderWidth(saved.borderWidth);
      setBorderColor(saved.borderColor);
      setShadowIntensity(saved.shadowIntensity);
      setPlayButtonColor(saved.playButtonColor);
      setPlayButtonShape(saved.playButtonShape);
      setShowCreatorBranding(saved.showCreatorBranding);
      setPreviewMode(saved.previewMode);
    }
    setAutosaveHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!autosaveHydrated) return;
    const t = setTimeout(() => {
      saveAutosave(AUTOSAVE_KEY, {
        title,
        slug,
        description,
        cues,
        displayTitle,
        displaySubtitle,
        bgStyle,
        bgColor,
        bgColor2,
        borderWidth,
        borderColor,
        shadowIntensity,
        playButtonColor,
        playButtonShape,
        showCreatorBranding,
        previewMode,
      });
    }, 400);
    return () => clearTimeout(t);
  }, [
    autosaveHydrated,
    AUTOSAVE_KEY,
    title,
    slug,
    description,
    cues,
    displayTitle,
    displaySubtitle,
    bgStyle,
    bgColor,
    bgColor2,
    borderWidth,
    borderColor,
    shadowIntensity,
    playButtonColor,
    playButtonShape,
    showCreatorBranding,
    previewMode,
  ]);

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

  /**
   * Sauvegarde du popquiz. `nextPublished` permet aux boutons d'action
   * de forcer l'état de publication au moment du save (au lieu de
   * dépendre d'un toggle séparé que l'utilisateur risque de manquer).
   *   • undefined → garde l'état actuel (rare, pas exposé en UI)
   *   • true      → "Publier" / "Enregistrer les modifications" (publié)
   *   • false     → "Enregistrer brouillon" / "Dépublier"
   *
   * Gwenn 2026-05-04 : avant ce refactor, la publication passait par un
   * minuscule toggle Eye/EyeOff au milieu de la card "Statut", facile à
   * rater. Le bouton du bas s'appelait "Enregistrer" sans expliquer
   * qu'il publiait aussi. Nouveau : deux boutons explicites
   * contextualisés à l'état courant.
   */
  async function handleSave(nextPublished?: boolean) {
    setError(null);
    if (!title.trim()) {
      setError("Le titre ne peut pas être vide.");
      return;
    }
    const willPublish = nextPublished ?? isPublished;
    setSaving(true);
    try {
      const res = await fetch(`/api/popquiz/${popquiz.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          slug: slug.trim(),
          description: description.trim() || null,
          is_published: willPublish,
          // Personnalisation page publique
          display_title: displayTitle.trim() || null,
          display_subtitle: displaySubtitle.trim() || null,
          bg_style: bgStyle,
          bg_color: bgStyle === "transparent" ? null : bgColor,
          bg_color_2: bgStyle === "gradient" ? bgColor2 : null,
          border_width: borderWidth,
          border_color: borderWidth > 0 ? borderColor : null,
          shadow_intensity: shadowIntensity,
          play_button_color: playButtonColor.trim() || null,
          play_button_shape: playButtonShape,
          show_creator_branding: showCreatorBranding,
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
      // Save serveur OK → on nettoie l'autosave local pour ne pas
      // ré-hydrater des données obsolètes au prochain mount.
      clearAutosave(AUTOSAVE_KEY);

      // Sync local state to what was sent so les boutons reflètent
      // immédiatement le nouveau statut sans attendre router.refresh().
      setIsPublished(willPublish);
      if (willPublish && !popquiz.isPublished) {
        toast.success("Popquiz publié — partage le lien à ton audience");
      } else if (!willPublish && popquiz.isPublished) {
        toast.success("Popquiz dépublié — il n'est plus visible publiquement");
      } else {
        toast.success("Modifications enregistrées");
      }
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
      // Vignette custom uploadée → poster du player en temps réel.
      video: {
        ...popquiz.video,
        thumbnailUrl: thumbnailUrl ?? popquiz.video.thumbnailUrl,
      },
      // Override appearance avec l'état édité en temps réel — le live
      // preview reflète les changements avant même qu'on enregistre.
      appearance: {
        displayTitle: displayTitle.trim() || null,
        displaySubtitle: displaySubtitle.trim() || null,
        bgStyle,
        bgColor: bgStyle === "transparent" ? null : bgColor,
        bgColor2: bgStyle === "gradient" ? bgColor2 : null,
        borderWidth,
        borderColor: borderWidth > 0 ? borderColor : null,
        shadowIntensity,
        playButtonColor: playButtonColor.trim() || null,
        playButtonShape,
        showCreatorBranding,
      },
      cues: cues.map<PopquizCue>((c, i) => ({
        id: c.localId,
        quizId: c.quizId,
        timestampMs: c.timestampMs,
        behavior: c.behavior,
        displayOrder: i,
      })),
    }),
    [
      popquiz,
      title,
      cues,
      thumbnailUrl,
      displayTitle,
      displaySubtitle,
      bgStyle,
      bgColor,
      bgColor2,
      borderWidth,
      borderColor,
      shadowIntensity,
      playButtonColor,
      playButtonShape,
      showCreatorBranding,
    ],
  );

  return (
    <AppShell userEmail={userEmail} headerTitle="Modifier le popquiz" contentClassName="flex-1">
      <PageContainer>
      <PageBanner
        icon={<Video className="h-5 w-5" />}
        title={title || "Popquiz"}
        subtitle={
          isPublished
            ? "Publié — visible à l'adresse partagée."
            : "Brouillon — non visible publiquement."
        }
      />

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

          <ThumbnailPicker
            popquizId={popquiz.id}
            currentUrl={thumbnailUrl}
            currentSource={thumbnailSource}
            // Vignette custom dispo pour TOUTE source vidéo (upload,
            // YouTube, Vimeo, URL) — l'image se substitue au poster
            // automatique dès qu'elle est appliquée.
            enabled={true}
            onUpdated={({ source, thumbnailUrl: nextUrl }) => {
              setThumbnailSource(source);
              if (nextUrl) setThumbnailUrl(nextUrl);
            }}
          />


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

          {/* Badge de statut informatif (lecture seule). La publication
              passe désormais par les boutons d'action en bas de page,
              plus visibles et explicites. */}
          <div className="flex items-start gap-3 rounded-md border bg-muted/30 px-3 py-2">
            <span
              className={`mt-0.5 size-9 grid place-items-center rounded-full ${
                isPublished
                  ? "bg-emerald-500 text-white"
                  : "bg-muted text-muted-foreground"
              }`}
              aria-hidden
            >
              {isPublished ? (
                <Eye className="size-4" />
              ) : (
                <EyeOff className="size-4" />
              )}
            </span>
            <div className="flex-1">
              <p className="text-sm font-medium">
                {isPublished ? "Publié" : "Brouillon"}
              </p>
              <p className="text-xs text-muted-foreground">
                {isPublished
                  ? "Toute personne avec le lien peut voir la vidéo. Utilise « Dépublier » plus bas pour la cacher."
                  : "Personne d'autre que toi ne peut voir la vidéo. Utilise « Publier » plus bas pour la rendre visible."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* En dessous de l'info full-width : 2 colonnes — gauche
          personnalisation, droite la vidéo unique + timeline +
          marqueurs. Aucun tweak de margin/padding spécifique : on
          reste sur la grille standard de l'app. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
        {/* Colonne gauche : personnalisation. PopquizAppearanceForm
            est déjà un Card, donc on l'utilise tel quel. */}
        <PopquizAppearanceForm
          idPrefix="ed"
          displayTitle={displayTitle}
          displaySubtitle={displaySubtitle}
          bgStyle={bgStyle}
          bgColor={bgColor}
          bgColor2={bgColor2}
          borderWidth={borderWidth}
          borderColor={borderColor}
          shadowIntensity={shadowIntensity}
          playButtonColor={playButtonColor}
          playButtonShape={playButtonShape}
          showCreatorBranding={showCreatorBranding}
          setDisplayTitle={setDisplayTitle}
          setDisplaySubtitle={setDisplaySubtitle}
          setBgStyle={setBgStyle}
          setBgColor={setBgColor}
          setBgColor2={setBgColor2}
          setBorderWidth={setBorderWidth}
          setBorderColor={setBorderColor}
          setShadowIntensity={setShadowIntensity}
          setPlayButtonColor={setPlayButtonColor}
          setPlayButtonShape={setPlayButtonShape}
          setShowCreatorBranding={setShowCreatorBranding}
        />

        {/* Colonne droite : LA vidéo unique (avec apparence appliquée),
            timeline juste en dessous, puis liste des marqueurs.
            L'aperçu reflète l'apparence en temps réel. */}
        <Card className="overflow-hidden">
          <CardContent className="py-5 space-y-4">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <h2 className="text-base font-semibold">Aperçu de la vidéo</h2>
                <p className="text-[11px] text-muted-foreground">
                  Reflète l&apos;apparence en temps réel. Place les
                  marqueurs en cliquant sur la timeline.
                </p>
              </div>
              {/* Toggle direct/iframe — simule les 2 rendus côté visiteur. */}
              <div className="flex items-center gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => setPreviewMode("direct")}
                  className={`rounded-md border px-2 py-1 transition flex items-center gap-1 ${
                    previewMode === "direct"
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <LinkIcon className="size-3" />
                  Lien direct
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode("iframe")}
                  className={`rounded-md border px-2 py-1 transition flex items-center gap-1 ${
                    previewMode === "iframe"
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <SquareIcon className="size-3" />
                  Iframe
                </button>
              </div>
            </div>

            {/* Cadre rendu — fond/titre/sous-titre/branding seulement
                en mode "lien direct" (l'iframe reste épurée). */}
            <div
              className="rounded-md p-3"
              style={
                previewMode === "direct"
                  ? buildPageBackgroundStyle(previewPopquiz.appearance)
                  : { background: "transparent" }
              }
            >
              {/* Titre / sous-titre éditables INLINE — clique pour
                  modifier (toolbar : gras / italique / couleur /
                  alignement / lien). Apparaît seulement en mode
                  "lien direct" car ils ne s'affichent pas en iframe.
                  Le HTML produit est sanitisé côté public. */}
              {previewMode === "direct" ? (
                <div className="space-y-1 mb-2 text-center">
                  <RichTextEdit
                    value={displayTitle}
                    onChange={setDisplayTitle}
                    singleLine
                    placeholder="Clique pour ajouter un titre"
                    className="tiquiz-rich text-base font-bold text-white drop-shadow-sm"
                  />
                  <RichTextEdit
                    value={displaySubtitle}
                    onChange={setDisplaySubtitle}
                    singleLine
                    placeholder="Clique pour ajouter un sous-titre"
                    className="tiquiz-rich text-xs text-white/80"
                  />
                </div>
              ) : null}
              <div
                className={buildPlayerWrapperClassName(previewPopquiz.appearance)}
                style={buildPlayerWrapperStyle(previewPopquiz.appearance)}
              >
                <PopquizPlayer
                  popquiz={previewPopquiz}
                  onDurationChange={setDurationMs}
                  renderOverlay={({ cue, onSkipped }) => {
                    const linked = quizzes.find((q) => q.id === cue.quizId);
                    return (
                      <div className="absolute inset-0 grid place-items-center p-4">
                        <div className="max-w-sm w-full rounded-xl bg-white dark:bg-card shadow-2xl p-4 space-y-2">
                          <h4 className="text-sm font-semibold">
                            Marqueur à {formatMs(cue.timestampMs)} —{" "}
                            {linked?.title ?? "Quiz inconnu"}
                          </h4>
                          <p className="text-xs text-muted-foreground">
                            En lecture finale, le quiz s&apos;affichera ici.
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
              </div>
            </div>

            <TimelineStrip
              durationMs={durationMs}
              cues={cues}
              onAddAt={addCueAt}
              onRemove={removeCue}
              primaryColor={markerColor}
            />

            {/* Liste des marqueurs — sous la timeline, dans la même
                colonne droite. Permet d'éditer le quiz lié, le
                comportement et le timestamp finement. */}
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Marqueurs</h3>
                  <p className="text-[11px] text-muted-foreground">
                    Le quiz se déclenche à ce moment.
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
                <p className="text-xs text-muted-foreground py-3 text-center">
                  Aucun marqueur. Clique sur la timeline ou sur « Ajouter ».
                </p>
              ) : (
                <ul className="space-y-2">
                  {cues.map((cue) => {
                    const linked = quizzes.find((q) => q.id === cue.quizId);
                    const isDraftQuiz = linked && linked.status !== "active";
                    return (
                      <li
                        key={cue.localId}
                        className="flex flex-wrap items-center gap-2 rounded-md border p-2.5"
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
                          className="w-20"
                          aria-label="Timestamp en secondes"
                        />
                        <span className="text-xs text-muted-foreground">s</span>
                        <select
                          value={cue.quizId}
                          onChange={(e) =>
                            updateCue(cue.localId, { quizId: e.target.value })
                          }
                          className="flex-1 min-w-[160px] h-9 rounded-md border bg-background px-2 text-sm"
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
                          <span className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded">
                            Brouillon
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
            </div>
          </CardContent>
        </Card>
      </div>

      {/* On utilise l'état client (isPublished) plutôt que la prop
          server (popquiz.isPublished) pour que la carte de partage
          apparaisse IMMÉDIATEMENT après un clic sur "Publier". */}
      {isPublished ? (
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
                    <Check className="size-4 text-green-600 dark:text-green-400" />
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
                    <Check className="size-4 mr-2 text-green-600 dark:text-green-400" />
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

      {/* Barre d'actions contextualisée à l'état de publication.
          Gwenn 2026-05-04 : avant, un seul bouton "Enregistrer" et un
          toggle œil minuscule rendaient la publication non évidente.
          Nouveau : deux actions explicites côte à côte, dont la
          principale (Publier / Enregistrer modifs) en bouton primaire. */}
      <div className="flex flex-wrap items-center gap-2 justify-end">
        <Button
          variant="ghost"
          disabled={saving}
          onClick={() => router.push("/popquizzes")}
          type="button"
          className="mr-auto"
        >
          ← Retour à mes popquiz
        </Button>

        {isPublished ? (
          <>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => handleSave(false)}
              type="button"
              title="Repasser ce popquiz en brouillon (plus accessible publiquement)"
            >
              <EyeOff className="size-4 mr-2" />
              {saving ? "…" : "Dépublier"}
            </Button>
            <Button disabled={saving} onClick={() => handleSave(true)} type="button">
              <Save className="size-4 mr-2" />
              {saving ? "Enregistrement…" : "Enregistrer les modifications"}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => handleSave(false)}
              type="button"
              title="Sauvegarder en brouillon (pas encore visible publiquement)"
            >
              <Save className="size-4 mr-2" />
              {saving ? "…" : "Enregistrer brouillon"}
            </Button>
            <Button disabled={saving} onClick={() => handleSave(true)} type="button">
              <Sparkles className="size-4 mr-2" />
              {saving ? "Publication…" : "Publier"}
            </Button>
          </>
        )}
      </div>
      </PageContainer>
    </AppShell>
  );
}
