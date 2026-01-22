// lib/prompts/content/index.ts
import { buildSocialPostPrompt, type SocialPostPromptParams } from "@/lib/prompts/content/socialPost";

export type BuildPromptArgs =
  | ({ type: "post" } & SocialPostPromptParams)
  | { type: string; prompt: string };

export function buildPromptByType(args: BuildPromptArgs): string {
  if (args.type === "post") {
    return buildSocialPostPrompt(args);
  }

  if ("prompt" in args && typeof args.prompt === "string") return args.prompt;
  return "";
}
