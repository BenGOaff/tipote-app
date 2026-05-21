// Post-build copy for Next.js standalone output.
//
// `output: "standalone"` ships everything the server needs in
// `.next/standalone/`, but Next does NOT copy `.next/static` (Webpack
// chunks) nor `public/` (static assets like favicon.png) into it —
// that responsibility is left to the deploy infra. We do it here so
// `pm2 start .next/standalone/server.js` Just Works.

const fs = require("fs");
const path = require("path");

function copyDir(srcRel, destRel, { required = true } = {}) {
  const src = path.join(process.cwd(), srcRel);
  const dest = path.join(process.cwd(), destRel);
  if (!fs.existsSync(src)) {
    if (required) {
      console.error(`❌ ${srcRel} introuvable`);
      process.exit(1);
    }
    console.log(`ℹ️  ${srcRel} absent (rien à copier)`);
    return;
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log(`✅ ${srcRel} → ${destRel}`);
}

copyDir(".next/static", ".next/standalone/.next/static");
copyDir("public", ".next/standalone/public", { required: false });
