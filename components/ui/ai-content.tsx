import * as React from "react";

import { cn } from "@/lib/utils";

type AIContentMode = "auto" | "markdown" | "plain";

export interface AIContentProps {
  content?: string | null;
  /**
   * - auto: tente markdown si ça ressemble à du markdown, sinon texte simple
   * - markdown: force rendu markdown
   * - plain: force texte simple
   */
  mode?: AIContentMode;
  /**
   * Si true, le container devient scrollable.
   * Utile dans les modals/éditeurs pour éviter le débordement écran.
   */
  scroll?: boolean;
  /**
   * Max height Tailwind (ex: "70vh", "calc(100vh-220px)").
   * Appliqué uniquement si scroll=true.
   */
  maxHeight?: string;
  className?: string;
}

/**
 * Renderer léger "safe-ish" sans dépendance (pas de react-markdown installé dans le repo).
 * - Échappe le HTML user/IA
 * - Supporte : titres (#/##/###), gras (**), italique (*), listes (- / 1.), hr (---), code inline/backticks,
 *   code blocks ``` ```
 * - Rend en HTML contrôlé + classes Tailwind via sélecteurs.
 */
export function AIContent({
  content,
  mode = "auto",
  scroll = false,
  maxHeight,
  className,
}: AIContentProps) {
  const raw = (content ?? "").toString();

  if (!raw.trim()) {
    return (
      <div
        className={cn(
          "text-sm text-muted-foreground",
          scroll && "overflow-y-auto",
          className
        )}
        style={scroll && maxHeight ? ({ maxHeight } as React.CSSProperties) : undefined}
      >
        Aucun contenu.
      </div>
    );
  }

  const shouldMarkdown =
    mode === "markdown" ? true : mode === "plain" ? false : looksLikeMarkdown(raw);

  if (!shouldMarkdown) {
    return (
      <div
        className={cn(
          "whitespace-pre-wrap text-sm leading-6 text-foreground",
          scroll && "overflow-y-auto",
          className
        )}
        style={scroll && maxHeight ? ({ maxHeight } as React.CSSProperties) : undefined}
      >
        {raw}
      </div>
    );
  }

  const html = markdownToHtmlSafe(raw);

  return (
    <div
      className={cn(
        // Base container
        "text-foreground",
        // Typo + spacing (proche d'un rendu "prose" sans plugin)
        "text-sm leading-6",
        // Headings
        "[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-semibold",
        "[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold",
        "[&_h3]:mt-3 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold",
        // Paragraphs
        "[&_p]:my-2 [&_p]:text-sm [&_p]:leading-6",
        // Lists
        "[&_ul]:my-2 [&_ul]:ml-5 [&_ul]:list-disc",
        "[&_ol]:my-2 [&_ol]:ml-5 [&_ol]:list-decimal",
        "[&_li]:my-1",
        // HR
        "[&_hr]:my-4 [&_hr]:border-border",
        // Inline code + code blocks
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]",
        "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
        // Links (si jamais)
        "[&_a]:underline [&_a]:underline-offset-4",
        // Scroll behavior
        scroll && "overflow-y-auto",
        className
      )}
      style={scroll && maxHeight ? ({ maxHeight } as React.CSSProperties) : undefined}
      // HTML contrôlé via parser ci-dessous (on échappe d'abord, puis on insère nos tags)
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function looksLikeMarkdown(input: string) {
  // Heuristique simple : si on voit des patterns markdown classiques
  const s = input.trim();
  if (!s) return false;

  // headings / bold / lists / code fences / hr
  if (/(^|\n)\s{0,3}#{1,6}\s+\S/.test(s)) return true;
  if (/\*\*[^*]+\*\*/.test(s)) return true;
  if (/(^|\n)\s*[-*]\s+\S/.test(s)) return true;
  if (/(^|\n)\s*\d+\.\s+\S/.test(s)) return true;
  if (/(^|\n)\s*```/.test(s)) return true;
  if (/(^|\n)\s*---\s*(\n|$)/.test(s)) return true;

  // parfois l'IA met juste quelques ##
  if (s.includes("# ") || s.includes("## ") || s.includes("### ")) return true;

  return false;
}

function escapeHtml(text: string) {
  // Empêche injection HTML. On réinjecte ensuite uniquement des tags qu'on crée nous-mêmes.
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function markdownToHtmlSafe(md: string) {
  // 1) Normalise line endings
  const normalized = md.replaceAll("\r\n", "\n").replaceAll("\r", "\n");

  // 2) Extract code fences into placeholders (on évite que la suite transforme le contenu)
  const codeBlocks: string[] = [];
  const withFencePlaceholders = normalized.replace(
    /```([^\n]*)\n([\s\S]*?)```/g,
    (_m, _lang, code) => {
      const escaped = escapeHtml(code);
      const idx = codeBlocks.push(escaped) - 1;
      return `@@CODEBLOCK_${idx}@@`;
    }
  );

  // 3) Escape everything
  let safe = escapeHtml(withFencePlaceholders);

  // 4) Inline code `...` (sur texte déjà échappé)
  safe = safe.replace(/`([^`\n]+)`/g, (_m, code) => `<code>${code}</code>`);

  // 5) Bold / italic (simple, suffisant pour IA)
  // Bold: **text**
  safe = safe.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  // Italic: *text* (évite les ** déjà traités, et évite les listes)
  safe = safe.replace(/(^|[^\*])\*([^*\n]+)\*([^\*]|$)/g, "$1<em>$2</em>$3");

  // 6) Line-based parsing for headings, lists, hr, paragraphs
  const lines = safe.split("\n");
  const out: string[] = [];

  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      out.push("</ol>");
      inOl = false;
    }
  };

  const flushParagraph = (buffer: string[]) => {
    if (!buffer.length) return;
    const text = buffer.join(" ").trim();
    if (!text) return;
    out.push(`<p>${text}</p>`);
    buffer.length = 0;
  };

  const paragraphBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Blank line -> end paragraph / close lists where appropriate
    if (!line.trim()) {
      flushParagraph(paragraphBuffer);
      closeLists();
      continue;
    }

    // HR
    if (/^\s*---\s*$/.test(line)) {
      flushParagraph(paragraphBuffer);
      closeLists();
      out.push("<hr/>");
      continue;
    }

    // Headings (#, ##, ###)
    const h3 = line.match(/^\s*###\s+(.*)$/);
    if (h3) {
      flushParagraph(paragraphBuffer);
      closeLists();
      out.push(`<h3>${h3[1].trim()}</h3>`);
      continue;
    }
    const h2 = line.match(/^\s*##\s+(.*)$/);
    if (h2) {
      flushParagraph(paragraphBuffer);
      closeLists();
      out.push(`<h2>${h2[1].trim()}</h2>`);
      continue;
    }
    const h1 = line.match(/^\s*#\s+(.*)$/);
    if (h1) {
      flushParagraph(paragraphBuffer);
      closeLists();
      out.push(`<h1>${h1[1].trim()}</h1>`);
      continue;
    }

    // UL item (- / *)
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) {
      flushParagraph(paragraphBuffer);
      if (inOl) {
        out.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        out.push("<ul>");
        inUl = true;
      }
      out.push(`<li>${ul[1].trim()}</li>`);
      continue;
    }

    // OL item (1. 2. etc.)
    const ol = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (ol) {
      flushParagraph(paragraphBuffer);
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        out.push("<ol>");
        inOl = true;
      }
      out.push(`<li>${ol[2].trim()}</li>`);
      continue;
    }

    // Default: paragraph text (keep as buffer, handle hard line breaks by space)
    paragraphBuffer.push(line.trim());
  }

  flushParagraph(paragraphBuffer);
  closeLists();

  // 7) Re-inject code blocks placeholders
  let html = out.join("\n");
  html = html.replace(/@@CODEBLOCK_(\d+)@@/g, (_m, idxStr) => {
    const idx = Number(idxStr);
    const code = codeBlocks[idx] ?? "";
    return `<pre><code>${code}</code></pre>`;
  });

  return html;
}
