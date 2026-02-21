"use client";

import * as React from "react";
import { Loader2, AlertCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

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
        ) : boards.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun tableau trouvé. Crée un tableau sur Pinterest d&apos;abord.
          </p>
        ) : (
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
