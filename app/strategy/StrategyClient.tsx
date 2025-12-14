// app/strategy/StrategyClient.tsx

"use client";

import { useState, useTransition } from "react";
import PyramidChooser from "./PyramidChooser";
import type { OfferPyramid as PyramidType } from "./PyramidCard";

type AnyRecord = Record<string, unknown>;

type OfferLevel = {
  name?: string;
  title?: string;
  description?: string;
  price?: string | number;
  price_range?: string;
  type?: string;
};

type Props = {
  offerPyramids: AnyRecord[];
  initialSelectedIndex: number;
  initialSelectedPyramid?: AnyRecord;
};

function normalisePyramid(raw?: AnyRecord): PyramidType {
  if (!raw) {
    return {
      name: "",
      label: "",
      levels: [],
    };
  }

  const levels =
    (raw.levels as OfferLevel[] | undefined) ||
    (raw.offers as OfferLevel[] | undefined) ||
    [];

  return {
    name: (raw.name as string) || (raw.label as string) || "",
    label: (raw.label as string) || (raw.name as string) || "",
    levels,
  };
}

export default function StrategyClient({
  offerPyramids,
  initialSelectedIndex,
  initialSelectedPyramid,
}: Props) {
  const hasInitial = !!initialSelectedPyramid;

  const [mode, setMode] = useState<"choose" | "edit">(
    hasInitial ? "edit" : "choose",
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(
    hasInitial ? initialSelectedIndex ?? 0 : null,
  );
  const [draft, setDraft] = useState<PyramidType | null>(
    hasInitial ? normalisePyramid(initialSelectedPyramid) : null,
  );
  const [chooserOpen, setChooserOpen] = useState<boolean>(
    !hasInitial && offerPyramids.length > 0,
  );
  const [saving, startSaving] = useTransition();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const scenarios: PyramidType[] = offerPyramids.map((p) => normalisePyramid(p));

  function updateLevel(
    levelIndex: number,
    field: keyof OfferLevel,
    value: string,
  ) {
    if (!draft) return;
    setDraft((prev) => {
      if (!prev) return prev;
      const levels = [...(prev.levels || [])];
      if (!levels[levelIndex]) levels[levelIndex] = {};
      (levels[levelIndex] as OfferLevel)[field] = value;
      return { ...prev, levels };
    });
  }

  function updateName(value: string) {
    if (!draft) return;
    setDraft((prev) =>
      prev ? { ...prev, name: value, label: value } : prev,
    );
  }

  async function handleChoose(index: number, pyramid: PyramidType) {
    setStatusMessage(null);

    // Mise à jour optimiste : on ferme la popup et on passe en mode édition
    setSelectedIndex(index);
    setDraft(pyramid);
    setMode("edit");
    setChooserOpen(false);

    startSaving(async () => {
      try {
        const res = await fetch("/api/strategy/offer-pyramid", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selected_offer_pyramid_index: index,
            selected_offer_pyramid: pyramid,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error("Save pyramid error", body);
          setStatusMessage(
            body?.error ||
              "Erreur lors de la sauvegarde de la pyramide. Réessaie.",
          );
          return;
        }

        setStatusMessage("Pyramide choisie et sauvegardée ✅");
      } catch (e) {
        console.error(e);
        setStatusMessage("Erreur réseau. Réessaie.");
      }
    });
  }

  async function handleSave() {
    setStatusMessage(null);

    if (mode !== "edit" || draft == null || selectedIndex === null) {
      setStatusMessage(
        "Choisis d'abord un scénario de pyramide avant de le modifier.",
      );
      return;
    }

    startSaving(async () => {
      try {
        const res = await fetch("/api/strategy/offer-pyramid", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selected_offer_pyramid_index: selectedIndex,
            selected_offer_pyramid: draft,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error("Save pyramid error", body);
          setStatusMessage(
            body?.error ||
              "Erreur lors de la sauvegarde de la pyramide. Réessaie.",
          );
          return;
        }

        setStatusMessage("Modifications sauvegardées ✅");
      } catch (e) {
        console.error(e);
        setStatusMessage("Erreur réseau. Réessaie.");
      }
    });
  }

  const scenarioLabel = draft?.name || "";

  return (
    <>
      {/* MODAL de choix : visible tant qu'aucune pyramide n'est choisie */}
      <PyramidChooser
        open={mode === "choose" && chooserOpen}
        offerPyramids={scenarios}
        onClose={() => {
          // On ne permet pas vraiment de fermer sans choisir, mais on laisse le bouton au cas où
          setChooserOpen(false);
        }}
        onChoose={(idx, pyramid) => handleChoose(idx, normalisePyramid(pyramid))}
      />

      {/* Carte principale (édition) */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Pyramide d&apos;Offres
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              L&apos;offre de base, l&apos;offre coeur et l&apos;offre premium vont
              structurer tout ton contenu, ton tunnel et tes automatisations.
            </p>
            {mode === "choose" && (
              <p className="mt-2 text-xs font-semibold text-[#a855f7]">
                Commence par choisir un scénario dans la fenêtre qui s&apos;ouvre,
                puis personnalise les offres.
              </p>
            )}
            {mode === "edit" && (
              <p className="mt-2 text-xs text-slate-500">
                Tu peux ajuster les noms, descriptions et prix pour coller à ton
                business actuel.
              </p>
            )}
          </div>
        </div>

        {/* Récap scénario choisi / bouton de re-choix */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#f5f3ff] text-[11px] font-semibold text-[#7c3aed]">
              {selectedIndex !== null ? selectedIndex + 1 : "?"}
            </span>
            <div>
              <p className="font-medium text-slate-900">
                {scenarioLabel || "Aucune pyramide encore sélectionnée"}
              </p>
              <p className="text-[11px] text-slate-500">
                Scénarios générés automatiquement à partir de ton onboarding.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setMode("choose");
              setChooserOpen(true);
            }}
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Changer de scénario
          </button>
        </div>

        {mode === "edit" && draft && (
          <>
            {/* Nom global de la pyramide */}
            <div className="mb-4">
              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Nom de ta pyramide
              </label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none ring-0 focus:border-[#a855f7] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#a855f7]/30"
                value={scenarioLabel}
                onChange={(e) => updateName(e.target.value)}
                placeholder="Ex : Ascension Affiliation Success"
              />
            </div>

            {/* Niveaux d'offres */}
            <div className="grid gap-3 md:grid-cols-2">
              {["Lead Magnet", "Entrée", "Offre Core", "Premium"].map(
                (label, idx) => {
                  const level = (draft.levels || [])[idx] || {};
                  return (
                    <div
                      key={idx}
                      className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/80 p-3"
                    >
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Niveau {idx + 1} · {label}
                      </p>

                      <div className="space-y-2">
                        <div>
                          <label className="text-[11px] font-medium text-slate-600">
                            Nom de l&apos;offre
                          </label>
                          <input
                            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-[#a855f7] focus:outline-none focus:ring-2 focus:ring-[#a855f7]/30"
                            value={level.name ?? ""}
                            onChange={(e) =>
                              updateLevel(idx, "name", e.target.value)
                            }
                            placeholder="Ex : Atelier express, Offre signature..."
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-medium text-slate-600">
                            Description courte
                          </label>
                          <textarea
                            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-[#a855f7] focus:outline-none focus:ring-2 focus:ring-[#a855f7]/30"
                            rows={3}
                            value={level.description ?? ""}
                            onChange={(e) =>
                              updateLevel(idx, "description", e.target.value)
                            }
                            placeholder="À qui s'adresse cette offre ? Résultat principal, format..."
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[11px] font-medium text-slate-600">
                              Prix indicatif
                            </label>
                            <input
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-[#a855f7] focus:outline-none focus:ring-2 focus:ring-[#a855f7]/30"
                              value={
                                level.price !== undefined
                                  ? String(level.price)
                                  : ""
                              }
                              onChange={(e) =>
                                updateLevel(idx, "price", e.target.value)
                              }
                              placeholder="Ex : 47€, 997€..."
                            />
                          </div>

                          <div>
                            <label className="text-[11px] font-medium text-slate-600">
                              Fourchette / gamme
                            </label>
                            <input
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-[#a855f7] focus:outline-none focus:ring-2 focus:ring-[#a855f7]/30"
                              value={level.price_range ?? ""}
                              onChange={(e) =>
                                updateLevel(idx, "price_range", e.target.value)
                              }
                              placeholder="Ex : Offre d'entrée, coeur, premium..."
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                },
              )}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center justify-center rounded-lg bg-[#a855f7] px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-[#9333ea] disabled:opacity-60"
              >
                {saving ? "Sauvegarde..." : "Sauvegarder la pyramide"}
              </button>
            </div>
          </>
        )}

        {statusMessage && (
          <p className="mt-2 text-xs text-slate-600">{statusMessage}</p>
        )}
      </div>
    </>
  );
}
