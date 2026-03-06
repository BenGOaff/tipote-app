// lib/templates/render.ts
// Backward-compatible wrapper for renderTemplateHtml.
// Now delegates to the programmatic page builder (lib/pageBuilder.ts).
// Template files (src/templates/) are no longer used.

import { buildPage } from "@/lib/pageBuilder";

export type TemplateKind = "capture" | "vente" | "vitrine";
export type RenderMode = "preview" | "kit";

export type RenderTemplateRequest = {
  kind: TemplateKind;
  templateId: string;
  mode: RenderMode;
  variantId?: string | null;
  contentData: Record<string, any>;
  brandTokens?: Record<string, any> | null;
  locale?: string;
};

/**
 * Render a page HTML from content data.
 * Now delegates entirely to the programmatic page builder.
 * The kind/templateId/mode/variantId params are kept for API compatibility
 * but are no longer used for template file loading.
 */
export async function renderTemplateHtml(req: RenderTemplateRequest): Promise<{ html: string }> {
  const pageType = req.kind === "vente" ? "sales" : req.kind === "vitrine" ? "showcase" : "capture";

  const html = buildPage({
    pageType,
    contentData: req.contentData || {},
    brandTokens: req.brandTokens || null,
    locale: req.locale,
  });

  return { html };
}

/**
 * Backward-compat alias.
 */
export const renderTemplate = renderTemplateHtml;
