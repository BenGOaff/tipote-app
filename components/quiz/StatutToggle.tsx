"use client";

// components/quiz/StatutToggle.tsx
//
// L'INTERRUPTEUR ACTIF / DÉSACTIVÉ D'UN PROJET (retour client, 16
// septembre 2026), IDENTIQUE dans les deux dépôts (Tiquiz et Tipote).
//
// Il remplace le bouton "Publier" / "Désactiver" en tête des deux
// éditeurs. Le mot "Publier" décrivait un GESTE, et il fallait deviner
// l'état en lisant le libellé du bouton (un bouton qui dit "Publier" veut
// dire que le quiz est... hors ligne). Un interrupteur dit l'ÉTAT : vert
// et "Actif" quand le quiz est en ligne, gris et "Désactivé" sinon.
//
// Il ne décide de rien : `actif` vient du statut du quiz, `onToggle`
// est le même gestionnaire qu'avant (PATCH du statut, toast, confettis).
// Les libellés sont passés en props parce que les deux dépôts n'ont pas
// le même namespace de traduction.

type Props = {
  actif: boolean;
  onToggle: () => void;
  libelles: { on: string; off: string; onHint: string; offHint: string };
  disabled?: boolean;
};

export default function StatutToggle({ actif, onToggle, libelles, disabled }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={actif}
      onClick={onToggle}
      disabled={disabled}
      title={actif ? libelles.onHint : libelles.offHint}
      data-statut={actif ? "actif" : "desactive"}
      className={`shrink-0 inline-flex items-center gap-2 rounded-full border pl-1 pr-3 py-1 text-xs font-semibold transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
        actif
          ? "bg-emerald-500 border-emerald-500 text-white hover:bg-emerald-600"
          : "bg-muted border-border text-muted-foreground hover:bg-muted/70"
      }`}
    >
      {/* Le rail et le curseur : à droite quand c'est actif, à gauche sinon.
          LE CURSEUR PORTE UN `left` EXPLICITE (retour Béné, 16 septembre
          2026 : "le bouton actif est caché par le toggle"). Un élément
          `absolute` sans `left` garde sa position statique, et dans un
          rail `inline-block` posé dans un bouton `inline-flex` cette
          position n'est pas le bord gauche du rail : le curseur partait
          se poser SUR le mot "Actif". `left-0.5` + `translate-x-4` borne
          le curseur dans les 36 px du rail (2 + 16 + 16 = 34), exactement
          comme le `SettingsToggle` de la colonne de réglages, qui marche.
          Le libellé, lui, ne se coupe jamais (`whitespace-nowrap`). */}
      <span
        aria-hidden
        className={`relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors ${actif ? "bg-white/30" : "bg-foreground/15"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full shadow transition-transform ${
            actif ? "translate-x-4 bg-white" : "translate-x-0 bg-background"
          }`}
        />
      </span>
      <span className="whitespace-nowrap">{actif ? libelles.on : libelles.off}</span>
    </button>
  );
}
