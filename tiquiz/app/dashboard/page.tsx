"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QuizForm } from "@/components/quiz/QuizForm";
import {
  Plus,
  Eye,
  Users,
  Share2,
  Loader2,
  ExternalLink,
  LogOut,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

type Quiz = {
  id: string;
  title: string;
  status: string;
  views_count: number;
  shares_count: number;
  created_at: string;
  locale: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [leadsCount, setLeadsCount] = useState<Record<string, number>>({});

  const loadQuizzes = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/quiz");
      const json = await res.json();
      if (json?.ok) {
        setQuizzes(json.quizzes ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuizzes();
  }, []);

  const handleLogout = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  if (showCreate) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 p-6">
        <div className="max-w-3xl mx-auto">
          <QuizForm onClose={() => { setShowCreate(false); loadQuizzes(); }} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <h1 className="text-xl font-bold">Tiquiz</h1>
          <div className="flex items-center gap-3">
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-2" /> Nouveau quiz
            </Button>
            <Button variant="ghost" size="icon" onClick={handleLogout} title="Se deconnecter">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : quizzes.length === 0 ? (
          <Card className="p-12 text-center space-y-4">
            <h2 className="text-xl font-bold">Aucun quiz pour le moment</h2>
            <p className="text-muted-foreground">
              Cree ton premier quiz lead magnet en quelques minutes.
            </p>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-2" /> Creer un quiz
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4">
            {quizzes.map((quiz) => (
              <Link key={quiz.id} href={`/quiz/${quiz.id}`}>
                <Card className="p-5 hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold">{quiz.title}</h3>
                        <Badge variant={quiz.status === "active" ? "default" : "secondary"}>
                          {quiz.status === "active" ? "Actif" : "Brouillon"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Eye className="w-3.5 h-3.5" /> {quiz.views_count ?? 0} vues
                        </span>
                        <span className="flex items-center gap-1">
                          <Share2 className="w-3.5 h-3.5" /> {quiz.shares_count ?? 0} partages
                        </span>
                      </div>
                    </div>
                    {quiz.status === "active" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.preventDefault();
                          window.open(`/q/${quiz.id}`, "_blank");
                        }}
                        title="Voir le quiz public"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
