// lib/sanitizeHtml.ts
// Server-side sanitization of html_snapshot to strip editor artifacts.
// Shared by PATCH handler (prevents dirty saves) and admin cleanup.

/**
 * Strips all page-builder editor artifacts from an html_snapshot string.
 * This is the server-side equivalent of the client-side cleanup in PublicPageClient.
 */
export function sanitizeHtmlSnapshot(html: string): string {
  if (!html) return html;

  // 1. Remove <script> tags with data-tipote-injected (index-based, not regex)
  let searchFrom = 0;
  while (true) {
    const scriptStart = html.indexOf("<script", searchFrom);
    if (scriptStart === -1) break;
    const tagEnd = html.indexOf(">", scriptStart);
    if (tagEnd === -1) break;
    const tagContent = html.slice(scriptStart, tagEnd + 1);
    if (tagContent.includes("data-tipote-injected")) {
      const scriptClose = html.indexOf("</script>", tagEnd);
      if (scriptClose !== -1) {
        html = html.slice(0, scriptStart) + html.slice(scriptClose + "</script>".length);
        continue;
      }
    }
    searchFrom = tagEnd + 1;
  }

  // 2. Remove <div> elements with data-tipote-injected (toolbar, highlights, overlays)
  //    Use index-based approach to handle nested divs correctly.
  searchFrom = 0;
  while (true) {
    const idx = html.indexOf("data-tipote-injected", searchFrom);
    if (idx === -1) break;

    // Walk backward to find the opening <div or <style tag
    let tagStart = html.lastIndexOf("<", idx);
    if (tagStart === -1) { searchFrom = idx + 1; continue; }

    const tagSlice = html.slice(tagStart, idx + 30);
    const tagMatch = tagSlice.match(/^<(\w+)/);
    if (!tagMatch) { searchFrom = idx + 1; continue; }

    const tagName = tagMatch[1].toLowerCase();

    if (tagName === "div" || tagName === "style") {
      // Find the matching closing tag — handle nesting for div
      const closeTag = `</${tagName}>`;
      let depth = 1;
      let pos = html.indexOf(">", idx) + 1;
      while (depth > 0 && pos < html.length) {
        const nextOpen = html.indexOf(`<${tagName}`, pos);
        const nextClose = html.indexOf(closeTag, pos);
        if (nextClose === -1) break;
        if (nextOpen !== -1 && nextOpen < nextClose) {
          depth++;
          pos = nextOpen + tagName.length + 1;
        } else {
          depth--;
          if (depth === 0) {
            html = html.slice(0, tagStart) + html.slice(nextClose + closeTag.length);
            // Don't advance searchFrom — content shifted
            break;
          }
          pos = nextClose + closeTag.length;
        }
      }
      if (depth > 0) {
        // Couldn't find proper close — just skip
        searchFrom = idx + 1;
      }
    } else {
      searchFrom = idx + 1;
    }
  }

  // 3. Remove data-tp-section-idx attributes
  html = html.replace(/\s*data-tp-section-idx="[^"]*"/g, "");

  // 4. Remove contenteditable attributes
  html = html.replace(/\s*contenteditable="[^"]*"/g, "");

  // 5. Remove editor-only inline styles
  html = html.replace(/cursor:\s*text;?\s*/g, "");
  html = html.replace(/outline:\s*none;?\s*/g, "");

  // 6. Clean up empty style attributes
  html = html.replace(/\s*style="[\s;]*"/g, "");

  return html;
}
