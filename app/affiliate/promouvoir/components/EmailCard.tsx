"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CopyButton } from "./CopyButton";
import type { EmailTemplate } from "../content/emails-fr";

export function EmailCard({
  email,
  affiliateLink,
  displayName,
}: {
  email: EmailTemplate;
  affiliateLink: string;
  displayName: string;
}) {
  const [open, setOpen] = useState(false);

  // Remplacer les placeholders pour la copie réelle (mais on garde
  // {first_name} qui est la variable Systeme io que l'affilié laisse
  // intacte pour la perso côté envoi).
  const resolvedSubject = email.subject;
  const resolvedBody = email.body
    .replaceAll("{AFFILIATE_LINK}", affiliateLink)
    .replaceAll("{NAME}", displayName);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary flex-shrink-0" />
              <span className="truncate">{resolvedSubject}</span>
            </CardTitle>
            <CardDescription className="mt-1 text-xs">
              Pré-header : {email.preheader}
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
              <>
                <ChevronUp className="h-4 w-4 mr-1" />
                Replier
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-1" />
                Voir
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4">
          {email.notes && (
            <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground italic">
              💡 {email.notes}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Objet
              </span>
              <CopyButton text={resolvedSubject} label="Copier l'objet" />
            </div>
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm font-medium">
              {resolvedSubject}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Pré-header
              </span>
              <CopyButton text={email.preheader} label="Copier" />
            </div>
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              {email.preheader}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Corps de l&apos;email
              </span>
              <CopyButton text={resolvedBody} label="Copier le corps" />
            </div>
            <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed max-h-[400px] overflow-y-auto">
              {resolvedBody}
            </div>
          </div>

          <div className="flex gap-2 pt-2 border-t border-border">
            <CopyButton
              text={`Objet : ${resolvedSubject}\nPré-header : ${email.preheader}\n\n${resolvedBody}`}
              label="Tout copier (objet + corps)"
              size="default"
              variant="default"
            />
          </div>
        </CardContent>
      )}
    </Card>
  );
}
