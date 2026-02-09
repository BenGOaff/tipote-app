#!/usr/bin/env node
// scripts/add-kit-conditionals.mjs
// Adds <!-- IF --> / <!-- ENDIF --> conditionals to kit-systeme.html files.
// Wraps testimonial sections and legal link blocks.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "src", "templates");

let totalModified = 0;

function wrapTestimonialsSection(html) {
  // Already has IF testimonials? Skip.
  if (html.includes("<!-- IF testimonials -->")) return html;

  // Pattern 1: <section class="testimonial..."> ... </section>
  const sectionRegex = /(<section\s+class="[^"]*testimonial[^"]*"[^>]*>[\s\S]*?<\/section>)/gi;

  return html.replace(sectionRegex, (match) => {
    return `<!-- IF testimonials -->\n${match}\n  <!-- ENDIF testimonials -->`;
  });
}

function wrapLegalLinks(html) {
  // Already has IF legal_privacy_url wrapping footer-links? Skip.
  if (html.includes("<!-- IF legal_privacy_url -->") && html.includes("<!-- ENDIF legal_privacy_url -->")) return html;

  // Pattern: <div class="footer-links"> ... </div> containing legal links
  const footerLinksRegex = /(<div\s+class="footer-links">)([\s\S]*?)(<\/div>)/gi;

  return html.replace(footerLinksRegex, (match, open, inner, close) => {
    // Check if this contains legal/privacy/mentions/cgv links
    if (!inner.includes("legal_") && !inner.includes("footer_link")) return match;

    // Wrap the whole block
    let result = `<!-- IF legal_privacy_url -->\n    ${open}`;

    // Wrap individual links with IF conditionals
    // Pattern: <a href="{{something_url}}">text</a> or <a href="{{something_url}}">{{something_text}}</a>
    let processedInner = inner;

    // Wrap each <a> + preceding <span>|</span> pair with IF conditionals
    processedInner = processedInner.replace(
      /(\s*(?:<span>\|<\/span>\s*)?<a\s+href="\{\{([a-z_]+_url)\}\}">[^<]*<\/a>)/gi,
      (linkMatch, fullLink, urlKey) => {
        if (fullLink.includes(`<!-- IF ${urlKey} -->`)) return fullLink; // already wrapped
        return `\n      <!-- IF ${urlKey} -->${fullLink}<!-- ENDIF ${urlKey} -->`;
      }
    );

    result += processedInner + `\n    ${close}\n    <!-- ENDIF legal_privacy_url -->`;
    return result;
  });
}

const kinds = ["capture", "vente"];

for (const kind of kinds) {
  const kindDir = path.join(ROOT, kind);
  if (!fs.existsSync(kindDir)) continue;

  const templates = fs.readdirSync(kindDir).filter(d => {
    return fs.statSync(path.join(kindDir, d)).isDirectory();
  });

  for (const tplId of templates) {
    const kitPath = path.join(kindDir, tplId, "kit-systeme.html");
    if (!fs.existsSync(kitPath)) {
      console.log(`SKIP ${kind}/${tplId} — no kit-systeme.html`);
      continue;
    }

    let html = fs.readFileSync(kitPath, "utf-8");
    const originalHtml = html;

    // Check if template has testimonials in its schema
    const schemaPath = path.join(kindDir, tplId, "content-schema.json");
    let hasTestimonials = false;
    let hasLegalLinks = false;

    if (fs.existsSync(schemaPath)) {
      const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
      const fields = schema.fields || [];
      hasTestimonials = fields.some(f =>
        f.key.includes("testimonial") && (f.source === "user_or_ai" && f.fallback === "remove")
      );
      hasLegalLinks = fields.some(f =>
        (f.key.includes("legal_") || f.key.includes("footer_link")) && f.fallback === "empty"
      );
    }

    if (hasTestimonials) {
      html = wrapTestimonialsSection(html);
    }

    if (hasLegalLinks) {
      html = wrapLegalLinks(html);
    }

    if (html !== originalHtml) {
      fs.writeFileSync(kitPath, html, "utf-8");
      console.log(`DONE  ${kind}/${tplId} — added conditionals (testimonials: ${hasTestimonials}, legal: ${hasLegalLinks})`);
      totalModified++;
    } else {
      console.log(`OK    ${kind}/${tplId} — no changes needed`);
    }
  }
}

console.log(`\n=== ${totalModified} kit files modified ===`);
