"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { Menu, X } from "lucide-react";

const navLinks = [
  { label: "Fonctionnalites", href: "#fonctionnalites" },
  { label: "Comment ca marche", href: "#comment-ca-marche" },
  { label: "Resultats", href: "#resultats" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-white/80 backdrop-blur-xl shadow-sm border-b border-black/5" : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-6xl flex items-center justify-between px-6 h-16">
        <a href="#" className="flex items-center gap-2.5">
          <Image src="/logo-normal.png" alt="Tipote" width={28} height={28} />
          <span className="font-bold text-lg tracking-tight text-[#2E386E]">Tipote</span>
        </a>

        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-[#2E386E]/70 hover:text-[#5D6CDB] transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <a
            href="/"
            className="text-sm font-medium text-[#2E386E]/70 hover:text-[#5D6CDB] transition-colors px-4 py-2"
          >
            Connexion
          </a>
          <a
            href="#cta"
            className="inline-flex items-center justify-center rounded-full bg-[#5D6CDB] text-white text-sm font-semibold px-6 py-2.5 hover:bg-[#4A59C8] transition-all shadow-md hover:shadow-lg"
          >
            Commencer gratuitement
          </a>
        </div>

        <button className="md:hidden p-2" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Menu">
          {mobileOpen ? <X className="w-5 h-5 text-[#2E386E]" /> : <Menu className="w-5 h-5 text-[#2E386E]" />}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-white/95 backdrop-blur-xl border-b overflow-hidden"
          >
            <div className="px-6 py-4 flex flex-col gap-3">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="text-sm font-medium text-[#2E386E]/80 py-2"
                >
                  {link.label}
                </a>
              ))}
              <a
                href="#cta"
                onClick={() => setMobileOpen(false)}
                className="inline-flex items-center justify-center rounded-full bg-[#5D6CDB] text-white text-sm font-semibold px-6 py-2.5 mt-2"
              >
                Commencer gratuitement
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
