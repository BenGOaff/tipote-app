"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AnimatedSection } from "./AnimatedSection";

const beforeAfter = [
  {
    before: "3 heures pour rediger un post. 3 likes.",
    after: "Contenus generes en quelques clics. Engagement reel.",
  },
  {
    before: "8 outils qui ne se parlent pas.",
    after: "Un seul tableau de bord pour tout piloter.",
  },
  {
    before: "Strategie floue. Actions dispersees.",
    after: "Plan 90 jours clair. Priorites identifiees.",
  },
  {
    before: "Copier-coller entre les reseaux.",
    after: "Publication directe sur 7 plateformes.",
  },
  {
    before: "L'IA ne connait pas ton business.",
    after: "Une IA qui memorise et personnalise tout.",
  },
  {
    before: "Blocage a 23h, personne pour t'aider.",
    after: "Coach IA disponible 24/7.",
  },
];

export default function TransformationSection() {
  const [showAfter, setShowAfter] = useState(true);

  return (
    <section id="resultats" className="relative py-24 sm:py-32 bg-[#F6F7FB]">
      <div className="mx-auto max-w-6xl px-6">
        <AnimatedSection className="text-center mb-16">
          <p className="text-sm font-semibold text-[#5D6CDB] tracking-wide uppercase mb-4">
            La transformation
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#2E386E] tracking-tight leading-tight">
            Avant Tipote.
            <br />
            <span className="hero-text-gradient">Apres Tipote.</span>
          </h2>
        </AnimatedSection>

        {/* Toggle */}
        <AnimatedSection className="flex justify-center mb-12">
          <div className="inline-flex items-center rounded-full bg-white border border-black/5 p-1 shadow-sm">
            <button
              onClick={() => setShowAfter(false)}
              className={`rounded-full px-6 py-2 text-sm font-medium transition-all ${
                !showAfter ? "bg-[#2E386E] text-white shadow-sm" : "text-[#2E386E]/50 hover:text-[#2E386E]/70"
              }`}
            >
              Avant
            </button>
            <button
              onClick={() => setShowAfter(true)}
              className={`rounded-full px-6 py-2 text-sm font-medium transition-all ${
                showAfter ? "bg-[#5D6CDB] text-white shadow-sm" : "text-[#2E386E]/50 hover:text-[#2E386E]/70"
              }`}
            >
              Apres
            </button>
          </div>
        </AnimatedSection>

        {/* Cards grid */}
        <AnimatedSection>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {beforeAfter.map((item, i) => (
              <motion.div
                key={i}
                layout
                className={`rounded-2xl border p-6 transition-all duration-500 ${
                  showAfter
                    ? "bg-white border-[#5D6CDB]/10 shadow-sm"
                    : "bg-white/50 border-black/5"
                }`}
              >
                <motion.div
                  key={showAfter ? "after" : "before"}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                >
                  {!showAfter ? (
                    <>
                      <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center mb-3">
                        <div className="w-2 h-2 rounded-full bg-red-300" />
                      </div>
                      <p className="text-sm text-[#2E386E]/60 leading-relaxed">{item.before}</p>
                    </>
                  ) : (
                    <>
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center mb-3">
                        <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      </div>
                      <p className="text-sm text-[#2E386E]/80 leading-relaxed font-medium">{item.after}</p>
                    </>
                  )}
                </motion.div>
              </motion.div>
            ))}
          </div>
        </AnimatedSection>

        {/* Emotional summary */}
        <AnimatedSection className="mt-16" delay={0.2}>
          <div className="rounded-3xl bg-gradient-to-br from-[#5D6CDB] to-[#2E3A6E] p-8 sm:p-12 text-center text-white">
            <h3 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
              La clarte. Enfin.
            </h3>
            <p className="text-base text-white/70 max-w-2xl mx-auto leading-relaxed mb-2">
              Tu n&apos;as plus l&apos;impression de courir dans toutes les directions.
              Ton activite a du sens, une direction et une coherence.
            </p>
            <p className="text-base text-white/70 max-w-2xl mx-auto leading-relaxed">
              Tu te sens enfin maitre de ta trajectoire professionnelle.
            </p>
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
