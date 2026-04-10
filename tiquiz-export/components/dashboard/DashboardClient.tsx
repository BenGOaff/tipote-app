"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Eye, Play, CheckCircle, Users, Share2, Pencil, Trash2, Copy, LogOut, Settings, BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import LanguageSwitcher from "@/components/LanguageSwitcher";

type Quiz = {
  id: string;
  title: string;
  status: string;
  views_count: number;
  starts_count: number;
  completions_count: number;
  shares_count: number;
  created_at: string;
};

export default function DashboardClient() {
  const t = useTranslations("dashboard");
  const tn = useTranslations("nav");
  const router = useRouter();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [leadsCount, setLeadsCount] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchQuizzes();
  }, []);

  async function fetchQuizzes() {
    try {
      const res = await fetch("/api/quiz");
      const data = await res.json();
      if (data.ok) {
        setQuizzes(data.quizzes);
        // Fetch leads count per quiz
        const counts: Record<string, number> = {};
        for (const quiz of data.quizzes) {
          const qRes = await fetch(`/api/quiz/${quiz.id}`);
          const qData = await qRes.json();
          counts[quiz.id] = qData.leads?.length ?? 0;
        }
        setLeadsCount(counts);
      }
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(quizId: string) {
    if (!confirm(t("confirmDelete"))) return;
    try {
      const res = await fetch(`/api/quiz/${quizId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) {
        setQuizzes((prev) => prev.filter((q) => q.id !== quizId));
        toast.success(t("quizDeleted"));
      }
    } catch {
      toast.error("Error");
    }
  }

  function copyLink(quizId: string) {
    const url = `${window.location.origin}/q/${quizId}`;
    navigator.clipboard.writeText(url);
    toast.success(t("linkCopied"));
  }

  async function handleLogout() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="w-full border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-2xl font-bold">Tiquiz</Link>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Button variant="ghost" size="sm" asChild>
              <Link href="/settings"><Settings className="h-4 w-4 mr-1" />{tn("settings")}</Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-1" />{tn("logout")}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">{t("title")}</h1>
            <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
          </div>
          <Button asChild>
            <Link href="/quiz/new"><Plus className="h-4 w-4 mr-2" />{t("createQuiz")}</Link>
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">{/* Loading */}</div>
        ) : quizzes.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t("noQuizzes")}</h3>
              <p className="text-muted-foreground mb-6">{t("noQuizzesDesc")}</p>
              <Button asChild>
                <Link href="/quiz/new"><Plus className="h-4 w-4 mr-2" />{t("createQuiz")}</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {quizzes.map((quiz) => {
              const leads = leadsCount[quiz.id] ?? 0;
              const rate = quiz.starts_count > 0
                ? Math.round((leads / quiz.starts_count) * 100)
                : 0;

              return (
                <Card key={quiz.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <Link
                            href={`/quiz/${quiz.id}`}
                            className="text-lg font-semibold hover:underline truncate"
                          >
                            {quiz.title}
                          </Link>
                          <Badge variant={quiz.status === "active" ? "default" : "secondary"}>
                            {quiz.status === "active" ? t("status") + ": " + "Active" : "Draft"}
                          </Badge>
                        </div>

                        {/* Stats */}
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Eye className="h-3.5 w-3.5" /> {quiz.views_count} {t("views")}
                          </span>
                          <span className="flex items-center gap-1">
                            <Play className="h-3.5 w-3.5" /> {quiz.starts_count} {t("starts")}
                          </span>
                          <span className="flex items-center gap-1">
                            <CheckCircle className="h-3.5 w-3.5" /> {quiz.completions_count} {t("completions")}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" /> {leads} {t("leads")}
                          </span>
                          <span className="flex items-center gap-1">
                            <Share2 className="h-3.5 w-3.5" /> {quiz.shares_count} {t("shares")}
                          </span>
                          {rate > 0 && (
                            <span className="font-medium text-foreground">
                              {rate}% {t("conversionRate")}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => copyLink(quiz.id)} title={t("copyLink")}>
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" asChild>
                          <Link href={`/quiz/${quiz.id}`} title={t("editQuiz")}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(quiz.id)} title={t("deleteQuiz")}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
