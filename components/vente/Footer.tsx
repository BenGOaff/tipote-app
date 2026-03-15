"use client";

import Image from "next/image";

export default function Footer() {
  return (
    <footer className="border-t border-black/5 bg-[#F6F7FB] py-12">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <Image src="/logo-normal.png" alt="Tipote" width={24} height={24} />
            <span className="font-semibold text-sm text-[#2E386E]">Tipote</span>
          </div>

          <div className="flex items-center gap-6 text-xs text-[#2E386E]/40">
            <a href="/legal/mentions-legales" className="hover:text-[#5D6CDB] transition-colors">
              Mentions legales
            </a>
            <a href="/legal/cgv" className="hover:text-[#5D6CDB] transition-colors">
              CGV
            </a>
            <a href="/legal/confidentialite" className="hover:text-[#5D6CDB] transition-colors">
              Confidentialite
            </a>
          </div>

          <p className="text-xs text-[#2E386E]/30">
            &copy; {new Date().getFullYear()} Tipote. Tous droits reserves.
          </p>
        </div>
      </div>
    </footer>
  );
}
