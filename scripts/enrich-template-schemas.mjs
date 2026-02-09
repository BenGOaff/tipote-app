#!/usr/bin/env node
// scripts/enrich-template-schemas.mjs
// Enriches all content-schema.json files with source/fallback/inputType attributes.
// Run: node scripts/enrich-template-schemas.mjs

import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "src", "templates");

// --- Rules for assigning source/fallback/inputType ---

/** Keys that are ALWAYS user-provided */
const USER_KEYS = new Set([
  // Identity
  "about_name", "author_name", "trainer_name", "coach_name", "expert_name",
  "site_name", "site_name_root", "site_name_tld", "site_name_full", "brand_name",
  // Images
  "logo_image_url", "author_photo_url", "trainer_photo_url", "coach_photo_url",
  "about_image", "hero_image", "hero_visual",
  // Contact
  "contact_email", "contact_phone",
  // Legal
  "legal_mentions_url", "legal_privacy_url", "legal_cgv_url",
  "legal_mentions_text", "legal_privacy_text", "legal_cgv_text",
  "footer_link_1_url", "footer_link_1_label",
  "footer_link_2_url", "footer_link_2_label",
  "footer_link_3_url", "footer_link_3_label",
  // Dates (user knows their own dates)
  "hero_date", "badge_dates", "event_date",
  // Pricing (user sets their own prices)
  "price", "original_price", "offer_price", "payment_url", "checkout_url",
  "offer_price_old", "pricing_normal_price", "pricing_current_price",
  "price_label", "price_old", "price_current", "price_note", "price_main",
  "price_amount", "price_strike", "price_intro_text", "price_original",
  "price_usual", "price_tag", "price_detail",
  // Logos / brand names in footer/header (user provides their branding)
  "footer_logo", "footer_logo_italic", "footer_logo_accent", "footer_brand_name",
  "hero_logo", "bundle_logo", "logo_accent", "logo_text_italic",
  "method_section_logo",
  // Speaker/expert names
  "section_1_speaker_name",
  // Challenge/method/solution names (user decides their own branding)
  "challenge_name", "challenge_box_name",
  "method_name", "solution_name",
  "cta_section_price_title",
  // Recap branding
  "recap_bundle_name_intro", "recap_bundle_name_outro",
  // Press logos
  "press_logos",
]);

/** Keys that are user_or_ai with fallback: remove (optional sections) */
const USER_OR_AI_REMOVE_KEYS = new Set([
  "testimonials", "testimonial", "social_proof",
]);

/** Keys that are user_or_ai with fallback: generate */
const USER_OR_AI_GENERATE_KEYS = new Set([
  "logo_subtitle", "logo_text",
  "experts", "expert_list",
]);

/** Patterns for image fields */
const IMAGE_PATTERNS = [
  "_image_url", "_photo_url", "_image", "_visual", "_photo",
  "logo_image", "hero_image", "about_image",
];

/** Patterns for URL fields */
const URL_PATTERNS = [
  "_url", "_link",
];

/** Patterns for email fields */
const EMAIL_PATTERNS = [
  "_email", "contact_email",
];

function inferSource(key) {
  // Exact match
  if (USER_KEYS.has(key)) return "user";
  if (USER_OR_AI_REMOVE_KEYS.has(key)) return "user_or_ai";
  if (USER_OR_AI_GENERATE_KEYS.has(key)) return "user_or_ai";

  // Pattern match for user fields
  const k = key.toLowerCase();

  // Legal/footer links are always user
  if (k.startsWith("legal_") || k.startsWith("footer_link")) return "user";

  // Site name variants are user
  if (k.startsWith("site_name")) return "user";

  // Photo/image URLs are user
  for (const p of IMAGE_PATTERNS) {
    if (k.includes(p) || k.endsWith(p)) return "user";
  }

  // Names of people are user
  if ((k.includes("_name") || k.startsWith("name")) &&
      (k.includes("about") || k.includes("author") || k.includes("trainer") || k.includes("coach") || k.includes("expert"))) {
    return "user";
  }

  // Contact info is user
  for (const p of EMAIL_PATTERNS) {
    if (k.includes(p)) return "user";
  }

  // Dates are typically user (they know their own schedule)
  if (k.includes("_date") || k === "hero_date" || k === "badge_dates") return "user";

  // Prices are always user (they set their own pricing)
  if (k.startsWith("price") || k.includes("_price") || k.includes("pricing_")) return "user";

  // Footer logos / brand references are user
  if (k.startsWith("footer_logo") || k.startsWith("footer_brand")) return "user";

  // Testimonials-like arrays are user_or_ai
  if (k.includes("testimonial") || k === "reviews" || k === "social_proofs") return "user_or_ai";

  // Everything else is AI-generated
  return "ai";
}

function inferFallback(key, source) {
  if (source === "ai") return undefined; // AI always generates, no fallback needed

  const k = key.toLowerCase();

  if (source === "user_or_ai") {
    // Testimonials can be removed
    if (k.includes("testimonial") || k.includes("review") || k.includes("social_proof")) return "remove";
    // Other user_or_ai fields default to generate
    return "generate";
  }

  // source === "user"
  // Legal URLs: empty if not provided (sections hidden by IF conditionals)
  if (k.startsWith("legal_") || k.includes("_url") && (k.includes("legal") || k.includes("footer_link"))) return "empty";
  if (k.startsWith("footer_link")) return "empty";

  // Images: placeholder
  for (const p of IMAGE_PATTERNS) {
    if (k.includes(p)) return "placeholder";
  }

  // Contact: empty
  if (k.includes("email") || k.includes("phone")) return "empty";

  // Names, site names: placeholder
  return "placeholder";
}

function inferInputType(key, fieldType) {
  const k = key.toLowerCase();

  // Image URLs
  for (const p of IMAGE_PATTERNS) {
    if (k.includes(p)) return "image_url";
  }

  // URLs
  if (k.endsWith("_url") || k.includes("_link_url") || k === "payment_url" || k === "checkout_url") return "url";

  // Email
  for (const p of EMAIL_PATTERNS) {
    if (k.includes(p)) return "email";
  }

  // Don't set inputType for non-user fields or complex types
  return undefined;
}

function enrichField(field) {

  const key = field.key;
  const type = field.type || "string";

  const source = inferSource(key);
  const fallback = inferFallback(key, source);
  const inputType = (source !== "ai") ? inferInputType(key, type) : undefined;

  const enriched = { ...field };

  // Insert source right after type
  enriched.source = source;
  if (fallback) enriched.fallback = fallback;
  if (inputType) enriched.inputType = inputType;

  return enriched;
}

function enrichSchema(schema) {
  if (!schema || !Array.isArray(schema.fields)) return schema;

  return {
    ...schema,
    fields: schema.fields.map(enrichField),
  };
}

function reorderFieldKeys(field) {
  // Desired key order for readability
  const order = [
    "key", "label", "type", "source", "fallback", "inputType",
    "intention", "description", "examples",
    "minItems", "maxItems", "maxLength", "itemMaxLength",
    "fields", "itemSchema",
    "required",
  ];

  const result = {};
  for (const k of order) {
    if (k in field) result[k] = field[k];
  }
  // Any remaining keys not in order
  for (const k of Object.keys(field)) {
    if (!(k in result)) result[k] = field[k];
  }
  return result;
}

// --- Main ---

const kinds = ["capture", "vente"];

let totalModified = 0;

for (const kind of kinds) {
  const kindDir = path.join(ROOT, kind);
  if (!fs.existsSync(kindDir)) continue;

  const templates = fs.readdirSync(kindDir).filter(d => {
    return fs.statSync(path.join(kindDir, d)).isDirectory();
  });

  for (const tplId of templates) {
    const schemaPath = path.join(kindDir, tplId, "content-schema.json");
    if (!fs.existsSync(schemaPath)) {
      console.log(`SKIP ${kind}/${tplId} — no content-schema.json`);
      continue;
    }

    const raw = fs.readFileSync(schemaPath, "utf-8");
    let schema;
    try {
      schema = JSON.parse(raw);
    } catch (e) {
      console.log(`ERROR ${kind}/${tplId} — invalid JSON: ${e.message}`);
      continue;
    }

    const totalFields = (schema.fields || []).length;
    const skipIds = ["capture-01", "capture-02"]; // Already manually enriched
    if (skipIds.includes(tplId)) {
      console.log(`SKIP  ${kind}/${tplId} — manually enriched`);
      continue;
    }

    const enriched = enrichSchema(schema);

    // Reorder keys for readability
    enriched.fields = enriched.fields.map(reorderFieldKeys);

    const out = JSON.stringify(enriched, null, 2) + "\n";
    fs.writeFileSync(schemaPath, out, "utf-8");

    const userCount = enriched.fields.filter(f => f.source === "user").length;
    const uoaiCount = enriched.fields.filter(f => f.source === "user_or_ai").length;
    console.log(`DONE  ${kind}/${tplId} — ${totalFields} fields (user: ${userCount}, user_or_ai: ${uoaiCount}, ai: ${totalFields - userCount - uoaiCount})`);
    totalModified++;
  }
}

console.log(`\n=== ${totalModified} schemas modified ===`);
