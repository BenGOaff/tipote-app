"use client";

// components/share/QrCodeCard.tsx (Tipote, mirror Tiquiz)
//
// Genere un QR code a partir d'une URL publique (quiz, sondage, popquiz).
// Affiche le SVG inline + 2 boutons telechargement (PNG hi-res 1024x1024
// + SVG vectoriel).
//
// Cas d'usage type (Bene 4 juin 2026) : inserer un QR dans un livre,
// un flyer, une slide → le lecteur scanne, arrive direct sur le quiz.
//
// Choix techniques :
//   - Lib `qrcode` (vanilla JS, ~30KB) : genere SVG string + PNG dataURL
//   - Error correction LEVEL H (30% redommagement tolere) — important
//     pour l'impression livre/papier qui peut bavurer
//   - Margin 2 (quiet zone standard ISO/IEC 18004) — sans ca, certains
//     scanners ratent
//   - Couleurs codees en dur #000000 / #FFFFFF (max contraste, ne depend
//     pas du theme dark/light)
//
// SVG est l'export recommande pour le print (vectoriel = aucune
// pixellisation a n'importe quelle taille). PNG 1024x1024 pour Canva,
// PowerPoint, reseaux sociaux qui n'aiment pas le SVG.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import { QrCode, Download, FileImage, FileCode } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface QrCodeCardProps {
  /** URL a encoder dans le QR (typiquement publicUrl du quiz) */
  url: string;
  /** Nom de fichier pour le download (sans extension) — ex. "quiz-tdah" */
  filename?: string;
}

export function QrCodeCard({ url, filename = "tiquiz" }: QrCodeCardProps) {
  const t = useTranslations("qrCode");
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgString, setSvgString] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    QRCode.toString(url, {
      type: "svg",
      errorCorrectionLevel: "H",
      margin: 2,
      color: { dark: "#000000", light: "#FFFFFF" },
    })
      .then((svg) => {
        if (!cancelled) {
          setSvgString(svg);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  function safeFilename(): string {
    return (filename || "tiquiz").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "tiquiz";
  }

  async function downloadPng() {
    try {
      const dataUrl = await QRCode.toDataURL(url, {
        errorCorrectionLevel: "H",
        margin: 2,
        width: 1024,
        color: { dark: "#000000", light: "#FFFFFF" },
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${safeFilename()}-qrcode.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      console.error("[QrCodeCard] PNG download failed", e);
    }
  }

  function downloadSvg() {
    if (!svgString) return;
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `${safeFilename()}-qrcode.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode className="h-5 w-5 text-primary" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row items-center gap-5">
          <div
            ref={containerRef}
            className="w-44 h-44 sm:w-48 sm:h-48 shrink-0 rounded-lg border bg-white p-2 flex items-center justify-center"
            aria-label={t("ariaLabel")}
          >
            {error ? (
              <p className="text-xs text-destructive text-center px-2">{error}</p>
            ) : svgString ? (
              <div className="w-full h-full" dangerouslySetInnerHTML={{ __html: svgString }} />
            ) : (
              <p className="text-xs text-muted-foreground">{t("generating")}</p>
            )}
          </div>
          <div className="flex-1 space-y-3 min-w-0">
            <p className="text-sm text-muted-foreground leading-relaxed">{t("hint")}</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={downloadSvg}
                disabled={!svgString}
                className="justify-start"
              >
                <FileCode className="h-4 w-4 mr-2" />
                {t("downloadSvg")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={downloadPng}
                className="justify-start"
              >
                <FileImage className="h-4 w-4 mr-2" />
                {t("downloadPng")}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              <Download className="inline h-3 w-3 mr-1" />
              {t("printTip")}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
