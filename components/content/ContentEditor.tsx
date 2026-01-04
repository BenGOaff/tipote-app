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

import { Copy, Save, Trash2, CheckCircle2, CalendarDays, FileText, CopyPlus, CalendarX } from "lucide-react";

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

type ApiResponse = { ok: true; item?: any } | { ok: false; error?: string };

type Props = {
  initialItem: ContentItem;
};

function normalizeStatusValue(status: string | null | undefined): string {
  const s = (status ?? "").trim().toLowerCase();
  if (!s) return "draft";
  if (s === "planned") return "scheduled";
  return s;
}

function normalizeStatusLabel(status: string | null): string {
  const low = normalizeStatusValue(status);
  if (low === "published") return "Publié";
  if (low === "scheduled") return "Planifié";
  if (low === "draft") return "Brouillon";
  if (low === "archived") return "Archivé";
  return status?.trim() || "—";
}

function badgeVariantForStatus(status: string | null): "default" | "secondary" | "outline" | "destructive" {
  const s = normalizeStatusValue(status);
  if (s === "published") return "default";
  if (s === "scheduled") return "secondary";
  if (s === "draft") return "outline";
  if (s === "archived") return "outline";
  return "outline";
}

function normalizeTags(raw: string) {
  return (raw ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function tagsToString(tags: string[] | null | undefined) {
  return (tags ?? []).filter(Boolean).join(", ");
}

function toYmdOrEmpty(v: string | null | undefined) {
  const s = (v ?? "").trim();
  if (!s) return "";
  // si déjà YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // sinon on tente Date ISO
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function ContentEditor({ initialItem }: Props) {
  const router = useRouter();

  // Baseline local: permet un "dirty" fiable après save,
  // même si le refresh Next met un peu de temps ou renvoie un item équivalent.
  const [baseline, setBaseline] = useState<ContentItem>(() => ({
    ...initialItem,
    tags: Array.isArray(initialItem.tags) ? initialItem.tags : [],
    scheduled_date: initialItem.scheduled_date ? toYmdOrEmpty(initialItem.scheduled_date) : null,
    status: normalizeStatusValue(initialItem.status),
  }));

  const [title, setTitle] = useState(baseline.title ?? "");
  const [channel, setChannel] = useState(baseline.channel ?? "");
  const [type, setType] = useState(baseline.type ?? "");
  const [scheduledDate, setScheduledDate] = useState<string>(baseline.scheduled_date ? toYmdOrEmpty(baseline.scheduled_date) : "");
  const [status, setStatus] = useState<string>(normalizeStatusValue(baseline.status));
  const [tags, setTags] = useState(tagsToString(baseline.tags));
  const [prompt, setPrompt] = useState(baseline.prompt ?? "");
  const [content, setContent] = useState(baseline.content ?? "");

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  const dirty = useMemo(() => {
    const a = baseline;
    return (
      (a.title ?? "") !== title ||
      (a.channel ?? "") !== channel ||
      (a.type ?? "") !== type ||
      toYmdOrEmpty(a.scheduled_date) !== toYmdOrEmpty(scheduledDate) ||
      normalizeStatusValue(a.status) !== normalizeStatusValue(status) ||
      (a.prompt ?? "") !== prompt ||
      (a.content ?? "") !== content ||
      tagsToString(a.tags) !== tags
    );
  }, [baseline, title, channel, type, scheduledDate, status, prompt, content, tags]);

  // Cohérence UX: si une date est saisie et que statut est "draft", on passe "scheduled"
  React.useEffect(() => {
    const d = toYmdOrEmpty(scheduledDate);
    const s = normalizeStatusValue(status);

    if (d && s === "draft") setStatus("scheduled");
    if (!d && s === "scheduled") {
      // si l'user retire la date, on repasse en draft (cohérent pour le calendrier)
      setStatus("draft");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduledDate]);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isSave = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s";
      if (!isSave) return;
      e.preventDefault();
      if (!saving && dirty) void onSave();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saving, dirty, title, channel, type, scheduledDate, status, tags, prompt, content]);

  async function savePatch(overrides?: Partial<{ status: string; scheduledDate: string | null }>) {
    const nextStatus = normalizeStatusValue(overrides?.status ?? status);
    const nextScheduledDate =
      overrides?.scheduledDate !== undefined
        ? overrides.scheduledDate
        : toYmdOrEmpty(scheduledDate)
          ? toYmdOrEmpty(scheduledDate)
          : null;

    if (nextStatus === "scheduled" && !nextScheduledDate) {
      toast({
        title: "Date manquante",
        description: "Choisis une date de planification avant de planifier.",
        variant: "destructive",
      });
      return false;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim() || "Sans titre",
        channel: channel.trim() || null,
        type: type.trim() || null,
        scheduledDate: nextScheduledDate, // API attend scheduledDate (YYYY-MM-DD ou null)
        status: nextStatus,
        tags: normalizeTags(tags),
        content,
        prompt: prompt.trim() || null,
      };

      const res = await fetch(`/api/content/${baseline.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => ({}))) as ApiResponse;

      if (!("ok" in data) || !data.ok) {
        toast({
          title: "Enregistrement impossible",
          description: (data as any).error ?? "Erreur",
          variant: "destructive",
        });
        return false;
      }

      // ✅ Best-of: on met à jour le baseline local avec ce que l'API renvoie,
      // sinon on le reconstruit à partir du payload.
      const returned = (data as any)?.item ?? null;
      if (returned && typeof returned === "object") {
        setBaseline((prev) => ({
          ...prev,
          title: typeof returned.title === "string" ? returned.title : prev.title,
          channel: typeof returned.channel === "string" ? returned.channel : returned.channel ?? prev.channel,
          type: typeof returned.type === "string" ? returned.type : returned.type ?? prev.type,
          status: typeof returned.status === "string" ? returned.status : nextStatus,
          scheduled_date: typeof returned.scheduled_date === "string" ? toYmdOrEmpty(returned.scheduled_date) : nextScheduledDate,
          tags: Array.isArray(returned.tags) ? returned.tags.map(String) : normalizeTags(tags),
          prompt: typeof returned.prompt === "string" ? returned.prompt : payload.prompt,
          content: typeof returned.content === "string" ? returned.content : payload.content,
          updated_at: typeof returned.updated_at === "string" ? returned.updated_at : prev.updated_at,
        }));
      } else {
        setBaseline((prev) => ({
          ...prev,
          title: payload.title,
          channel: payload.channel,
          type: payload.type,
          status: nextStatus,
          scheduled_date: nextScheduledDate,
          tags: normalizeTags(tags),
          prompt: payload.prompt,
          content: payload.content,
        }));
      }

      toast({ title: "Sauvegardé ✅", description: "Les modifications ont été enregistrées." });
      router.refresh();
      return true;
    } catch (e) {
      toast({
        title: "Enregistrement impossible",
        description: e instanceof Error ? e.message : "Erreur inconnue",
        variant: "destructive",
      });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function onSave() {
    if (!dirty) return;
    await savePatch();
  }

  async function onPublish() {
    await savePatch({ status: "published" });
  }

  async function onPlan() {
    await savePatch({ status: "scheduled" });
  }

  async function onUnplan() {
    setStatus("draft");
    setScheduledDate("");
    await savePatch({ status: "draft", scheduledDate: null });
  }

  async function onDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/content/${baseline.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as ApiResponse;

      if (!("ok" in data) || !data.ok) {
        toast({
          title: "Suppression impossible",
          description: (data as any).error ?? "Erreur",
          variant: "destructive",
        });
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

  async function onDuplicate() {
    setDuplicating(true);
    try {
      const res = await fetch(`/api/content/${baseline.id}/duplicate`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { ok: boolean; id?: string | null; error?: string };

      if (!data.ok || !data.id) {
        toast({
          title: "Duplication impossible",
          description: data.error ?? "Erreur",
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Dupliqué ✅", description: "Une copie a été créée." });
      router.push(`/contents/${data.id}`);
      router.refresh();
    } catch (e) {
      toast({
        title: "Duplication impossible",
        description: e instanceof Error ? e.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setDuplicating(false);
    }
  }

  const statusLabel = normalizeStatusLabel(status);
  const statusBadgeVariant = badgeVariantForStatus(status);
  const isPlanned = normalizeStatusValue(status) === "scheduled";

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
              <span className="inline-flex items-center gap-2">
                <FileText className="w-4 h-4" />
                {type?.trim() || "—"}
              </span>
              <span aria-hidden>•</span>
              <span>{channel?.trim() || "—"}</span>
              <span aria-hidden>•</span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="w-4 h-4" />
                {toYmdOrEmpty(scheduledDate) ? toYmdOrEmpty(scheduledDate) : "Non planifié"}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              className="gap-2 rounded-xl"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(content ?? "");
                  toast({ title: "Copié ✅", description: "Le contenu a été copié dans le presse-papier." });
                } catch {
                  toast({
                    title: "Copie impossible",
                    description: "Ton navigateur a bloqué l’accès au presse-papier.",
                    variant: "destructive",
                  });
                }
              }}
              disabled={saving || deleting || duplicating}
            >
              <Copy className="w-4 h-4" />
              Copier
            </Button>

            <Button onClick={() => void onSave()} disabled={saving || deleting || duplicating || !dirty} className="gap-2 rounded-xl">
              <Save className="w-4 h-4" />
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>

            <Button
              variant="secondary"
              onClick={() => void onPlan()}
              disabled={saving || deleting || duplicating}
              className="gap-2 rounded-xl"
            >
              <CalendarDays className="w-4 h-4" />
              Planifier
            </Button>

            {isPlanned ? (
              <Button
                variant="outline"
                onClick={() => void onUnplan()}
                disabled={saving || deleting || duplicating}
                className="gap-2 rounded-xl"
              >
                <CalendarX className="w-4 h-4" />
                Déplanifier
              </Button>
            ) : null}

            <Button onClick={() => void onPublish()} disabled={saving || deleting || duplicating} className="gap-2 rounded-xl">
              <CheckCircle2 className="w-4 h-4" />
              Publier
            </Button>

            <Button
              variant="outline"
              className="gap-2 rounded-xl"
              onClick={() => void onDuplicate()}
              disabled={saving || deleting || duplicating}
            >
              <CopyPlus className="w-4 h-4" />
              {duplicating ? "Duplication…" : "Dupliquer"}
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="gap-2 rounded-xl border-rose-200 text-rose-700 hover:bg-rose-50"
                  disabled={saving || deleting || duplicating}
                >
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
                    disabled={deleting}
                    className="bg-rose-600 text-white hover:bg-rose-700"
                    onClick={(e) => {
                      e.preventDefault();
                      void onDelete();
                    }}
                  >
                    {deleting ? "Suppression…" : "Supprimer"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4 space-y-3">
          <div className="space-y-2">
            <Label>Titre</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre du contenu" />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <Input value={type} onChange={(e) => setType(e.target.value)} placeholder="post / email / blog..." />
            </div>

            <div className="space-y-2">
              <Label>Canal</Label>
              <Input value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="LinkedIn / Email..." />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Statut</Label>
              <Select value={normalizeStatusValue(status)} onValueChange={(v) => setStatus(normalizeStatusValue(v))}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Brouillon</SelectItem>
                  <SelectItem value="scheduled">Planifié</SelectItem>
                  <SelectItem value="published">Publié</SelectItem>
                  <SelectItem value="archived">Archivé</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Date de planification</Label>
              <Input
                type="date"
                value={toYmdOrEmpty(scheduledDate)}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Si vide : “Non planifié”.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="ex: lancement, storytelling, preuve sociale"
            />
            <p className="text-xs text-muted-foreground">Sépare avec des virgules.</p>
          </div>

          <div className="space-y-2">
            <Label>Prompt (optionnel)</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Contexte / prompt utilisé"
              rows={5}
            />
          </div>
        </Card>

        <Card className="p-4 space-y-2">
          <div>
            <p className="font-semibold">Contenu</p>
            <p className="text-sm text-muted-foreground">Édite librement. Cmd/Ctrl+S pour sauvegarder.</p>
          </div>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Colle ou écris ton contenu ici…"
            rows={22}
          />
        </Card>
      </div>
    </div>
  );
}
