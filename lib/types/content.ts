// lib/types/content.ts

export type ContentListItem = {
  id: string;
  type: string | null;
  title: string | null;

  /**
   * IMPORTANT:
   * - Certains écrans (list/calendar) n'en ont pas besoin
   * - Mais d'autres (ou des anciens types) le demandent.
   * => on le met en optionnel pour éviter les conflits TS.
   */
  content?: string | null;

  status: string | null;
  scheduled_date: string | null; // YYYY-MM-DD (ou ISO)
  channel: string | null;
  tags: string[] | string | null;
  created_at: string;
};
