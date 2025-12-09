"use client";

import PyramidCard, { OfferPyramid } from "./PyramidCard";

type PyramidChooserProps = {
  open: boolean;
  offerPyramids: OfferPyramid[];
  onClose: () => void;
  onChoose: (index: number, pyramid: OfferPyramid) => void;
};

export default function PyramidChooser({
  open,
  offerPyramids,
  onClose,
  onChoose,
}: PyramidChooserProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justifycenter bg-black/40">
      <div className="mx-4 max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Choix de ta pyramide d&apos;offres
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">
              Voici 3 propositions de séquences d&apos;offres progressives
            </h2>
            <p className="mt-2 text-xs text-slate-600">
              Choisis celle qui te semble la plus alignée avec ton business. Tu
              pourras ensuite modifier le nom, le prix et la description de
              chaque offre, mais tu ne pourras plus changer de scénario global.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            Fermer
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {offerPyramids.slice(0, 3).map((p, idx) => (
            <PyramidCard
              key={idx}
              index={idx}
              pyramid={p}
              highlight={idx === 0}
              onChoose={() => onChoose(idx, p)}
            />
          ))}
        </div>

        <p className="mt-4 text-[11px] text-slate-500">
          Astuce : pense à la place de chaque offre dans ton écosystème :
          attirer (lead magnet), engager (entrée), transformer (offre core),
          scaler (premium).
        </p>
      </div>
    </div>
  );
}
