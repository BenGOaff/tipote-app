"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

type SioTag = { id: number; name: string };
type SioCourse = { id: number; title: string };
type SioCommunity = { id: number; name: string };

interface SioSelectorsProps {
  tagValue: string;
  courseValue: string;
  communityValue: string;
  onTagChange: (v: string) => void;
  onCourseChange: (v: string) => void;
  onCommunityChange: (v: string) => void;
}

export default function SioSelectors({
  tagValue, courseValue, communityValue,
  onTagChange, onCourseChange, onCommunityChange,
}: SioSelectorsProps) {
  const [tags, setTags] = useState<SioTag[]>([]);
  const [courses, setCourses] = useState<SioCourse[]>([]);
  const [communities, setCommunities] = useState<SioCommunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasKey, setHasKey] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/systeme-io/tags").then((r) => r.json()),
      fetch("/api/systeme-io/courses").then((r) => r.json()),
      fetch("/api/systeme-io/communities").then((r) => r.json()),
    ])
      .then(([tagsData, coursesData, communitiesData]) => {
        setTags(tagsData.tags ?? []);
        setCourses(coursesData.courses ?? []);
        setCommunities(communitiesData.communities ?? []);
        // If all empty, likely no API key configured
        if (!tagsData.tags?.length && !coursesData.courses?.length && !communitiesData.communities?.length) {
          setHasKey(false);
        }
      })
      .catch(() => setHasKey(false))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement des données Systeme.io...
      </div>
    );
  }

  if (!hasKey) {
    return (
      <div className="rounded-lg bg-muted/50 border border-border p-3 text-sm text-muted-foreground">
        Configure ta clé API Systeme.io dans les <a href="/settings?tab=systemeio" className="text-primary underline">Paramètres</a> pour voir tes tags, formations et communautés ici.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {/* Tag */}
      <div className="space-y-2">
        <Label>Tag Systeme.io</Label>
        {tags.length > 0 ? (
          <select
            value={tagValue}
            onChange={(e) => onTagChange(e.target.value)}
            className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
          >
            <option value="">— Aucun tag —</option>
            {tags.map((t) => (
              <option key={t.id} value={t.name}>{t.name}</option>
            ))}
          </select>
        ) : (
          <Input
            value={tagValue}
            onChange={(e) => onTagChange(e.target.value)}
            placeholder="Nom du tag"
          />
        )}
      </div>

      {/* Course */}
      <div className="space-y-2">
        <Label>Formation Systeme.io</Label>
        {courses.length > 0 ? (
          <select
            value={courseValue}
            onChange={(e) => onCourseChange(e.target.value)}
            className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
          >
            <option value="">— Aucune formation —</option>
            {courses.map((c) => (
              <option key={c.id} value={String(c.id)}>{c.title}</option>
            ))}
          </select>
        ) : (
          <Input
            value={courseValue}
            onChange={(e) => onCourseChange(e.target.value)}
            placeholder="ID de la formation"
          />
        )}
      </div>

      {/* Community */}
      <div className="space-y-2">
        <Label>Communauté Systeme.io</Label>
        {communities.length > 0 ? (
          <select
            value={communityValue}
            onChange={(e) => onCommunityChange(e.target.value)}
            className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
          >
            <option value="">— Aucune communauté —</option>
            {communities.map((c) => (
              <option key={c.id} value={String(c.id)}>{c.name}</option>
            ))}
          </select>
        ) : (
          <Input
            value={communityValue}
            onChange={(e) => onCommunityChange(e.target.value)}
            placeholder="ID de la communauté"
          />
        )}
      </div>
    </div>
  );
}
