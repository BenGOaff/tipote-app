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

// Icone Reddit - SVG logo Snoo simplifie
function RedditIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286C.775 23.225 1.097 24 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0zm4.388 3.199c1.104 0 1.999.895 1.999 1.999 0 .552-.225 1.052-.587 1.414-.363.363-.863.587-1.414.587-.552 0-1.052-.225-1.414-.587-.363-.363-.587-.863-.587-1.414 0-1.104.897-1.999 2.003-1.999zM12 6c2.379 0 4.438.86 6.042 2.165.162-.108.355-.165.558-.165.552 0 1 .448 1 1 0 .369-.2.691-.497.864C20.316 11.453 21 13.162 21 15c0 3.866-4.029 7-9 7s-9-3.134-9-7c0-1.838.684-3.547 1.897-5.136C4.6 9.691 4.4 9.369 4.4 9c0-.552.448-1 1-1 .203 0 .396.057.558.165C7.562 6.86 9.621 6 12 6zm-3.5 8c-.828 0-1.5-.672-1.5-1.5S7.672 11 8.5 11s1.5.672 1.5 1.5S9.328 14 8.5 14zm7 0c-.828 0-1.5-.672-1.5-1.5s.672-1.5 1.5-1.5 1.5.672 1.5 1.5-.672 1.5-1.5 1.5zm-7.163 3.243c.19-.236.534-.275.77-.086C9.972 17.844 10.946 18.2 12 18.2c1.054 0 2.028-.356 2.893-1.043.236-.19.58-.15.77.086.19.236.15.58-.086.77C14.54 18.864 13.32 19.3 12 19.3s-2.54-.436-3.577-1.287c-.236-.19-.275-.534-.086-.77z" />
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
    key: "facebook",
    label: "Facebook",
    icon: <Facebook className="h-5 w-5 text-[#1877F2]" />,
    color: "bg-[#1877F2]",
    bgColor: "bg-[#1877F2]/10",
    hoverColor: "hover:bg-[#0C5DC7]",
    oauthUrl: "/api/auth/meta",
  },
  {
    key: "instagram",
    label: "Instagram",
    icon: <Instagram className="h-5 w-5 text-[#E1306C]" />,
    color: "bg-[#E1306C]",
    bgColor: "bg-[#E1306C]/10",
    hoverColor: "hover:bg-[#C1185A]",
    oauthUrl: "/api/auth/instagram",
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
    key: "reddit",
    label: "Reddit",
    icon: <RedditIcon className="h-5 w-5 text-[#FF4500]" />,
    color: "bg-[#FF4500]",
    bgColor: "bg-[#FF4500]/10",
    hoverColor: "hover:bg-[#CC3700]",
    oauthUrl: "/api/auth/reddit",
  },
];

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

    // Reddit
    if (searchParams.get("reddit_connected") === "1") {
      toast({ title: t("toast.redditOk"), description: t("toast.redditOkDesc") });
      fetchConnections();
    }
    const redditError = searchParams.get("reddit_error");
    if (redditError) {
      toast({
        title: `${t("toast.errorTitle")} Reddit`,
        description: decodeURIComponent(redditError),
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

          {/* Placeholder pour les futurs réseaux */}
          {["TikTok"].map((name) => (
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
