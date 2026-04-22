"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Monitor, Tablet, Smartphone } from "lucide-react";

type QuizOption = { text: string; result_index: number };
type QuizQuestion = { question_text: string; options: QuizOption[] };
type QuizResult = { title: string; description: string; cta_text: string; cta_url: string };

interface QuizPreviewProps {
  title: string;
  introduction: string;
  questions: QuizQuestion[];
  results: QuizResult[];
  captureHeading: string;
  captureSubtitle: string;
  captureFirstName: boolean;
  captureLastName: boolean;
  capturePhone: boolean;
  captureCountry: boolean;
  ctaText: string;
  // Branding
  brandColorPrimary?: string;
  brandColorAccent?: string;
  brandFont?: string;
  brandLogoUrl?: string;
}

type Device = "desktop" | "tablet" | "mobile";

const DEVICE_WIDTHS: Record<Device, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "375px",
};

export default function QuizPreview({
  title, introduction, questions, results, captureHeading, captureSubtitle,
  captureFirstName, captureLastName, capturePhone, captureCountry,
  ctaText, brandColorPrimary, brandColorAccent, brandFont, brandLogoUrl,
}: QuizPreviewProps) {
  const t = useTranslations("quizPreview");
  const [device, setDevice] = useState<Device>("desktop");
  const [previewStep, setPreviewStep] = useState<"intro" | "question" | "capture" | "result">("intro");
  const [currentQ, setCurrentQ] = useState(0);

  const primaryColor = brandColorPrimary || "#5D6CDB";
  const accentColor = brandColorAccent || "#20BBE6";
  const font = brandFont || "Inter";

  return (
    <div className="space-y-4">
      {/* Device toggles */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{t("livePreview")}</h3>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {([
            { key: "desktop" as Device, icon: Monitor, label: t("deviceDesktop") },
            { key: "tablet" as Device, icon: Tablet, label: t("deviceTablet") },
            { key: "mobile" as Device, icon: Smartphone, label: t("deviceMobile") },
          ]).map(({ key, icon: Icon, label }) => (
            <Button
              key={key}
              variant={device === key ? "default" : "ghost"}
              size="sm"
              onClick={() => setDevice(key)}
              className="h-8 px-3"
              title={label}
            >
              <Icon className="h-4 w-4" />
            </Button>
          ))}
        </div>
      </div>

      {/* Preview step selector */}
      <div className="flex gap-2 flex-wrap">
        {([
          { key: "intro" as const, label: t("stepIntro") },
          { key: "question" as const, label: t("stepQuestion", { n: currentQ + 1 }) },
          { key: "capture" as const, label: t("stepCapture") },
          { key: "result" as const, label: t("stepResult") },
        ]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPreviewStep(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              previewStep === key
                ? "bg-primary text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Preview frame */}
      <div className="flex justify-center">
        <div
          className="border-2 border-border rounded-2xl overflow-hidden bg-white shadow-lg transition-all duration-300"
          style={{
            width: DEVICE_WIDTHS[device],
            maxWidth: "100%",
            minHeight: device === "mobile" ? "600px" : "500px",
            fontFamily: font,
          }}
        >
          <div className="p-6 sm:p-8 flex flex-col items-center justify-center min-h-[400px] text-center">
            {/* Logo */}
            {brandLogoUrl && (
              <img src={brandLogoUrl} alt="Logo" className="h-10 w-auto mb-6" />
            )}

            {/* Intro step */}
            {previewStep === "intro" && (
              <>
                <h1 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: primaryColor }}>
                  {title || t("defaultTitle")}
                </h1>
                <p className="text-base text-gray-600 mb-8 max-w-md">
                  {introduction || t("defaultIntro")}
                </p>
                <button
                  className="px-8 py-3 rounded-xl text-white font-semibold text-base transition-all hover:opacity-90 shadow-md"
                  style={{ backgroundColor: primaryColor }}
                  onClick={() => { setPreviewStep("question"); setCurrentQ(0); }}
                >
                  {ctaText || t("defaultCta")}
                </button>
              </>
            )}

            {/* Question step */}
            {previewStep === "question" && questions[currentQ] && (
              <>
                {/* Progress */}
                <div className="w-full mb-6">
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>{t("questionProgress", { n: currentQ + 1, total: questions.length })}</span>
                    <span>{Math.round(((currentQ + 1) / questions.length) * 100)}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${((currentQ + 1) / questions.length) * 100}%`,
                        backgroundColor: accentColor,
                      }}
                    />
                  </div>
                </div>

                <h2 className="text-xl sm:text-2xl font-bold mb-6" style={{ color: primaryColor }}>
                  {questions[currentQ].question_text || t("defaultQuestion")}
                </h2>

                <div className="space-y-3 w-full max-w-md">
                  {questions[currentQ].options.map((opt, i) => (
                    <button
                      key={i}
                      className="w-full text-left px-5 py-3.5 rounded-xl border-2 transition-all hover:shadow-md"
                      style={{
                        borderColor: "rgba(0,0,0,0.08)",
                        color: primaryColor,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = accentColor; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(0,0,0,0.08)"; }}
                      onClick={() => {
                        if (currentQ < questions.length - 1) {
                          setCurrentQ(currentQ + 1);
                        } else {
                          setPreviewStep("capture");
                        }
                      }}
                    >
                      <span className="font-medium text-xs text-gray-400 mr-2">{String.fromCharCode(65 + i)}</span>
                      {opt.text || t("defaultOption", { n: i + 1 })}
                    </button>
                  ))}
                </div>

                {/* Nav buttons */}
                <div className="flex gap-2 mt-6">
                  {currentQ > 0 && (
                    <button
                      className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                      onClick={() => setCurrentQ(currentQ - 1)}
                    >
                      {t("prevNav")}
                    </button>
                  )}
                </div>
              </>
            )}

            {/* Capture step */}
            {previewStep === "capture" && (
              <>
                <h2 className="text-xl sm:text-2xl font-bold mb-2" style={{ color: primaryColor }}>
                  {captureHeading || t("defaultCaptureHeading")}
                </h2>
                <p className="text-sm text-gray-500 mb-6">
                  {captureSubtitle || t("defaultCaptureSubtitle")}
                </p>

                <div className="space-y-3 w-full max-w-sm">
                  <input placeholder={t("emailPh")} className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm" readOnly />
                  {captureFirstName && <input placeholder={t("firstNamePh")} className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm" readOnly />}
                  {captureLastName && <input placeholder={t("lastNamePh")} className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm" readOnly />}
                  {capturePhone && <input placeholder={t("phonePh")} className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm" readOnly />}
                  {captureCountry && <input placeholder={t("countryPh")} className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm" readOnly />}

                  <button
                    className="w-full px-6 py-3 rounded-xl text-white font-semibold transition-all"
                    style={{ backgroundColor: primaryColor }}
                    onClick={() => setPreviewStep("result")}
                  >
                    {t("seeResultBtn")}
                  </button>
                </div>
              </>
            )}

            {/* Result step */}
            {previewStep === "result" && results[0] && (
              <>
                <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: `${accentColor}20` }}>
                  <span className="text-2xl">🎯</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold mb-3" style={{ color: primaryColor }}>
                  {results[0].title || t("defaultResultTitle")}
                </h2>
                <p className="text-sm text-gray-600 mb-6 max-w-md">
                  {results[0].description || t("defaultResultDesc")}
                </p>
                {results[0].cta_text && (
                  <button
                    className="px-8 py-3 rounded-xl text-white font-semibold transition-all hover:opacity-90 shadow-md"
                    style={{ backgroundColor: accentColor }}
                  >
                    {results[0].cta_text}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
