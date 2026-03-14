"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileText,
  FilePlus,
  Trash2,
  Loader2,
  Upload,
  X,
  FileType2,
  StickyNote,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

interface Source {
  id: string;
  title: string;
  source_type: "text" | "pdf" | "docx";
  original_filename: string | null;
  file_size_bytes: number | null;
  created_at: string;
}

const TYPE_ICONS: Record<string, typeof FileText> = {
  text: StickyNote,
  pdf: FileType2,
  docx: FileText,
};

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function ProjectSourcesSection() {
  const { toast } = useToast();
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Text source fields
  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");

  // File source fields
  const [fileTitle, setFileTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch("/api/project-sources");
      const data = await res.json();
      if (data?.ok && Array.isArray(data.sources)) {
        setSources(data.sources);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const resetForm = () => {
    setTextTitle("");
    setTextContent("");
    setFileTitle("");
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleAddText = async () => {
    if (!textTitle.trim() || !textContent.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/project-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: textTitle.trim(), content_text: textContent.trim() }),
      });
      const data = await res.json();
      if (!data?.ok) {
        toast({ title: "Erreur", description: data?.error ?? "Erreur inconnue", variant: "destructive" });
        return;
      }
      setSources((prev) => [...prev, data.source]);
      resetForm();
      setDialogOpen(false);
      toast({ title: "Source ajoutée" });
    } catch {
      toast({ title: "Erreur", description: "Impossible d'ajouter la source.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddFile = async () => {
    if (!selectedFile) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      if (fileTitle.trim()) formData.append("title", fileTitle.trim());

      const res = await fetch("/api/project-sources", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!data?.ok) {
        toast({ title: "Erreur", description: data?.error ?? "Erreur inconnue", variant: "destructive" });
        return;
      }
      setSources((prev) => [...prev, data.source]);
      resetForm();
      setDialogOpen(false);
      toast({ title: "Source ajoutée" });
    } catch {
      toast({ title: "Erreur", description: "Impossible d'importer le fichier.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/project-sources/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data?.ok) {
        setSources((prev) => prev.filter((s) => s.id !== id));
        toast({ title: "Source supprimée" });
      } else {
        toast({ title: "Erreur", description: data?.error ?? "Erreur", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de supprimer.", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    if (!fileTitle.trim()) {
      setFileTitle(file.name.replace(/\.[^.]+$/, ""));
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold">Sources de contexte</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Ajoutez du contexte (notes, PDF, documents) qui sera automatiquement injecté dans toutes vos
            générations de contenu.
          </p>
        </div>
        <Button
          size="sm"
          className="gap-2"
          onClick={() => { resetForm(); setDialogOpen(true); }}
          disabled={sources.length >= 5}
        >
          <FilePlus className="w-4 h-4" />
          Ajouter
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : sources.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Aucune source pour le moment.</p>
          <p className="text-xs mt-1">
            Ajoutez des notes, votre charte éditoriale, ou importez un PDF pour enrichir vos générations.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sources.map((s) => {
            const Icon = TYPE_ICONS[s.source_type] ?? FileText;
            return (
              <div
                key={s.id}
                className="flex items-center gap-3 p-3 rounded-lg border bg-background hover:bg-muted/40 transition-colors"
              >
                <Icon className="w-5 h-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.source_type.toUpperCase()}
                    {s.file_size_bytes ? ` · ${formatBytes(s.file_size_bytes)}` : ""}
                    {" · "}
                    {formatDate(s.created_at)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(s.id)}
                  disabled={deletingId === s.id}
                >
                  {deletingId === s.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </Button>
              </div>
            );
          })}
          {sources.length >= 5 && (
            <p className="text-xs text-muted-foreground text-center pt-2">
              Maximum 5 sources par projet atteint.
            </p>
          )}
        </div>
      )}

      {/* Add Source Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ajouter une source de contexte</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="text" className="mt-2">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="text" className="gap-2">
                <StickyNote className="w-4 h-4" />
                Texte libre
              </TabsTrigger>
              <TabsTrigger value="file" className="gap-2">
                <Upload className="w-4 h-4" />
                Fichier
              </TabsTrigger>
            </TabsList>

            {/* Text tab */}
            <TabsContent value="text" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="text-title">Titre *</Label>
                <Input
                  id="text-title"
                  placeholder="Ex: Charte éditoriale, Ton de marque..."
                  value={textTitle}
                  onChange={(e) => setTextTitle(e.target.value)}
                  maxLength={200}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="text-content">Contenu *</Label>
                <Textarea
                  id="text-content"
                  placeholder="Collez ici vos notes, guidelines, contexte de marque, informations clés..."
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  rows={8}
                  className="resize-none"
                  maxLength={10000}
                />
                <p className="text-xs text-muted-foreground text-right">
                  {textContent.length.toLocaleString()} / 10 000
                </p>
              </div>
              <Button
                className="w-full"
                onClick={handleAddText}
                disabled={submitting || !textTitle.trim() || textContent.trim().length < 10}
              >
                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Ajouter la source
              </Button>
            </TabsContent>

            {/* File tab */}
            <TabsContent value="file" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="file-title">Titre</Label>
                <Input
                  id="file-title"
                  placeholder="Titre (auto-rempli depuis le fichier)"
                  value={fileTitle}
                  onChange={(e) => setFileTitle(e.target.value)}
                  maxLength={200}
                />
              </div>
              <div className="space-y-2">
                <Label>Fichier (PDF, DOCX, TXT — max 5 Mo)</Label>
                <div
                  className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {selectedFile ? (
                    <div className="flex items-center justify-center gap-2">
                      <FileText className="w-5 h-5 text-primary" />
                      <span className="text-sm font-medium">{selectedFile.name}</span>
                      <span className="text-xs text-muted-foreground">({formatBytes(selectedFile.size)})</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-6 h-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFile(null);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Cliquez ou glissez un fichier ici
                      </p>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.pdf,.docx,.md"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
              </div>
              <Button
                className="w-full"
                onClick={handleAddFile}
                disabled={submitting || !selectedFile}
              >
                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Importer le fichier
              </Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
