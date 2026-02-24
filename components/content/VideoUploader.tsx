"use client";

import * as React from "react";
import { useCallback, useRef, useState } from "react";
import { Video, X, Loader2, AlertCircle } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

export type UploadedVideo = {
  url: string;
  path: string;
  filename: string;
  size: number;
  type: string;
};

type Props = {
  /** Vidéo déjà uploadée */
  video: UploadedVideo | null;
  /** Callback quand la vidéo change */
  onChange: (video: UploadedVideo | null) => void;
  /** ID du contenu (pour organiser le stockage) */
  contentId?: string;
  /** Désactivé */
  disabled?: boolean;
};

const ACCEPTED_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const ACCEPTED_EXTENSIONS = ".mp4,.webm,.mov";
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoUploader({
  video,
  onChange,
  contentId,
  disabled = false,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);

  const canAdd = !video && !disabled;

  const uploadFile = useCallback(
    async (file: File): Promise<UploadedVideo | null> => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        toast({
          title: "Format non supporté",
          description: `"${file.name}" n'est pas un fichier MP4, WebM ou MOV.`,
          variant: "destructive",
        });
        return null;
      }

      if (file.size > MAX_FILE_SIZE) {
        toast({
          title: "Fichier trop volumineux",
          description: `"${file.name}" (${formatSize(file.size)}) dépasse la limite de 500 MB.`,
          variant: "destructive",
        });
        return null;
      }

      // Simulate progress for UX (actual upload is single request)
      setUploadProgress(0);
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + Math.random() * 15;
        });
      }, 500);

      const formData = new FormData();
      formData.append("file", file);
      if (contentId) formData.append("contentId", contentId);

      try {
        const res = await fetch("/api/upload/video", {
          method: "POST",
          body: formData,
        });

        clearInterval(progressInterval);
        setUploadProgress(100);

        const json = await res.json().catch(() => ({ ok: false, error: "Erreur réseau" }));

        if (!res.ok || !json.ok) {
          toast({
            title: "Erreur d'upload",
            description: json.error ?? "Impossible d'uploader la vidéo.",
            variant: "destructive",
          });
          return null;
        }

        return {
          url: json.url,
          path: json.path,
          filename: json.filename,
          size: json.size,
          type: json.type,
        };
      } catch {
        clearInterval(progressInterval);
        toast({
          title: "Erreur réseau",
          description: "Impossible d'uploader la vidéo. Vérifie ta connexion.",
          variant: "destructive",
        });
        return null;
      }
    },
    [contentId]
  );

  const handleFile = useCallback(
    async (file: File) => {
      if (!file) return;

      setUploading(true);
      setUploadProgress(0);

      try {
        const result = await uploadFile(file);
        if (result) {
          onChange(result);
          toast({
            title: "Vidéo ajoutée",
            description: `${result.filename} (${formatSize(result.size)}) uploadée.`,
          });
        }
      } finally {
        setUploading(false);
        setUploadProgress(0);
      }
    },
    [onChange, uploadFile]
  );

  const removeVideo = useCallback(async () => {
    if (!video) return;

    // Delete from storage
    try {
      await fetch("/api/upload/video", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: video.path }),
      });
    } catch {
      // Continue even if delete fails
    }

    setDuration(null);
    onChange(null);
  }, [video, onChange]);

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (canAdd) setDragOver(true);
    },
    [canAdd]
  );

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (!canAdd) return;
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [canAdd, handleFile]
  );

  const onFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      // Reset input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [handleFile]
  );

  const handleLoadedMetadata = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const vid = e.currentTarget;
      if (vid.duration && isFinite(vid.duration)) {
        setDuration(vid.duration);
      }
    },
    []
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
          <Video className="w-3.5 h-3.5 text-slate-500" />
          Vidéo
        </label>
        {video && (
          <span className="text-[11px] text-slate-500">
            MP4, WebM, MOV - max 500 MB
          </span>
        )}
      </div>

      {/* Preview */}
      {video && (
        <div className="relative rounded-xl border border-slate-200 overflow-hidden bg-black">
          <video
            src={video.url}
            className="w-full max-h-64 object-contain"
            controls
            preload="metadata"
            onLoadedMetadata={handleLoadedMetadata}
          />
          <button
            type="button"
            onClick={removeVideo}
            disabled={disabled || uploading}
            className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-rose-500 disabled:opacity-50"
            aria-label={`Supprimer ${video.filename}`}
          >
            <X className="h-4 w-4" />
          </button>
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
            <p className="truncate text-xs text-white font-medium">{video.filename}</p>
            <p className="text-[10px] text-white/70">
              {formatSize(video.size)}
              {duration !== null && ` — ${formatDuration(duration)}`}
            </p>
          </div>
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-xs text-slate-600">Upload en cours...</span>
            <span className="text-xs text-slate-500 ml-auto">{Math.round(uploadProgress)}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${Math.min(uploadProgress, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Drop zone / Upload button */}
      {canAdd && !uploading && (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 transition-colors ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-slate-200 bg-slate-50 hover:border-primary/50 hover:bg-primary/5"
          }`}
        >
          <Video className="h-8 w-8 text-slate-400" />
          <p className="text-xs text-slate-600">
            Glisse ta vidéo ici ou clique pour parcourir
          </p>
          <p className="text-[11px] text-slate-400">
            MP4, WebM ou MOV - max 500 MB
          </p>
        </div>
      )}

      {video && (
        <div className="flex items-center gap-1.5 text-[11px] text-emerald-600">
          <AlertCircle className="h-3 w-3" />
          La vidéo sera conservée dans Supabase Storage — l&apos;URL reste valide même pour les posts programmés.
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        onChange={onFileSelect}
        className="hidden"
        aria-hidden="true"
      />
    </div>
  );
}
