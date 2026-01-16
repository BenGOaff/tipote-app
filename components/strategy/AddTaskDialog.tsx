// components/strategy/AddTaskDialog.tsx
"use client";

import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AddTaskDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (task: string, phaseIndex: number) => void;
  phases: Array<{ title: string }>;
}

export const AddTaskDialog = ({
  isOpen,
  onClose,
  onAdd,
  phases,
}: AddTaskDialogProps) => {
  const [taskName, setTaskName] = useState("");
  const [selectedPhase, setSelectedPhase] = useState("0");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (taskName.trim()) {
      onAdd(taskName.trim(), parseInt(selectedPhase));
      setTaskName("");
      setSelectedPhase("0");
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter une tâche</DialogTitle>
          <DialogDescription>
            Crée une nouvelle tâche pour ta stratégie
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="taskName">Nom de la tâche</Label>
            <Input
              id="taskName"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="Ex: Créer une landing page"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phase">Phase</Label>
            <Select value={selectedPhase} onValueChange={setSelectedPhase}>
              <SelectTrigger>
                <SelectValue placeholder="Choisis une phase" />
              </SelectTrigger>
              <SelectContent>
                {phases.map((phase, index) => (
                  <SelectItem key={index} value={index.toString()}>
                    {phase.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={!taskName.trim()}>
              Ajouter
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
