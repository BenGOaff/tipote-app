// components/templates/types.ts
export type TemplateType = "capture" | "sales" | "blog";

export interface Template {
  id: string;
  name: string;
  description: string;
  category: string[];
  type: TemplateType;
  imageUrl: string;
  shareLink: string;
  features: string[];
  price?: string;
}
