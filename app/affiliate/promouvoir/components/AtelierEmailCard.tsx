"use client";

// Carte d'un email du kit Atelier. Trois différences avec la carte des
// emails Tiquiz : les objets alternatifs (A/B/C) sont proposés à la copie,
// le gras du kit est conservé au collage (Systeme.io garde la mise en
// forme), et le lien tracké est déjà injecté dans le corps.

import { useState } from "react";
import { ChevronDown, ChevronUp, Mail, Pencil, RotateCcw } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "./CopyButton";
import { CopyRichButton } from "./CopyRichButton";
import { useDict } from "../../i18n/context";
import { interpolate } from "../../i18n";
import { toHtml, toPlain, resolveVars } from "@/lib/affiliate/markdownLite";
import type { AtelierEmail } from "../content/atelier-emails-fr";

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

export function AtelierEmailCard({
  email,
  index,
  affiliateLink,
  displayName,
  overrides,
}: {
  email: AtelierEmail;
  index: number;
  affiliateLink: string;
  displayName: string;
  overrides: Record<string, string>;
}) {
  const t = useDict();
  const [open, setOpen] = useState(false);

  const kSubject = `email:${email.id}:subject`;
  const kPre = `email:${email.id}:preheader`;
  const kBody = `email:${email.id}:body`;

  const [subject, setSubject] = useState(overrides[kSubject] ?? email.subject);
  const [preheader, setPreheader] = useState(
    overrides[kPre] ?? email.preheader,
  );
  const [body, setBody] = useState(overrides[kBody] ?? email.body);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customized, setCustomized] = useState(
    kSubject in overrides || kPre in overrides || kBody in overrides,
  );

  const vars = { affiliateLink, name: displayName };
  const resolvedBody = resolveVars(body, vars);
  const html = toHtml(resolvedBody);
  const plain = toPlain(resolvedBody);

  async function save() {
    setSaving(true);
    await Promise.all([
      patchPromo(kSubject, subject),
      patchPromo(kPre, preheader),
      patchPromo(kBody, body),
    ]);
    setCustomized(true);
    setSaving(false);
    setEditing(false);
  }

  async function reset() {
    setSaving(true);
    await Promise.all([
      patchPromo(kSubject, null),
      patchPromo(kPre, null),
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
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-4 w-4 flex-shrink-0 text-primary" />
              <span className="truncate">
                {interpolate(t.email_card.numbered, { n: index + 1 })}{" "}
                {email.label}
              </span>
              {customized && (
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {t.promouvoir.edit_badge}
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-1 truncate text-xs">
              {subject}
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setOpen((o) => !o)}
            className="flex-shrink-0"
          >
            {open ? (
              <ChevronUp className="mr-1 h-4 w-4" />
            ) : (
              <ChevronDown className="mr-1 h-4 w-4" />
            )}
            {open ? t.common.close : t.common.learn_more}
          </Button>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4">
          {editing ? (
            <>
              <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                {t.promouvoir.edit_hint}
              </div>
              <div className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t.email_card.label_subject}
                </span>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t.email_card.label_preheader}
                </span>
                <Input
                  value={preheader}
                  onChange={(e) => setPreheader(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t.email_card.label_body}
                </span>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={18}
                  className="font-mono text-sm leading-relaxed"
                />
              </div>
              <div className="flex items-center gap-2 border-t border-border pt-2">
                <Button size="sm" onClick={save} disabled={saving}>
                  {saving ? t.common.saving : t.common.save}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                >
                  {t.common.cancel}
                </Button>
                {customized && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={reset}
                    disabled={saving}
                    className="ml-auto text-muted-foreground"
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    {t.promouvoir.edit_reset}
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {t.email_card.label_subject}
                  </span>
                  <CopyButton
                    text={subject}
                    label={t.email_card.copy_subject}
                    copiedLabel={t.common.copied}
                  />
                </div>
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm font-medium">
                  {subject}
                </div>
                {email.subjectAlt.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    <span className="text-[11px] text-muted-foreground">
                      {t.email_card.alt_subjects}
                    </span>
                    {email.subjectAlt.map((alt) => (
                      <div key={alt} className="flex items-center gap-2">
                        <span className="flex-1 truncate rounded border border-dashed border-border px-2 py-1 text-xs text-muted-foreground">
                          {alt}
                        </span>
                        <CopyButton
                          text={alt}
                          label={t.common.copy}
                          copiedLabel={t.common.copied}
                          size="sm"
                          variant="ghost"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {t.email_card.label_preheader}
                  </span>
                  <CopyButton
                    text={preheader}
                    label={t.email_card.copy_preheader}
                    copiedLabel={t.common.copied}
                  />
                </div>
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  {preheader}
                </div>
              </div>

              <div>
                <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t.email_card.label_body}
                </span>
                <div
                  className="tipote-quiz-rich max-h-[420px] overflow-y-auto rounded-md border border-border bg-muted/30 px-4 py-3 text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
                <CopyRichButton
                  html={html}
                  label={t.email_card.copy_rich}
                  copiedLabel={t.common.copied}
                />
                <CopyButton
                  text={plain}
                  label={t.email_card.copy_plain}
                  copiedLabel={t.common.copied}
                  variant="outline"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(true)}
                  className="ml-auto"
                >
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  {t.promouvoir.edit_button}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
