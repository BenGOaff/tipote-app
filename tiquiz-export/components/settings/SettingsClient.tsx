"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import LanguageSwitcher from "@/components/LanguageSwitcher";

type Profile = {
  full_name: string | null;
  ui_locale: string | null;
  address_form: string | null;
  privacy_url: string | null;
  sio_user_api_key: string | null;
  sio_api_key_name: string | null;
};

export default function SettingsClient() {
  const t = useTranslations("settings");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [sioKey, setSioKey] = useState("");
  const [sioKeyName, setSioKeyName] = useState("");
  const [privacyUrl, setPrivacyUrl] = useState("");
  const [addressForm, setAddressForm] = useState("tu");

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.profile) {
          setProfile(data.profile);
          setSioKey(data.profile.sio_user_api_key ?? "");
          setSioKeyName(data.profile.sio_api_key_name ?? "");
          setPrivacyUrl(data.profile.privacy_url ?? "");
          setAddressForm(data.profile.address_form ?? "tu");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sio_user_api_key: sioKey.trim() || null,
          sio_api_key_name: sioKeyName.trim() || null,
          privacy_url: privacyUrl.trim() || null,
          address_form: addressForm,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(t("saved"));
      } else {
        toast.error(t("error"));
      }
    } catch {
      toast.error(t("error"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="w-full border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard"><ArrowLeft className="h-4 w-4 mr-1" />Tiquiz</Link>
          </Button>
          <h1 className="text-xl font-bold">{t("title")}</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Language */}
        <Card>
          <CardHeader>
            <CardTitle>{t("languageTitle")}</CardTitle>
            <CardDescription>{t("languageDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <LanguageSwitcher />
          </CardContent>
        </Card>

        {/* Profile */}
        <Card>
          <CardHeader>
            <CardTitle>{t("profileTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t("addressFormLabel")}</Label>
              <select
                value={addressForm}
                onChange={(e) => setAddressForm(e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
              >
                <option value="tu">Tu</option>
                <option value="vous">Vous</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t("privacyUrlLabel")}</Label>
              <Input
                value={privacyUrl}
                onChange={(e) => setPrivacyUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
          </CardContent>
        </Card>

        {/* Systeme.io */}
        <Card>
          <CardHeader>
            <CardTitle>{t("sioTitle")}</CardTitle>
            <CardDescription>{t("sioDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t("sioKeyNameLabel")}</Label>
              <Input
                value={sioKeyName}
                onChange={(e) => setSioKeyName(e.target.value)}
                placeholder={t("sioKeyNamePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("sioKeyLabel")}</Label>
              <Input
                type="password"
                value={sioKey}
                onChange={(e) => setSioKey(e.target.value)}
                placeholder={t("sioKeyPlaceholder")}
              />
            </div>
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? "…" : t("saved").replace(".", "")}
        </Button>
      </main>
    </div>
  );
}
