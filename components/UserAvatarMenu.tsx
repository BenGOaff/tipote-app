// components/UserAvatarMenu.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  User,
  Link2,
  Settings,
  Target,
  Palette,
  CreditCard,
  LogOut,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

type Props = {
  userEmail: string;
};

export function UserAvatarMenu({ userEmail }: Props) {
  const t = useTranslations("header");
  const router = useRouter();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Load avatar URL from profile
  useEffect(() => {
    (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return;

        const { data } = await supabase
          .from("business_profiles")
          .select("brand_author_photo_url")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (data?.brand_author_photo_url) {
          setAvatarUrl(data.brand_author_photo_url);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  const initials = userEmail
    ? userEmail.slice(0, 2).toUpperCase()
    : "?";

  const handleLogout = useCallback(async () => {
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
      router.push("/");
    } catch {
      router.push("/");
    }
  }, [router]);

  const settingsTabs = [
    { key: "profile", icon: User, tab: "profile" },
    { key: "connections", icon: Link2, tab: "connections" },
    { key: "settings", icon: Settings, tab: "settings" },
    { key: "positioning", icon: Target, tab: "positioning" },
    { key: "branding", icon: Palette, tab: "branding" },
    { key: "subscription", icon: CreditCard, tab: "pricing" },
  ] as const;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="rounded-full ring-2 ring-transparent hover:ring-primary/20 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={t("account")}
        >
          <Avatar className="h-9 w-9 cursor-pointer">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={userEmail} />}
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-3 py-2">
          <p className="text-sm font-medium truncate">{userEmail}</p>
        </div>
        <DropdownMenuSeparator />
        {settingsTabs.map(({ key, icon: Icon, tab }) => (
          <DropdownMenuItem
            key={key}
            onClick={() => router.push(`/settings?tab=${tab}`)}
            className="cursor-pointer"
          >
            <Icon className="mr-2 h-4 w-4" />
            {t(`menu.${key}`)}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {t("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
