// lib/coach/briefSchema.ts
//
// JSON schema strict pour le brief hebdo Coach IA proactif. Passé à
// l'API Claude via `output_config.format = {type: "json_schema", ...}`
// (cf. skill claude-api). Garantit JSON valide sans markdown qui se
// faufile + valide la forme à l'arrivée.
//
// additionalProperties: false partout (requis par structured outputs).
// Pas de minLength / maxLength (non supportés par structured outputs —
// la longueur est cadrée par le system prompt côté qualitatif).

export interface CoachBrief {
  headline: string;
  week_recap: string;
  alerts: Array<{
    kind: string;
    message: string;
  }>;
  recommendation: string;
  wins_to_celebrate: Array<{
    emoji: string;
    title: string;
  }>;
}

export const COACH_BRIEF_JSON_SCHEMA = {
  type: "object" as const,
  properties: {
    headline: {
      type: "string",
      description:
        "Une phrase qui résume la semaine. Pas un titre marketing — un constat ancré dans les chiffres. 80-180 caractères.",
    },
    week_recap: {
      type: "string",
      description:
        "2 à 4 lignes décrivant ce qui s'est passé (production, leads, ventes, partages) avec les chiffres réels du contexte.",
    },
    alerts: {
      type: "array",
      description:
        "0 à 2 points qui nécessitent attention cette semaine. Tableau vide si rien d'urgent.",
      items: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            description:
              "Identifiant court du type d'alerte (ex 'social_disconnected', 'goal_behind', 'sleeping_quiz').",
          },
          message: {
            type: "string",
            description:
              "1 phrase décrivant l'alerte + l'action concrète attendue.",
          },
        },
        required: ["kind", "message"],
        additionalProperties: false,
      },
    },
    recommendation: {
      type: "string",
      description:
        "UNE seule reco actionnable pour cette semaine, la plus impactante d'après le contexte. Format : verbe + objet + CTA implicite.",
    },
    wins_to_celebrate: {
      type: "array",
      description:
        "1 à 3 wins récents (milestones, palier CA, top post, série de publication). Tableau vide si rien à célébrer.",
      items: {
        type: "object",
        properties: {
          emoji: {
            type: "string",
            description: "Emoji symbolisant le win (1 char).",
          },
          title: {
            type: "string",
            description: "Le win en 1 phrase courte.",
          },
        },
        required: ["emoji", "title"],
        additionalProperties: false,
      },
    },
  },
  required: [
    "headline",
    "week_recap",
    "alerts",
    "recommendation",
    "wins_to_celebrate",
  ],
  additionalProperties: false,
};
