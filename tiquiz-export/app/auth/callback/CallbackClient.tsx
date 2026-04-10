"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { Button } from "@/components/ui/button";

function parseHashParams(hash: string): Record<string, string> {
  const h = (hash || "").replace(/^#/, "").trim();
  const out: Record<string, string> = {};
  if (!h) return out;
  for (const part of h.split("&")) {
    const [k, v] = part.split("=");
    if (!k) continue;
    out[decodeURIComponent(k)] = decodeURIComponent(v || "");
  }
  return out;
}

export default function CallbackClient() {
  const t = useTranslations("callbackPage");
  const router = useRouter();
  const searchParams = useSearchParams();
  const ranRef = useRef(false);

  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const code = useMemo(() => (searchParams?.get("code") || "").trim(), [searchParams]);
  const tokenHash = useMemo(() => (searchParams?.get("token_hash") || "").trim(), [searchParams]);
  const type = useMemo(() => (searchParams?.get("type") || "").trim().toLowerCase(), [searchParams]);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      try {
        const supabase = getSupabaseBrowserClient();

        // OTP flow (token_hash)
        if (tokenHash) {
          const otpType = (type || "magiclink") as "magiclink" | "recovery" | "invite";
          const { error } = await supabase.auth.verifyOtp({ type: otpType, token_hash: tokenHash });
          if (error) throw error;
          router.replace("/dashboard");
          return;
        }

        // PKCE flow (?code=...)
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          router.replace("/dashboard");
          return;
        }

        // Implicit hash (#access_token=...&refresh_token=...)
        const hashParams = parseHashParams(window.location.hash || "");
        const access_token = (hashParams["access_token"] || "").trim();
        const refresh_token = (hashParams["refresh_token"] || "").trim();

        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) throw error;
          try {
            window.history.replaceState({}, document.title, window.location.pathname);
          } catch { /* ignore */ }
          router.replace("/dashboard");
          return;
        }

        router.replace("/login?auth_error=missing_code");
      } catch (e) {
        const msg = e instanceof Error ? e.message : t("errUnknown");
        setStatus("error");
        setErrorMsg(msg);
      }
    })();
  }, [router, code, tokenHash, type, t]);

  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-md rounded-2xl border border-border p-8 text-center">
          <h1 className="text-xl font-semibold mb-2">{t("loadingTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("loadingDesc")}</p>
          <div className="mt-4 h-2 w-full bg-muted rounded-full overflow-hidden">
            <div className="h-full w-2/3 bg-primary/30 rounded-full animate-pulse" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md rounded-2xl border border-border p-8 text-center">
        <h1 className="text-xl font-semibold mb-2">{t("errorHeading")}</h1>
        <p className="text-sm text-muted-foreground break-words">{errorMsg || t("errUnknown")}</p>
        <Button className="mt-6 w-full" variant="outline" onClick={() => router.replace("/login")}>
          {t("backToLogin")}
        </Button>
      </div>
    </main>
  );
}
