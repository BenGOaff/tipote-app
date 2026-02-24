// components/settings/SocialConnections.tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Linkedin, Facebook, Instagram, AtSign, Unplug, RefreshCw, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

// Icone X (Twitter) - SVG officiel du logo X
function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

// Icone TikTok - SVG logo
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.72a8.2 8.2 0 0 0 4.76 1.52v-3.4a4.85 4.85 0 0 1-1-.15z" />
    </svg>
  );
}

// Icone Pinterest - SVG logo P
function PinterestIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z" />
    </svg>
  );
}

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
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  hoverColor: string;
  oauthUrl: string;
};

// Plateformes actives — accessibles aux users
const PLATFORMS: PlatformConfig[] = [
  {
    key: "linkedin",
    label: "LinkedIn",
    icon: <Linkedin className="h-5 w-5 text-[#0A66C2]" />,
    color: "bg-[#0A66C2]",
    bgColor: "bg-[#0A66C2]/10",
    hoverColor: "hover:bg-[#004182]",
    oauthUrl: "/api/auth/linkedin",
  },
  {
    key: "threads",
    label: "Threads",
    icon: <AtSign className="h-5 w-5 text-[#000000]" />,
    color: "bg-[#000000]",
    bgColor: "bg-[#000000]/10",
    hoverColor: "hover:bg-[#333333]",
    oauthUrl: "/api/auth/threads",
  },
  {
    key: "twitter",
    label: "X (Twitter)",
    icon: <XIcon className="h-5 w-5 text-[#000000]" />,
    color: "bg-[#000000]",
    bgColor: "bg-[#000000]/10",
    hoverColor: "hover:bg-[#333333]",
    oauthUrl: "/api/auth/twitter",
  },
  {
    key: "tiktok",
    label: "TikTok",
    icon: <TikTokIcon className="h-5 w-5 text-[#000000]" />,
    color: "bg-[#000000]",
    bgColor: "bg-[#000000]/10",
    hoverColor: "hover:bg-[#333333]",
    oauthUrl: "/api/auth/tiktok",
  },
  {
    key: "facebook",
    label: "Facebook",
    icon: <Facebook className="h-5 w-5 text-[#1877F2]" />,
    color: "bg-[#1877F2]",
    bgColor: "bg-[#1877F2]/10",
    hoverColor: "hover:bg-[#1565C0]",
    oauthUrl: "/api/auth/meta",
  },
  {
    key: "instagram",
    label: "Instagram",
    icon: <Instagram className="h-5 w-5 text-[#E1306C]" />,
    color: "bg-[#E1306C]",
    bgColor: "bg-[#E1306C]/10",
    hoverColor: "hover:bg-[#C2185B]",
    oauthUrl: "/api/auth/instagram",
  },
  {
    key: "pinterest",
    label: "Pinterest",
    icon: <PinterestIcon className="h-5 w-5 text-[#E60023]" />,
    color: "bg-[#E60023]",
    bgColor: "bg-[#E60023]/10",
    hoverColor: "hover:bg-[#C50000]",
    oauthUrl: "/api/auth/pinterest",
  },
];

// Plateformes en attente — "bientot disponible"
const COMING_SOON_PLATFORMS: { key: string; label: string; icon: React.ReactNode; bgColor: string }[] = [];

export default function SocialConnections() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const t = useTranslations("social");
  const tc = useTranslations("common");

  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDisconnect, startDisconnect] = useTransition();
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);


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
      toast({ title: t("toast.linkedinOk"), description: t("toast.linkedinOkDesc") });
      fetchConnections();
    }
    const linkedinError = searchParams.get("linkedin_error");
    if (linkedinError) {
      toast({
        title: `${t("toast.errorTitle")} LinkedIn`,
        description: decodeURIComponent(linkedinError),
        variant: "destructive",
      });
    }

    // Facebook
    if (searchParams.get("meta_connected") === "facebook") {
      toast({ title: t("toast.facebookOk"), description: t("toast.facebookOkDesc") });
      fetchConnections();
    }
    const metaError = searchParams.get("meta_error");
    if (metaError) {
      toast({
        title: `${t("toast.errorTitle")} Facebook`,
        description: decodeURIComponent(metaError),
        variant: "destructive",
      });
    }

    // Instagram
    if (searchParams.get("instagram_connected") === "1") {
      toast({ title: t("toast.instagramOk"), description: t("toast.instagramOkDesc") });
      fetchConnections();
    }
    const instagramError = searchParams.get("instagram_error");
    if (instagramError) {
      toast({
        title: `${t("toast.errorTitle")} Instagram`,
        description: decodeURIComponent(instagramError),
        variant: "destructive",
      });
    }

    // Threads
    if (searchParams.get("threads_connected") === "1") {
      toast({ title: t("toast.threadsOk"), description: t("toast.threadsOkDesc") });
      fetchConnections();
    }
    const threadsError = searchParams.get("threads_error");
    if (threadsError) {
      toast({
        title: `${t("toast.errorTitle")} Threads`,
        description: decodeURIComponent(threadsError),
        variant: "destructive",
      });
    }

    // X (Twitter)
    if (searchParams.get("twitter_connected") === "1") {
      toast({ title: t("toast.twitterOk"), description: t("toast.twitterOkDesc") });
      fetchConnections();
    }
    const twitterError = searchParams.get("twitter_error");
    if (twitterError) {
      toast({
        title: `${t("toast.errorTitle")} X`,
        description: decodeURIComponent(twitterError),
        variant: "destructive",
      });
    }

    // TikTok
    if (searchParams.get("tiktok_connected") === "1") {
      toast({ title: t("toast.tiktokOk"), description: t("toast.tiktokOkDesc") });
      fetchConnections();
    }
    const tiktokError = searchParams.get("tiktok_error");
    if (tiktokError) {
      toast({
        title: `${t("toast.errorTitle")} TikTok`,
        description: decodeURIComponent(tiktokError),
        variant: "destructive",
      });
    }

    // Pinterest
    if (searchParams.get("pinterest_connected") === "1") {
      toast({ title: t("toast.pinterestOk"), description: t("toast.pinterestOkDesc") });
      fetchConnections();
    }
    const pinterestError = searchParams.get("pinterest_error");
    if (pinterestError) {
      toast({
        title: `${t("toast.errorTitle")} Pinterest`,
        description: decodeURIComponent(pinterestError),
        variant: "destructive",
      });
    }
  }, [searchParams, toast, t]);

  const onConnect = (oauthUrl: string) => {
    window.location.href = oauthUrl;
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
          toast({ title: t("toast.disconnected"), description: t("toast.disconnectedDesc") });
          setConnections((prev) => prev.filter((c) => c.id !== id));
        } else {
          toast({ title: t("toast.errorTitle"), description: json.error ?? t("toast.errorUnknown"), variant: "destructive" });
        }
      } catch {
        toast({ title: t("toast.errorTitle"), description: t("toast.errorNetwork"), variant: "destructive" });
      } finally {
        setDisconnectingId(null);
      }
    });
  };

  const getConnection = (platform: string) => connections.find((c) => c.platform === platform);

  return (
    <Card className="p-6">
      <h3 className="text-lg font-bold mb-2">{t("title")}</h3>
      <p className="text-sm text-muted-foreground mb-6">{t("subtitle")}</p>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t("loading")}
        </div>
      ) : (
        <div className="space-y-4">
          {PLATFORMS.map((platform) => {
            const connection = getConnection(platform.key);

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
                          {t("connected")}
                        </Badge>
                      )}
                      {connection?.expired && (
                        <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 text-xs">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          {t("expired")}
                        </Badge>
                      )}
                    </div>
                    {connection ? (
                      <p className="text-sm text-muted-foreground">
                        {connection.platform_username ?? t("connectedFallback")}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">{t(`platforms.${platform.key}`)}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {connection ? (
                    <>
                      {connection.expired && (
                        <Button variant="outline" size="sm" onClick={() => onConnect(platform.oauthUrl)}>
                          <RefreshCw className="w-4 h-4 mr-1" />
                          {t("reconnect")}
                        </Button>
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
                            {t("disconnect")}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t("disconnectTitle", { platform: platform.label })}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t("disconnectDesc", { platform: platform.label })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={(e) => {
                                e.preventDefault();
                                onDisconnect(connection.id);
                              }}
                              className="bg-rose-600 hover:bg-rose-700"
                            >
                              {t("disconnectConfirm")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  ) : (
                    <Button
                      onClick={() => onConnect(platform.oauthUrl)}
                      className={`${platform.color} ${platform.hoverColor} text-white`}
                    >
                      {platform.icon}
                      <span className="ml-2">{t("connect", { platform: platform.label })}</span>
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Plateformes en attente — bientot disponible */}
          {COMING_SOON_PLATFORMS.map((platform) => (
            <div
              key={platform.key}
              className="flex items-center justify-between rounded-lg border border-dashed p-4 opacity-50"
            >
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${platform.bgColor}`}>
                  {platform.icon}
                </div>
                <div>
                  <span className="font-medium">{platform.label}</span>
                  <p className="text-sm text-muted-foreground">{t("comingSoon")}</p>
                </div>
              </div>
              <Badge variant="outline" className="text-xs">{t("comingSoonBadge")}</Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
