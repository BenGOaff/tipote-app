"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Copy, ExternalLink, Globe, Image, Link2, Check, Code,
} from "lucide-react";
import { toast } from "sonner";

const SOCIAL_NETWORKS = [
  { id: "facebook", label: "Facebook", icon: "f" },
  { id: "linkedin", label: "LinkedIn", icon: "in" },
  { id: "x", label: "X (Twitter)", icon: "X" },
  { id: "instagram", label: "Instagram", icon: "ig" },
  { id: "pinterest", label: "Pinterest", icon: "P" },
  { id: "threads", label: "Threads", icon: "@" },
  { id: "reddit", label: "Reddit", icon: "r" },
  { id: "email", label: "Email", icon: "@" },
] as const;

interface QuizShareSettingsProps {
  quizId: string;
  status: string;
  ogImageUrl: string;
  ogDescription?: string;
  slug?: string;
  shareNetworks?: string[];
  onStatusChange: (status: string) => void;
  onOgImageChange: (url: string) => void;
  onOgDescriptionChange?: (desc: string) => void;
  onSlugChange?: (slug: string) => void;
  onShareNetworksChange?: (networks: string[]) => void;
}

export default function QuizShareSettings({
  quizId, status, ogImageUrl, ogDescription = "", slug = "",
  shareNetworks = ["facebook", "linkedin", "x", "email"],
  onStatusChange, onOgImageChange, onOgDescriptionChange, onSlugChange,
  onShareNetworksChange,
}: QuizShareSettingsProps) {
  const [copied, setCopied] = useState<"link" | "iframe" | null>(null);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const effectiveSlug = slug || quizId;
  const publicUrl = `${baseUrl}/q/${effectiveSlug}`;
  const iframeCode = `<iframe src="${publicUrl}" width="100%" height="700" frameborder="0" style="border:none;border-radius:12px;max-width:640px;margin:0 auto;display:block;"></iframe>`;

  function copyText(text: string, type: "link" | "iframe") {
    navigator.clipboard.writeText(text);
    setCopied(type);
    toast.success(type === "link" ? "Lien copié !" : "Code iframe copié !");
    setTimeout(() => setCopied(null), 2000);
  }

  function toggleNetwork(id: string) {
    if (!onShareNetworksChange) return;
    onShareNetworksChange(
      shareNetworks.includes(id)
        ? shareNetworks.filter((n) => n !== id)
        : [...shareNetworks, id]
    );
  }

  return (
    <div className="space-y-4">
      {/* Status toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Publication
          </CardTitle>
          <CardDescription>Active ou désactive l&apos;accès public à ton quiz</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge variant={status === "active" ? "default" : "secondary"}>
                {status === "active" ? "Actif" : "Brouillon"}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {status === "active"
                  ? "Ton quiz est accessible publiquement"
                  : "Ton quiz n'est visible que par toi"}
              </span>
            </div>
            <Button
              variant={status === "active" ? "outline" : "default"}
              size="sm"
              onClick={() => onStatusChange(status === "active" ? "draft" : "active")}
            >
              {status === "active" ? "Désactiver" : "Activer"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Public link + slug */}
      {quizId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" />
              Lien de partage
            </CardTitle>
            <CardDescription>URL personnalisable pour partager ton quiz</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {onSlugChange && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground shrink-0">{baseUrl}/q/</span>
                <Input
                  value={slug}
                  onChange={(e) => onSlugChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder={quizId.slice(0, 8)}
                  className="font-mono text-sm"
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Input value={publicUrl} readOnly className="font-mono text-sm bg-muted" />
              <Button variant="outline" size="icon" onClick={() => copyText(publicUrl, "link")} className="shrink-0">
                {copied === "link" ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button variant="outline" size="icon" asChild className="shrink-0">
                <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Iframe embed */}
      {quizId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5 text-primary" />
              Intégration iframe
            </CardTitle>
            <CardDescription>Copie ce code pour intégrer le quiz dans ton site</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <pre className="text-xs font-mono bg-muted rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all border">
                {iframeCode}
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => copyText(iframeCode, "iframe")}
              >
                {copied === "iframe" ? <Check className="h-3.5 w-3.5 mr-1 text-green-500" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                {copied === "iframe" ? "Copié" : "Copier"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Social sharing networks */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Réseaux de partage
          </CardTitle>
          <CardDescription>Choisis les réseaux sur lesquels tes visiteurs pourront partager le quiz</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {SOCIAL_NETWORKS.map((net) => {
              const active = shareNetworks.includes(net.id);
              return (
                <button
                  key={net.id}
                  type="button"
                  onClick={() => toggleNetwork(net.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                    active
                      ? "border-primary bg-primary/5 text-primary font-medium"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                    active ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    {net.icon}
                  </div>
                  {net.label}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* OG meta */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Image className="h-5 w-5 text-primary" />
            Méta données sociales
          </CardTitle>
          <CardDescription>
            Image et description affichées lors du partage sur les réseaux
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {ogImageUrl && (
            <div className="rounded-lg border overflow-hidden">
              <img src={ogImageUrl} alt="OG Preview" className="w-full h-auto max-h-48 object-cover" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Image de partage (1200x630px)</Label>
            <Input
              value={ogImageUrl}
              onChange={(e) => onOgImageChange(e.target.value)}
              placeholder="https://monsite.com/og-image.jpg"
            />
          </div>
          {onOgDescriptionChange && (
            <div className="space-y-1.5">
              <Label>Meta description</Label>
              <Input
                value={ogDescription}
                onChange={(e) => onOgDescriptionChange(e.target.value)}
                placeholder="Découvre quel profil tu es en répondant à ce quiz !"
                maxLength={160}
              />
              <p className="text-xs text-muted-foreground">{ogDescription.length}/160</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
