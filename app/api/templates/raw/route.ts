import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const relPath = searchParams.get("path");

  if (!relPath) {
    return new NextResponse("Missing path", { status: 400 });
  }

  const fullPath = path.join(process.cwd(), relPath);

  if (!fs.existsSync(fullPath)) {
    return new NextResponse("Template not found", { status: 404 });
  }

  const html = fs.readFileSync(fullPath, "utf-8");

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
