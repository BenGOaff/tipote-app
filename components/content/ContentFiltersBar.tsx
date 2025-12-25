"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Filter } from "lucide-react";

type Props = {
  initialQ: string;
  initialStatus: string; // '' | 'draft' | 'scheduled' | 'published' | 'archived'
  initialType: string;
  initialChannel: string;
  view: "list" | "calendar";
  typeOptions: string[];
  channelOptions: string[];
};

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function normalizeStatusForUi(status: string): string {
  const s = safeString(status).trim().toLowerCase();
  if (!s) return "all";
  if (s === "planned") return "scheduled";
  return s;
}

function normalizeSelectValue(v: string): string {
  const s = safeString(v).trim();
  return s ? s : "all";
}

export function ContentFiltersBar({
  initialQ,
  initialStatus,
  initialType,
  initialChannel,
  view,
  typeOptions,
  channelOptions,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  const [q, setQ] = useState<string>(initialQ);
  const [status, setStatus] = useState<string>(normalizeStatusForUi(initialStatus));
  const [type, setType] = useState<string>(normalizeSelectValue(initialType));
  const [channel, setChannel] = useState<string>(normalizeSelectValue(initialChannel));

  const currentBase = useMemo(() => {
    const entries: [string, string][] = [];
    sp.forEach((value, key) => {
      // On reconstruit proprement, mais on ne garde pas les filtres (gérés par state)
      if (key === "q" || key === "status" || key === "type" || key === "channel") return;
      entries.push([key, value]);
    });
    return entries;
  }, [sp]);

  function apply() {
    const params = new URLSearchParams();

    for (const [k, v] of currentBase) params.set(k, v);

    params.set("view", view);

    const qTrim = q.trim();
    if (qTrim) params.set("q", qTrim);

    if (status && status !== "all") params.set("status", status);
    if (type && type !== "all") params.set("type", type);
    if (channel && channel !== "all") params.set("channel", channel);

    const qs = params.toString();
    router.push(qs ? `/contents?${qs}` : "/contents");
  }

  function reset() {
    setQ("");
    setStatus("all");
    setType("all");
    setChannel("all");

    const params = new URLSearchParams();
    for (const [k, v] of currentBase) params.set(k, v);
    params.set("view", view);

    const qs = params.toString();
    router.push(qs ? `/contents?${qs}` : "/contents");
  }

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex flex-1 items-center gap-2">
          <div className="flex h-10 w-full items-center gap-2 rounded-xl border bg-background px-3 text-muted-foreground">
            <Filter className="h-4 w-4 shrink-0" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher un contenu…"
              className="h-8 w-full border-0 p-0 shadow-none focus-visible:ring-0"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  apply();
                }
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:flex lg:items-center">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-10 rounded-xl">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="draft">Brouillon</SelectItem>
              <SelectItem value="scheduled">Planifié</SelectItem>
              <SelectItem value="published">Publié</SelectItem>
              <SelectItem value="archived">Archivé</SelectItem>
            </SelectContent>
          </Select>

          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-10 rounded-xl">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les types</SelectItem>
              {typeOptions.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger className="h-10 rounded-xl">
              <SelectValue placeholder="Canal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les canaux</SelectItem>
              {channelOptions.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex gap-2">
            <Button onClick={apply} variant="outline" className="h-10 flex-1 rounded-xl lg:flex-none">
              Filtrer
            </Button>
            <Button onClick={reset} variant="ghost" className="h-10 flex-1 rounded-xl lg:flex-none">
              Reset
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default ContentFiltersBar;
