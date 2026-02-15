"use client";

import * as React from "react";
import { useCallback, useRef, useState } from "react";
import { ImagePlus, X, Loader2, AlertCircle } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

export type UploadedImage = {
  url: string;
  path: string;
  filename: string;
  size: number;
  type: string;
};

type Props = {
  /** Images déjà uploadées */
  images: UploadedImage[];
  /** Callback quand les images changent */
  onChange: (images: UploadedImage[]) => void;
  /** ID du contenu (pour organiser le stockage) */
  contentId?: string;
  /** Nombre max d'images (défaut: 4) */
  maxImages?: number;
  /** Désactivé */
  disabled?: boolean;
};

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/gif"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImageUploader({
  images,
  onChange,
  contentId,
  maxImages = 4,
  disabled = false,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const canAdd = images.length < maxImages && !disabled;

  const uploadFile = useCallback(
    async (file: File): Promise<UploadedImage | null> => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        toast({
          title: "Format non supporté",
          description: `"${file.name}" n'est pas un PNG, JPG ou GIF.`,
          variant: "destructive",
        });
        return null;
      }

      if (file.size > MAX_FILE_SIZE) {
        toast({
          title: "Fichier trop volumineux",
          description: `"${file.name}" (${formatSize(file.size)}) dépasse la limite de 10 MB.`,
          variant: "destructive",
        });
        return null;
      }

      const formData = new FormData();
      formData.append("file", file);
      if (contentId) formData.append("contentId", contentId);

      const res = await fetch("/api/upload/image", {
        method: "POST",
        body: formData,
      });

      const json = await res.json().catch(() => ({ ok: false, error: "Erreur réseau" }));

      if (!res.ok || !json.ok) {
        toast({
          title: "Erreur d'upload",
          description: json.error ?? "Impossible d'uploader l'image.",
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
    },
    [contentId]
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArr = Array.from(files);
      const slotsAvailable = maxImages - images.length;

      if (fileArr.length === 0) return;

      if (fileArr.length > slotsAvailable) {
        toast({
          title: "Trop d'images",
          description: `Tu peux ajouter ${slotsAvailable} image${slotsAvailable > 1 ? "s" : ""} de plus (max ${maxImages}).`,
          variant: "destructive",
        });
      }

      const toUpload = fileArr.slice(0, slotsAvailable);
      if (toUpload.length === 0) return;

      setUploading(true);

      try {
        const results = await Promise.all(toUpload.map(uploadFile));
        const successful = results.filter(Boolean) as UploadedImage[];

        if (successful.length > 0) {
          onChange([...images, ...successful]);
          toast({
            title: "Image(s) ajoutée(s)",
            description: `${successful.length} image${successful.length > 1 ? "s" : ""} uploadée${successful.length > 1 ? "s" : ""}.`,
          });
        }
      } finally {
        setUploading(false);
      }
    },
    [images, maxImages, onChange, uploadFile]
  );

  const removeImage = useCallback(
    async (index: number) => {
      const img = images[index];
      if (!img) return;

      // Delete from storage
      try {
        await fetch("/api/upload/image", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: img.path }),
        });
      } catch {
        // Continue even if delete fails
      }

      const next = images.filter((_, i) => i !== index);
      onChange(next);
    },
    [images, onChange]
  );

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
      handleFiles(e.dataTransfer.files);
    },
    [canAdd, handleFiles]
  );

  const onFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        handleFiles(e.target.files);
      }
      // Reset input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [handleFiles]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-700">
          Images
          <span className="ml-1 font-normal text-slate-500">
            ({images.length}/{maxImages})
          </span>
        </label>
        {images.length > 0 && (
          <span className="text-[11px] text-slate-500">
            PNG, JPG, GIF - max 10 MB
          </span>
        )}
      </div>

      {/* Previews */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img, i) => (
            <div
              key={img.path}
              className="group relative h-20 w-20 rounded-lg border border-slate-200 overflow-hidden bg-slate-50"
            >
              <img
                src={img.url}
                alt={img.filename}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeImage(i)}
                disabled={disabled || uploading}
                className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-rose-600 disabled:opacity-50"
                aria-label={`Supprimer ${img.filename}`}
              >
                <X className="h-3 w-3" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1 py-0.5">
                <p className="truncate text-[9px] text-white">{img.filename}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone / Upload button */}
      {canAdd && (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 transition-colors ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-slate-200 bg-slate-50 hover:border-primary/50 hover:bg-primary/5"
          } ${uploading ? "pointer-events-none opacity-60" : ""}`}
        >
          {uploading ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs text-slate-600">Upload en cours...</p>
            </>
          ) : (
            <>
              <ImagePlus className="h-6 w-6 text-slate-400" />
              <p className="text-xs text-slate-600">
                Glisse une image ici ou clique pour parcourir
              </p>
              <p className="text-[11px] text-slate-400">
                PNG, JPG ou GIF - max 10 MB
              </p>
            </>
          )}
        </div>
      )}

      {images.length >= maxImages && (
        <div className="flex items-center gap-1.5 text-[11px] text-amber-600">
          <AlertCircle className="h-3 w-3" />
          Nombre maximum d&apos;images atteint ({maxImages})
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif"
        multiple
        onChange={onFileSelect}
        className="hidden"
        aria-hidden="true"
      />
    </div>
  );
}
