"use client";

// Popquiz player — Vidstack MediaPlayer wrapped in our cue state
// machine and dressed in a custom YouTube/Vimeo-style chrome (no
// default Vidstack layout). Visual identity comes from the
// creator's brand colour via --pq-accent on the container.
//
// Layout:
//   • black rounded container with deep shadow
//   • full-area click-to-toggle play (z-1)
//   • visible glass play button at centre (decoration only)
//   • bottom controls auto-hide on idle via Controls.Root
//   • overlay layer at z-20 hosts the quiz iframe + close button
//
// Source-specific:
//   • YouTube / Vimeo — their native chrome is suppressed via URL
//     params so our custom layer is the only player UI.
//   • Upload — falls back to externalUrl when hlsPath isn't set
//     (always-the-case until the HLS pipeline lands). The signed
//     URL is hydrated server-side by lib/popquiz/repo.ts.
//
// Poster: shown before play starts and during buffering, sourced
// from popquiz.video.thumbnailUrl (auto-extracted on upload, set
// by oEmbed for YouTube/Vimeo when we add it).

import "@vidstack/react/player/styles/default/theme.css";

import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  MediaPlayer,
  MediaProvider,
  Controls,
  FullscreenButton,
  MuteButton,
  Poster,
  PlayButton,
  Time,
  TimeSlider,
  useMediaState,
  type MediaPlayerInstance,
} from "@vidstack/react";
import {
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import {
  initialSnapshot,
  reducer,
} from "@/lib/popquiz/state-machine";
import { applyThemeVars } from "@/lib/popquiz/theme";
import type {
  PlayerEvent,
  Popquiz,
  PopquizCue,
  PopquizVideo,
} from "@/lib/popquiz/types";

function DurationReporter({
  onChange,
}: {
  onChange: (durationMs: number) => void;
}) {
  const duration = useMediaState("duration");
  useEffect(() => {
    if (duration && duration > 0) onChange(Math.round(duration * 1000));
  }, [duration, onChange]);
  return null;
}

function CueMarkers({ cues }: { cues: PopquizCue[] }) {
  const duration = useMediaState("duration");
  if (!duration || duration <= 0) return null;
  return (
    <div className="absolute inset-y-0 left-0 right-0 pointer-events-none">
      {cues.map((c) => {
        const pct = (c.timestampMs / 1000 / duration) * 100;
        if (pct < 0 || pct > 100) return null;
        return (
          // Bigger, brighter cue markers (Gwenn UX feedback : les
          // anciens points 6px en bg accent étaient quasi-invisibles
          // sur la barre de progression). 10px + ring accent + glow
          // doux pour qu'on les repère sans loupe.
          <span
            key={c.id}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-2.5 rounded-full bg-white ring-[2px] ring-[var(--pq-accent,#5D6CDB)] shadow-[0_0_0_3px_rgba(93,108,219,0.25)]"
            style={{ left: `${pct}%` }}
            aria-hidden
          />
        );
      })}
    </div>
  );
}

function CenterPlayVisual() {
  const paused = useMediaState("paused");
  return (
    <div
      className={`absolute inset-0 grid place-items-center pointer-events-none transition-all duration-300 z-[5] ${
        paused ? "opacity-100 scale-100" : "opacity-0 scale-90"
      }`}
    >
      <span className="size-16 sm:size-20 rounded-full bg-white/15 backdrop-blur-md grid place-items-center shadow-2xl">
        <Play className="size-7 sm:size-9 text-white fill-white ml-1" />
      </span>
    </div>
  );
}

// Spinner overlay pendant le buffering (waiting=true). Vidstack
// expose cet état via useMediaState — discret, n'apparaît que quand
// le player attend des données. Évite l'effet « le player s'est figé »
// qu'on a sur les vidéos lourdes / connexions moyennes.
function BufferingOverlay() {
  const waiting = useMediaState("waiting");
  const paused = useMediaState("paused");
  if (!waiting || paused) return null;
  return (
    <div className="absolute inset-0 grid place-items-center pointer-events-none z-[6]">
      <span className="size-12 rounded-full bg-black/50 backdrop-blur-sm grid place-items-center shadow-xl">
        <Loader2 className="size-6 text-white animate-spin" />
      </span>
    </div>
  );
}

function PlayPauseSmall() {
  const paused = useMediaState("paused");
  return (
    <PlayButton className="size-9 grid place-items-center rounded-full hover:bg-white/15 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
      {paused ? (
        <Play className="size-4 text-white fill-white" />
      ) : (
        <Pause className="size-4 text-white fill-white" />
      )}
    </PlayButton>
  );
}

function MuteToggle() {
  const muted = useMediaState("muted");
  return (
    <MuteButton className="size-9 grid place-items-center rounded-full hover:bg-white/15 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
      {muted ? (
        <VolumeX className="size-4 text-white" />
      ) : (
        <Volume2 className="size-4 text-white" />
      )}
    </MuteButton>
  );
}

function FullscreenToggle() {
  const isFs = useMediaState("fullscreen");
  return (
    <FullscreenButton className="size-9 grid place-items-center rounded-full hover:bg-white/15 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
      {isFs ? (
        <Minimize2 className="size-4 text-white" />
      ) : (
        <Maximize2 className="size-4 text-white" />
      )}
    </FullscreenButton>
  );
}

function CustomControls({ cues }: { cues: PopquizCue[] }) {
  return (
    <Controls.Root className="absolute inset-0 pointer-events-none z-10">
      <Controls.Group className="absolute bottom-0 left-0 right-0 px-3 sm:px-4 pb-2 sm:pb-3 pt-12 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-auto opacity-0 data-[visible]:opacity-100 transition-opacity duration-300">
        <div className="relative">
          <TimeSlider.Root className="relative h-5 flex items-center group/scrub w-full select-none">
            <TimeSlider.Track className="relative h-1 w-full rounded-full bg-white/25 group-hover/scrub:h-1.5 transition-all">
              <TimeSlider.TrackFill className="absolute h-full rounded-full bg-[var(--pq-accent,#5D6CDB)]" />
              <TimeSlider.Progress className="absolute h-full rounded-full bg-white/35" />
            </TimeSlider.Track>
            <CueMarkers cues={cues} />
            <TimeSlider.Thumb className="absolute size-3 rounded-full bg-white shadow-lg opacity-0 group-hover/scrub:opacity-100 transition-opacity" />
          </TimeSlider.Root>
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <PlayPauseSmall />
          <div className="text-[11px] font-medium text-white/90 font-mono ml-1 tabular-nums">
            <Time type="current" />
            <span className="text-white/40 mx-1">/</span>
            <Time type="duration" />
          </div>
          <div className="flex-1" />
          <MuteToggle />
          <FullscreenToggle />
        </div>
      </Controls.Group>
    </Controls.Root>
  );
}

export interface PopquizPlayerProps {
  popquiz: Popquiz;
  onEvent?: (event: PlayerEvent) => void;
  onDurationChange?: (durationMs: number) => void;
  renderOverlay: (args: {
    cue: PopquizCue;
    onAnswered: (meta?: Record<string, unknown>) => void;
    onSkipped: () => void;
  }) => ReactNode;
}

export function PopquizPlayer({
  popquiz,
  onEvent,
  onDurationChange,
  renderOverlay,
}: PopquizPlayerProps) {
  const playerRef = useRef<MediaPlayerInstance>(null);
  const [snap, dispatch] = useReducer(reducer, undefined, initialSnapshot);

  const cues = useMemo(
    () => [...popquiz.cues].sort((a, b) => a.timestampMs - b.timestampMs),
    [popquiz.cues],
  );

  const containerStyle: CSSProperties = useMemo(
    () => applyThemeVars(popquiz.theme?.config ?? {}),
    [popquiz.theme],
  );

  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    if (snap.state === "quiz_open" && !p.paused) {
      p.pause();
    } else if (snap.state === "resuming" && p.paused) {
      void p.play().catch(() => {});
    }
  }, [snap.state]);

  const emittedCountRef = useRef(0);
  useEffect(() => {
    if (!onEvent) {
      emittedCountRef.current = snap.events.length;
      return;
    }
    const fresh = snap.events.slice(emittedCountRef.current);
    emittedCountRef.current = snap.events.length;
    for (const e of fresh) onEvent(e);
  }, [snap.events, onEvent]);

  const src = mediaSourceFor(popquiz.video);
  if (!src) {
    return (
      <div className="aspect-video w-full grid place-items-center bg-black text-white/70 text-sm rounded-2xl">
        Source vidéo indisponible.
      </div>
    );
  }

  const activeCue =
    snap.currentCueId !== null
      ? cues.find((c) => c.id === snap.currentCueId) ?? null
      : null;

  function dismissCue() {
    if (!activeCue) return;
    dispatch({ type: "QUIZ_ANSWERED", cueId: activeCue.id });
  }

  const posterUrl = popquiz.video.thumbnailUrl ?? undefined;

  return (
    <div
      className="popquiz-player relative w-full aspect-video overflow-hidden rounded-2xl bg-black shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]"
      style={containerStyle}
    >
      <MediaPlayer
        ref={playerRef}
        src={src}
        playsInline
        crossOrigin
        className="w-full h-full"
        onPlay={() => dispatch({ type: "PLAY" })}
        onPause={() => dispatch({ type: "PAUSE" })}
        onEnded={() => dispatch({ type: "ENDED" })}
        onTimeUpdate={(detail) => {
          dispatch({
            type: "TIME_UPDATE",
            ms: Math.floor(detail.currentTime * 1000),
            cues,
          });
        }}
      >
        <MediaProvider>
          {posterUrl ? (
            <Poster
              src={posterUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover bg-black"
            />
          ) : null}
        </MediaProvider>

        <PlayButton className="absolute inset-0 z-[1] cursor-pointer focus-visible:outline-none" />

        <CenterPlayVisual />
        <BufferingOverlay />
        <CustomControls cues={cues} />

        {onDurationChange ? (
          <DurationReporter onChange={onDurationChange} />
        ) : null}
      </MediaPlayer>

      {activeCue ? (
        <div
          className="absolute inset-0 z-20"
          style={{
            background: "var(--pq-bg, rgba(0,0,0,0.85))",
            backdropFilter: "var(--pq-backdrop, blur(12px))",
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Question Popquiz"
        >
          <button
            type="button"
            onClick={dismissCue}
            className="absolute top-3 right-3 z-30 size-9 rounded-full bg-white/95 hover:bg-white grid place-items-center text-foreground shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label="Reprendre la vidéo"
          >
            <X className="size-4" />
          </button>
          {renderOverlay({
            cue: activeCue,
            onAnswered: (meta) =>
              dispatch({
                type: "QUIZ_ANSWERED",
                cueId: activeCue.id,
                meta,
              }),
            onSkipped: () =>
              dispatch({ type: "QUIZ_SKIPPED", cueId: activeCue.id }),
          })}
        </div>
      ) : null}
    </div>
  );
}

function mediaSourceFor(video: PopquizVideo): string | null {
  switch (video.source) {
    case "youtube":
      return video.externalId
        ? `youtube/${video.externalId}?controls=0&modestbranding=1&rel=0&playsinline=1`
        : null;
    case "vimeo":
      return video.externalId
        ? `vimeo/${video.externalId}?controls=0&title=0&byline=0&portrait=0`
        : null;
    case "url":
      return video.externalUrl;
    case "upload":
      return video.hlsPath ?? video.externalUrl ?? null;
    default:
      return null;
  }
}
