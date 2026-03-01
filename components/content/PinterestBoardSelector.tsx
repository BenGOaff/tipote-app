"use client";

import * as React from "react";
import { Loader2, AlertCircle, Plus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Board = {
  id: string;
  name: string;
  privacy: "PUBLIC" | "PROTECTED" | "SECRET";
};

type Props = {
  /** ID du tableau sélectionné */
  boardId: string;
  /** URL de destination de l'épingle (optionnel) */
  link: string;
  onBoardChange: (boardId: string) => void;
  onLinkChange: (link: string) => void;
  disabled?: boolean;
};

export function PinterestBoardSelector({
  boardId,
  link,
  onBoardChange,
  onLinkChange,
  disabled = false,
}: Props) {
  const [boards, setBoards] = React.useState<Board[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showNewBoard, setShowNewBoard] = React.useState(false);
  const [newBoardName, setNewBoardName] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/social/pinterest-boards");
        const json = await res.json();
        if (!cancelled) {
          if (json.ok && Array.isArray(json.boards)) {
            setBoards(json.boards);
          } else {
            setError(json.error ?? "Impossible de charger les tableaux.");
          }
        }
      } catch {
        if (!cancelled) {
          setError("Erreur réseau lors du chargement des tableaux.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreateBoard() {
    if (!newBoardName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/social/pinterest-boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newBoardName.trim() }),
      });
      const json = await res.json();
      if (json.ok && json.board) {
        setBoards((prev) => [json.board, ...prev]);
        onBoardChange(json.board.id);
        setNewBoardName("");
        setShowNewBoard(false);
      } else {
        setError(json.error ?? "Impossible de créer le tableau.");
      }
    } catch {
      setError("Erreur réseau lors de la création du tableau.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Tableau Pinterest */}
      <div className="space-y-1.5">
        <Label htmlFor="pinterest-board">
          Tableau Pinterest{" "}
          <span className="text-rose-500">*</span>
        </Label>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground h-9">
            <Loader2 className="w-4 h-4 animate-spin" />
            Chargement des tableaux…
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-sm text-rose-600">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        ) : boards.length === 0 && !showNewBoard ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Aucun tableau trouvé.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setShowNewBoard(true)}
            >
              <Plus className="w-3.5 h-3.5" />
              Créer un tableau Pinterest
            </Button>
          </div>
        ) : (
          <>
            <Select
              value={boardId}
              onValueChange={onBoardChange}
              disabled={disabled}
            >
              <SelectTrigger id="pinterest-board">
                <SelectValue placeholder="Choisir un tableau…" />
              </SelectTrigger>
              <SelectContent>
                {boards.map((board) => (
                  <SelectItem key={board.id} value={board.id}>
                    {board.name}
                    {board.privacy !== "PUBLIC" && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({board.privacy === "SECRET" ? "secret" : "protégé"})
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!showNewBoard && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs text-muted-foreground"
                onClick={() => setShowNewBoard(true)}
              >
                <Plus className="w-3 h-3" />
                Créer un nouveau tableau
              </Button>
            )}
          </>
        )}

        {/* Create new board inline form */}
        {showNewBoard && (
          <div className="flex items-center gap-2 mt-1">
            <Input
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
              placeholder="Nom du tableau…"
              className="h-8 text-sm"
              disabled={creating}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreateBoard();
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              className="h-8 shrink-0"
              onClick={handleCreateBoard}
              disabled={creating || !newBoardName.trim()}
            >
              {creating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                "Créer"
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 shrink-0"
              onClick={() => {
                setShowNewBoard(false);
                setNewBoardName("");
              }}
            >
              Annuler
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Sélectionne le tableau sur lequel publier l&apos;épingle.
        </p>
      </div>

      {/* Lien de destination (optionnel) */}
      <div className="space-y-1.5">
        <Label htmlFor="pinterest-link">
          Lien de destination{" "}
          <span className="text-muted-foreground text-xs">(optionnel)</span>
        </Label>
        <Input
          id="pinterest-link"
          type="url"
          value={link}
          onChange={(e) => onLinkChange(e.target.value)}
          placeholder="https://ton-site.com/article"
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          URL vers laquelle l&apos;épingle redirige. Ex: article de blog, produit, page de capture.
        </p>
      </div>
    </div>
  );
}
