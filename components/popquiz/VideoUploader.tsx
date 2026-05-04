"use client";

// Direct video upload widget. Production-grade pipeline now:
//
//   1. Probe the file client-side via a hidden <video> element to
//      pull duration + a poster frame at t=2s (or 10% of duration,
//      whichever is smaller). Pure client work, no roundtrip.
//   2. Upload the poster JPEG to Supabase Storage with the regular
//      single-shot upload (it's tiny).
//   3. Resumable upload of the source file via TUS
//      (tus-js-client) against Supabase's /storage/v1/upload/resumable
//      endpoint. Survives network drops, retries on transient
//      errors with exponential backoff, exposes real progress in
//      bytes — not just a spinner.
//   4. Generate signed URLs for the editor preview.
//
// The host (PopquizNewClient) gets back the storage paths +
// duration. The API stores the paths; lib/popquiz/repo.ts mints
// fresh signed URLs at fetch time so the player never has to know
// about Supabase Storage.

import { useEffect, useRef, useState } from "react";
import * as tus from "tus-js-client";
import { CheckCircle2, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { toast } from "sonner";

export interface UploadedVideo {
  // raw/<auth.uid>/<videoId>/source.<ext>
  path: string;
  // raw/<auth.uid>/<videoId>/thumbnail.jpg — null if extraction failed.
  thumbnailPath: string | null;
  fileName: string;
  // 1 h signed URL the editor preview streams from. Server mints
  // its own when it serves the public play page.
  signedUrl: string;
  thumbnailUrl: string | null;
  durationMs: number | null;
  bytes: number;
}

interface ProbeResult {
  thumb: Blob | null;
  durationMs: number | null;
}

function genVideoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  if (i < 0 || i === name.length - 1) return "mp4";
  return name.slice(i + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} Go`;
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
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setError("Tu dois être connecté pour importer une vidéo.");
        setPhase({ kind: "idle" });
        return;
      }

      const { thumb, durationMs } = await probeFile(file);

      const videoId = genVideoId();
      const userId = session.user.id;
      const path = `raw/${userId}/${videoId}/source.${extOf(file.name)}`;
      const thumbPath = thumb
        ? `raw/${userId}/${videoId}/thumbnail.jpg`
        : null;

      if (thumb && thumbPath) {
        const { error: thumbError } = await supabase.storage
          .from("popquiz-videos")
          .upload(thumbPath, thumb, {
            contentType: "image/jpeg",
            upsert: true,
          });
        if (thumbError) {
          console.warn("Thumbnail upload failed:", thumbError.message);
        }
      }

      setPhase({ kind: "uploading", sent: 0, total: file.size, pct: 0 });
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) {
        throw new Error(
          "Configuration Supabase manquante (NEXT_PUBLIC_SUPABASE_URL).",
        );
      }

      await new Promise<void>((resolve, reject) => {
        const upload = new tus.Upload(file, {
          endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
          retryDelays: [0, 3000, 5000, 10000, 20000],
          headers: {
            authorization: `Bearer ${session.access_token}`,
            "x-upsert": "true",
          },
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          metadata: {
            bucketName: "popquiz-videos",
            objectName: path,
            contentType: file.type || "video/mp4",
            cacheControl: "3600",
          },
          chunkSize: 6 * 1024 * 1024,
          onError: (err) => {
            uploadRef.current = null;
            reject(err);
          },
          onProgress: (sent, total) => {
            setPhase({
              kind: "uploading",
              sent,
              total,
              pct: total > 0 ? Math.round((sent / total) * 100) : 0,
            });
          },
          onSuccess: () => {
            uploadRef.current = null;
            resolve();
          },
        });
        uploadRef.current = upload;
        upload.start();
      });

      setPhase({ kind: "finalizing" });
      const { data: signed, error: signError } = await supabase.storage
        .from("popquiz-videos")
        .createSignedUrl(path, 3600);
      if (signError || !signed?.signedUrl) {
        throw new Error(
          signError?.message ?? "Impossible de générer un lien de lecture.",
        );
      }

      let thumbnailUrl: string | null = null;
      if (thumbPath) {
        const { data: thumbSigned } = await supabase.storage
          .from("popquiz-videos")
          .createSignedUrl(thumbPath, 3600);
        thumbnailUrl = thumbSigned?.signedUrl ?? null;
      }

      onUploaded({
        path,
        thumbnailPath: thumbPath,
        fileName: file.name,
        signedUrl: signed.signedUrl,
        thumbnailUrl,
        durationMs,
        bytes: file.size,
      });
      toast.success("Vidéo importée");
      setPhase({ kind: "idle" });
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Erreur lors de l'import";
      const friendly =
        raw.toLowerCase().includes("exceeded") || raw.toLowerCase().includes("size")
          ? "Fichier trop volumineux pour ton plan Supabase. Augmente la limite ou choisis une vidéo plus légère."
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
      <div className="flex items-center gap-3 rounded-md border border-green-200 bg-green-50 p-3">
        <CheckCircle2 className="size-5 text-green-700 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-green-900 truncate">
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
          <X className="size-4 text-green-900" />
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
          <span className="text-sm font-mono tabular-nums">{phase.pct} %</span>
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
        <p className="text-[11px] text-muted-foreground">
          Résumable en cas de coupure réseau — garde l'onglet ouvert.
        </p>
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
          MP4, WebM, MOV. Upload résumable — survit aux coupures réseau.
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
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
