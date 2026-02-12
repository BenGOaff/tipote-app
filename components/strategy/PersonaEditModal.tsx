// components/strategy/PersonaEditModal.tsx
"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Save, Plus, X, Loader2 } from "lucide-react";

interface PersonaData {
  title: string;
  pains: string[];
  desires: string[];
  channels: string[];
}

interface PersonaEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  persona: PersonaData;
  onSaved: (persona: PersonaData) => void;
}

export const PersonaEditModal = ({
  isOpen,
  onClose,
  persona,
  onSaved,
}: PersonaEditModalProps) => {
  const [title, setTitle] = useState(persona.title);
  const [pains, setPains] = useState<string[]>(persona.pains);
  const [desires, setDesires] = useState<string[]>(persona.desires);
  const [channels, setChannels] = useState<string[]>(persona.channels);
  const [saving, setSaving] = useState(false);

  const [newPain, setNewPain] = useState("");
  const [newDesire, setNewDesire] = useState("");
  const [newChannel, setNewChannel] = useState("");

  // Reset form when modal opens with new data
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onClose();
        return;
      }
      setTitle(persona.title);
      setPains([...persona.pains]);
      setDesires([...persona.desires]);
      setChannels([...persona.channels]);
      setNewPain("");
      setNewDesire("");
      setNewChannel("");
    },
    [persona, onClose],
  );

  const addItem = (
    list: string[],
    setList: (v: string[]) => void,
    value: string,
    setValue: (v: string) => void,
  ) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setList([...list, trimmed]);
    setValue("");
  };

  const removeItem = (
    list: string[],
    setList: (v: string[]) => void,
    index: number,
  ) => {
    setList(list.filter((_, i) => i !== index));
  };

  const handleSave = useCallback(async () => {
    if (!title.trim()) return;
    setSaving(true);

    try {
      const res = await fetch("/api/persona", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), pains, desires, channels }),
      });

      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; persona?: PersonaData; error?: string }
        | null;

      if (!res.ok || !json?.ok) {
        setSaving(false);
        return;
      }

      onSaved(json.persona || { title: title.trim(), pains, desires, channels });
      onClose();
    } catch {
      // Error handling - keep modal open
    } finally {
      setSaving(false);
    }
  }, [title, pains, desires, channels, onSaved, onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden p-0">
        <div className="flex flex-col max-h-[90vh]">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle className="text-2xl font-display font-bold">
              Modifier le persona
            </DialogTitle>
            <DialogDescription>
              Modifie ton persona cible. Les changements seront synchronisés
              partout dans l&apos;application.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 pb-6 overflow-auto space-y-6">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="persona-title">Profil principal</Label>
              <Input
                id="persona-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Entrepreneur solo, 30-45 ans"
              />
            </div>

            {/* Pains */}
            <div className="space-y-3">
              <Label>Problèmes principaux</Label>
              <div className="space-y-2">
                {pains.map((pain, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-destructive flex-shrink-0" />
                    <span className="flex-1 text-sm">{pain}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeItem(pains, setPains, i)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newPain}
                  onChange={(e) => setNewPain(e.target.value)}
                  placeholder="Ajouter un problème..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addItem(pains, setPains, newPain, setNewPain);
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => addItem(pains, setPains, newPain, setNewPain)}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Desires */}
            <div className="space-y-3">
              <Label>Objectifs</Label>
              <div className="space-y-2">
                {desires.map((desire, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-success flex-shrink-0" />
                    <span className="flex-1 text-sm">{desire}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeItem(desires, setDesires, i)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newDesire}
                  onChange={(e) => setNewDesire(e.target.value)}
                  placeholder="Ajouter un objectif..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addItem(desires, setDesires, newDesire, setNewDesire);
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    addItem(desires, setDesires, newDesire, setNewDesire)
                  }
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Channels */}
            <div className="space-y-3">
              <Label>Canaux préférés</Label>
              <div className="flex flex-wrap gap-2">
                {channels.map((channel, i) => (
                  <Badge
                    key={i}
                    variant="outline"
                    className="gap-1 cursor-pointer hover:bg-destructive/10"
                    onClick={() => removeItem(channels, setChannels, i)}
                  >
                    {channel}
                    <X className="w-3 h-3" />
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newChannel}
                  onChange={(e) => setNewChannel(e.target.value)}
                  placeholder="Ajouter un canal..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addItem(channels, setChannels, newChannel, setNewChannel);
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    addItem(channels, setChannels, newChannel, setNewChannel)
                  }
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end pt-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Annuler
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !title.trim()}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                {saving ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
