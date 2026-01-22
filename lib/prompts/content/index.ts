// lib/prompts/content/index.ts
import { buildSocialPostPrompt, type SocialPostPromptParams } from "@/lib/prompts/content/socialPost";

export type PostBuildArgs = { type: "post" } & SocialPostPromptParams;
export type GenericBuildArgs = { type: string; prompt: string };
export type BuildPromptArgs = PostBuildArgs | GenericBuildArgs;

function isPostArgs(args: BuildPromptArgs): args is PostBuildArgs {
  if (!args || typeof args !== "object") return false;
  if ((args as any).type !== "post") return false;

  // On valide la présence minimale des champs requis par SocialPostPromptParams
  const platform = (args as any).platform;
  const theme = (args as any).theme;
  const subject = (args as any).subject;

  return typeof platform === "string" && typeof theme === "string" && typeof subject === "string";
}

export function buildPromptByType(args: PostBuildArgs): string;
export function buildPromptByType(args: GenericBuildArgs): string;
export function buildPromptByType(args: BuildPromptArgs): string {
  if (isPostArgs(args)) {
    // ✅ Ici TS sait VRAIMENT que args === PostBuildArgs
    return buildSocialPostPrompt(args);
  }

  if ("prompt" in args && typeof args.prompt === "string") return args.prompt;
  return "";
}
