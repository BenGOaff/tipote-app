// lib/renderInlineMarkdown.tsx
// Minimal inline markdown renderer for chat messages: **bold**, *italic*,
// and line breaks. No full markdown dep — we only need enough to render
// what Haiku emits in short chat replies.

import React from "react";

type Token =
  | { type: "text"; value: string }
  | { type: "bold"; children: Token[] }
  | { type: "italic"; children: Token[] };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let buf = "";

  const flush = () => {
    if (buf) {
      tokens.push({ type: "text", value: buf });
      buf = "";
    }
  };

  while (i < input.length) {
    // Bold: **...**
    if (input[i] === "*" && input[i + 1] === "*") {
      const end = input.indexOf("**", i + 2);
      if (end !== -1) {
        flush();
        tokens.push({ type: "bold", children: tokenize(input.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    // Italic: *...*  (single, not part of **)
    if (input[i] === "*" && input[i + 1] !== "*") {
      // Find next lone * that's not part of **
      let end = -1;
      for (let j = i + 1; j < input.length; j++) {
        if (input[j] === "*" && input[j + 1] !== "*" && input[j - 1] !== "*") {
          end = j;
          break;
        }
      }
      if (end !== -1) {
        flush();
        tokens.push({ type: "italic", children: tokenize(input.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    buf += input[i];
    i++;
  }
  flush();
  return tokens;
}

function renderTokens(tokens: Token[], keyPrefix = ""): React.ReactNode[] {
  return tokens.map((tok, idx) => {
    const key = `${keyPrefix}-${idx}`;
    if (tok.type === "bold") {
      return <strong key={key}>{renderTokens(tok.children, key)}</strong>;
    }
    if (tok.type === "italic") {
      return <em key={key}>{renderTokens(tok.children, key)}</em>;
    }
    return <React.Fragment key={key}>{tok.value}</React.Fragment>;
  });
}

export function renderInlineMarkdown(text: string): React.ReactNode {
  if (!text) return null;
  // Preserve explicit line breaks by splitting first, then tokenizing each line
  const lines = text.split("\n");
  return lines.map((line, i) => (
    <React.Fragment key={i}>
      {renderTokens(tokenize(line), String(i))}
      {i < lines.length - 1 ? <br /> : null}
    </React.Fragment>
  ));
}
