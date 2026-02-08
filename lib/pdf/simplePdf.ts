// lib/pdf/simplePdf.ts
// Minimal, dependency-free PDF generator (single page, Helvetica) for plain text exports.
// Works in the browser (client-side) and can be used to create a downloadable .pdf blob.

function escapePdfText(s: string): string {
  // Escape PDF string literals
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function normalizeText(input: string): string {
  return String(input ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, "  ");
}

export function textToPdfBytes(opts: { title?: string; text: string }): Uint8Array {
  const title = (opts.title ?? "Tipote").trim() || "Tipote";
  const text = normalizeText(opts.text);

  // Page settings
  const pageWidth = 595.28; // A4 width in points
  const pageHeight = 841.89; // A4 height in points
  const margin = 48;
  const fontSize = 11;
  const leading = 15;

  const maxLineWidth = pageWidth - margin * 2;

  // Approx text width for Helvetica (rough): 0.5 * fontSize per char.
  // We'll do a simple word wrap with that approximation.
  const approxCharWidth = fontSize * 0.52;

  const wrapLine = (line: string): string[] => {
    const words = line.split(/\s+/).filter(Boolean);
    if (!words.length) return [""];

    const lines: string[] = [];
    let current = words[0];

    for (let i = 1; i < words.length; i++) {
      const w = words[i];
      const candidate = `${current} ${w}`;
      const candidateWidth = candidate.length * approxCharWidth;

      if (candidateWidth <= maxLineWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = w;
      }
    }
    lines.push(current);
    return lines;
  };

  const rawLines = text.split("\n");
  const wrapped: string[] = [];

  // Title line
  wrapped.push(title);
  wrapped.push("");

  for (const l of rawLines) {
    wrapped.push(...wrapLine(l));
  }

  // Fit in one page (MVP): if too long, truncate with a note.
  const usableHeight = pageHeight - margin * 2;
  const maxLines = Math.floor(usableHeight / leading);

  let finalLines = wrapped;
  if (wrapped.length > maxLines) {
    finalLines = wrapped.slice(0, Math.max(0, maxLines - 2));
    finalLines.push("");
    finalLines.push("… (document tronqué, exporte aussi le texte complet en .txt si besoin)");
  }

  // Build a simple PDF with:
  // - 1 page
  // - 1 font (Helvetica)
  // - content stream with text lines
  const contentLines: string[] = [];
  contentLines.push("BT");
  contentLines.push("/F1 11 Tf");
  contentLines.push(`${margin} ${pageHeight - margin} Td`);

  // First line (title): slightly larger
  contentLines.push("/F1 14 Tf");
  contentLines.push(`(${escapePdfText(finalLines[0] ?? "")}) Tj`);
  contentLines.push("T*");
  contentLines.push("/F1 11 Tf");

  for (let i = 1; i < finalLines.length; i++) {
    const line = finalLines[i] ?? "";
    contentLines.push(`(${escapePdfText(line)}) Tj`);
    contentLines.push("T*");
  }

  contentLines.push("ET");

  // Set leading (line height): use TL
  // We'll inject TL after setting font; easiest is to rebuild with TL.
  // Replace beginning after BT:
  const rebuilt: string[] = [];
  rebuilt.push("BT");
  rebuilt.push(`/F1 11 Tf`);
  rebuilt.push(`${leading} TL`);
  rebuilt.push(`${margin} ${pageHeight - margin} Td`);
  rebuilt.push("/F1 14 Tf");
  rebuilt.push(`(${escapePdfText(finalLines[0] ?? "")}) Tj`);
  rebuilt.push("T*");
  rebuilt.push("/F1 11 Tf");
  for (let i = 1; i < finalLines.length; i++) {
    rebuilt.push(`(${escapePdfText(finalLines[i] ?? "")}) Tj`);
    rebuilt.push("T*");
  }
  rebuilt.push("ET");

  const stream = rebuilt.join("\n");
  const streamBytes = new TextEncoder().encode(stream);

  const objects: Array<{ id: number; content: Uint8Array | string }> = [];

  // 1: Catalog
  objects.push({
    id: 1,
    content: `<< /Type /Catalog /Pages 2 0 R >>`,
  });

  // 2: Pages
  objects.push({
    id: 2,
    content: `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
  });

  // 3: Page
  objects.push({
    id: 3,
    content: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
  });

  // 4: Font
  objects.push({
    id: 4,
    content: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
  });

  // 5: Content stream
  const streamHeader = `<< /Length ${streamBytes.length} >>\nstream\n`;
  const streamFooter = `\nendstream`;
  objects.push({
    id: 5,
    content: concatBytes(new TextEncoder().encode(streamHeader), streamBytes, new TextEncoder().encode(streamFooter)),
  });

  // Build xref
  const chunks: Uint8Array[] = [];
  const pushStr = (s: string) => chunks.push(new TextEncoder().encode(s));
  const offsets: number[] = [0]; // object 0

  pushStr("%PDF-1.4\n%\u00E2\u00E3\u00CF\u00D3\n");

  let cursor = byteLength(chunks);

  for (const obj of objects) {
    offsets[obj.id] = cursor;
    const header = `${obj.id} 0 obj\n`;
    const footer = `\nendobj\n`;
    pushStr(header);
    if (typeof obj.content === "string") {
      pushStr(obj.content);
    } else {
      chunks.push(obj.content);
    }
    pushStr(footer);
    cursor = byteLength(chunks);
  }

  const xrefOffset = cursor;
  const maxObjId = Math.max(...objects.map((o) => o.id));

  pushStr("xref\n");
  pushStr(`0 ${maxObjId + 1}\n`);
  // object 0
  pushStr(`0000000000 65535 f \n`);
  for (let i = 1; i <= maxObjId; i++) {
    const off = offsets[i] ?? 0;
    pushStr(`${String(off).padStart(10, "0")} 00000 n \n`);
  }

  pushStr("trailer\n");
  pushStr(`<< /Size ${maxObjId + 1} /Root 1 0 R >>\n`);
  pushStr("startxref\n");
  pushStr(`${xrefOffset}\n`);
  pushStr("%%EOF\n");

  return concatBytes(...chunks);
}

function byteLength(chunks: Uint8Array[]): number {
  return chunks.reduce((acc, c) => acc + c.length, 0);
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
