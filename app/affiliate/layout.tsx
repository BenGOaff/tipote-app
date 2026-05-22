// app/affiliate/layout.tsx
//
// Layout du dashboard affilié (affiliate.tipote.com). Sépare totalement
// du layout principal Tipote app : pas de sidebar, header bi-marque
// Tipote × Tiquiz, palette adaptée.
//
// Toutes les routes sous /affiliate sauf /affiliate/login et
// /affiliate/auth/* requièrent une session valide — c'est vérifié au
// niveau de chaque page (pas dans le layout pour éviter les redirects
// en cascade côté login).

import "../globals.css";
import Link from "next/link";

export default function AffiliateLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="font-sans antialiased min-h-screen bg-slate-950 text-slate-100">
        <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-30">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold text-sm">
                  T
                </span>
                <div className="flex flex-col leading-none">
                  <span className="text-base font-semibold tracking-tight">
                    Tipote × Tiquiz
                  </span>
                  <span className="text-[11px] text-slate-400 uppercase tracking-widest">
                    Creators
                  </span>
                </div>
              </div>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link href="/" className="px-3 py-2 rounded-lg hover:bg-slate-800 transition">
                Vue d&apos;ensemble
              </Link>
              <Link href="/promouvoir" className="px-3 py-2 rounded-lg hover:bg-slate-800 transition">
                Promouvoir
              </Link>
              <Link href="/revenus" className="px-3 py-2 rounded-lg hover:bg-slate-800 transition">
                Revenus
              </Link>
              <Link href="/paiement" className="px-3 py-2 rounded-lg hover:bg-slate-800 transition">
                Paiement
              </Link>
              <Link href="/support" className="px-3 py-2 rounded-lg hover:bg-slate-800 transition">
                Support
              </Link>
            </nav>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
