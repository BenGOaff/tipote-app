'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';

type Props = {
  taskId: string | null;
  initialStatus?: string | null;
  className?: string;
};

function isDone(status: unknown): boolean {
  if (typeof status !== 'string') return false;
  const s = status.toLowerCase();
  return s === 'done' || s === 'completed' || s === 'fait' || s === 'terminé';
}

export function MarkTaskDoneButton({ taskId, initialStatus, className }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [optimisticDone, setOptimisticDone] = useState<boolean | null>(null);

  const done = useMemo(() => {
    if (optimisticDone !== null) return optimisticDone;
    return isDone(initialStatus);
  }, [initialStatus, optimisticDone]);

  // ✅ Guard définitif
  if (!taskId) return null;

  // ✅ Narrowing TS explicite (clé de la fix)
  const taskIdStr: string = taskId;

  async function onClick() {
    if (pending || done) return;

    setPending(true);
    setOptimisticDone(true);

    try {
      const res = await fetch(
        `/api/tasks/${encodeURIComponent(taskIdStr)}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const json = (await res.json()) as { ok?: boolean; error?: string };

      if (!res.ok || !json?.ok) {
        setOptimisticDone(null);
        console.error(json?.error || 'Failed to update task');
      } else {
        router.refresh();
      }
    } catch (e) {
      setOptimisticDone(null);
      console.error(e);
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant={done ? 'secondary' : 'default'}
      size="sm"
      className={className}
      disabled={pending || done}
      onClick={onClick}
    >
      {done ? 'Fait ✅' : pending ? '...' : 'Marquer comme faite'}
    </Button>
  );
}
