"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type SioTag = { id: number; name: string };

type SioTagsContextValue = {
  tags: SioTag[] | null;
  loading: boolean;
  noApiKey: boolean;
  error: boolean;
  loadTags: () => Promise<void>;
  addTagLocal: (name: string) => void;
};

const SioTagsContext = createContext<SioTagsContextValue | null>(null);

export function useSioTagsContext() {
  return useContext(SioTagsContext);
}

export function SioTagsProvider({ children }: { children: ReactNode }) {
  const [tags, setTags] = useState<SioTag[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [noApiKey, setNoApiKey] = useState(false);
  const [error, setError] = useState(false);

  const loadTags = useCallback(async () => {
    if (tags !== null || loading) return;
    setLoading(true);
    setError(false);
    setNoApiKey(false);
    try {
      const res = await fetch("/api/systeme-io/tags");
      const json = await res.json();
      if (json?.ok && Array.isArray(json.tags)) {
        setTags(json.tags);
      } else if (json?.error === "NO_API_KEY") {
        setNoApiKey(true);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [tags, loading]);

  const addTagLocal = useCallback((name: string) => {
    setTags((prev) => {
      const list = prev ?? [];
      if (list.find((t) => t.name.toLowerCase() === name.toLowerCase())) return list;
      return [...list, { id: Date.now(), name }];
    });
  }, []);

  return (
    <SioTagsContext.Provider value={{ tags, loading, noApiKey, error, loadTags, addTagLocal }}>
      {children}
    </SioTagsContext.Provider>
  );
}
