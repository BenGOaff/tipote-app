// Shared domain types for the popquiz feature.
// Kept framework-agnostic so the future @tipote/popquiz package
// can re-export them without a Next.js or Tailwind dependency.

export type VideoSource = "youtube" | "vimeo" | "url" | "upload";

export type VideoStatus = "pending" | "transcoding" | "ready" | "failed";

export type CueBehavior = "block" | "optional";

export interface PopquizVideo {
  id: string;
  source: VideoSource;
  externalUrl: string | null;
  externalId: string | null;
  storagePath: string | null;
  hlsPath: string | null;
  thumbnailUrl: string | null;
  durationMs: number | null;
  status: VideoStatus;
}

export interface PopquizCue {
  id: string;
  quizId: string;
  timestampMs: number;
  behavior: CueBehavior;
  displayOrder: number;
}

export interface PopquizThemeConfig {
  accent?: string;
  bg?: string;
  radius?: string;
  "controls-height"?: string;
  backdrop?: string;
  font?: string;
  [key: string]: string | undefined;
}

export interface PopquizTheme {
  id: string;
  name: string;
  config: PopquizThemeConfig;
  isPreset: boolean;
  isShared: boolean;
}

// Branding resolved from the creator's profile (and, in a future
// pass, optional per-popquiz overrides). Threaded all the way down
// to the player so it can paint the accent colour, render an inline
// logo, and surface the creator's site link.
export interface PopquizBranding {
  logoUrl: string | null;
  websiteUrl: string | null;
  primaryColor: string | null;
}

export interface Popquiz {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  locale: string;
  isPublished: boolean;
  video: PopquizVideo;
  theme: PopquizTheme | null;
  branding: PopquizBranding;
  cues: PopquizCue[];
}

// Runtime player state. Transitions are driven by the reducer in
// state-machine.ts, never by setState calls scattered across the
// component tree.
export type PlayerState =
  | "idle"
  | "playing"
  | "quiz_open"
  | "resuming"
  | "ended";

export type PlayerEventType =
  | "started"
  | "cue_reached"
  | "quiz_answered"
  | "quiz_skipped"
  | "completed"
  | "abandoned";

export interface PlayerEvent {
  type: PlayerEventType;
  cueId?: string;
  timestampMs: number;
  at: string;
  meta?: Record<string, unknown>;
}
