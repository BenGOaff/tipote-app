// app/strategy/PyramidCard.tsx
"use client";

type OfferLevel = {
  name?: string;
  title?: string;
  description?: string;
  price?: string | number;
  price_range?: string;
};

export type OfferPyramid = {
  name?: string;
  label?: string;
  levels?: OfferLevel[];
  offers?: OfferLevel[];
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
  const levels =
    (pyramid.levels as OfferLevel[] | undefined) ||
    (pyramid.offers as OfferLevel[] | undefined) ||
    [];
  const displayName =
    pyramid.name || pyramid.label || `Scénario ${index + 1}`;

  return (
    <div
      className={`flex h-full flex-col rounded-2xl border bg-white p-4 shadow-sm ${
        highlight ? "border-[#a855f7] shadow-md" : "border-slate-200"
      }`}
    >
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

      {onChoose && (
        <button
          type="button"
          onClick={onChoose}
          className="mt-4 inline-flex items-center justify-center rounded-full bg-[#a855f7] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#9333ea]"
        >
          Choisir ce scénario
        </button>
      )}
    </div>
  );
}
