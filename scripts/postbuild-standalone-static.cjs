const fs = require("fs");
const path = require("path");

const src = path.join(process.cwd(), ".next/static");
const dest = path.join(process.cwd(), ".next/standalone/.next/static");

if (!fs.existsSync(src)) {
  console.error("❌ .next/static introuvable");
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(path.dirname(dest), { recursive: true });

fs.cpSync(src, dest, { recursive: true });

console.log("✅ .next/static copié vers .next/standalone/.next/static");
