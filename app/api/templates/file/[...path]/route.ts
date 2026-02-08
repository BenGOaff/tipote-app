// app/api/templates/file/[...path]/route.ts
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

function getContentType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    case ".ttf":
      return "font/ttf";
    case ".otf":
      return "font/otf";
    default:
      return "application/octet-stream";
  }
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const { path: parts } = await ctx.params;

  // On ne sert QUE ce qui est dans src/templates
  const requested = parts.join("/"); // ex: src/templates/capture/capture-01/layout.html
  if (!requested.startsWith("src/templates/")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Sécurise contre ../
  const root = process.cwd();
  const abs = path.resolve(root, requested);
  const absTemplates = path.resolve(root, "src/templates");

  if (!abs.startsWith(absTemplates)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const contentType = getContentType(abs);
  const buf = fs.readFileSync(abs);

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      // preview rapide + assets OK
      "Cache-Control": "public, max-age=60",
    },
  });
}
