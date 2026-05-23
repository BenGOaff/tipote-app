// components/pages/LinkinbioEditor.tsx
// Editor for Link-in-Bio pages: manage links, customize theme, live preview.

"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowLeft, Plus, Trash2, GripVertical, Eye, EyeOff,
  ExternalLink, Globe, Loader2, Check, Copy, Link2,
  Type, Users, Mail, Smartphone, Monitor, Image as ImageIcon,
  Palette, Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useShareDomain } from "@/hooks/useShareDomain";
import { ShareDomainPicker } from "@/components/share/ShareDomainPicker";
import { useToast } from "@/hooks/use-toast";
import { buildLinkinbioPage, type LinkinbioPageData, type LinkinbioTheme, type ButtonStyle } from "@/lib/linkinbioBuilder";

// ─── Types ───

type LinkBlock = {
  id: string;
  block_type: "link" | "header" | "social_icons" | "capture_form";
  title: string;
  url: string;
  icon_url: string;
  social_links: { platform: string; url: string }[];
  enabled: boolean;
  sort_order: number;
  clicks_count: number;
  open_in_new_tab: boolean;
  color: string | null;
};

type PageData = {
  id: string;
  title: string;
  slug: string;
  page_type: string;
  status: string;
  content_data: Record<string, any>;
  brand_tokens: Record<string, any>;
  html_snapshot: string;
  meta_title: string;
  meta_description: string;
  og_image_url: string;
  capture_heading: string;
  capture_subtitle: string;
  capture_first_name: boolean;
  sio_capture_tag: string;
  views_count: number;
  leads_count: number;
  clicks_count?: number;
  locale?: string;
};

type Props = {
  initialPage: PageData;
  onBack: () => void;
};

const SOCIAL_PLATFORMS = [
  "instagram", "linkedin", "youtube", "tiktok", "twitter",
  "facebook", "pinterest", "threads", "spotify", "whatsapp",
  "telegram", "website", "email",
];

const THEMES: { id: LinkinbioTheme; label: string; preview: string }[] = [
  { id: "minimal", label: "Minimal", preview: "bg-gray-50 dark:bg-gray-900/40 text-gray-900 dark:text-gray-50" },
  { id: "dark", label: "Dark", preview: "bg-gray-900 text-white" },
  { id: "gradient", label: "Gradient", preview: "bg-gradient-to-br from-indigo-500 to-purple-600 text-white" },
  { id: "glass", label: "Glass", preview: "bg-gray-800 text-white" },
  { id: "bold", label: "Bold", preview: "bg-indigo-600 text-white" },
];

const BUTTON_STYLES: { id: ButtonStyle; label: string }[] = [
  { id: "rounded", label: "Rounded" },
  { id: "pill", label: "Pill" },
  { id: "outlined", label: "Outlined" },
  { id: "shadow", label: "Shadow" },
  { id: "square", label: "Square" },
];

export default function LinkinbioEditor({ initialPage, onBack }: Props) {
  const { toast } = useToast();
  const t = useTranslations("linkinbio");
  const tc = useTranslations("common");
  const { shareDomain, shareDomainOptions, shareOrigin, setShareDomain, isCustomDomain, buildPublicUrl } = useShareDomain();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Page state
  const [page, setPage] = useState(initialPage);
  const [links, setLinks] = useState<LinkBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Editing state
  const [displayName, setDisplayName] = useState(page.title || "");
  const [bio, setBio] = useState(page.content_data?.bio || "");
  const [slug, setSlug] = useState(page.slug || "");
  const [theme, setTheme] = useState<LinkinbioTheme>(page.content_data?.theme || "minimal");
  const [buttonStyle, setButtonStyle] = useState<ButtonStyle>(page.content_data?.buttonStyle || "rounded");
  const [avatarUrl, setAvatarUrl] = useState<string>(page.content_data?.avatarUrl || "");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [metaTitle, setMetaTitle] = useState(page.meta_title || "");
  const [metaDescription, setMetaDescription] = useState(page.meta_description || "");
  const [copied, setCopied] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<"mobile" | "desktop">("mobile");
  const [activeTab, setActiveTab] = useState<"links" | "design" | "seo">("links");

  // Drag state
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // Load links
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/pages/${page.id}/links`);
        const data = await res.json();
        if (data.ok) setLinks(data.links || []);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [page.id]);

  // Build preview HTML
  const buildPreview = useCallback(() => {
    const cd = page.content_data || {};
    const bt = page.brand_tokens || {};
    const pageData: LinkinbioPageData = {
      pageId: page.id,
      bio,
      displayName,
      avatarUrl: avatarUrl || undefined,
      logoUrl: undefined,
      links: links.map((l) => ({
        id: l.id,
        block_type: l.block_type,
        title: l.title,
        url: l.url,
        icon_url: l.icon_url,
        social_links: l.social_links,
        enabled: l.enabled,
        sort_order: l.sort_order,
        open_in_new_tab: l.open_in_new_tab,
        color: l.color,
      })),
      theme,
      buttonStyle,
      backgroundType: cd.backgroundType,
      backgroundValue: cd.backgroundValue,
      brandColor: bt["colors-primary"],
      brandAccent: bt["colors-accent"],
      brandFont: bt["typography-heading"],
      captureHeading: page.capture_heading,
      captureSubtitle: page.capture_subtitle,
      captureFirstName: page.capture_first_name,
      metaTitle,
      metaDescription,
      locale: page.locale || "fr",
    };
    return buildLinkinbioPage(pageData);
  }, [links, bio, displayName, avatarUrl, theme, buttonStyle, metaTitle, metaDescription, page]);

  // Update preview iframe
  useEffect(() => {
    if (!iframeRef.current) return;
    const html = buildPreview();
    const blob = new Blob([html], { type: "text/html" });
    iframeRef.current.src = URL.createObjectURL(blob);
  }, [buildPreview]);

  // ─── CRUD Handlers ───

  const addBlock = async (blockType: "link" | "header" | "social_icons" | "capture_form") => {
    const defaults: any = { block_type: blockType };
    if (blockType === "link") {
      defaults.title = t("newLink");
      defaults.url = "https://";
    } else if (blockType === "header") {
      defaults.title = t("newHeader");
    } else if (blockType === "social_icons") {
      defaults.title = "Social";
      defaults.social_links = [];
    } else if (blockType === "capture_form") {
      defaults.title = t("captureFormTitle");
    }

    try {
      const res = await fetch(`/api/pages/${page.id}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(defaults),
      });
      const data = await res.json();
      if (data.ok && data.link) {
        setLinks((prev) => [...prev, data.link]);
      }
    } catch {
      toast({ title: tc("error"), variant: "destructive" });
    }
  };

  const updateLink = async (linkId: string, updates: Partial<LinkBlock>) => {
    // Optimistic update
    setLinks((prev) => prev.map((l) => l.id === linkId ? { ...l, ...updates } : l));

    try {
      await fetch(`/api/pages/${page.id}/links`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId, ...updates }),
      });
    } catch { /* revert would be complex, ignore for now */ }
  };

  const deleteLink = async (linkId: string) => {
    setLinks((prev) => prev.filter((l) => l.id !== linkId));

    try {
      await fetch(`/api/pages/${page.id}/links`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId }),
      });
    } catch { /* ignore */ }
  };

  // Drag & drop
  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    setLinks((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(idx, 0, moved);
      return next;
    });
    setDragIdx(idx);
  };
  const handleDragEnd = async () => {
    setDragIdx(null);
    // Save new order
    const orderedIds = links.map((l) => l.id);
    try {
      await fetch(`/api/pages/${page.id}/links/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds }),
      });
    } catch { /* ignore */ }
  };

  // Avatar upload — reuse /api/upload/image with contentId=linkinbio-<page>
  const uploadAvatar = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: tc("error"), description: t("avatarFormatHint"), variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: tc("error"), description: t("avatarTooLarge"), variant: "destructive" });
      return;
    }
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("contentId", `linkinbio-${page.id}`);
      const res = await fetch("/api/upload/image", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast({ title: tc("error"), description: data.error ?? t("avatarUploadError"), variant: "destructive" });
        return;
      }
      setAvatarUrl(data.url);
    } catch {
      toast({ title: tc("error"), variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const clearAvatar = () => {
    setAvatarUrl("");
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  };

  // Save page settings
  const savePage = async () => {
    setSaving(true);
    try {
      const contentData = {
        ...(page.content_data || {}),
        bio,
        theme,
        buttonStyle,
        avatarUrl: avatarUrl || null,
      };
      await fetch(`/api/pages/${page.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: displayName,
          slug,
          content_data: contentData,
          meta_title: metaTitle,
          meta_description: metaDescription,
        }),
      });
      setPage((p) => ({ ...p, title: displayName, slug, content_data: contentData, meta_title: metaTitle, meta_description: metaDescription }));
      toast({ title: t("saved") });
    } catch {
      toast({ title: tc("error"), variant: "destructive" });
    }
    setSaving(false);
  };

  // Publish / unpublish
  const togglePublish = async () => {
    setPublishing(true);
    const isPublished = page.status === "published";
    try {
      const res = await fetch(`/api/pages/${page.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publish: !isPublished }),
      });
      const data = await res.json();
      if (data.ok) {
        setPage((p) => ({ ...p, status: isPublished ? "draft" : "published" }));
        toast({ title: isPublished ? t("unpublished") : t("published") });
      }
    } catch {
      toast({ title: tc("error"), variant: "destructive" });
    }
    setPublishing(false);
  };

  // Copy URL — honours the creator's chosen share domain. On a custom
  // domain the prefix is dropped (just /<slug>); on the main host
  // we keep /p/<slug> to disambiguate from quizzes and popquizzes.
  const pageUrl = buildPublicUrl("p", page.slug);
  const copyUrl = () => {
    navigator.clipboard.writeText(pageUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ─── Social icons editor for a social_icons block ───
  const SocialIconsEditor = ({ link }: { link: LinkBlock }) => {
    const socials = link.social_links || [];
    const [newPlatform, setNewPlatform] = useState("");
    const [newUrl, setNewUrl] = useState("");

    const addSocial = () => {
      if (!newPlatform || !newUrl) return;
      const updated = [...socials, { platform: newPlatform, url: newUrl }];
      updateLink(link.id, { social_links: updated } as any);
      setNewPlatform("");
      setNewUrl("");
    };

    const removeSocial = (idx: number) => {
      const updated = socials.filter((_, i) => i !== idx);
      updateLink(link.id, { social_links: updated } as any);
    };

    return (
      <div className="space-y-2 mt-2">
        {socials.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="capitalize font-medium w-20 truncate">{s.platform}</span>
            <span className="text-muted-foreground truncate flex-1 text-xs">{s.url}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeSocial(i)}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Select value={newPlatform} onValueChange={setNewPlatform}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue placeholder={t("platform")} />
            </SelectTrigger>
            <SelectContent>
              {SOCIAL_PLATFORMS.map((p) => (
                <SelectItem key={p} value={p} className="text-xs capitalize">{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://..."
            className="h-8 text-xs flex-1"
          />
          <Button size="sm" variant="outline" className="h-8 px-2" onClick={addSocial} disabled={!newPlatform || !newUrl}>
            <Plus className="w-3 h-3" />
          </Button>
        </div>
      </div>
    );
  };

  // ─── RENDER ───

  return (
    <div className="flex flex-1 min-h-0">
      {/* Left panel: editor */}
      <div className="w-[420px] shrink-0 bg-background flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold truncate">{t("title")}</h2>
            <p className="text-xs text-muted-foreground truncate">{page.slug}</p>
          </div>
          <Button size="sm" variant="outline" onClick={savePage} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          </Button>
          <Button
            size="sm"
            onClick={togglePublish}
            disabled={publishing}
            variant={page.status === "published" ? "outline" : "default"}
          >
            {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Globe className="w-3.5 h-3.5 mr-1" />}
            {page.status === "published" ? t("unpublish") : t("publish")}
          </Button>
        </div>

        {/* Published URL bar */}
        {page.status === "published" && (
          <div className="flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-950/30 border-b text-xs">
            <Globe className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
            <span className="truncate flex-1 text-green-700 dark:text-green-400">{pageUrl}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={copyUrl}>
              {copied ? <Check className="w-3 h-3 text-green-600 dark:text-green-400" /> : <Copy className="w-3 h-3" />}
            </Button>
            <a href={pageUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-foreground" />
            </a>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b">
          {(["links", "design", "seo"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                activeTab === tab ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "links" ? t("tabLinks") : tab === "design" ? t("tabDesign") : "SEO"}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeTab === "links" && (
            <>
              {/* Profile section */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold">{t("profileSection")}</Label>

                {/* Avatar uploader */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => !uploadingAvatar && avatarInputRef.current?.click()}
                    className="relative h-16 w-16 rounded-full border-2 border-dashed border-border bg-muted/30 flex items-center justify-center overflow-hidden hover:border-primary/50 transition-colors group shrink-0"
                    aria-label={t("avatarUpload")}
                    title={t("avatarUpload")}
                  >
                    {uploadingAvatar ? (
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    ) : avatarUrl ? (
                      <>
                        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                        <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-medium">
                          {t("avatarChange")}
                        </span>
                      </>
                    ) : (
                      <ImageIcon className="w-5 h-5 text-muted-foreground" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">{avatarUrl ? t("avatarChange") : t("avatarUpload")}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{t("avatarHint")}</p>
                    {avatarUrl && (
                      <button
                        type="button"
                        onClick={clearAvatar}
                        className="text-[11px] text-destructive hover:underline mt-0.5"
                      >
                        {t("avatarRemove")}
                      </button>
                    )}
                  </div>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadAvatar(f);
                      if (avatarInputRef.current) avatarInputRef.current.value = "";
                    }}
                    className="hidden"
                  />
                </div>

                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t("displayNamePlaceholder")}
                  className="h-9 text-sm"
                />
                <Textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder={t("bioPlaceholder")}
                  rows={2}
                  className="text-sm resize-none"
                />
              </div>

              <hr className="opacity-0" />

              {/* Links list */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">{t("blocksSection")}</Label>
                  {links.length > 0 && (
                    <span className="text-[11px] text-muted-foreground">
                      {links.length} {links.length > 1 ? "blocs" : "bloc"}
                    </span>
                  )}
                </div>

                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {links.map((link, idx) => {
                      const BlockIcon = link.block_type === "link" ? Link2
                        : link.block_type === "header" ? Type
                        : link.block_type === "social_icons" ? Users
                        : Mail;
                      const blockLabel = link.block_type === "link" ? t("addLink")
                        : link.block_type === "header" ? t("addHeader")
                        : link.block_type === "social_icons" ? t("addSocial")
                        : t("addCapture");
                      return (
                      <div
                        key={link.id}
                        draggable
                        onDragStart={() => handleDragStart(idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDragEnd={handleDragEnd}
                        className={`group relative rounded-xl border bg-card p-4 transition-all hover:shadow-sm ${
                          dragIdx === idx ? "shadow-lg ring-2 ring-primary/40 border-primary/40" : "border-border"
                        } ${!link.enabled ? "opacity-60" : ""}`}
                      >
                        {/* Header row : drag + type chip + clicks + actions */}
                        <div className="flex items-center gap-2 mb-3">
                          <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab shrink-0" />
                          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium">
                            <BlockIcon className="w-3.5 h-3.5" />
                            {blockLabel}
                          </div>
                          {link.clicks_count > 0 && (
                            <span className="text-[11px] text-muted-foreground">
                              {link.clicks_count} {t("clicks")}
                            </span>
                          )}
                          <div className="ml-auto flex items-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => updateLink(link.id, { enabled: !link.enabled })}
                              title={link.enabled ? t("blockHide") : t("blockShow")}
                            >
                              {link.enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => deleteLink(link.id)}
                              title={t("blockDelete")}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          {/* Title */}
                          <Input
                            value={link.title}
                            onChange={(e) => updateLink(link.id, { title: e.target.value })}
                            className="h-9 text-sm"
                            placeholder={t("titlePlaceholder")}
                          />

                          {/* URL (for link type) */}
                          {link.block_type === "link" && (
                            <>
                              <Input
                                value={link.url}
                                onChange={(e) => updateLink(link.id, { url: e.target.value })}
                                className="h-9 text-sm"
                                placeholder="https://..."
                              />
                              <div className="flex items-center justify-between pt-1">
                                <label className="text-xs text-muted-foreground flex items-center gap-2 cursor-pointer">
                                  <Switch
                                    checked={link.open_in_new_tab !== false}
                                    onCheckedChange={(v) => updateLink(link.id, { open_in_new_tab: v })}
                                    className="scale-75 -my-1"
                                  />
                                  {t("openInNewTab")}
                                </label>
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="color"
                                    value={link.color || "#000000"}
                                    onChange={(e) => updateLink(link.id, { color: e.target.value })}
                                    className="h-7 w-7 rounded-md border border-border cursor-pointer bg-transparent"
                                    aria-label={t("customColor")}
                                    title={t("customColor")}
                                  />
                                  {link.color && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-muted-foreground"
                                      onClick={() => updateLink(link.id, { color: null })}
                                      title={t("resetColor")}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </>
                          )}

                          {/* Social icons editor */}
                          {link.block_type === "social_icons" && <SocialIconsEditor link={link} />}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}

                {/* Add block buttons */}
                <div className="pt-1">
                  <p className="text-[11px] text-muted-foreground mb-2">{t("addBlockLabel")}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" className="h-9 text-xs gap-2 justify-start" onClick={() => addBlock("link")}>
                      <Link2 className="w-3.5 h-3.5 text-primary" /> {t("addLink")}
                    </Button>
                    <Button variant="outline" className="h-9 text-xs gap-2 justify-start" onClick={() => addBlock("header")}>
                      <Type className="w-3.5 h-3.5 text-primary" /> {t("addHeader")}
                    </Button>
                    <Button variant="outline" className="h-9 text-xs gap-2 justify-start" onClick={() => addBlock("social_icons")}>
                      <Users className="w-3.5 h-3.5 text-primary" /> {t("addSocial")}
                    </Button>
                    <Button variant="outline" className="h-9 text-xs gap-2 justify-start" onClick={() => addBlock("capture_form")}>
                      <Mail className="w-3.5 h-3.5 text-primary" /> {t("addCapture")}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === "design" && (
            <div className="space-y-5">
              {/* Theme */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">{t("themeLabel")}</Label>
                <div className="grid grid-cols-5 gap-2">
                  {THEMES.map((th) => (
                    <button
                      key={th.id}
                      onClick={() => setTheme(th.id)}
                      className={`aspect-square rounded-lg text-[9px] font-bold flex items-center justify-center transition-all ${th.preview} ${
                        theme === th.id ? "ring-2 ring-primary ring-offset-2" : "opacity-70 hover:opacity-100"
                      }`}
                    >
                      {th.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Button style */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">{t("buttonStyleLabel")}</Label>
                <div className="grid grid-cols-5 gap-2">
                  {BUTTON_STYLES.map((bs) => (
                    <button
                      key={bs.id}
                      onClick={() => setButtonStyle(bs.id)}
                      className={`py-2 text-[10px] font-medium rounded-lg border transition-all ${
                        buttonStyle === bs.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      {bs.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Domain picker (only if creator has a verified custom
                  domain in this project) + slug. Prefix shown next to
                  the slug input mirrors the actual URL shape: bare on
                  custom domain, /p/ on the main host. */}
              <div className="space-y-1.5">
                <ShareDomainPicker
                  label={tc("shareDomain")}
                  value={shareDomain}
                  options={shareDomainOptions}
                  onChange={setShareDomain}
                />
                <Label className="text-xs">{t("slugLabel")}</Label>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="truncate">
                    {shareDomain
                      ? (isCustomDomain ? `https://${shareDomain}/` : `https://${shareDomain}/p/`)
                      : `${shareOrigin}/p/`}
                  </span>
                  <Input
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    className="h-7 text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === "seo" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("seoTitle")}</Label>
                <Input
                  value={metaTitle}
                  onChange={(e) => setMetaTitle(e.target.value)}
                  placeholder={displayName}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("seoDescription")}</Label>
                <Textarea
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  placeholder={bio}
                  rows={3}
                  className="text-sm resize-none"
                />
              </div>
              <div className="rounded-lg border p-3 bg-muted/30">
                <p className="text-xs text-muted-foreground">{t("seoHint")}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right panel: preview */}
      <div className="flex-1 bg-muted/30 flex flex-col">
        {/* Preview device toggle */}
        <div className="flex items-center justify-center gap-2 py-3 border-b bg-background">
          <Button
            variant={previewDevice === "mobile" ? "default" : "outline"}
            size="sm"
            className="h-7 px-3 text-xs gap-1"
            onClick={() => setPreviewDevice("mobile")}
          >
            <Smartphone className="w-3 h-3" /> Mobile
          </Button>
          <Button
            variant={previewDevice === "desktop" ? "default" : "outline"}
            size="sm"
            className="h-7 px-3 text-xs gap-1"
            onClick={() => setPreviewDevice("desktop")}
          >
            <Monitor className="w-3 h-3" /> Desktop
          </Button>
        </div>

        {/* Preview iframe */}
        <div className="flex-1 flex items-start justify-center p-6 overflow-auto">
          <div
            className="bg-white dark:bg-card rounded-2xl shadow-xl overflow-hidden transition-all duration-300"
            style={{
              width: previewDevice === "mobile" ? 375 : 800,
              height: previewDevice === "mobile" ? 667 : "auto",
              minHeight: previewDevice === "desktop" ? 500 : undefined,
            }}
          >
            <iframe
              ref={iframeRef}
              className="w-full h-full border-0"
              title="Preview"
              sandbox="allow-scripts"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
