// lib/pages/applySectionOrderToHtml.ts
// Bake a user's custom section ordering into a static html_snapshot.
//
// Why this exists:
// PageBuilder lets users drag-reorder sections in the live iframe;
// the resulting order is persisted in hosted_pages.section_order
// (per-device: { mobile: [], desktop: [] }). The editor applies it
// at runtime via CSS `order:N` rules injected into the iframe head
// (see PageBuilder.tsx ~line 971). The PUBLIC page (/p/[slug])
// renders the static html_snapshot which previously did NOT carry
// that CSS — so visitors saw the template's default ordering even
// after the creator had carefully laid out their funnel.
//
// This helper is the server-side mirror of the iframe runtime
// rule. We:
//   1) Auto-assign `tp-auto-section-{N}` ids to <section> tags that
//      don't have one — same scheme PageBuilder uses, so the
//      section_order arrays stay valid across the boundary.
//   2) Build the device-scoped CSS that puts each section at the
//      right `order:N`.
//   3) Inject <style id="tipote-section-order"> just before </head>
//      and ensure <body> is `display:flex; flex-direction:column`
//      so the `order` rules apply.
//
// Defensive: when section_order is empty / null, the html is
// returned untouched. Idempotent: if a previous tipote-section-
// order block exists it's replaced rather than duplicated.

export type SectionOrder = {
  mobile?: string[] | null;
  desktop?: string[] | null;
};

const STYLE_ID = "tipote-section-order";
const BODY_FLEX_HINT = "data-tipote-body-flex";

function buildOrderCss(order: SectionOrder): string {
  const m = Array.isArray(order.mobile) ? order.mobile.filter(Boolean) : [];
  const d = Array.isArray(order.desktop) ? order.desktop.filter(Boolean) : [];
  if (m.length === 0 && d.length === 0) return "";

  let css = "";
  if (m.length > 0) {
    css += "@media (max-width:899px){";
    m.forEach((id, i) => { css += `#${id}{order:${i + 1};}`; });
    css += "}";
  }
  if (d.length > 0) {
    css += "@media (min-width:900px){";
    d.forEach((id, i) => { css += `#${id}{order:${i + 1};}`; });
    css += "}";
  }
  return css;
}

/**
 * Walk the html string, find <section> tags, ensure each has an
 * id (auto-assign tp-auto-section-N when missing), return the
 * (possibly mutated) html.
 *
 * Regex-based on purpose: a real DOM parser would be ~100x slower
 * and require a heavy dep. The shape we're matching is well-known
 * (server-rendered <section ...> tags with no nested <section>),
 * and the rewrite is purely additive (only adds a new attribute
 * when absent), so the failure modes are bounded.
 */
function ensureSectionIds(html: string): string {
  let counter = 0;
  return html.replace(/<section\b([^>]*)>/g, (match, attrs: string) => {
    const idIdx = attrs.search(/\sid\s*=/i);
    counter += 1;
    if (idIdx !== -1) return match; // already has an id
    return `<section${attrs} id="tp-auto-section-${counter - 1}">`;
  });
}

/**
 * Inject (or replace) the section-order <style> block + the body
 * flex hint. Skips entirely when the order is empty so we never
 * touch a snapshot that doesn't need it.
 */
export function applySectionOrderToHtml(
  html: string,
  order: SectionOrder | null | undefined,
): string {
  if (!html || !order) return html;
  const css = buildOrderCss(order);
  if (!css) return html;

  // 1) Normalise section ids so the css selectors actually match.
  let out = ensureSectionIds(html);

  // 2) Drop any previous block we may have injected (idempotent).
  const existingStyleRe = new RegExp(
    `<style[^>]*id="${STYLE_ID}"[^>]*>[\\s\\S]*?<\\/style>`,
    "i",
  );
  out = out.replace(existingStyleRe, "");

  // 3) Make sure body uses flex so the 'order' property is honoured.
  //    We mark it with a data attribute so a future re-injection can
  //    detect we've already done this — never stack styles.
  if (!new RegExp(`<body\\b[^>]*${BODY_FLEX_HINT}`, "i").test(out)) {
    out = out.replace(
      /<body\b([^>]*)>/i,
      (_m, attrs: string) =>
        `<body${attrs} ${BODY_FLEX_HINT}="1" style="${
          ((attrs.match(/style="([^"]*)"/i)?.[1]) ?? "")
            .replace(/display\s*:\s*[^;]+;?/g, "")
            .replace(/flex-direction\s*:\s*[^;]+;?/g, "")
        }display:flex;flex-direction:column;">`.replace(/\s+>/, ">"),
    );
  }

  // 4) Inject the order CSS just before </head>. If the snapshot
  //    has no <head>, fall back to prepending to <body> wrapped in
  //    a <style> tag — still valid HTML5.
  const styleBlock = `<style id="${STYLE_ID}">${css}</style>`;
  if (/<\/head>/i.test(out)) {
    return out.replace(/<\/head>/i, `${styleBlock}</head>`);
  }
  if (/<body\b/i.test(out)) {
    return out.replace(/(<body\b[^>]*>)/i, `$1${styleBlock}`);
  }
  // Truly malformed input: append at the very start. Better than
  // silently dropping the user's customisation.
  return styleBlock + out;
}
