"use client";

import { Fragment } from "react";

// Lightweight renderer for short user-authored blurbs.
// Recognises: blank lines → paragraphs, leading "- " or "• " → bullet list.
// No HTML parsing, so content is always safe as React children.
export function RichParagraph({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const blocks: Array<{ kind: "p"; lines: string[] } | { kind: "ul"; items: string[] }> = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === "") {
      i++;
      continue;
    }
    const bulletMatch = /^(?:[-•*]\s+|•\s+)/u.exec(trimmed);
    if (bulletMatch) {
      const items: string[] = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (t === "") break;
        const m = /^(?:[-•*]\s+|•\s+)(.*)$/u.exec(t);
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      blocks.push({ kind: "ul", items });
    } else {
      const para: string[] = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (t === "") break;
        if (/^(?:[-•*]\s+|•\s+)/u.test(t)) break;
        para.push(lines[i]);
        i++;
      }
      blocks.push({ kind: "p", lines: para });
    }
  }

  return (
    <div className={className}>
      {blocks.map((b, bi) => {
        if (b.kind === "ul") {
          return (
            <ul key={bi} className="list-disc pl-5 space-y-1 text-left">
              {b.items.map((it, ii) => (
                <li key={ii}>{it}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi} className={bi > 0 ? "mt-3" : undefined}>
            {b.lines.map((ln, li) => (
              <Fragment key={li}>
                {ln}
                {li < b.lines.length - 1 ? <br /> : null}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
