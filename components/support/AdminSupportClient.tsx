"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus, Trash2, Edit3, Eye, EyeOff, Loader2, ChevronDown,
  ChevronRight, Database, ExternalLink, BookOpen, FolderOpen,
  Save, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Category = {
  id: string;
  slug: string;
  icon: string;
  sort_order: number;
  title: Record<string, string>;
  description: Record<string, string>;
};

type Article = {
  id: string;
  slug: string;
  sort_order: number;
  title: Record<string, string>;
  content: Record<string, string>;
  category_id: string;
  related_slugs: string[];
  tags: string[];
  published: boolean;
  support_categories?: { slug: string; title: Record<string, string>; icon: string };
};

const LANGS = ["fr", "en", "es", "it", "ar"];
const LANG_LABELS: Record<string, string> = {
  fr: "Français",
  en: "English",
  es: "Español",
  it: "Italiano",
  ar: "العربية",
};

export default function AdminSupportClient() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [editArticle, setEditArticle] = useState<Article | null>(null);
  const [editLang, setEditLang] = useState("fr");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [catRes, artRes] = await Promise.all([
      fetch("/api/admin/support?type=categories").then((r) => r.json()),
      fetch("/api/admin/support?type=articles").then((r) => r.json()),
    ]);
    if (catRes.ok) setCategories(catRes.categories);
    if (artRes.ok) setArticles(artRes.articles);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSeed = async () => {
    if (!confirm("Ceci va insérer/mettre à jour toutes les catégories et articles. Continuer ?")) return;
    setSeeding(true);
    setMessage("");
    const res = await fetch("/api/admin/support/seed", { method: "POST" });
    const d = await res.json();
    if (d.ok) {
      setMessage(`Seed réussi : ${d.categories} catégories, ${d.articles} articles`);
      fetchData();
    } else {
      setMessage(`Erreur : ${d.error}`);
    }
    setSeeding(false);
  };

  const handleTogglePublished = async (article: Article) => {
    const res = await fetch("/api/admin/support", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "article", id: article.id, published: !article.published }),
    });
    if ((await res.json()).ok) fetchData();
  };

  const handleDeleteArticle = async (id: string) => {
    if (!confirm("Supprimer cet article ?")) return;
    const res = await fetch(`/api/admin/support?type=article&id=${id}`, { method: "DELETE" });
    if ((await res.json()).ok) fetchData();
  };

  const handleSaveArticle = async () => {
    if (!editArticle) return;
    setSaving(true);
    const res = await fetch("/api/admin/support", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "article",
        id: editArticle.id,
        title: editArticle.title,
        content: editArticle.content,
        tags: editArticle.tags,
        related_slugs: editArticle.related_slugs,
      }),
    });
    if ((await res.json()).ok) {
      fetchData();
      setEditArticle(null);
    }
    setSaving(false);
  };

  const catArticles = (catId: string) => articles.filter((a) => a.category_id === catId);

  return (
    <div className="space-y-6">
      {/* Top actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Gestion du Centre d&apos;Aide</h2>
          <p className="text-sm text-muted-foreground">
            {categories.length} catégories, {articles.length} articles
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSeed}
            disabled={seeding}
          >
            {seeding ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Database className="w-4 h-4 mr-1.5" />}
            {seeding ? "Seeding..." : "Seed / Mettre à jour le contenu"}
          </Button>
          <a
            href="/support"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm">
              <ExternalLink className="w-4 h-4 mr-1.5" />
              Voir le centre d&apos;aide
            </Button>
          </a>
        </div>
      </div>

      {message && (
        <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
          {message}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {categories
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((cat) => {
              const isExpanded = expandedCat === cat.id;
              const arts = catArticles(cat.id);
              return (
                <Card key={cat.id}>
                  <button
                    className="w-full text-left"
                    onClick={() => setExpandedCat(isExpanded ? null : cat.id)}
                  >
                    <CardHeader className="py-3 px-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          )}
                          <FolderOpen className="w-4 h-4 text-primary" />
                          <span className="font-semibold text-sm">
                            {cat.title?.fr ?? cat.slug}
                          </span>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {arts.length} articles
                        </Badge>
                      </div>
                    </CardHeader>
                  </button>

                  {isExpanded && (
                    <CardContent className="pt-0 px-4 pb-4">
                      {arts.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">Aucun article</p>
                      ) : (
                        <div className="space-y-1.5">
                          {arts
                            .sort((a, b) => a.sort_order - b.sort_order)
                            .map((art) => (
                              <div
                                key={art.id}
                                className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 group"
                              >
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <BookOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                  <span className="text-sm truncate">
                                    {art.title?.fr ?? art.slug}
                                  </span>
                                  {!art.published && (
                                    <Badge variant="outline" className="text-xs shrink-0">
                                      Masqué
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => setEditArticle(art)}
                                    title="Éditer"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => handleTogglePublished(art)}
                                    title={art.published ? "Masquer" : "Publier"}
                                  >
                                    {art.published ? (
                                      <EyeOff className="w-3.5 h-3.5" />
                                    ) : (
                                      <Eye className="w-3.5 h-3.5" />
                                    )}
                                  </Button>
                                  <a
                                    href={`/support/article/${art.slug}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Voir">
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </Button>
                                  </a>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    onClick={() => handleDeleteArticle(art.id)}
                                    title="Supprimer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })}
        </div>
      )}

      {/* Edit article dialog */}
      {editArticle && (
        <Dialog open={!!editArticle} onOpenChange={(o) => !o && setEditArticle(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Éditer : {editArticle.title?.fr ?? editArticle.slug}</DialogTitle>
            </DialogHeader>

            {/* Language tabs */}
            <div className="flex gap-1 border-b mb-4">
              {LANGS.map((l) => (
                <button
                  key={l}
                  className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${
                    l === editLang
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setEditLang(l)}
                >
                  {LANG_LABELS[l]}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Titre ({editLang.toUpperCase()})</label>
                <Input
                  value={editArticle.title?.[editLang] ?? ""}
                  onChange={(e) =>
                    setEditArticle({
                      ...editArticle,
                      title: { ...editArticle.title, [editLang]: e.target.value },
                    })
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Contenu Markdown ({editLang.toUpperCase()})</label>
                <Textarea
                  rows={20}
                  className="font-mono text-sm"
                  value={editArticle.content?.[editLang] ?? ""}
                  onChange={(e) =>
                    setEditArticle({
                      ...editArticle,
                      content: { ...editArticle.content, [editLang]: e.target.value },
                    })
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Tags (séparés par des virgules)</label>
                <Input
                  value={(editArticle.tags ?? []).join(", ")}
                  onChange={(e) =>
                    setEditArticle({
                      ...editArticle,
                      tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
                    })
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Articles liés (slugs, séparés par des virgules)</label>
                <Input
                  value={(editArticle.related_slugs ?? []).join(", ")}
                  onChange={(e) =>
                    setEditArticle({
                      ...editArticle,
                      related_slugs: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
                    })
                  }
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditArticle(null)}>
                  <X className="w-4 h-4 mr-1.5" /> Annuler
                </Button>
                <Button onClick={handleSaveArticle} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                  Enregistrer
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
