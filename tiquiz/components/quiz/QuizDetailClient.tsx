// components/quiz/QuizDetailClient.tsx — Simplified for Tiquiz (no sidebar)
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Copy, Check, Eye, Users, Share2, Mail, Trash2,
  Loader2, Save, ExternalLink, Code, Download, Pencil, X,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

type Quiz = any;
type Lead = any;

export default function QuizDetailClient({ quizId }: { quizId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadQuiz = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/quiz/${quizId}`);
      const json = await res.json();
      if (json?.ok) {
        setQuiz(json.quiz);
        setLeads(json.leads ?? []);
      }
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { loadQuiz(); }, [quizId]);

  const handleSave = async (patch: Record<string, any>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/quiz/${quizId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (json?.ok) {
        toast({ title: "Sauvegarde !" });
        loadQuiz();
      } else {
        toast({ title: "Erreur", description: json?.error, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await fetch(`/api/quiz/${quizId}`, { method: "DELETE" });
      toast({ title: "Quiz supprime" });
      router.push("/dashboard");
    } catch {} finally { setDeleting(false); }
  };

  const copyLink = () => {
    const url = `${window.location.origin}/q/${quizId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyEmbed = () => {
    const url = `${window.location.origin}/q/${quizId}`;
    const code = `<iframe src="${url}" width="100%" height="700" frameborder="0" style="border:none;border-radius:12px;max-width:600px;margin:0 auto;display:block;"></iframe>`;
    navigator.clipboard.writeText(code);
    toast({ title: "Code d'integration copie !" });
  };

  const exportLeadsCsv = () => {
    if (leads.length === 0) return;
    const headers = ["Email", "Prenom", "Resultat", "Partage", "Date"];
    const rows = leads.map((l: any) => [
      l.email, l.first_name || "", l.result_title || "", l.has_shared ? "Oui" : "Non",
      l.created_at ? format(new Date(l.created_at), "dd/MM/yyyy HH:mm") : "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c: string) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${quizId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>);
  }

  if (!quiz) {
    return (<div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Quiz introuvable</p></div>);
  }

  const publicUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/q/${quizId}`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard"><Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button></Link>
            <h1 className="font-bold truncate max-w-xs">{quiz.title}</h1>
            <Badge variant={quiz.status === "active" ? "default" : "secondary"}>{quiz.status === "active" ? "Actif" : "Brouillon"}</Badge>
          </div>
          <div className="flex items-center gap-2">
            {quiz.status === "draft" && (
              <Button size="sm" onClick={() => handleSave({ status: "active" })} disabled={saving}><Eye className="w-4 h-4 mr-1" /> Publier</Button>
            )}
            {quiz.status === "active" && (
              <Button variant="outline" size="sm" onClick={() => handleSave({ status: "draft" })} disabled={saving}>Mettre en brouillon</Button>
            )}
            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setShowDelete(true)}><Trash2 className="w-4 h-4" /></Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-4 text-center"><Eye className="w-5 h-5 mx-auto mb-1 text-muted-foreground" /><p className="text-2xl font-bold">{quiz.views_count ?? 0}</p><p className="text-xs text-muted-foreground">Vues</p></Card>
          <Card className="p-4 text-center"><Mail className="w-5 h-5 mx-auto mb-1 text-muted-foreground" /><p className="text-2xl font-bold">{leads.length}</p><p className="text-xs text-muted-foreground">Leads</p></Card>
          <Card className="p-4 text-center"><Share2 className="w-5 h-5 mx-auto mb-1 text-muted-foreground" /><p className="text-2xl font-bold">{quiz.shares_count ?? 0}</p><p className="text-xs text-muted-foreground">Partages</p></Card>
        </div>

        {/* Share links */}
        <Card className="p-4 space-y-3">
          <h3 className="font-bold text-sm">Partager ton quiz</h3>
          <div className="flex gap-2">
            <Input readOnly value={publicUrl} className="flex-1 text-sm" />
            <Button variant="outline" size="sm" onClick={copyLink}>{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</Button>
            <Button variant="outline" size="sm" onClick={copyEmbed} title="Code d'integration"><Code className="w-4 h-4" /></Button>
            {quiz.status === "active" && (
              <Button variant="outline" size="sm" onClick={() => window.open(publicUrl, "_blank")}><ExternalLink className="w-4 h-4" /></Button>
            )}
          </div>
        </Card>

        {/* Leads table */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm">Leads ({leads.length})</h3>
            {leads.length > 0 && (
              <Button variant="outline" size="sm" onClick={exportLeadsCsv}><Download className="w-4 h-4 mr-1" /> CSV</Button>
            )}
          </div>
          {leads.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Aucun lead pour le moment. Partage ton quiz !</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Prenom</TableHead><TableHead>Resultat</TableHead><TableHead>Partage</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
              <TableBody>
                {leads.slice(0, 50).map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.email}</TableCell>
                    <TableCell>{l.first_name || "—"}</TableCell>
                    <TableCell>{l.result_title || "—"}</TableCell>
                    <TableCell>{l.has_shared ? <Check className="w-4 h-4 text-green-600" /> : "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{l.created_at ? format(new Date(l.created_at), "dd/MM/yyyy HH:mm", { locale: fr }) : ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </main>

      {/* Delete dialog */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader><DialogTitle>Supprimer ce quiz ?</DialogTitle><DialogDescription>Cette action est irreversible. Tous les leads seront aussi supprimes.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>{deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Supprimer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
