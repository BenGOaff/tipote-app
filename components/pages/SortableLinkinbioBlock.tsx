// components/pages/SortableLinkinbioBlock.tsx
//
// Bloc draggable individuel pour l'éditeur Link in Bio. Pattern aligné
// sur SortableQuestionList du quiz : card rounded-xl + grip handle +
// actions top-right. Migration depuis le drag HTML5 natif vers DndKit
// pour la cohérence cross-éditeurs.

"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslations } from "next-intl";
import {
  GripVertical, Trash2, Eye, EyeOff, Link2, Type, Users, Mail, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export type LinkinbioBlockData = {
  id: string;
  block_type: "link" | "header" | "social_icons" | "capture_form";
  title: string;
  url: string;
  icon_url: string;
  social_links: { platform: string; url: string }[];
  enabled: boolean;
  sort_order: number;
  clicks_count: number;
  open_in_new_tab: boolean;
  color: string | null;
};

const SOCIAL_PLATFORMS = [
  "instagram", "linkedin", "youtube", "tiktok", "twitter",
  "facebook", "pinterest", "threads", "spotify", "whatsapp",
  "telegram", "website", "email",
];

type Props = {
  link: LinkinbioBlockData;
  onUpdate: (patch: Partial<LinkinbioBlockData>) => void;
  onDelete: () => void;
};

export function SortableLinkinbioBlock({ link, onUpdate, onDelete }: Props) {
  const t = useTranslations("linkinbio");
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: link.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const BlockIcon = link.block_type === "link" ? Link2
    : link.block_type === "header" ? Type
    : link.block_type === "social_icons" ? Users
    : Mail;
  const blockLabel = link.block_type === "link" ? t("addLink")
    : link.block_type === "header" ? t("addHeader")
    : link.block_type === "social_icons" ? t("addSocial")
    : t("addCapture");

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`space-y-3 p-4 rounded-xl border border-border bg-card shadow-sm ${!link.enabled ? "opacity-60" : ""}`}
    >
      {/* Header : grip + chip + actions */}
      <div className="flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted touch-none"
          aria-label={t("reorderAria")}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium">
          <BlockIcon className="w-3.5 h-3.5" />
          {blockLabel}
        </div>
        {link.clicks_count > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {link.clicks_count} {t("clicks")}
          </span>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onUpdate({ enabled: !link.enabled })}
            title={link.enabled ? t("blockHide") : t("blockShow")}
          >
            {link.enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            title={t("blockDelete")}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Input
          value={link.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          className="h-9 text-sm"
          placeholder={t("titlePlaceholder")}
        />

        {link.block_type === "link" && (
          <>
            <Input
              value={link.url}
              onChange={(e) => onUpdate({ url: e.target.value })}
              className="h-9 text-sm"
              placeholder="https://..."
            />
            <div className="flex items-center justify-between pt-1">
              <label className="text-xs text-muted-foreground flex items-center gap-2 cursor-pointer">
                <Switch
                  checked={link.open_in_new_tab !== false}
                  onCheckedChange={(v) => onUpdate({ open_in_new_tab: v })}
                  className="scale-75 -my-1"
                />
                {t("openInNewTab")}
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={link.color || "#000000"}
                  onChange={(e) => onUpdate({ color: e.target.value })}
                  className="h-7 w-7 rounded-md border border-border cursor-pointer bg-transparent"
                  aria-label={t("customColor")}
                  title={t("customColor")}
                />
                {link.color && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground"
                    onClick={() => onUpdate({ color: null })}
                    title={t("resetColor")}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
          </>
        )}

        {link.block_type === "social_icons" && (
          <SocialIconsEditor link={link} onUpdate={onUpdate} />
        )}
      </div>
    </div>
  );
}

function SocialIconsEditor({
  link, onUpdate,
}: {
  link: LinkinbioBlockData;
  onUpdate: (patch: Partial<LinkinbioBlockData>) => void;
}) {
  const t = useTranslations("linkinbio");
  const socials = link.social_links || [];
  const [newPlatform, setNewPlatform] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const addSocial = () => {
    if (!newPlatform || !newUrl) return;
    onUpdate({ social_links: [...socials, { platform: newPlatform, url: newUrl }] });
    setNewPlatform("");
    setNewUrl("");
  };

  const removeSocial = (idx: number) => {
    onUpdate({ social_links: socials.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-2">
      {socials.map((s, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="capitalize font-medium w-20 truncate">{s.platform}</span>
          <span className="text-muted-foreground truncate flex-1 text-xs">{s.url}</span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeSocial(i)}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Select value={newPlatform} onValueChange={setNewPlatform}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue placeholder={t("platform")} />
          </SelectTrigger>
          <SelectContent>
            {SOCIAL_PLATFORMS.map((p) => (
              <SelectItem key={p} value={p} className="text-xs capitalize">{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          placeholder="https://..."
          className="h-8 text-xs flex-1"
        />
        <Button size="sm" variant="outline" className="h-8 px-2" onClick={addSocial} disabled={!newPlatform || !newUrl}>
          <Plus className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}
