import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

type TemplateItem = {
  id: string;
  name: string;
  description: string;
  type: "capture" | "sales";
  layoutPath: string; // ex: src/templates/capture/capture-ads/layout.html
};

function prettifyName(folder: string) {
  // "capture-03-feel-good" -> "Capture 03 Feel Good"
  return folder
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim();
}

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function scanType(type: "capture" | "sales"): Promise<TemplateItem[]> {
  const baseDir = path.join(process.cwd(), "src", "templates", type);
  const out: TemplateItem[] = [];

  let dirs: string[] = [];
  try {
    dirs = await fs.readdir(baseDir);
  } catch {
    return [];
  }

  for (const dir of dirs) {
    const absTemplateDir = path.join(baseDir, dir);
    const stat = await fs.stat(absTemplateDir).catch(() => null);
    if (!stat?.isDirectory()) continue;

    const absLayout = path.join(absTemplateDir, "layout.html");
    if (!(await exists(absLayout))) continue;

    // Optionnel : si tu as un meta.json par template, on l’utilise
    // { "name": "...", "description": "..." }
    let name = prettifyName(dir);
    let description = "";

    const absMeta = path.join(absTemplateDir, "meta.json");
    if (await exists(absMeta)) {
      try {
        const metaRaw = await fs.readFile(absMeta, "utf-8");
        const meta = JSON.parse(metaRaw);
        if (typeof meta?.name === "string" && meta.name.trim()) name = meta.name.trim();
        if (typeof meta?.description === "string" && meta.description.trim()) description = meta.description.trim();
      } catch {
        // ignore
      }
    }

    const layoutPath = `src/templates/${type}/${dir}/layout.html`;
    out.push({
      id: `${type}:${dir}`,
      name,
      description,
      type,
      layoutPath,
    });
  }

  // tri stable
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export async function GET() {
  const [capture, sales] = await Promise.all([scanType("capture"), scanType("sales")]);
  return NextResponse.json({ capture, sales }, { status: 200 });
}
