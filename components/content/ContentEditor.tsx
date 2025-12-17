"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { Copy, Save, Trash2, CheckCircle2, CalendarDays, FileText } from "lucide-react";

type ContentItem = {
  id: string;
  type: string | null;
  title: string | null;
  prompt: string | null;
  content: string | null;
  status: string | null;
  scheduled_date: string | null;
  channel: string | null;
  tags: string[] | null;
  created_at: string | null;
  updated_at: string | null;
};

type Props = {
  initialItem: ContentItem;
};

type ApiResponse = { ok: true; item: ContentItem } | { ok: false; error: string };

function normalizeTags(input: string): string[] {
  return input
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function normalizeStatusForLabel(status: string | null): string {
  const s = (status ?? "").trim();
  if (!s) return "—";
  const low = s.toLowerCase();
  if (low === "published") return "Publié";
  if (low === "planned" || low === "scheduled") return "Planifié";
  if (low === "draft") return "Brouillon";
  if (low === "archived") return "Archivé";
  return s;
}

function badgeVariantForStatus(status: string | null): "default" | "secondary" | "outline" | "destructive" {
  const s = (status ?? "").toLowerCase();
  if (s === "published") return "default";
  if (s === "planned" || s === "scheduled") return "secondary";
  if (s === "draft") return "outline";
  if (s === "archived") return "outline";
  return "outline";
}

export function ContentEditor({ initialItem }: Props) {
  const router = useRouter();

  const [title, setTitle] = useState(initialItem.title ?? "");
  const [channel, setChannel] = useState(initialItem.channel ?? "");
  const [type, setType] = useState(initialItem.type ?? "");
  const [scheduledDate, setScheduledDate] = useState(initialItem.scheduled_date ?? "");
  const [status, setStatus] = useState(initialItem.status ?? "draft");
  const [tags, setTags] = useState((initialItem.tags ?? []).join(", "));
  const [content, setContent] = useState(initialItem.content ?? "");
  const [prompt, setPrompt] = useState(initialItem.prompt ?? "");

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const dirty = useMemo(() => {
    const a = initialItem;
    return (
      (a.title ?? "") !== title ||
      (a.channel ?? "") !== channel ||
      (a.type ?? "") !== type ||
      (a.scheduled_date ?? "") !== scheduledDate ||
      (a.status ?? "draft") !== status ||
      (a.prompt ?? "") !== prompt ||
      (a.content ?? "") !== content ||
      (a.tags ?? []).join(", ") !== tags
    );
  }, [initialItem, title, channel, type, scheduledDate, status, prompt, content, tags]);

  // Cmd/Ctrl+S
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isSave = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s";
      if (!isSave) return;
      e.preventDefault();
      void onSave();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, channel, type, scheduledDate, status, tags, content, prompt, dirty]);

  async function savePatch(next?: Partial<{ status: string }>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/content/${initialItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          channel,
          type,
          scheduledDate: scheduledDate || null,
          status: next?.status ?? status,
          tags: normalizeTags(tags),
          content,
          prompt,
        }),
      });

      const data = (await res.json()) as ApiResponse;

      if (!("ok" in data) || !data.ok) {
        toast({ title: "Enregistrement impossible", description: data.error ?? "Erreur", variant: "destructive" });
        return;
      }

      setStatus(data.item.status ?? (next?.status ?? status));
      toast({ title: "Enregistré ✅", description: "Tes modifications ont été sauvegardées." });
      router.refresh();
    } catch (e) {
      toast({
        title: "Enregistrement impossible",
        description: e instanceof Error ? e.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function onSave() {
    if (!dirty) {
      toast({ title: "Rien à enregistrer", description: "Aucune modification détectée." });
      return;
    }
    await savePatch();
  }

  async function onPublish() {
    await savePatch({ status: "published" });
  }

  async function onPlan() {
    if (!scheduledDate) {
      toast({
        title: "Date manquante",
        description: "Choisis une date planifiée avant de passer en “Planifié”.",
        variant: "destructive",
      });
      return;
    }
    await savePatch({ status: "planned" });
  }

  async function onDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/content/${initialItem.id}`, { method: "DELETE" });
      const data = (await res.json()) as { ok: boolean; error?: string };

      if (!data.ok) {
        toast({ title: "Suppression impossible", description: data.error ?? "Erreur", variant: "destructive" });
        return;
      }

      toast({ title: "Supprimé ✅", description: "Le contenu a été supprimé." });
      router.push("/contents");
      router.refresh();
    } catch (e) {
      toast({
        title: "Suppression impossible",
        description: e instanceof Error ? e.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  }

  const statusLabel = normalizeStatusForLabel(status);
  const statusBadgeVariant = badgeVariantForStatus(status);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={statusBadgeVariant}>{statusLabel}</Badge>
              {dirty ? <Badge variant="outline">Modifications non enregistrées</Badge> : <Badge variant="secondary">À jour</Badge>}
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
              <FileText className="w-4 h-4" />
              <span>{type?.trim() || "—"}</span>
              <span aria-hidden>•</span>
              <span>{channel?.trim() || "—"}</span>
              <span aria-hidden>•</span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="w-4 h-4" />
                {scheduledDate || "Non planifié"}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" className="gap-2" onClick={async () => {
              try {
                await navigator.clipboard.writeText(content ?? "");
                toast({ title: "Copié ✅", description: "Le contenu a été copié dans le presse-papier." });
              } catch {
                toast({ title: "Copie impossible", description: "Ton navigateur a bloqué l’accès au presse-papier.", variant: "destructive" });
              }
            }}>
              <Copy className="w-4 h-4" />
              Copier
            </Button>

            <Button onClick={() => void onSave()} disabled={saving || deleting || !dirty} className="gap-2">
              <Save className="w-4 h-4" />
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>

            <Button variant="secondary" onClick={() => void onPlan()} disabled={saving || deleting} className="gap-2">
              <CalendarDays className="w-4 h-4" />
              Planifier
            </Button>

            <Button onClick={() => void onPublish()} disabled={saving || deleting} className="gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Publier
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="gap-2 border-rose-200 text-rose-700 hover:bg-rose-50" disabled={saving || deleting}>
                  <Trash2 className="w-4 h-4" />
                  Supprimer
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Supprimer ce contenu ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {title.trim()
                      ? `“${title.trim()}” sera supprimé définitivement. Cette action est irréversible.`
                      : "Ce contenu sera supprimé définitivement. Cette action est irréversible."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => {
                      e.preventDefault();
                      void onDelete();
                    }}
                    className="bg-rose-600 hover:bg-rose-700"
                    disabled={deleting}
                  >
                    {deleting ? "Suppression…" : "Supprimer"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="grid gap-2">
            <Label className="text-xs">Titre</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre" />
          </div>

          <div className="grid gap-2">
            <Label className="text-xs">Canal</Label>
            <Input value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="Ex: LinkedIn" />
          </div>

          <div className="grid gap-2">
            <Label className="text-xs">Type</Label>
            <Input value={type} onChange={(e) => setType(e.target.value)} placeholder="Ex: Post LinkedIn" />
          </div>

          <div className="grid gap-2">
            <Label className="text-xs">Date planifiée</Label>
            <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label className="text-xs">Statut</Label>
            <Select value={status} onValueChange={(v) => setStatus(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Brouillon</SelectItem>
                <SelectItem value="planned">Planifié</SelectItem>
                <SelectItem value="published">Publié</SelectItem>
                <SelectItem value="archived">Archivé</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label className="text-xs">Tags</Label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Ex: acquisition, offre, mindset" />
          </div>

          <div className="lg:col-span-2 grid gap-2">
            <Label className="text-xs">Consigne (prompt)</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[120px]"
              placeholder="Brief utilisé pour générer"
            />
          </div>

          <div className="lg:col-span-2 grid gap-2">
            <Label className="text-xs">Contenu</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[360px]"
              placeholder="Contenu généré"
            />
          </div>

          <div className="lg:col-span-2 flex items-center justify-between gap-2 flex-wrap pt-2">
            <p className="text-xs text-muted-foreground">
              Astuce : <span className="font-semibold">Cmd/Ctrl + S</span> pour enregistrer rapidement.
            </p>

            <Button variant="outline" onClick={() => router.refresh()} disabled={saving || deleting}>
              Rafraîchir
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
