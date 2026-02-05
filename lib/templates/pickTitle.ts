export function pickTitleFromContentData(contentData: Record<string, any> | null | undefined): string | null {
  if (!contentData || typeof contentData !== "object") return null;

  const candidates = ["title", "headline", "hero_title", "heroTitle", "h1"];
  for (const k of candidates) {
    const v = (contentData as any)[k];
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 120);
  }

  // fallback: first non-empty string field
  for (const [k, v] of Object.entries(contentData)) {
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 120);
  }

  return null;
}
