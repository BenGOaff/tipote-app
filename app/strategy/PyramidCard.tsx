"use client";

type OfferLevel = {
  name?: string;
  title?: string;
  description?: string;
  price?: string | number;
  price_range?: string;
  level?: string;
};

export type OfferPyramid = {
  name?: string;
  label?: string;
  levels?: OfferLevel[];
  offers?: OfferLevel[];
  // Explications de scénario enrichies par l'IA
  why_relevant?: string;
  how_it_fits?: string;
  ideal_for?: string;
};

type PyramidCardProps = {
  pyramid: OfferPyramid;
  index: number;
  onChoose?: () => void;
  highlight?: boolean;
};

export default function PyramidCard({
  pyramid,
  index,
  onChoose,
  highlight,
}: PyramidCardProps) {
  const {
    name,
    label,
    levels: rawLevels,
    offers,
    why_relevant,
    how_it_fits,
    ideal_for,
  } = pyramid || {};

  const displayName = label || name || `Pyramide ${index + 1}`;

  // On tolère à la fois "levels" et "offers" pour être compatible
  const levels: OfferLevel[] =
    (rawLevels && rawLevels.length ? rawLevels : offers) ?? [];

  const whyText =
    why_relevant ||
    "Ce scénario propose une séquence d’offres cohérente avec ton business et ton niveau actuel.";
  const howText =
    how_it_fits ||
    "Cette pyramide s’intègre dans ton plan 30/90 jours en apportant une progression logique entre chaque offre.";
  const idealText =
    ideal_for ||
    "Adapté aux solopreneurs et petites équipes qui veulent structurer leurs offres sans complexifier leur système.";

  const barCount = 4;

  const isClickable = Boolean(onChoose);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!onChoose) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onChoose();
    }
  };

  return (
    <div
      className={`flex h-full flex-col rounded-2xl border bg-white p-4 shadow-sm transition ${
        highlight ? "border-[#a855f7] shadow-md" : "border-slate-200"
      } ${
        isClickable
          ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md"
          : ""
      }`}
      onClick={onChoose}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? handleKeyDown : undefined}
    >
      {/* En-tête */}
      <div className="mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Scénario {index + 1}
        </p>
        <h3 className="mt-1 text-sm font-semibold text-slate-900">
          {displayName}
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Séquence d&apos;offres progressive pour guider ton client idéal.
        </p>
      </div>

      {/* Bloc d'explications : pourquoi / comment / pour qui */}
      <div className="mb-4 grid gap-2 rounded-xl bg-slate-50 p-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Pourquoi ce scénario&nbsp;?
          </p>
          <p className="mt-0.5 text-[11px] text-slate-700">{whyText}</p>
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Comment il s&apos;intègre dans le plan&nbsp;?
          </p>
          <p className="mt-0.5 text-[11px] text-slate-700">{howText}</p>
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Idéal pour
          </p>
          <p className="mt-0.5 text-[11px] text-slate-700">{idealText}</p>
        </div>
      </div>

      {/* Visualisation de la pyramide + détails des niveaux */}
      <div className="flex flex-1 gap-3">
        {/* Colonne gauche : représentation visuelle en barres */}
        <div className="flex w-24 flex-col justify-between gap-1">
          {Array.from({ length: barCount }).map((_, idx) => {
            const reversedIndex = barCount - 1 - idx;
            const labelLevel =
              ["Lead Magnet", "Entrée", "Offre Core", "Premium"][reversedIndex];

            return (
              <div
                key={idx}
                className="h-4 rounded-full bg-slate-100"
                style={{
                  opacity: 1 - idx * 0.12,
                }}
              >
                <div className="h-full w-full rounded-full bg-[#a855f7]/70" />
                <span className="sr-only">{labelLevel}</span>
              </div>
            );
          })}
        </div>

        {/* Colonne droite : détail par niveau */}
        <div className="flex flex-1 flex-col gap-2">
          {levels.slice(0, 4).map((level, idx) => (
            <div
              key={idx}
              className="flex flex-col rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {["Lead Magnet", "Entrée", "Offre Core", "Premium"][idx] ||
                    `Niveau ${idx + 1}`}
                </span>
                {(level.price || level.price_range) && (
                  <span className="text-xs font-semibold text-slate-900">
                    {String(level.price || level.price_range)}
                  </span>
                )}
              </div>
              <p className="text-xs font-medium text-slate-900">
                {level.name || level.title || "Offre à définir"}
              </p>
              {level.description && (
                <p className="mt-0.5 text-[11px] text-slate-600">
                  {level.description}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bouton explicite (en plus du clic sur la carte) */}
      {onChoose && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation(); // évite le double appel si on clique le bouton
            onChoose();
          }}
          className="mt-4 inline-flex items-center justify-center rounded-full bg-[#a855f7] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#9333ea]"
        >
          Choisir ce scénario
        </button>
      )}
    </div>
  );
}
