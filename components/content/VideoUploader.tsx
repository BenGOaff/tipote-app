"use client";

import * as React from "react";
import { useCallback, useRef, useState } from "react";
import { Video, X, Loader2, AlertCircle } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { useTranslations } from 'next-intl';

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
  /** Accepter aussi les GIF animés (Facebook les traite comme des Reels) */
  acceptGif?: boolean;
};

const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
// Use both video/* (for mobile pickers) and explicit extensions (for desktop)
const VIDEO_EXTENSIONS = "video/*,.mp4,.webm,.mov";
const GIF_TYPE = "image/gif";
const GIF_EXTENSION = ".gif";
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB (Supabase Free plan limit)

/**
 * Normalize MIME type: mobile devices sometimes report empty or non-standard types.
 * Falls back to extension-based detection.
 */
function normalizeVideoMimeType(file: File): string {
  const type = file.type?.toLowerCase() ?? "";

  // Standard types → pass through
  if (VIDEO_TYPES.includes(type) || type === GIF_TYPE) return type;

  // Non-standard but compatible types → normalize to mp4
  const MP4_COMPAT = ["video/x-m4v", "video/mpeg", "video/3gpp", "video/3gpp2", "video/x-mp4"];
  if (MP4_COMPAT.includes(type)) return "video/mp4";

  // Empty or unrecognized type → infer from extension
  const ext = file.name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "mp4":
    case "m4v":
    case "3gp":
    case "3gpp":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    case "webm":
      return "video/webm";
    case "gif":
      return "image/gif";
    default:
      return type; // return original, will be rejected downstream
  }
}

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
  acceptGif = false,
}: Props) {
  const t = useTranslations('videoUploader');
  const ACCEPTED_TYPES = acceptGif ? [...VIDEO_TYPES, GIF_TYPE] : VIDEO_TYPES;
  const ACCEPTED_EXTENSIONS = acceptGif ? `${VIDEO_EXTENSIONS},${GIF_EXTENSION}` : VIDEO_EXTENSIONS;
  const formatLabel = acceptGif ? "MP4, WebM, MOV ou GIF" : "MP4, WebM ou MOV";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);

  const canAdd = !video && !disabled;

  const uploadFile = useCallback(
    async (file: File): Promise<UploadedVideo | null> => {
      // Normalize MIME type (mobile devices often report empty or non-standard types)
      const resolvedType = normalizeVideoMimeType(file);

      if (!ACCEPTED_TYPES.includes(resolvedType)) {
        toast({
          title: t('unsupportedFormat'),
          description: t('unsupportedFormatDesc', { name: file.name, formats: formatLabel }),
          variant: "destructive",
        });
        return null;
      }

      if (file.size > MAX_FILE_SIZE) {
        toast({
          title: t('fileTooLarge'),
          description: t('fileTooLargeDesc', { name: file.name, size: formatSize(file.size) }),
          variant: "destructive",
        });
        return null;
      }

      // Step 1: Get a signed upload URL from our API (lightweight JSON request)
      setUploadProgress(5);
      let signedData: { signedUrl: string; token: string; path: string; publicUrl: string; filename: string };
      try {
        const signedRes = await fetch("/api/upload/video/signed-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType: resolvedType,
            contentId: contentId || undefined,
          }),
        });
        const signedJson = await signedRes.json().catch(() => ({ ok: false, error: t('networkError') }));
        if (!signedRes.ok || !signedJson.ok) {
          toast({
            title: t('uploadError'),
            description: signedJson.error ?? t('uploadPrepareError'),
            variant: "destructive",
          });
          return null;
        }
        signedData = signedJson;
      } catch {
        toast({
          title: t('networkError'),
          description: t('networkErrorDesc'),
          variant: "destructive",
        });
        return null;
      }

      // Step 2: Upload directly to Supabase Storage using XMLHttpRequest for real progress
      setUploadProgress(10);
      try {
        const uploaded = await new Promise<boolean>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", signedData.signedUrl, true);
          xhr.setRequestHeader("Content-Type", resolvedType);

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              // Scale progress from 10% to 100%
              const pct = 10 + (e.loaded / e.total) * 90;
              setUploadProgress(pct);
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              setUploadProgress(100);
              resolve(true);
            } else {
              const detail = xhr.responseText?.slice(0, 200) || "";
              reject(new Error(`Upload failed (${xhr.status}): ${detail}`));
            }
          };

          xhr.onerror = () => reject(new Error("Erreur réseau durant l'upload"));
          xhr.send(file);
        });

        if (!uploaded) return null;

        return {
          url: signedData.publicUrl,
          path: signedData.path,
          filename: signedData.filename,
          size: file.size,
          type: resolvedType,
        };
      } catch (err) {
        toast({
          title: t('uploadError'),
          description: err instanceof Error ? err.message : t('uploadFailed'),
          variant: "destructive",
        });
        return null;
      }
    },
    [contentId, acceptGif]
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
            title: t('videoAdded'),
            description: t('videoAddedDesc', { name: result.filename, size: formatSize(result.size) }),
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
          {t('label')}
        </label>
        {video && (
          <span className="text-[11px] text-slate-500">
            {formatLabel} - max 50 MB
          </span>
        )}
      </div>

      {/* Preview */}
      {video && (
        <div className="relative rounded-xl border border-slate-200 overflow-hidden bg-black">
          {video.type === "image/gif" ? (
            <img
              src={video.url}
              alt={video.filename}
              className="w-full max-h-64 object-contain"
            />
          ) : (
            <video
              src={video.url}
              className="w-full max-h-64 object-contain"
              controls
              preload="metadata"
              onLoadedMetadata={handleLoadedMetadata}
            />
          )}
          <button
            type="button"
            onClick={removeVideo}
            disabled={disabled || uploading}
            className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-rose-500 disabled:opacity-50"
            aria-label={t('deleteLabel', { name: video.filename })}
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
            <span className="text-xs text-slate-600">{t('uploading')}</span>
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
            {t('dropText')}
          </p>
          <p className="text-[11px] text-slate-400">
            {formatLabel} - max 50 MB
          </p>
        </div>
      )}

      {video && (
        <div className="flex items-center gap-1.5 text-[11px] text-emerald-600">
          <AlertCircle className="h-3 w-3" />
          {video.type === "image/gif"
            ? "Le GIF animé sera publié comme vidéo sur Facebook (Reel) pour conserver l\u2019animation."
            : t('videoStorageHint')}
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
