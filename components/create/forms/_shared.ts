"use client";

export type CreateFormCommonProps = {
  onGenerate: (params: any) => Promise<string>;
  onSave: (payload: any) => Promise<void>;
  onClose: () => void;
  isGenerating: boolean;
  isSaving: boolean;
};

/**
 * On envoie un objet "context" au backend.
 * Ton backend Tipote peut l’ignorer si pas utilisé,
 * mais ça permet de brancher onboarding/persona/offres ensuite.
 */
export function buildTipoteContext(extra?: Record<string, any>) {
  return {
    // placeholders “propres” : à brancher ensuite sur tes vraies sources (onboarding/persona/offres)
    onboarding: undefined,
    persona: undefined,
    offers: undefined,
    ...extra,
  };
}
