"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type PepiteItem = {
  userPepiteId: string;
  assignedAt: string;
  seenAt: string | null;
  pepite: { id: string; title: string; body: string } | null;
};

type SummaryRes = {
  ok: boolean;
  hasUnread?: boolean;
  current?: {
    userPepiteId: string;
    assignedAt: string;
    seenAt: string | null;
    pepite: { id: string; title: string; body: string } | null;
  } | null;
};

function formatDateFR(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function enhanceForDisplay(text: string) {
  // Style “fun” au rendu UNIQUEMENT (sans modifier la DB)
  // - lignes "👉 ..." en gras
  // - garde les sauts de ligne
  const lines = text.split("\n");
  return lines.map((line, idx) => {
    const trimmed = line.trimStart();
    const isArrow = trimmed.startsWith("👉");
    const content = line;

    return (
      <p key={idx} className={isArrow ? "font-semibold" : ""}>
        {content || <span className="block h-4" />}
      </p>
    );
  });
}

function FlipPepiteCard(props: {
  item: PepiteItem;
  highlight?: boolean;
  onSeen?: (userPepiteId: string) => void;
}) {
  const { item, highlight, onSeen } = props;

  const [flipped, setFlipped] = useState(false);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);

  const frontRef = useRef<HTMLDivElement | null>(null);
  const backRef = useRef<HTMLDivElement | null>(null);

  const title = item.pepite?.title ?? "Pépite";
  const body = item.pepite?.body ?? "";

  useEffect(() => {
    // Si déjà vue, on peut démarrer “ouverte” si c’est la carte highlight
    if (highlight && item.seenAt) setFlipped(true);
  }, [highlight, item.seenAt]);

  const recomputeHeight = () => {
    const front = frontRef.current;
    const back = backRef.current;
    if (!front || !back) return;

    // offsetHeight inclut padding / borders -> parfait pour fixer le container
    const h1 = front.offsetHeight || 0;
    const h2 = back.offsetHeight || 0;
    const next = Math.max(h1, h2);

    if (next > 0) setMeasuredHeight(next);
  };

  // Mesure initiale + à chaque flip (le contenu visible change)
  useLayoutEffect(() => {
    recomputeHeight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body, flipped]);

  // Mesure live si le contenu change (font loading, resize, etc.)
  useEffect(() => {
    const front = frontRef.current;
    const back = backRef.current;
    if (!front || !back) return;

    let raf: number | null = null;
    const schedule = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => recomputeHeight());
    };

    schedule();

    const ro = new ResizeObserver(() => schedule());
    ro.observe(front);
    ro.observe(back);

    const onResize = () => schedule();
    window.addEventListener("resize", onResize);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body]);

  async function handleFlip() {
    const next = !flipped;
    setFlipped(next);

    if (!item.seenAt && next) {
      // mark seen dès l’ouverture (récompense)
      try {
        await fetch("/api/pepites/seen", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userPepiteId: item.userPepiteId }),
        });
        onSeen?.(item.userPepiteId);
      } catch {
        // fail-open: l’UI reste ok
      }
    }
  }

  return (
    <button
      type="button"
      onClick={handleFlip}
      className="text-left w-full focus:outline-none"
      aria-label="Ouvrir la pépite"
      title="Cliquer pour retourner"
    >
      <div
        className={["relative w-full", "[perspective:1000px]"].join(" ")}
        style={{
          // ✅ La carte s’adapte à la plus grande face (front/back) = plus de débordement
          height: measuredHeight ? `${measuredHeight}px` : undefined,
        }}
      >
        <div
          className={[
            "absolute inset-0 rounded-2xl transition-transform duration-300",
            "[transform-style:preserve-3d]",
            flipped ? "[transform:rotateY(180deg)]" : "",
          ].join(" ")}
        >
          {/* Face avant */}
          <div
            ref={frontRef}
            className={[
              "absolute inset-0",
              "[backface-visibility:hidden]",
            ].join(" ")}
          >
            <Card
              className={[
                "h-full rounded-2xl border bg-card shadow-sm",
                "p-5 flex flex-col justify-between",
                highlight ? "border-primary/30 bg-primary/5" : "",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {formatDateFR(item.assignedAt)}
                  </p>

                  {/* ✅ Titre non tronqué */}
                  <h3 className="mt-1 text-base font-semibold leading-snug whitespace-normal break-words">
                    {title}
                  </h3>
                </div>

                <div className="relative flex items-center shrink-0">
                  <Sparkles className="h-5 w-5 text-primary" />
                  {!item.seenAt ? (
                    <span className="ml-2 text-xs font-medium text-primary">✨</span>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 mt-4">
                <p className="text-sm text-muted-foreground">
                  {item.seenAt ? "Déjà ouverte" : "Cliquer pour découvrir"}
                </p>
                <span className="text-xs text-muted-foreground shrink-0">↻</span>
              </div>
            </Card>
          </div>

          {/* Face arrière */}
          <div
            ref={backRef}
            className={[
              "absolute inset-0",
              "[transform:rotateY(180deg)]",
              "[backface-visibility:hidden]",
            ].join(" ")}
          >
            <Card
              className={[
                "h-full rounded-2xl border bg-card shadow-sm",
                "p-5",
                highlight ? "border-primary/30" : "",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {formatDateFR(item.assignedAt)}
                  </p>

                  {/* ✅ Titre non tronqué */}
                  <h3 className="mt-1 text-base font-semibold leading-snug whitespace-normal break-words">
                    {title}
                  </h3>
                </div>
                <Sparkles className="h-5 w-5 text-primary shrink-0" />
              </div>

              {/* ✅ Le texte dicte la hauteur de la carte */}
              <div className="mt-4 text-sm leading-relaxed text-foreground whitespace-pre-wrap space-y-1">
                {enhanceForDisplay(body)}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </button>
  );
}

export default function PepitesPageClient() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PepiteItem[]>([]);
  const [current, setCurrent] = useState<PepiteItem | null>(null);

  // ✅ admin gate (users ne voient pas le bouton)
  const [isAdmin, setIsAdmin] = useState(false);

  // Admin add
  const [adminOpen, setAdminOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  const highlightId = current?.userPepiteId ?? null;

  const sorted = useMemo(() => {
    // current en premier si existe
    if (!highlightId) return items;
    const curIdx = items.findIndex((x) => x.userPepiteId === highlightId);
    if (curIdx === -1) return items;
    const copy = [...items];
    const [cur] = copy.splice(curIdx, 1);
    return [cur, ...copy];
  }, [items, highlightId]);

  async function refreshAll() {
    setLoading(true);
    try {
      const [sRes, lRes] = await Promise.all([
        fetch("/api/pepites/summary", { cache: "no-store" }),
        fetch("/api/pepites/list", { cache: "no-store" }),
      ]);

      const sJson = (await sRes.json()) as SummaryRes;
      const lJson = (await lRes.json().catch(() => ({}))) as any;

      const list: PepiteItem[] = (lJson?.ok ? lJson.items : []) ?? [];
      setItems(list);

      // current depuis summary (peut venir d’une assignation “due”)
      if (sJson?.ok && sJson.current?.userPepiteId && sJson.current?.pepite) {
        const cur: PepiteItem = {
          userPepiteId: sJson.current.userPepiteId,
          assignedAt: sJson.current.assignedAt,
          seenAt: sJson.current.seenAt,
          pepite: sJson.current.pepite,
        };
        setCurrent(cur);

        // s’assurer qu’elle est dans la liste
        const exists = list.some((x) => x.userPepiteId === cur.userPepiteId);
        if (!exists) setItems([cur, ...list]);
      } else {
        setCurrent(null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshAll();

    // admin status (silent)
    (async () => {
      try {
        const res = await fetch("/api/pepites/admin/status", { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as any;
        setIsAdmin(Boolean(json?.ok && json?.isAdmin));
      } catch {
        setIsAdmin(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSeen(userPepiteId: string) {
    setItems((prev) =>
      prev.map((it) =>
        it.userPepiteId === userPepiteId
          ? { ...it, seenAt: new Date().toISOString() }
          : it,
      ),
    );
    setCurrent((prev) =>
      prev && prev.userPepiteId === userPepiteId
        ? { ...prev, seenAt: new Date().toISOString() }
        : prev,
    );
  }

  async function handleCreatePepite() {
    setAdminError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/pepites/admin/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: newTitle, body: newBody }),
      });

      const json = await res.json().catch(() => ({}));
      if (!json?.ok) {
        setAdminError(json?.error || "Erreur");
        return;
      }

      setNewTitle("");
      setNewBody("");
      setAdminOpen(false);
    } catch {
      setAdminError("Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Ta collection de pépites</h2>
            <p className="text-sm text-muted-foreground">
              Une nouvelle arrive de temps en temps… et tu ne sais jamais exactement quand 😄
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={refreshAll} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Rafraîchir
          </Button>

          {isAdmin ? (
            <Dialog open={adminOpen} onOpenChange={setAdminOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Ajouter
                </Button>
              </DialogTrigger>

              <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                  <DialogTitle>Ajouter une pépite</DialogTitle>
                </DialogHeader>

                <div className="space-y-3">
                  {adminError ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                      {adminError}
                    </div>
                  ) : null}

                  <div className="space-y-1">
                    <label className="text-sm font-medium">Titre (exact)</label>
                    <Input
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Titre…"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium">Texte (exact)</label>
                    <Textarea
                      value={newBody}
                      onChange={(e) => setNewBody(e.target.value)}
                      placeholder="Colle ici ton texte…"
                      className="min-h-[200px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      Rien n’est reformulé. Le fun (gras) est uniquement visuel côté UI.
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <Button variant="outline" onClick={() => setAdminOpen(false)}>
                      Annuler
                    </Button>
                    <Button
                      onClick={handleCreatePepite}
                      disabled={saving || !newTitle.trim() || !newBody.trim()}
                    >
                      {saving ? "Enregistrement…" : "Publier"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card
              key={i}
              className="h-[200px] rounded-2xl border bg-card/50 animate-pulse"
            />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <Card className="rounded-2xl border p-6">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold">
                Aucune pépite reçue pour l’instant
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Reviens plus tard… la première arrive automatiquement ✨
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 items-start">
          {sorted.map((it) => (
            <FlipPepiteCard
              key={it.userPepiteId}
              item={it}
              highlight={it.userPepiteId === highlightId}
              onSeen={handleSeen}
            />
          ))}
        </div>
      )}
    </div>
  );
}
