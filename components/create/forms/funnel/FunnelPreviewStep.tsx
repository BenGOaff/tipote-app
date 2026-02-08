"use client";

import type { SystemeTemplate } from "@/data/systemeTemplates";

export function FunnelPreviewStep(props: { selectedTemplate: SystemeTemplate }) {
  const { selectedTemplate } = props;

  return (
    <iframe
      src={`/api/templates/file/${selectedTemplate.layoutPath}`}
      className="w-full h-[80vh] border rounded-md"
      title="Template preview"
    />
  );
}
