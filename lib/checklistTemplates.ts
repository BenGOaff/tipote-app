// lib/checklistTemplates.ts
// Templates de checklist prédéfinis pour les tâches stratégiques.
// Chaque template contient un titre et une liste de sous-tâches à pré-remplir.

export interface ChecklistTemplate {
  id: string;
  label: string;
  description: string;
  items: string[];
}

/**
 * Templates disponibles.
 * Pour ajouter un template, il suffit d'ajouter une entrée ici.
 */
export const CHECKLIST_TEMPLATES: ChecklistTemplate[] = [
  // TODO: remplacer par les vrais templates
  {
    id: "lead-magnet",
    label: "Lead Magnet",
    description: "Créer un lead magnet de A à Z",
    items: [
      "Définir le problème précis résolu",
      "Choisir le format (PDF, vidéo, quiz…)",
      "Rédiger le contenu",
      "Créer le design / mise en page",
      "Mettre en place la page de capture",
      "Configurer l'email de livraison",
      "Tester le tunnel complet",
    ],
  },
  {
    id: "page-de-vente",
    label: "Page de vente",
    description: "Construire une page de vente qui convertit",
    items: [
      "Rédiger l'accroche / headline",
      "Lister les bénéfices clés",
      "Ajouter les preuves sociales",
      "Rédiger l'offre et le pricing",
      "Créer le CTA principal",
      "Ajouter la section FAQ",
      "Tester sur mobile",
    ],
  },
  {
    id: "tunnel-de-vente",
    label: "Tunnel de vente",
    description: "Mettre en place un tunnel complet",
    items: [
      "Définir les étapes du tunnel",
      "Créer la page de capture",
      "Configurer la séquence email",
      "Créer la page de vente",
      "Mettre en place le paiement",
      "Configurer la page de confirmation",
      "Tester le parcours de bout en bout",
    ],
  },
];

/** Retrouver un template par son id */
export function getTemplate(id: string): ChecklistTemplate | undefined {
  return CHECKLIST_TEMPLATES.find((t) => t.id === id);
}
