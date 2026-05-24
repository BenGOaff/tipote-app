"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Mail, Pencil, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "./CopyButton";
import { useDict } from "../../i18n/context";
import type { EmailTemplate } from "../content/emails-fr";

async function patchPromo(key: string, value: string | null) {
  try {
    await fetch("/affiliate/api/promo", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
  } catch {
    /* best effort */
  }
}

export function EmailCard({
  email,
  affiliateLink,
  displayName,
  overrides,
}: {
  email: EmailTemplate;
  affiliateLink: string;
  displayName: string;
  overrides: Record<string, string>;
}) {
  const t = useDict();
  const [open, setOpen] = useState(false);

  const kSubject = `email:${email.id}:subject`;
  const kPreheader = `email:${email.id}:preheader`;
  const kBody = `email:${email.id}:body`;

  const [subject, setSubject] = useState(overrides[kSubject] ?? email.subject);
  const [preheader, setPreheader] = useState(overrides[kPreheader] ?? email.preheader);
  const [body, setBody] = useState(overrides[kBody] ?? email.body);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [customized, setCustomized] = useState(
    kSubject in overrides || kPreheader in overrides || kBody in overrides,
  );

  const resolvedSubject = subject;
  const resolvedBody = body
    .replaceAll("{AFFILIATE_LINK}", affiliateLink)
    .replaceAll("{NAME}", displayName);

  async function save() {
    setSaving(true);
    await Promise.all([
      patchPromo(kSubject, subject),
      patchPromo(kPreheader, preheader),
      patchPromo(kBody, body),
    ]);
    setCustomized(true);
    setSaving(false);
    setEditing(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2500);
  }

  async function reset() {
    setSaving(true);
    await Promise.all([
      patchPromo(kSubject, null),
      patchPromo(kPreheader, null),
      patchPromo(kBody, null),
    ]);
    setSubject(email.subject);
    setPreheader(email.preheader);
    setBody(email.body);
    setCustomized(false);
    setSaving(false);
    setEditing(false);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary flex-shrink-0" />
              <span className="truncate">{resolvedSubject}</span>
              {customized && (
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {t.promouvoir.edit_badge}
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-1 text-xs">
              Pré-header : {preheader}
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setOpen((o) => !o)}
            className="flex-shrink-0"
          >
            {open ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
            {open ? t.common.close : t.common.learn_more}
          </Button>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4">
          {email.notes && !editing && (
            <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground italic">
              💡 {email.notes}
            </div>
          )}

          {editing ? (
            <>
              <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-muted-foreground">
                {t.promouvoir.edit_hint}
              </div>
              <div className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Objet</span>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="text-sm" />
              </div>
              <div className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Pré-header</span>
                <Input value={preheader} onChange={(e) => setPreheader(e.target.value)} className="text-sm" />
              </div>
              <div className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Corps de l&apos;email</span>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={14}
                  className="text-sm leading-relaxed font-mono"
                />
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <Button size="sm" onClick={save} disabled={saving}>
                  {saving ? t.common.saving : t.common.save}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                  {t.common.cancel}
                </Button>
                {customized && (
                  <Button size="sm" variant="ghost" onClick={reset} disabled={saving} className="ml-auto text-muted-foreground">
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    {t.promouvoir.edit_reset}
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Objet</span>
                  <CopyButton text={resolvedSubject} label="Copier l'objet" />
                </div>
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm font-medium">
                  {resolvedSubject}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Pré-header</span>
                  <CopyButton text={preheader} label="Copier" />
                </div>
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  {preheader}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Corps de l&apos;email</span>
                  <CopyButton text={resolvedBody} label="Copier le corps" />
                </div>
                <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed max-h-[400px] overflow-y-auto">
                  {resolvedBody}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <CopyButton
                  text={`Objet : ${resolvedSubject}\nPré-header : ${preheader}\n\n${resolvedBody}`}
                  label="Tout copier (objet + corps)"
                  size="default"
                  variant="default"
                />
                <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="ml-auto">
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  {t.promouvoir.edit_button}
                </Button>
                {savedFlash && (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">{t.promouvoir.edit_saved}</span>
                )}
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
