"use client";

// Public preview page for the PopquizPlayer. Wired to a fake
// popquiz with two cues so the player can be exercised end-to-end
// before any DB rows exist or the editor is built.
//
// NOTE: Kept around even after /popquiz/new became the real editor
// because a previous merge from feature → main didn't propagate
// its deletion. The cleanest path is just to keep the demo working,
// up to date with the current Popquiz shape, until we get a chance
// to remove it again with a guaranteed-clean merge.

import { useState } from "react";
import { PopquizPlayer } from "@/components/popquiz/PopquizPlayer";
import type { PlayerEvent, Popquiz } from "@/lib/popquiz";

const DEMO: Popquiz = {
  id: "demo-1",
  slug: null,
  title: "Demo Popquiz",
  description: null,
  locale: "fr",
  isPublished: false,
  theme: {
    id: "preset-glass",
    name: "Glass",
    isPreset: true,
    isShared: true,
    config: {
      accent: "#20BBE6",
      bg: "rgba(255,255,255,0.10)",
      radius: "16px",
      backdrop: "blur(18px)",
    },
  },
  branding: {
    logoUrl: null,
    websiteUrl: null,
    primaryColor: null,
  },
  video: {
    id: "video-1",
    source: "youtube",
    externalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    externalId: "dQw4w9WgXcQ",
    storagePath: null,
    hlsPath: null,
    thumbnailUrl: null,
    durationMs: 213000,
    status: "ready",
  },
  cues: [
    {
      id: "cue-a",
      quizId: "demo-quiz",
      timestampMs: 8000,
      behavior: "block",
      displayOrder: 0,
    },
    {
      id: "cue-b",
      quizId: "demo-quiz",
      timestampMs: 30000,
      behavior: "optional",
      displayOrder: 1,
    },
  ],
};

export default function PopquizPreviewPage() {
  const [log, setLog] = useState<PlayerEvent[]>([]);

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Popquiz preview</h1>
        <p className="text-sm text-muted-foreground">
          Test du <code>PopquizPlayer</code> avec deux marqueurs fictifs
          (8 s bloquant, 30 s optionnel). Lance la lecture et laisse
          tourner.
        </p>
      </header>

      <PopquizPlayer
        popquiz={DEMO}
        onEvent={(e) => setLog((prev) => [...prev, e])}
        renderOverlay={({ cue, onAnswered, onSkipped }) => (
          <div className="p-6 space-y-4">
            <h2 className="text-lg font-semibold">
              Question fictive @ {(cue.timestampMs / 1000).toFixed(1)} s
            </h2>
            <p className="text-sm text-muted-foreground">
              Brancher ici le composant quiz existant. Ce placeholder
              démontre uniquement la mécanique pause / resume.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onAnswered({ choice: "demo" })}
                className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm"
              >
                Répondre
              </button>
              {cue.behavior === "optional" ? (
                <button
                  type="button"
                  onClick={onSkipped}
                  className="rounded-md border px-4 py-2 text-sm"
                >
                  Passer
                </button>
              ) : null}
            </div>
          </div>
        )}
      />

      <section className="rounded-lg border p-4">
        <h2 className="text-sm font-medium mb-2">Events</h2>
        {log.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun événement pour l&apos;instant.
          </p>
        ) : (
          <ul className="text-xs font-mono space-y-1">
            {log.map((e, i) => (
              <li key={i}>
                {e.at} — {e.type}
                {e.cueId ? ` (${e.cueId})` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
