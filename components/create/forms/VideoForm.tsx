"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Wand2, RefreshCw, Save, Calendar, Send, X } from "lucide-react";

interface VideoFormProps {
  onGenerate: (params: any) => Promise<string>;
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
  isGenerating: boolean;
  isSaving: boolean;
}

const videoPlatforms = [
  { id: "youtube_long", label: "YouTube (long format)" },
  { id: "youtube_shorts", label: "YouTube Shorts" },
  { id: "tiktok", label: "TikTok" },
  { id: "reel", label: "Instagram Reel" },
];

const durations = [
  { id: "30s", label: "30 secondes" },
  { id: "60s", label: "1 minute" },
  { id: "3min", label: "3 minutes" },
  { id: "5min", label: "5 minutes" },
  { id: "10min", label: "10 minutes" },
  { id: "15min+", label: "15+ minutes" },
];

export function VideoForm({ onGenerate, onSave, onClose, isGenerating, isSaving }: VideoFormProps) {
  const [platform, setPlatform] = useState("youtube_long");
  const [subject, setSubject] = useState("");
  const [duration, setDuration] = useState("5min");
  const [generatedContent, setGeneratedContent] = useState("");
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  const handleGenerate = async () => {
    const content = await onGenerate({
      type: "video",
      platform,
      subject,
      duration,
    });
    if (content) {
      setGeneratedContent(content);
      if (!title) setTitle(subject || `Script ${platform}`);
    }
  };

  const handleSave = async (status: "draft" | "scheduled" | "published") => {
    await onSave({
      title,
      content: generatedContent,
      type: "video",
      platform,
      status,
      scheduled_at: scheduledAt || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Script Vidéo</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Plateforme</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {videoPlatforms.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Durée</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {durations.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Sujet *</Label>
            <Input
              placeholder="Ex: Comment vendre sans être pushy"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <Button className="w-full" onClick={handleGenerate} disabled={!subject || isGenerating}>
            {isGenerating ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Génération...</>
            ) : (
              <><Wand2 className="w-4 h-4 mr-2" />Générer</>
            )}
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Titre (pour sauvegarde)</Label>
            <Input
              placeholder="Titre interne"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Script généré</Label>
            <Textarea
              value={generatedContent}
              onChange={(e) => setGeneratedContent(e.target.value)}
              rows={12}
              placeholder="Le script apparaîtra ici..."
              className="resize-none"
            />
          </div>

          {generatedContent && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Programmer (optionnel)</Label>
                <Input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => handleSave("draft")} disabled={!title || isSaving}>
                  {isSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                  Brouillon
                </Button>

                {scheduledAt && (
                  <Button variant="secondary" size="sm" onClick={() => handleSave("scheduled")} disabled={!title || isSaving}>
                    <Calendar className="w-4 h-4 mr-1" />Planifier
                  </Button>
                )}

                <Button size="sm" onClick={() => handleSave("published")} disabled={!title || isSaving}>
                  <Send className="w-4 h-4 mr-1" />Publier
                </Button>

                <Button variant="outline" size="sm" onClick={handleGenerate} disabled={isGenerating}>
                  <RefreshCw className="w-4 h-4 mr-1" />Regénérer
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
