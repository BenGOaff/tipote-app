// GET /api/cron/check-fiscal-thresholds
//
// Cron quotidien qui contrôle que les seuils fiscaux stockés dans
// `fiscal_thresholds` sont TOUJOURS présents dans les pages
// officielles (service-public.fr / urssaf.fr / impots.gouv.fr).
//
// Stratégie volontairement simple — on ne PARSE pas la page (trop
// fragile), on cherche juste la VALEUR exacte stockée en DB sous
// forme de string. Trois cas :
//
//   1. Toutes les valeurs sont retrouvées dans la page → silence
//      radio (rien d'urgent).
//   2. Une ou plusieurs valeurs ont disparu → email aux admins
//      Tipote ("vérifie tel seuil — la valeur 37 500 € n'est plus
//      dans la page X"). Béné met à jour manuellement via
//      /admin/compta/fiscal-thresholds.
//   3. La page elle-même est inaccessible → email aux admins
//      ("la page X retourne du 500, vérifier l'URL source").
//
// Auth : header X-Cron-Secret comme les autres crons Tipote.

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/email";
import { ADMIN_EMAILS } from "@/lib/adminEmails";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET?.trim() || "";

function isAuthorized(req: NextRequest): boolean {
  if (!CRON_SECRET) return false;
  const provided = req.headers.get("x-cron-secret")?.trim() || "";
  if (provided.length !== CRON_SECRET.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(CRON_SECRET));
}

interface ThresholdRow {
  id: string;
  country: string;
  fiscal_year: number;
  category: string;
  base_value: number;
  major_value: number | null;
  source_url: string | null;
}

interface CheckIssue {
  id: string;
  country: string;
  fiscal_year: number;
  category: string;
  source_url: string | null;
  reason: string;
  details: string;
}

// Regex unique pour normaliser tous les types d'espaces non-standard
// vers un espace simple : NBSP (U+00A0) et narrow NBSP (U+202F).
const NBSP_REGEX = /[  ]/g;

/** Construit toutes les variantes plausibles d'une valeur numérique
 *  qu'on pourrait trouver dans une page web FR ou EN. Couvre :
 *    85000, 85 000, 85,000, 85k.
 *  Toutes les variantes sont déjà normalisées (NBSP → espace standard)
 *  pour matcher contre un HTML lui aussi normalisé.
 */
function valueVariants(n: number): string[] {
  const integer = Math.round(n);
  const fr = integer.toLocaleString("fr-FR").replace(NBSP_REGEX, " ");
  const en = integer.toLocaleString("en-US");
  const variants = [
    String(integer), // "85000"
    fr, // "85 000"
    en, // "85,000"
    `${Math.round(integer / 1000)}k`, // "85k"
  ];
  return Array.from(new Set(variants));
}

/** Fetch + recherche string. Normalise le HTML pour matching robuste :
 *  espaces insécables → espace standard, balises HTML enlevées pour
 *  ne chercher que dans le texte visible. */
async function pageContainsValues(
  url: string,
  values: number[],
): Promise<{ ok: boolean; missing: number[]; status: number }> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        "User-Agent": "Tipote-FiscalCheck/1.0 (+https://tipote.com)",
      },
    });
    if (!res.ok) {
      return { ok: false, missing: values, status: res.status };
    }
    const html = await res.text();
    const normalized = html
      .replace(/<[^>]+>/g, " ")
      .replace(NBSP_REGEX, " ")
      .replace(/\s+/g, " ");

    const missing: number[] = [];
    for (const v of values) {
      const variants = valueVariants(v);
      const found = variants.some((variant) => normalized.includes(variant));
      if (!found) missing.push(v);
    }
    return { ok: missing.length === 0, missing, status: 200 };
  } catch {
    return {
      ok: false,
      missing: values,
      status: 0,
    };
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: thresholds, error } = await supabaseAdmin
    .from("fiscal_thresholds")
    .select("id, country, fiscal_year, category, base_value, major_value, source_url")
    .order("country", { ascending: true })
    .order("fiscal_year", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (thresholds ?? []) as ThresholdRow[];

  // On regroupe par source_url : pour la même page, on fait UNE seule
  // requête HTTP et on vérifie toutes les valeurs stockées qui s'y
  // réfèrent. Évite de spammer service-public.fr avec 3 requêtes
  // identiques pour 3 catégories qui pointent vers la même URL.
  const byUrl = new Map<string, ThresholdRow[]>();
  for (const r of rows) {
    if (!r.source_url) continue;
    const list = byUrl.get(r.source_url) ?? [];
    list.push(r);
    byUrl.set(r.source_url, list);
  }

  const issues: CheckIssue[] = [];
  let pagesChecked = 0;

  for (const [url, group] of byUrl) {
    pagesChecked += 1;
    const expectedValues = group.flatMap((r) =>
      [r.base_value, r.major_value].filter(
        (v): v is number => typeof v === "number" && v > 0,
      ),
    );

    const result = await pageContainsValues(url, expectedValues);
    if (result.status !== 200) {
      issues.push({
        id: group[0]!.id,
        country: group[0]!.country,
        fiscal_year: group[0]!.fiscal_year,
        category: "page_inaccessible",
        source_url: url,
        reason: result.status === 0 ? "fetch_error" : `http_${result.status}`,
        details: `La page ${url} a renvoyé ${result.status === 0 ? "une erreur réseau" : `HTTP ${result.status}`}. Vérifie que l'URL est encore valide.`,
      });
      continue;
    }
    if (!result.ok) {
      for (const r of group) {
        const localExpected = [r.base_value, r.major_value].filter(
          (v): v is number => typeof v === "number" && v > 0,
        );
        const localMissing = localExpected.filter((v) => result.missing.includes(v));
        if (localMissing.length > 0) {
          issues.push({
            id: r.id,
            country: r.country,
            fiscal_year: r.fiscal_year,
            category: r.category,
            source_url: url,
            reason: "value_missing_on_page",
            details: `Valeur(s) attendue(s) non trouvée(s) sur la page : ${localMissing
              .map((v) => `${v} €`)
              .join(", ")}. Le seuil a peut-être changé — va vérifier sur la page et mets à jour la valeur dans /admin/compta/fiscal-thresholds.`,
          });
        }
      }
    }
  }

  if (issues.length === 0) {
    return NextResponse.json({
      ok: true,
      pagesChecked,
      issues: [],
    });
  }

  // Email aux admins Tipote
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.tipote.com";
  const issueRows = issues
    .map(
      (i) =>
        `<tr>
          <td style="padding:8px;border-bottom:1px solid #eee;"><strong>${i.country} ${i.fiscal_year}</strong><br/><code style="font-size:11px;color:#666;">${i.category}</code></td>
          <td style="padding:8px;border-bottom:1px solid #eee;">${i.details}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;"><a href="${i.source_url ?? ""}" target="_blank" style="color:#5b6cff;">Voir la page</a></td>
        </tr>`,
    )
    .join("");

  const body = `
    <p>Le contrôle quotidien des seuils fiscaux a détecté <strong>${issues.length} anomalie(s)</strong>.
    Ça veut souvent dire qu'un seuil a changé sur la page officielle. Va vérifier
    et mets à jour la valeur dans
    <a href="${appUrl}/admin/compta/fiscal-thresholds" style="color:#5b6cff;">/admin/compta/fiscal-thresholds</a>.</p>

    <table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:12px;">
      <thead>
        <tr style="background:#f5f5f5;">
          <th style="padding:8px;text-align:left;border-bottom:1px solid #ddd;">Catégorie</th>
          <th style="padding:8px;text-align:left;border-bottom:1px solid #ddd;">Détail</th>
          <th style="padding:8px;text-align:left;border-bottom:1px solid #ddd;">Source</th>
        </tr>
      </thead>
      <tbody>${issueRows}</tbody>
    </table>

    <p style="margin-top:16px;font-size:12px;color:#888;">
      Tant que tu n'auras pas mis à jour la valeur, le dashboard compta
      des users continue d'afficher l'ancien chiffre — ça reste cohérent
      mais peut être désynchronisé avec la réalité fiscale.
    </p>`;

  let emailsSent = 0;
  for (const adminEmail of ADMIN_EMAILS) {
    const result = await sendEmail({
      to: adminEmail,
      subject: `⚠️ Seuils fiscaux Tipote — ${issues.length} valeur(s) à vérifier`,
      greeting: "Salut,",
      body,
      ctaLabel: "Mettre à jour les seuils",
      ctaUrl: `${appUrl}/admin/compta/fiscal-thresholds`,
      preheader: `${issues.length} seuil(s) à vérifier sur les pages officielles.`,
      locale: "fr",
      category: "admin_alert",
    });
    if (result.ok) emailsSent += 1;
  }

  return NextResponse.json({
    ok: true,
    pagesChecked,
    issues,
    emailsSent,
  });
}
