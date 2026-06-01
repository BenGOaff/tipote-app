// lib/coach/render.ts
//
// Rendu HTML du brief hebdo en email. Le brief est déjà structuré
// (5 sections JSON) — on le formate proprement et on l'envoie via
// sendEmail (Resend).

import type { CoachBrief } from "@/lib/coach/briefSchema";

/**
 * Escape minimal pour insérer des contenus user-saisi-via-Claude dans
 * du HTML d'email. Le brief vient de Claude qui peut mentionner des
 * titres de quiz / posts user, donc on échappe pour la robustesse.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Convertit le brief structuré en HTML body pour sendEmail. Garde le
 * même style visuel que monthly-report (table sombre, accents emoji).
 */
export function renderBriefAsEmailBody(brief: CoachBrief): {
  subject: string;
  htmlBody: string;
  preheader: string;
} {
  const sections: string[] = [];

  // Headline en gros
  sections.push(
    `<div style="font-size:18px;line-height:1.5;font-weight:600;color:#2E386E;margin:0 0 16px;">${escapeHtml(brief.headline)}</div>`,
  );

  // Week recap
  sections.push(
    `<div style="font-size:15px;line-height:1.55;color:#333;margin:0 0 20px;">${escapeHtml(brief.week_recap).replace(/\n/g, "<br/>")}</div>`,
  );

  // Alerts (si présentes)
  if (brief.alerts.length > 0) {
    const alertLines = brief.alerts
      .map(
        (a) =>
          `<tr><td style="padding:6px 14px;font-size:24px;vertical-align:top;">⚠️</td><td style="padding:6px 14px;font-size:14px;color:#333;line-height:1.5;">${escapeHtml(a.message)}</td></tr>`,
      )
      .join("");
    sections.push(
      `<div style="font-size:12px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin:20px 0 8px;">À regarder cette semaine</div>` +
        `<table style="width:100%;border-collapse:collapse;background:#FEF3F2;border-radius:10px;overflow:hidden;">${alertLines}</table>`,
    );
  }

  // Recommendation
  sections.push(
    `<div style="font-size:12px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin:24px 0 8px;">Ma reco de la semaine</div>`,
  );
  sections.push(
    `<div style="font-size:15px;line-height:1.55;color:#2E386E;background:#F4F5FB;border-left:3px solid #5D6CDB;padding:12px 16px;border-radius:6px;">${escapeHtml(brief.recommendation)}</div>`,
  );

  // Wins
  if (brief.wins_to_celebrate.length > 0) {
    const winLines = brief.wins_to_celebrate
      .map(
        (w) =>
          `<tr><td style="padding:6px 14px;font-size:24px;vertical-align:top;">${escapeHtml(w.emoji)}</td><td style="padding:6px 14px;font-size:14px;color:#333;line-height:1.5;">${escapeHtml(w.title)}</td></tr>`,
      )
      .join("");
    sections.push(
      `<div style="font-size:12px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin:24px 0 8px;">À célébrer</div>` +
        `<table style="width:100%;border-collapse:collapse;background:#F0FDF4;border-radius:10px;overflow:hidden;">${winLines}</table>`,
    );
  }

  // Footer
  sections.push(
    `<div style="font-size:13px;color:#888;margin-top:28px;line-height:1.5;">— Tipote, ton copilote business.<br/>Ce brief est généré automatiquement chaque lundi. Tu peux désactiver dans tes préférences email.</div>`,
  );

  return {
    subject: `🌅 Ton brief du lundi — ${brief.headline.slice(0, 60)}`,
    htmlBody: sections.join(""),
    preheader: brief.recommendation.slice(0, 140),
  };
}
