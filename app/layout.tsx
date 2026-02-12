// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import Providers from "@/components/Providers";
import { HotjarTracker } from "@/components/HotjarTracker";


export const metadata: Metadata = {
  title: "Tipote",
  description: "Tipote – planification stratégique & automatisations business",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="font-sans antialiased">
        <HotjarTracker />

        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
