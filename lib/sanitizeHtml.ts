// lib/sanitizeHtml.ts
// Server-side sanitization of html_snapshot to strip editor artifacts.
// Shared by PATCH handler (prevents dirty saves) and admin cleanup.

/**
 * Remove a <tag>...</tag> block from html starting at `tagStart`.
 * Handles nested tags of the same name correctly.
 * Returns the cleaned html string.
 */
function removeTagBlock(html: string, tagStart: number, tagName: string): string {
  const closeTag = `</${tagName}>`;
  const openTag = `<${tagName}`;
  const firstClose = html.indexOf(">", tagStart);
  if (firstClose === -1) return html;

  let depth = 1;
  let pos = firstClose + 1;
  while (depth > 0 && pos < html.length) {
    const nextOpen = html.indexOf(openTag, pos);
    const nextClose = html.indexOf(closeTag, pos);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = html.indexOf(">", nextOpen) + 1;
    } else {
      depth--;
      if (depth === 0) {
        return html.slice(0, tagStart) + html.slice(nextClose + closeTag.length);
      }
      pos = nextClose + closeTag.length;
    }
  }
  return html; // Couldn't find matching close — leave unchanged
}

/**
 * Strips all page-builder editor artifacts from an html_snapshot string.
 *
 * Targets artifacts by their ACTUAL signatures (class names, z-index, inline
 * styles, script content) — NOT just data-tipote-injected, since older
 * editor versions didn't add that attribute.
 */
export function sanitizeHtmlSnapshot(html: string): string {
  if (!html) return html;

  // ── 1. Remove editor <script> tags ──
  // Match scripts containing editor-specific code signatures.
  // We look for known unique strings that only appear in editor scripts.
  const SCRIPT_SIGNATURES = [
    "data-tipote-injected",
    "tipote-toolbar",
    "tipote:text-edit",
    "tipote:sections-list",
    "tipote:illust-",
    "tipote:section-click",
    "tipote:element-select",
  ];

  let searchFrom = 0;
  while (true) {
    const scriptStart = html.indexOf("<script", searchFrom);
    if (scriptStart === -1) break;
    const scriptClose = html.indexOf("</script>", scriptStart);
    if (scriptClose === -1) break;

    const scriptContent = html.slice(scriptStart, scriptClose + "</script>".length);
    const isEditorScript = SCRIPT_SIGNATURES.some((sig) => scriptContent.includes(sig));

    if (isEditorScript) {
      html = html.slice(0, scriptStart) + html.slice(scriptClose + "</script>".length);
      // Don't advance — content shifted
      continue;
    }
    searchFrom = scriptClose + "</script>".length;
  }

  // ── 2. Remove editor overlay divs ──
  // These are: toolbar, illust overlay, element highlight, section highlight.
  // They can be identified by class names or unique inline style patterns.
  const DIV_SIGNATURES = [
    'class="tipote-toolbar"',
    'class="tipote-illust-overlay"',
    "z-index: 99999",
    "z-index: 99998",
    "z-index: 99990",
    "z-index: 99989",
    "z-index:99999",
    "z-index:99998",
    "z-index:99990",
    "z-index:99989",
    // Also match the data-tipote-injected variant
    "data-tipote-injected",
  ];

  for (const sig of DIV_SIGNATURES) {
    let pos = 0;
    while (true) {
      const idx = html.indexOf(sig, pos);
      if (idx === -1) break;

      // Walk backward to find the opening tag
      let tagStart = html.lastIndexOf("<", idx);
      if (tagStart === -1) { pos = idx + 1; continue; }

      const tagSlice = html.slice(tagStart, tagStart + 20);
      const tagMatch = tagSlice.match(/^<(\w+)/);
      if (!tagMatch) { pos = idx + 1; continue; }

      const tagName = tagMatch[1].toLowerCase();
      if (tagName === "div" || tagName === "style") {
        const before = html.length;
        html = removeTagBlock(html, tagStart, tagName);
        if (html.length < before) continue; // Removed — scan from same position
      }
      pos = idx + 1;
    }
  }

  // ── 3. Remove data-tp-section-idx attributes ──
  html = html.replace(/\s*data-tp-section-idx="[^"]*"/g, "");

  // ── 4. Remove contenteditable attributes ──
  html = html.replace(/\s*contenteditable="[^"]*"/g, "");

  // ── 5. Remove editor-only inline styles ──
  html = html.replace(/cursor:\s*text;?\s*/g, "");
  html = html.replace(/outline:\s*none;?\s*/g, "");

  // ── 6. Clean up empty style attributes ──
  html = html.replace(/\s*style="[\s;]*"/g, "");

  return html;
}
