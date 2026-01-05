"use client";

import { useMemo, useState } from "react";
import { X, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { CreateFormCommonProps, buildTipoteContext } from "./_shared";

const videoTypes = [
  { id: "youtube", label: "YouTube" },
  { id: "reels", label: "Reels / Shorts" },
  { id: "tiktok", label: "TikTok" },
] as const;

export function VideoForm(props: CreateFormCommonProps) {
  const { onGenerate, onSave, onClose, isGenerating, isSaving } = props;

  const [videoType, setVideoType] = useState<string>("youtube");
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [preview, setPreview] = useState("");

  const canSave = useMemo(() => title.trim().length > 0, [title]);

  async function handleGenerate() {
    const content = await onGenerate({
      type: "video",
      video_type: videoType,
      topic: topic || undefined,
      context: buildTipoteContext({ videoType }),
    });
    setPreview(content || "");
  }

  async function handleSaveClick() {
    await onSave({
      type: "video",
      status: "draft",
      title,
      content: preview,
      meta: { videoType, topic },
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-0 top-0 p-2 rounded-md hover:bg-muted"
        aria-label="Fermer"
      >
        <X className="h-5 w-5 text-muted-foreground" />
      </button>

      <div className="mb-4">
        <div className="text-xl font-bold">Scripts vidéo</div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Format</Label>
            <Select value={videoType} onValueChange={setVideoType}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner..." />
              </SelectTrigger>
              <SelectContent>
                {videoTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Sujet</Label>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="De quoi parle la vidéo ?"
            />
          </div>

          <Button
            type="button"
            className="w-full h-12"
            onClick={handleGenerate}
            disabled={isGenerating}
          >
            <Wand2 className="w-4 h-4 mr-2" />
            {isGenerating ? "Génération..." : "Générer"}
          </Button>
        </div>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Titre (pour sauvegarde)</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titre de votre script"
            />
          </div>

          <div className="space-y-2">
            <Label>Prévisualisation</Label>
            <Textarea
              value={preview}
              onChange={(e) => setPreview(e.target.value)}
              placeholder="Le contenu généré apparaîtra ici..."
              className="min-h-[260px]"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button
              type="button"
              onClick={handleSaveClick}
              disabled={isSaving || !canSave}
            >
              {isSaving ? "Sauvegarde..." : "Sauvegarder"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
