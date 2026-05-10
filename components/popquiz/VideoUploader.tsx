"use client";

// Direct video upload widget. Production-grade pipeline:
//
//   1. Probe the file client-side via a hidden <video> element to pull
//      duration + a poster frame at t=2s (or 10% of duration). Pure
//      client work, no roundtrip.
//   2. Ask the backend (/api/popquiz/upload-token) for two short-lived
//      tus tokens — one for the source file, one for the thumbnail —
//      both bound to the same freshly-minted videoId.
//   3. Resumable upload of source + thumbnail via tus-js-client to our
//      self-hosted tus server (tus.<app>.com → nginx → /opt/popquiz-tus
//      → /srv/popquiz-videos/...). Survives network drops, retries
//      with exponential backoff, exposes byte-level progress.
//   4. Surface a temporary preview URL signed by the same backend.
//
// The host (PopquizNewClient) gets back the storage paths + duration.
// The API stores the paths; lib/popquiz/repo.ts mints fresh nginx
// secure_link URLs at fetch time so the player never has to know
// about the storage layout.

import { useEffect, useRef, useState } from "react";
import * as tus from "tus-js-client";
import { CheckCircle2, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

export interface UploadedVideo {
  // tipote/raw/<auth.uid>/<videoId>/source.<ext>
  path: string;
  // tipote/raw/<auth.uid>/<videoId>/thumbnail.jpg — null if extraction failed.
  thumbnailPath: string | null;
  fileName: string;
  // Short-lived signed URL the editor preview streams from. Server
  // mints its own when serving the public play page.
  signedUrl: string;
  thumbnailUrl: string | null;
  durationMs: number | null;
  bytes: number;
}

interface ProbeResult {
  thumb: Blob | null;
  durationMs: number | null;
}

interface UploadTokenResponse {
  ok: boolean;
  videoId: string;
  uploadUrl: string;
  source: {
    token: string;
    expiresAt: number;
    ext: string;
    storagePath: string;
  };
  thumbnail: {
    token: string;
    expiresAt: number;
    ext: string;
    storagePath: string;
  } | null;
  error?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} Go`;
}

async function probeFile(file: File): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    video.src = url;
    let durationMs: number | null = null;

    const cleanup = () => URL.revokeObjectURL(url);

    video.onloadedmetadata = () => {
      durationMs = isFinite(video.duration)
        ? Math.round(video.duration * 1000)
        : null;
      video.currentTime = Math.min(2, Math.max(0.1, video.duration * 0.1));
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        const w = video.videoWidth || 640;
        const h = video.videoHeight || 360;
        canvas.width = 640;
        canvas.height = Math.round((h / w) * 640);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          cleanup();
          return resolve({ thumb: null, durationMs });
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            cleanup();
            resolve({ thumb: blob, durationMs });
          },
          "image/jpeg",
          0.85,
        );
      } catch {
        cleanup();
        resolve({ thumb: null, durationMs });
      }
    };

    video.onerror = () => {
      cleanup();
      resolve({ thumb: null, durationMs: null });
    };
  });
}

// Resumable upload helper. Wraps tus.Upload in a Promise so the main
// flow can `await` it and we can inject byte-level progress without
// callbacks bleeding into the UI state machine.
function tusUpload({
  file,
  endpoint,
  token,
  onProgress,
  uploadRef,
}: {
  file: File | Blob;
  endpoint: string;
  token: string;
  onProgress?: (sent: number, total: number) => void;
  uploadRef?: { current: tus.Upload | null };
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${token}`,
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      onError: (err) => {
        if (uploadRef) uploadRef.current = null;
        reject(err);
      },
      onProgress: (sent, total) => onProgress?.(sent, total),
      onSuccess: () => {
        if (uploadRef) uploadRef.current = null;
        resolve();
      },
    });
    if (uploadRef) uploadRef.current = upload;
    upload.start();
  });
}

type Phase =
  | { kind: "idle" }
  | { kind: "preparing" }
  | { kind: "uploading"; sent: number; total: number; pct: number }
  | { kind: "finalizing" };

export function VideoUploader({
  current,
  onUploaded,
  onCleared,
}: {
  current: UploadedVideo | null;
  onUploaded: (file: UploadedVideo) => void;
  onCleared: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<tus.Upload | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    return () => {
      uploadRef.current?.abort();
    };
  }, []);

  async function handleFile(file: File) {
    setError(null);
    if (!file.type.startsWith("video/")) {
      setError("Choisis une vidéo (.mp4, .webm, .mov…).");
      return;
    }

    setPhase({ kind: "preparing" });
    try {
      const { thumb, durationMs } = await probeFile(file);

      const tokenRes = await fetch("/api/popquiz/upload-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          thumbnail: thumb !== null,
        }),
      });
      const tokenJson = (await tokenRes.json()) as UploadTokenResponse;
      if (!tokenRes.ok || !tokenJson.ok) {
        throw new Error(tokenJson.error || "Impossible de préparer l'import.");
      }

      setPhase({ kind: "uploading", sent: 0, total: file.size, pct: 0 });
      await tusUpload({
        file,
        endpoint: tokenJson.uploadUrl,
        token: tokenJson.source.token,
        uploadRef,
        onProgress: (sent, total) => {
          setPhase({
            kind: "uploading",
            sent,
            total,
            pct: total > 0 ? Math.round((sent / total) * 100) : 0,
          });
        },
      });

      setPhase({ kind: "finalizing" });

      // Thumbnail is best-effort: failure shouldn't block the editor.
      // The player has its own poster fallback.
      if (thumb && tokenJson.thumbnail) {
        try {
          await tusUpload({
            file: thumb,
            endpoint: tokenJson.uploadUrl,
            token: tokenJson.thumbnail.token,
          });
        } catch (e) {
          console.warn("[popquiz] thumbnail upload failed:", e);
        }
      }

      const previewRes = await fetch("/api/popquiz/playback-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          path: tokenJson.source.storagePath,
          thumbnailPath: tokenJson.thumbnail?.storagePath ?? null,
        }),
      });
      const previewJson = (await previewRes.json()) as {
        ok: boolean;
        signedUrl?: string;
        thumbnailUrl?: string | null;
        error?: string;
      };
      if (!previewRes.ok || !previewJson.ok || !previewJson.signedUrl) {
        throw new Error(
          previewJson.error ?? "Impossible de générer un lien de lecture.",
        );
      }

      onUploaded({
        path: tokenJson.source.storagePath,
        thumbnailPath: tokenJson.thumbnail?.storagePath ?? null,
        fileName: file.name,
        signedUrl: previewJson.signedUrl,
        thumbnailUrl: previewJson.thumbnailUrl ?? null,
        durationMs,
        bytes: file.size,
      });
      toast.success("Vidéo importée");
      setPhase({ kind: "idle" });
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Erreur lors de l'import";
      const friendly =
        raw.toLowerCase().includes("exceeded") ||
        raw.toLowerCase().includes("size")
          ? "Fichier trop volumineux. La taille maximale acceptée est 20 Go."
          : raw.toLowerCase().includes("abort")
            ? "Import annulé."
            : raw;
      setError(friendly);
      setPhase({ kind: "idle" });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleCancel() {
    uploadRef.current?.abort();
    uploadRef.current = null;
    setPhase({ kind: "idle" });
  }

  if (current) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-3">
        <CheckCircle2 className="size-5 text-green-700 dark:text-green-300 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-green-900 dark:text-green-200 truncate">
            {current.fileName}
          </p>
          <p className="text-xs text-green-700/80">
            {formatBytes(current.bytes)}
            {current.durationMs
              ? ` • ${Math.round(current.durationMs / 1000)} s`
              : ""}
            {" • vidéo prête"}
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={onCleared}
          type="button"
          aria-label="Retirer la vidéo"
          className="shrink-0 hover:bg-green-100"
        >
          <X className="size-4 text-green-900 dark:text-green-200" />
        </Button>
      </div>
    );
  }

  if (phase.kind === "uploading") {
    return (
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Loader2 className="size-5 animate-spin text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Importation en cours…</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {formatBytes(phase.sent)} / {formatBytes(phase.total)}
            </p>
          </div>
          <span className="text-sm font-mono tabular-nums">{phase.pct} %</span>
          <Button
            size="sm"
            variant="ghost"
            type="button"
            onClick={handleCancel}
            className="shrink-0"
          >
            Annuler
          </Button>
        </div>
        <Progress value={phase.pct} className="h-1.5" />
      </div>
    );
  }

  if (phase.kind === "preparing" || phase.kind === "finalizing") {
    return (
      <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
        <Loader2 className="size-5 animate-spin text-primary shrink-0" />
        <p className="text-sm">
          {phase.kind === "preparing"
            ? "Préparation (extraction de la miniature…)"
            : "Finalisation…"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/30"
        }`}
      >
        <Upload className="size-6 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm font-medium">
          Glisse une vidéo ici ou clique pour choisir
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          MP4, WebM, MOV — jusqu&apos;à 20 Go.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
