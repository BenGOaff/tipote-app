/**
 * Shared utilities for content actions (copy to clipboard, download PDF, download Word).
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

// ---------------------------------------------------------------------------
// Word (.docx) export
// ---------------------------------------------------------------------------

/**
 * Decoupe le contenu genere en blocs (1 par email). Gere le format reel
 * (emails separes par une ligne "-----") ET un fallback JSON (tableau
 * d'objets {subject/objet, preheader, body, cta}) au cas ou la sortie
 * arriverait structuree.
 */
function parseEmailBlocks(text: string): string[] {
  try {
    const j = JSON.parse(text);
    if (Array.isArray(j) && j.length && typeof j[0] === "object") {
      return j
        .map((e: Record<string, unknown>) => {
          const pick = (...keys: string[]): string => {
            for (const k of keys) {
              const v = e[k];
              if (typeof v === "string" && v.trim()) return v.trim();
            }
            return "";
          };
          const subj = pick("subject", "objet", "object", "title", "titre");
          const pre = pick("preheader", "preheadr", "preview", "preheadeur");
          const body = pick("body", "content", "text", "corps", "message");
          const cta = pick("cta", "call_to_action", "callToAction");
          const parts: string[] = [];
          if (subj) parts.push(`Objet : ${subj}`);
          if (pre) parts.push(`Préheader : ${pre}`);
          if (body) parts.push(body);
          if (cta) parts.push(cta);
          return parts.join("\n");
        })
        .filter((b: string) => b.trim());
    }
  } catch {
    /* pas du JSON : on retombe sur le format texte "-----" */
  }
  return text
    .split(/\n\s*-{3,}\s*\n/g)
    .map((b) => b.trim())
    .filter(Boolean);
}

/** Nom de fichier sur (ascii, tirets), borne a 60 caracteres. */
function slugifyForFile(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "sequence-email"
  );
}

/**
 * Telecharge le contenu au format Word (.docx), propre et exploitable par un
 * utilisateur non technique. Chaque email devient une section : titre "Email
 * N", "Objet :" + objet en gras, "Préheader :" en gras, corps, et le CTA
 * final en gras. Le markdown **gras** eventuel est respecte. La librairie
 * docx est chargee a la demande (hors bundle principal) au moment du clic.
 */
export async function downloadAsDocx(content: string, title?: string): Promise<void> {
  const trimmed = (content ?? "").trim();
  if (!trimmed) return;

  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");
  const safeTitle =
    (title ?? "Contenu Tipote").replace(/[<>"]/g, "").trim() || "Contenu Tipote";

  // Transforme une ligne en runs, en gerant le **gras** inline et un gras
  // force optionnel (utilise pour le CTA final).
  const inlineRuns = (line: string, forceBold: boolean) => {
    const runs: InstanceType<typeof TextRun>[] = [];
    const re = /\*\*(.+?)\*\*/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      if (m.index > last) {
        runs.push(new TextRun({ text: line.slice(last, m.index), bold: forceBold }));
      }
      runs.push(new TextRun({ text: m[1], bold: true }));
      last = re.lastIndex;
    }
    if (last < line.length) {
      runs.push(new TextRun({ text: line.slice(last), bold: forceBold }));
    }
    if (runs.length === 0) runs.push(new TextRun({ text: line, bold: forceBold }));
    return runs;
  };

  const blocks = parseEmailBlocks(trimmed);
  const children: InstanceType<typeof Paragraph>[] = [];
  children.push(new Paragraph({ text: safeTitle, heading: HeadingLevel.HEADING_1 }));

  blocks.forEach((block, idx) => {
    if (blocks.length > 1) {
      children.push(new Paragraph({ text: `Email ${idx + 1}`, heading: HeadingLevel.HEADING_2 }));
    }
    const lines = block.split("\n");
    let lastNonEmpty = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim()) {
        lastNonEmpty = i;
        break;
      }
    }
    lines.forEach((rawLine, i) => {
      const line = rawLine.replace(/\s+$/, "");
      if (!line.trim()) {
        children.push(new Paragraph({ text: "" }));
        return;
      }
      const objet = line.match(/^\s*(Objet|Subject|Asunto|Oggetto|Betreff)\s*:\s*(.*)$/i);
      const pre = line.match(/^\s*(Pré-?header|Preheader|Vista previa|Anteprima)\s*:\s*(.*)$/i);
      if (objet) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `${objet[1]} : `, bold: true }),
              new TextRun({ text: objet[2], bold: true }),
            ],
          }),
        );
      } else if (pre) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `${pre[1]} : `, bold: true }),
              new TextRun({ text: pre[2] }),
            ],
          }),
        );
      } else {
        // Le CTA est la derniere ligne non vide du bloc : on la met en gras.
        children.push(new Paragraph({ children: inlineRuns(line, i === lastNonEmpty) }));
      }
    });
    if (idx < blocks.length - 1) children.push(new Paragraph({ text: "" }));
  });

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugifyForFile(safeTitle)}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
