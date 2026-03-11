// lib/checklistTemplates.ts
// Templates de checklist prédéfinis pour les tâches stratégiques.
// Les textes sont résolus via i18n (namespace "checklistTemplates").

export interface ChecklistTemplate {
  id: string;
  /** Nombre de sous-tâches dans le template */
  itemCount: number;
  /** Phase suggérée : "fondations" | "croissance" | "scale" */
  phase?: string;
}

/**
 * Templates disponibles.
 * Les labels, descriptions et items sont dans les fichiers de traduction
 * sous la clé "checklistTemplates.<id>.label", ".description", ".item_0" … ".item_N"
 */
export const CHECKLIST_TEMPLATES: ChecklistTemplate[] = [
  { id: "lead-magnet", itemCount: 7, phase: "fondations" },
  { id: "offre", itemCount: 9, phase: "fondations" },
  { id: "tunnel-de-vente", itemCount: 7, phase: "fondations" },
  { id: "affiliation", itemCount: 5, phase: "croissance" },
  { id: "challenge-webinaire", itemCount: 7, phase: "croissance" },
  { id: "contenu-recurrent", itemCount: 6, phase: "croissance" },
];

/** Retrouver un template par son id */
export function getTemplate(id: string): ChecklistTemplate | undefined {
  return CHECKLIST_TEMPLATES.find((t) => t.id === id);
}
