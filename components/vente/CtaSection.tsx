"use client";

import { motion } from "framer-motion";
import { AnimatedSection } from "./AnimatedSection";
import { ArrowRight, Check, Zap } from "lucide-react";

const guarantees = [
  "Gratuit pour demarrer",
  "Aucune carte bancaire requise",
  "Pret en 5 minutes",
  "Support reactif",
];

export default function CtaSection() {
  return (
    <section id="cta" className="relative py-24 sm:py-32 bg-white overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-[0.02]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, #2E386E 1px, transparent 0)`,
        backgroundSize: "40px 40px",
      }} />
      <motion.div
        animate={{ x: [0, 20, 0], y: [0, -15, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-[#5D6CDB]/5 rounded-full blur-[150px]"
      />

      <div className="relative mx-auto max-w-4xl px-6 text-center">
        <AnimatedSection>
          <div className="inline-flex items-center gap-2 rounded-full bg-[#C1FF6F]/15 border border-[#C1FF6F]/20 px-4 py-1.5 mb-8">
            <Zap className="w-3.5 h-3.5 text-[#5D6CDB]" />
            <span className="text-xs font-medium text-[#2E386E]/60 tracking-wide">
              Rejoins les solobuilders qui avancent
            </span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#2E386E] tracking-tight leading-tight mb-6">
            Arrete de disperser tes efforts.
            <br />
            <span className="hero-text-gradient">Commence a construire.</span>
          </h2>

          <p className="text-lg text-[#2E386E]/55 max-w-2xl mx-auto leading-relaxed mb-10">
            Tipote est le seul outil qui memorise ton business, structure ta strategie,
            genere tes contenus et publie sur tes reseaux. Tout, depuis un seul endroit.
          </p>

          {/* CTA Button */}
          <motion.a
            href="/"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            className="group inline-flex items-center gap-3 rounded-full bg-gradient-to-r from-[#5D6CDB] to-[#4A59C8] text-white font-semibold px-10 py-5 text-lg shadow-xl shadow-[#5D6CDB]/25 hover:shadow-2xl hover:shadow-[#5D6CDB]/30 transition-shadow"
          >
            Essayer Tipote gratuitement
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          </motion.a>

          {/* Guarantees */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {guarantees.map((item) => (
              <div key={item} className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs text-[#2E386E]/45 font-medium">{item}</span>
              </div>
            ))}
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
