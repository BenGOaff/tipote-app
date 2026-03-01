// components/pages/renderClient.ts
// Client-side template rendering via API call.

export async function renderTemplateHtml(params: {
  kind: string;
  templateId: string;
  contentData: Record<string, any>;
  brandTokens?: Record<string, any> | null;
}): Promise<string> {
  try {
    const res = await fetch("/api/templates/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: params.kind,
        templateId: params.templateId,
        mode: "preview",
        contentData: params.contentData,
        brandTokens: params.brandTokens,
      }),
    });
    return await res.text();
  } catch {
    return "<html><body><p>Erreur de rendu</p></body></html>";
  }
}
