// components/content/ContentCalendarView.tsx
"use client";

// Vue Calendrier pour "Mes Contenus"
// - état local : date sélectionnée
// - reçoit les données déjà chargées côté server (app/contents/page.tsx)

import Link from "next/link";
import { useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";

import { ArrowRight, CalendarDays, FileText, Image as ImageIcon, Mail, Plus, Video } from "lucide-react";

export type ContentCalendarItem = {
  id: string;
  type: string | null;
  title: string | null;
  status: string | null;
  scheduled_date: string | null; // YYYY-MM-DD
  channel: string | null;
  tags: string[] | null;
  created_at: string;
};

export function ContentCalendarView({
  itemsByDate,
  scheduledDates,
}: {
  itemsByDate: Record<string, ContentCalendarItem[]>;
  scheduledDates: string[]; // YYYY-MM-DD
}) {
  const datesAsDate = useMemo(() => scheduledDates.map((d) => new Date(`${d}T00:00:00`)), [scheduledDates]);

  const defaultSelected =
    datesAsDate.find((d) => d.toDateString() === new Date().toDateString()) ?? datesAsDate[0] ?? undefined;

  const [selected, setSelected] = useState<Date | undefined>(defaultSelected);

  const selectedKey = useMemo(() => {
    if (!selected) return "";
    const yyyy = selected.getFullYear();
    const mm = String(selected.getMonth() + 1).padStart(2, "0");
    const dd = String(selected.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, [selected]);

  const dayItems = selectedKey ? itemsByDate[selectedKey] ?? [] : [];

  return (
    <div className="grid gap-4 md:grid-cols-[340px_1fr]">
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-semibold">Planification</p>
        </div>

        <Calendar
          mode="single"
          selected={selected}
          onSelect={setSelected}
          modifiers={{ hasContent: datesAsDate }}
          modifiersClassNames={{ hasContent: "bg-primary text-primary-foreground hover:bg-primary/90" }}
        />

        <p className="text-xs text-muted-foreground mt-3">Les jours avec du contenu planifié sont mis en avant.</p>
      </Card>

      <Card className="p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm text-muted-foreground">Sélection</p>
            <p className="text-lg font-semibold">{selectedKey ? formatDateLabel(selectedKey) : "Choisis un jour"}</p>
          </div>

          <Link href="/create">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Nouveau contenu
            </Button>
          </Link>
        </div>

        <div className="mt-5 space-y-3">
          {!selectedKey ? (
            <div className="rounded-xl border border-dashed p-6 text-center">
              <p className="font-semibold">Sélectionne une date</p>
              <p className="text-sm text-muted-foreground mt-1">
                Clique sur un jour dans le calendrier pour voir les contenus planifiés.
              </p>
            </div>
          ) : null}

          {selectedKey && dayItems.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center">
              <p className="font-semibold">Rien de planifié ce jour-là</p>
              <p className="text-sm text-muted-foreground mt-1">
                Crée un contenu et choisis une date de publication pour remplir ton calendrier.
              </p>
            </div>
          ) : null}

          {selectedKey && dayItems.length > 0 ? (
            <div className="grid gap-3">
              {dayItems.map((it) => {
                const Icon = iconForType(it.type);
                return (
                  <Link key={it.id} href={`/contents/${it.id}`}>
                    <div className="rounded-2xl border p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
                          <Icon className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold truncate">
                              {it.title?.trim() || `${it.type || "Contenu"} sans titre`}
                            </p>
                            <Badge variant={badgeVariantForStatus(it.status)}>{statusLabel(it.status)}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {it.type || "—"} · {it.channel || "—"}
                          </p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function formatDateLabel(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00`);
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "2-digit", month: "long" }).format(d);
}

function iconForType(type: string | null) {
  const t = safeString(type).toLowerCase();
  if (t.includes("email")) return Mail;
  if (t.includes("video") || t.includes("vidéo")) return Video;
  if (t.includes("image") || t.includes("visuel")) return ImageIcon;
  return FileText;
}

function badgeVariantForStatus(status: string | null): "default" | "secondary" | "outline" | "destructive" {
  const s = safeString(status).toLowerCase();
  if (s.includes("pub")) return "default";
  if (s.includes("plan")) return "secondary";
  if (s.includes("brou") || s.includes("draft")) return "outline";
  if (s.includes("err") || s.includes("fail")) return "destructive";
  return "outline";
}

function statusLabel(status: string | null): string {
  const s = safeString(status).trim();
  if (!s) return "—";
  const low = s.toLowerCase();
  if (low === "published") return "Publié";
  if (low === "scheduled") return "Planifié";
  if (low === "draft") return "Brouillon";
  return s;
}
