// lib/milestones.ts
// Server-side helper to detect and celebrate user milestones.
// Called after key actions (post published, lead captured, etc.)
// Creates in-app notification + optional email for major milestones.

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createNotification } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";

type MilestoneType =
  | "first_content_published"
  | "first_lead_captured"
  | "first_social_connected"
  | "strategy_complete"
  | "first_page_published"
  | "tenth_content_published"
  | "first_automation_active";

type MilestoneDef = {
  type: MilestoneType;
  icon: string;
  titles: Record<string, string>;
  bodies: Record<string, string>;
  emailSubjects?: Record<string, string>;
  actionUrl: string;
  actionLabels: Record<string, string>;
  sendEmail: boolean;
};

const MILESTONES: MilestoneDef[] = [
  {
    type: "first_content_published",
    icon: "🎉",
    titles: {
      fr: "Ton premier contenu est publié !",
      en: "Your first content is published!",
      es: "¡Tu primer contenido está publicado!",
      it: "Il tuo primo contenuto è pubblicato!",
    },
    bodies: {
      fr: "C'est un grand pas. La régularité est la clé — programme tes prochains posts.",
      en: "That's a big step. Consistency is key — schedule your next posts.",
      es: "Es un gran paso. La constancia es la clave.",
      it: "È un grande passo. La costanza è la chiave.",
    },
    emailSubjects: {
      fr: "🎉 Ton premier contenu est publié !",
      en: "🎉 Your first content is published!",
    },
    actionUrl: "/contents",
    actionLabels: { fr: "Mes contenus", en: "My content" },
    sendEmail: true,
  },
  {
    type: "first_lead_captured",
    icon: "🎯",
    titles: {
      fr: "Tu as capturé ton premier lead !",
      en: "You captured your first lead!",
      es: "¡Capturaste tu primer lead!",
      it: "Hai catturato il tuo primo lead!",
    },
    bodies: {
      fr: "Quelqu'un s'intéresse à ton offre. C'est le début de ta liste !",
      en: "Someone is interested in your offer. Your list is growing!",
      es: "Alguien se interesa en tu oferta.",
      it: "Qualcuno è interessato alla tua offerta.",
    },
    emailSubjects: {
      fr: "🎯 Premier lead capturé !",
      en: "🎯 First lead captured!",
    },
    actionUrl: "/leads",
    actionLabels: { fr: "Mes leads", en: "My leads" },
    sendEmail: true,
  },
  {
    type: "first_social_connected",
    icon: "🔗",
    titles: {
      fr: "Premier réseau social connecté !",
      en: "First social network connected!",
    },
    bodies: {
      fr: "Tu peux maintenant programmer tes publications automatiquement.",
      en: "You can now schedule your posts automatically.",
    },
    actionUrl: "/contents",
    actionLabels: { fr: "Créer un contenu", en: "Create content" },
    sendEmail: false,
  },
  {
    type: "strategy_complete",
    icon: "🏆",
    titles: {
      fr: "Ta stratégie est prête !",
      en: "Your strategy is ready!",
      es: "¡Tu estrategia está lista!",
      it: "La tua strategia è pronta!",
    },
    bodies: {
      fr: "L'IA a analysé ton profil et créé un plan d'action. Découvre tes prochaines étapes.",
      en: "AI analyzed your profile and created an action plan. Discover your next steps.",
      es: "La IA analizó tu perfil y creó un plan de acción.",
      it: "L'IA ha analizzato il tuo profilo e creato un piano d'azione.",
    },
    emailSubjects: {
      fr: "🏆 Ta stratégie Tipote est prête !",
      en: "🏆 Your Tipote strategy is ready!",
    },
    actionUrl: "/strategy",
    actionLabels: { fr: "Voir ma stratégie", en: "View my strategy" },
    sendEmail: true,
  },
  {
    type: "first_page_published",
    icon: "📄",
    titles: {
      fr: "Ta première page est en ligne !",
      en: "Your first page is live!",
    },
    bodies: {
      fr: "Partage le lien et commence à capturer des leads.",
      en: "Share the link and start capturing leads.",
    },
    actionUrl: "/pages",
    actionLabels: { fr: "Mes pages", en: "My pages" },
    sendEmail: false,
  },
  {
    type: "tenth_content_published",
    icon: "🔥",
    titles: {
      fr: "10 contenus publiés — tu es sur une lancée !",
      en: "10 posts published — you're on a roll!",
    },
    bodies: {
      fr: "La régularité paie. Continue comme ça !",
      en: "Consistency pays off. Keep going!",
    },
    actionUrl: "/contents",
    actionLabels: { fr: "Mes contenus", en: "My content" },
    sendEmail: false,
  },
  {
    type: "first_automation_active",
    icon: "⚡",
    titles: {
      fr: "Ta première automatisation est active !",
      en: "Your first automation is active!",
    },
    bodies: {
      fr: "Les commentaires déclencheront automatiquement tes réponses et DMs.",
      en: "Comments will automatically trigger your replies and DMs.",
    },
    actionUrl: "/automations",
    actionLabels: { fr: "Mes automatisations", en: "My automations" },
    sendEmail: false,
  },
];

/**
 * Checks and triggers a milestone for a user.
 * Idempotent: won't fire the same milestone twice (tracked via notifications meta).
 */
export async function checkMilestone(userId: string, type: MilestoneType, projectId?: string | null) {
  const def = MILESTONES.find((m) => m.type === type);
  if (!def) return;

  // Check if already triggered
  const { data: existing } = await supabaseAdmin
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "milestone")
    .contains("meta", { milestone: type })
    .limit(1);

  if (existing?.length) return; // Already celebrated

  // Get user locale
  const { data: profile } = await supabaseAdmin
    .from("business_profiles")
    .select("content_locale, first_name")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const locale = profile?.content_locale || "fr";
  const name = profile?.first_name || "";

  // Create in-app notification
  await createNotification({
    user_id: userId,
    project_id: projectId ?? null,
    type: "milestone",
    title: def.titles[locale] || def.titles.fr,
    body: def.bodies[locale] || def.bodies.fr,
    icon: def.icon,
    action_url: def.actionUrl,
    action_label: def.actionLabels[locale] || def.actionLabels.fr,
    meta: { milestone: type },
  });

  // Send email for major milestones (if user hasn't opted out)
  if (def.sendEmail && def.emailSubjects) {
    try {
      // Check milestone_emails preference
      const { data: prefs } = await supabaseAdmin
        .from("email_preferences")
        .select("milestone_emails")
        .eq("user_id", userId)
        .maybeSingle();

      if (prefs && prefs.milestone_emails === false) return;

      const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (!user?.email) return;

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.tipote.com";
      const greeting = name ? `${name},` : (locale === "fr" ? "Félicitations !" : "Congratulations!");

      await sendEmail({
        to: user.email,
        subject: def.emailSubjects[locale] || def.emailSubjects.fr,
        greeting,
        body: `${def.titles[locale] || def.titles.fr}<br/><br/>${def.bodies[locale] || def.bodies.fr}`,
        ctaLabel: def.actionLabels[locale] || def.actionLabels.fr,
        ctaUrl: `${appUrl}${def.actionUrl}`,
        locale,
      });
    } catch (err) {
      console.error(`[milestones] Email for ${type} failed:`, err);
    }
  }
}
