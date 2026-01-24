// lib/prompts/content/index.ts
import { buildSocialPostPrompt, type SocialPostPromptParams } from "@/lib/prompts/content/socialPost";
import {
  buildVideoScriptPrompt,
  type VideoScriptPromptParams,
  type VideoDurationId,
  type VideoPlatform,
} from "@/lib/prompts/content/video";

export type PostBuildArgs = { type: "post" } & SocialPostPromptParams;
export type VideoBuildArgs = { type: "video" } & VideoScriptPromptParams;

// Backward compatible: permet encore de passer un prompt "déjà construit" depuis l'API
export type GenericBuildArgs = { type: string; prompt: string };

export type BuildPromptArgs = PostBuildArgs | VideoBuildArgs | GenericBuildArgs;

function isPostArgs(args: BuildPromptArgs): args is PostBuildArgs {
  if (!args || typeof args !== "object") return false;
  if ((args as any).type !== "post") return false;

  // On valide la présence minimale des champs requis par SocialPostPromptParams
  const platform = (args as any).platform;
  const theme = (args as any).theme;
  const subject = (args as any).subject;

  return typeof platform === "string" && typeof theme === "string" && typeof subject === "string";
}

function isVideoArgs(args: BuildPromptArgs): args is VideoBuildArgs {
  if (!args || typeof args !== "object") return false;
  if ((args as any).type !== "video") return false;

  const platform = (args as any).platform as VideoPlatform;
  const subject = (args as any).subject;
  const duration = (args as any).duration as VideoDurationId;

  const platformOk =
    platform === "youtube_long" || platform === "youtube_shorts" || platform === "tiktok" || platform === "reel";

  const durationOk =
    duration === "30s" ||
    duration === "60s" ||
    duration === "3min" ||
    duration === "5min" ||
    duration === "10min" ||
    duration === "15min+";

  return platformOk && typeof subject === "string" && subject.trim().length > 0 && durationOk;
}

export function buildPromptByType(args: PostBuildArgs): string;
export function buildPromptByType(args: VideoBuildArgs): string;
export function buildPromptByType(args: GenericBuildArgs): string;
export function buildPromptByType(args: BuildPromptArgs): string {
  if (isPostArgs(args)) {
    // ✅ Ici TS sait VRAIMENT que args === PostBuildArgs
    return buildSocialPostPrompt(args);
  }

  if (isVideoArgs(args)) {
    return buildVideoScriptPrompt(args);
  }

  if ("prompt" in args && typeof args.prompt === "string") return args.prompt;
  return "";
}
