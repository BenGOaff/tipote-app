import * as fs from "node:fs";
import * as path from "node:path";

const root = process.cwd();

const source = path.join(root, ".next", "static");
const target = path.join(root, ".next", "standalone", ".next", "static");

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    console.error("[postbuild] Source static folder not found:", src);
    process.exit(1);
  }

  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log("[postbuild] Copying .next/static -> .next/standalone/.next/static");
fs.rmSync(target, { recursive: true, force: true });
copyRecursive(source, target);
console.log("[postbuild] Static assets copied successfully");
