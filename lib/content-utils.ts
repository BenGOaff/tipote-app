/**
 * Shared utilities for content actions (copy to clipboard, download PDF).
 */

/**
 * Copy text to clipboard with fallback for older browsers.
 * Returns true on success, false on failure.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return false;

  try {
    await navigator.clipboard.writeText(trimmed);
    return true;
  } catch {
    // Fallback: hidden textarea + execCommand
    try {
      const textarea = document.createElement("textarea");
      textarea.value = trimmed;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Simple markdown-to-HTML converter for PDF rendering.
 * Handles: headings, bold, italic, lists, code blocks, horizontal rules, links.
 */
function markdownToHtml(md: string): string {
  let html = md
    // Escape HTML entities first
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks (``` ... ```)
  html = html.replace(/```[\s\S]*?```/g, (match) => {
    const code = match.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
    return `<pre style="background:#f4f4f5;padding:12px;border-radius:6px;font-size:13px;overflow-x:auto;"><code>${code}</code></pre>`;
  });

  // Process line by line
  const lines = html.split("\n");
  const result: string[] = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Headings
    if (trimmed.startsWith("### ")) {
      if (inList) { result.push("</ul>"); inList = false; }
      result.push(`<h3 style="font-size:16px;font-weight:700;margin:16px 0 8px;">${trimmed.slice(4)}</h3>`);
      continue;
    }
    if (trimmed.startsWith("## ")) {
      if (inList) { result.push("</ul>"); inList = false; }
      result.push(`<h2 style="font-size:18px;font-weight:700;margin:20px 0 8px;">${trimmed.slice(3)}</h2>`);
      continue;
    }
    if (trimmed.startsWith("# ")) {
      if (inList) { result.push("</ul>"); inList = false; }
      result.push(`<h1 style="font-size:22px;font-weight:700;margin:24px 0 12px;">${trimmed.slice(2)}</h1>`);
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(trimmed)) {
      if (inList) { result.push("</ul>"); inList = false; }
      result.push('<hr style="border:none;border-top:1px solid #e4e4e7;margin:16px 0;">');
      continue;
    }

    // List items
    if (/^[-*+]\s/.test(trimmed)) {
      if (!inList) { result.push('<ul style="padding-left:20px;margin:8px 0;">'); inList = true; }
      result.push(`<li style="margin:4px 0;">${inlineFormat(trimmed.replace(/^[-*+]\s/, ""))}</li>`);
      continue;
    }

    // Numbered list
    if (/^\d+[.)]\s/.test(trimmed)) {
      if (!inList) { result.push('<ol style="padding-left:20px;margin:8px 0;">'); inList = true; }
      result.push(`<li style="margin:4px 0;">${inlineFormat(trimmed.replace(/^\d+[.)]\s/, ""))}</li>`);
      continue;
    }

    // Close list if we hit a non-list line
    if (inList) { result.push("</ul>"); inList = false; }

    // Empty line
    if (!trimmed) {
      result.push("<br>");
      continue;
    }

    // Normal paragraph
    result.push(`<p style="margin:6px 0;line-height:1.6;">${inlineFormat(trimmed)}</p>`);
  }

  if (inList) result.push("</ul>");

  return result.join("\n");
}

function inlineFormat(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, '<code style="background:#f4f4f5;padding:2px 4px;border-radius:3px;font-size:13px;">$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#2563eb;text-decoration:underline;">$1</a>');
}

/**
 * Download content as PDF via the browser's print dialog.
 * Creates a hidden iframe with styled HTML content and triggers print().
 */
export function downloadAsPdf(content: string, title?: string): void {
  const trimmed = (content ?? "").trim();
  if (!trimmed) return;

  const htmlBody = markdownToHtml(trimmed);
  const safeTitle = (title ?? "Contenu Tipote").replace(/[<>"]/g, "");

  const fullHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>${safeTitle}</title>
  <style>
    @page { margin: 2cm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      color: #18181b;
      line-height: 1.6;
      max-width: 700px;
      margin: 0 auto;
      padding: 20px;
    }
    h1 { font-size: 22px; margin: 24px 0 12px; }
    h2 { font-size: 18px; margin: 20px 0 8px; }
    h3 { font-size: 16px; margin: 16px 0 8px; }
    .header {
      border-bottom: 2px solid #18181b;
      padding-bottom: 12px;
      margin-bottom: 24px;
    }
    .header h1 { margin: 0; font-size: 20px; }
    .header .meta { font-size: 12px; color: #71717a; margin-top: 4px; }
    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${safeTitle}</h1>
    <div class="meta">Généré avec Tipote &mdash; ${new Date().toLocaleDateString("fr-FR")}</div>
  </div>
  ${htmlBody}
</body>
</html>`;

  // Create hidden iframe, write content, trigger print
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-9999px";
  iframe.style.top = "0";
  iframe.style.width = "800px";
  iframe.style.height = "600px";
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    document.body.removeChild(iframe);
    return;
  }

  iframeDoc.open();
  iframeDoc.write(fullHtml);
  iframeDoc.close();

  // Wait for content to render, then print
  setTimeout(() => {
    try {
      iframe.contentWindow?.print();
    } catch {
      // Fallback: open in new window
      const win = window.open("", "_blank");
      if (win) {
        win.document.write(fullHtml);
        win.document.close();
        win.print();
      }
    }

    // Clean up iframe after a delay
    setTimeout(() => {
      try { document.body.removeChild(iframe); } catch { /* ignore */ }
    }, 1000);
  }, 300);
}
