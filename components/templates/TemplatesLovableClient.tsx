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
import { PageHeader } from "@/components/PageHeader";
import { PageBanner } from "@/components/PageBanner";

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
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto bg-muted/30 flex flex-col">
          <PageHeader left={<h1 className="text-lg font-display font-bold truncate">{t("title")}</h1>} />
          <div className="flex-1 p-4 sm:p-5 lg:p-6">
            <div className="max-w-[1200px] mx-auto w-full space-y-5">
              <PageBanner icon={<Layout className="w-5 h-5" />} title={t("title")} subtitle={t("description")} />

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
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
