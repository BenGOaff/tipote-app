// components/templates/TemplatesLovableClient.tsx
"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { TemplateCard } from "@/components/templates/TemplateCard";
import { templates } from "@/components/templates/templatesData";
import type { Template, TemplateType } from "@/components/templates/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, ShoppingCart, LayoutGrid as Layout } from "lucide-react";

type TabValue = "all" | TemplateType;

export default function TemplatesLovableClient() {
  const t = useTranslations("templates");
  const [activeTab, setActiveTab] = useState<TabValue>("all");

  const filteredTemplates: Template[] = useMemo(() => {
    return activeTab === "all"
      ? templates
      : templates.filter((t: Template) => t.type === activeTab);
  }, [activeTab]);

  const captureCount = useMemo(
    () => templates.filter((t: Template) => t.type === "capture").length,
    []
  );
  const salesCount = useMemo(
    () => templates.filter((t: Template) => t.type === "sales").length,
    []
  );
  const blogCount = useMemo(
    () => templates.filter((t: Template) => t.type === "blog").length,
    []
  );

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <div className="p-6 md:p-8 max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-display font-bold mb-2">{t("title")}</h1>
              <p className="text-muted-foreground max-w-2xl">{t("description")}</p>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="mb-8">
              <TabsList className="grid w-full max-w-md grid-cols-4">
                <TabsTrigger value="all" className="flex items-center gap-2">
                  <Layout className="w-4 h-4" />
                  <span className="hidden sm:inline">{t("tabs.all")}</span>
                  <span className="text-xs text-muted-foreground">({templates.length})</span>
                </TabsTrigger>

                <TabsTrigger value="capture" className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  <span className="hidden sm:inline">{t("tabs.capture")}</span>
                  <span className="text-xs text-muted-foreground">({captureCount})</span>
                </TabsTrigger>

                <TabsTrigger value="sales" className="flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4" />
                  <span className="hidden sm:inline">{t("tabs.sales")}</span>
                  <span className="text-xs text-muted-foreground">({salesCount})</span>
                </TabsTrigger>

                <TabsTrigger value="blog" className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  <span className="hidden sm:inline">{t("tabs.blog")}</span>
                  <span className="text-xs text-muted-foreground">({blogCount})</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value={activeTab} className="mt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredTemplates.map((template: Template) => (
                    <TemplateCard key={template.id} template={template} />
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
