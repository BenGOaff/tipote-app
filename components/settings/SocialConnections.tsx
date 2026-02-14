// components/settings/SocialConnections.tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Linkedin, Facebook, AtSign, Instagram, Unplug, RefreshCw, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/hooks/use-toast";

type Connection = {
  id: string;
  platform: string;
  platform_user_id: string | null;
  platform_username: string | null;
  token_expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  expired: boolean;
};

type PlatformConfig = {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  hoverColor: string;
  /** URL pour OAuth redirect (LinkedIn, Facebook, Threads) */
  oauthUrl?: string;
  /** URL pour discovery via POST (Instagram) */
  discoverUrl?: string;
  /** Prerequis : plateforme qui doit etre connectee d'abord */
  requiresPlatform?: string;
};

const PLATFORMS: PlatformConfig[] = [
  {
    key: "linkedin",
    label: "LinkedIn",
    description: "Publie sur ton profil personnel LinkedIn",
    icon: <Linkedin className="h-5 w-5 text-[#0A66C2]" />,
    color: "bg-[#0A66C2]",
    bgColor: "bg-[#0A66C2]/10",
    hoverColor: "hover:bg-[#004182]",
    oauthUrl: "/api/auth/linkedin",
  },
  {
    key: "facebook",
    label: "Facebook",
    description: "Publie sur ta Page Facebook",
    icon: <Facebook className="h-5 w-5 text-[#1877F2]" />,
    color: "bg-[#1877F2]",
    bgColor: "bg-[#1877F2]/10",
    hoverColor: "hover:bg-[#0C5DC7]",
    oauthUrl: "/api/auth/meta",
  },
  {
    key: "instagram",
    label: "Instagram",
    description: "Publie sur ton compte Instagram Business/Creator",
    icon: <Instagram className="h-5 w-5 text-[#E4405F]" />,
    color: "bg-[#E4405F]",
    bgColor: "bg-[#E4405F]/10",
    hoverColor: "hover:bg-[#C13584]",
    oauthUrl: "/api/auth/instagram",
  },
  {
    key: "threads",
    label: "Threads",
    description: "Publie sur ton compte Threads",
    icon: <AtSign className="h-5 w-5 text-[#000000]" />,
    color: "bg-[#000000]",
    bgColor: "bg-[#000000]/10",
    hoverColor: "hover:bg-[#333333]",
    oauthUrl: "/api/auth/threads",
  },
];

export default function SocialConnections() {
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDisconnect, startDisconnect] = useTransition();
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [discoveringPlatform, setDiscoveringPlatform] = useState<string | null>(null);

  // Charger les connexions
  const fetchConnections = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/social/connections");
      const json = await res.json();
      setConnections(json?.connections ?? []);
    } catch {
      // silencieux
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnections();
  }, []);

  // Afficher les toasts basés sur les query params (retour OAuth)
  useEffect(() => {
    // LinkedIn
    if (searchParams.get("linkedin_connected") === "1") {
      toast({
        title: "LinkedIn connecté",
        description: "Ton compte LinkedIn est maintenant lié à Tipote.",
      });
      fetchConnections();
    }
    const linkedinError = searchParams.get("linkedin_error");
    if (linkedinError) {
      toast({
        title: "Erreur LinkedIn",
        description: decodeURIComponent(linkedinError),
        variant: "destructive",
      });
    }

    // Facebook
    if (searchParams.get("meta_connected") === "facebook") {
      toast({
        title: "Facebook connecte",
        description: "Ta Page Facebook est maintenant liee a Tipote.",
      });
      fetchConnections();
    }
    const metaError = searchParams.get("meta_error");
    if (metaError) {
      toast({
        title: "Erreur Facebook",
        description: decodeURIComponent(metaError),
        variant: "destructive",
      });
    }

    // Instagram (callback legacy – au cas ou)
    if (searchParams.get("instagram_connected") === "1") {
      toast({
        title: "Instagram connecte",
        description: "Ton compte Instagram est maintenant lie a Tipote.",
      });
      fetchConnections();
    }
    const instagramError = searchParams.get("instagram_error");
    if (instagramError) {
      toast({
        title: "Erreur Instagram",
        description: decodeURIComponent(instagramError),
        variant: "destructive",
      });
    }

    // Threads
    if (searchParams.get("threads_connected") === "1") {
      toast({
        title: "Threads connecte",
        description: "Ton compte Threads est maintenant lie a Tipote.",
      });
      fetchConnections();
    }
    const threadsError = searchParams.get("threads_error");
    if (threadsError) {
      toast({
        title: "Erreur Threads",
        description: decodeURIComponent(threadsError),
        variant: "destructive",
      });
    }
  }, [searchParams, toast]);

  const onConnect = (oauthUrl: string) => {
    window.location.href = oauthUrl;
  };

  /** Connexion via discovery API (Instagram) : POST au lieu de redirect OAuth */
  const onDiscover = async (platform: PlatformConfig) => {
    if (!platform.discoverUrl) return;

    // Verifier que le prerequis est connecte
    if (platform.requiresPlatform) {
      const required = connections.find((c) => c.platform === platform.requiresPlatform && !c.expired);
      if (!required) {
        toast({
          title: `${platform.label} necessite Facebook`,
          description: "Connecte d'abord ta Page Facebook, puis clique sur Connecter Instagram.",
          variant: "destructive",
        });
        return;
      }
    }

    setDiscoveringPlatform(platform.key);
    try {
      const res = await fetch(platform.discoverUrl, { method: "POST" });
      const json = await res.json();

      if (json.ok) {
        toast({
          title: `${platform.label} connecte`,
          description: `Compte @${json.username ?? platform.label} lie a Tipote.`,
        });
        fetchConnections();
      } else {
        toast({
          title: `Erreur ${platform.label}`,
          description: json.error ?? "Erreur inconnue",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Erreur réseau",
        description: `Impossible de connecter ${platform.label}.`,
        variant: "destructive",
      });
    } finally {
      setDiscoveringPlatform(null);
    }
  };

  const onDisconnect = (id: string) => {
    setDisconnectingId(id);
    startDisconnect(async () => {
      try {
        const res = await fetch("/api/social/connections", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        const json = await res.json();
        if (json.ok) {
          toast({ title: "Compte déconnecté", description: "La connexion a été supprimée." });
          setConnections((prev) => prev.filter((c) => c.id !== id));
        } else {
          toast({ title: "Erreur", description: json.error ?? "Erreur inconnue", variant: "destructive" });
        }
      } catch {
        toast({ title: "Erreur", description: "Erreur réseau", variant: "destructive" });
      } finally {
        setDisconnectingId(null);
      }
    });
  };

  const getConnection = (platform: string) => connections.find((c) => c.platform === platform);

  return (
    <Card className="p-6">
      <h3 className="text-lg font-bold mb-2">Comptes sociaux</h3>
      <p className="text-sm text-muted-foreground mb-6">
        Connecte tes réseaux sociaux pour publier directement depuis Tipote.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          Chargement...
        </div>
      ) : (
        <div className="space-y-4">
          {PLATFORMS.map((platform) => {
            const connection = getConnection(platform.key);
            const isDiscovering = discoveringPlatform === platform.key;

            return (
              <div
                key={platform.key}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${platform.bgColor}`}>
                    {platform.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{platform.label}</span>
                      {connection && !connection.expired && (
                        <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 text-xs">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Connecté
                        </Badge>
                      )}
                      {connection?.expired && (
                        <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 text-xs">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Expiré
                        </Badge>
                      )}
                    </div>
                    {connection ? (
                      <p className="text-sm text-muted-foreground">
                        {connection.platform_username ?? "Compte connecte"}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">{platform.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {connection ? (
                    <>
                      {connection.expired && (
                        platform.oauthUrl ? (
                          <Button variant="outline" size="sm" onClick={() => onConnect(platform.oauthUrl!)}>
                            <RefreshCw className="w-4 h-4 mr-1" />
                            Reconnecter
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => onDiscover(platform)} disabled={isDiscovering}>
                            {isDiscovering ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                            Reconnecter
                          </Button>
                        )
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-rose-600"
                            disabled={pendingDisconnect && disconnectingId === connection.id}
                          >
                            <Unplug className="w-4 h-4 mr-1" />
                            Déconnecter
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Déconnecter {platform.label} ?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Tu ne pourras plus publier sur {platform.label} depuis Tipote.
                              Tu peux reconnecter ton compte à tout moment.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annuler</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={(e) => {
                                e.preventDefault();
                                onDisconnect(connection.id);
                              }}
                              className="bg-rose-600 hover:bg-rose-700"
                            >
                              Déconnecter
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  ) : (
                    platform.oauthUrl ? (
                      <Button
                        onClick={() => onConnect(platform.oauthUrl!)}
                        className={`${platform.color} ${platform.hoverColor} text-white`}
                      >
                        {platform.icon}
                        <span className="ml-2">Connecter {platform.label}</span>
                      </Button>
                    ) : (
                      <Button
                        onClick={() => onDiscover(platform)}
                        disabled={isDiscovering}
                        className={`${platform.color} ${platform.hoverColor} text-white`}
                      >
                        {isDiscovering ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          platform.icon
                        )}
                        <span className="ml-2">
                          {isDiscovering ? "Recherche..." : `Connecter ${platform.label}`}
                        </span>
                      </Button>
                    )
                  )}
                </div>
              </div>
            );
          })}

          {/* Placeholder pour les futurs réseaux */}
          {["X (Twitter)", "TikTok"].map((name) => (
            <div
              key={name}
              className="flex items-center justify-between rounded-lg border border-dashed p-4 opacity-50"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <span className="text-xs font-medium text-muted-foreground">
                    {name.charAt(0)}
                  </span>
                </div>
                <div>
                  <span className="font-medium">{name}</span>
                  <p className="text-sm text-muted-foreground">Bientôt disponible</p>
                </div>
              </div>
              <Badge variant="outline" className="text-xs">Prochainement</Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
