"use client";

import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";

export default function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Animated gradient background */}
      <div className="absolute inset-0 hero-gradient-bg" />

      {/* Floating grid pattern */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, #2E386E 1px, transparent 0)`,
        backgroundSize: "40px 40px",
      }} />

      {/* Glow orbs */}
      <motion.div
        animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-[#5D6CDB]/10 rounded-full blur-[120px]"
      />
      <motion.div
        animate={{ x: [0, -20, 0], y: [0, 30, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-[#C1FF6F]/8 rounded-full blur-[100px]"
      />

      <div className="relative z-10 mx-auto max-w-5xl px-6 text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 rounded-full bg-[#5D6CDB]/8 border border-[#5D6CDB]/15 px-4 py-1.5 mb-8"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#5D6CDB]" />
          <span className="text-xs font-medium text-[#5D6CDB] tracking-wide">
            Le systeme d&apos;exploitation des solobuilders
          </span>
        </motion.div>

        {/* Main headline */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15 }}
          className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-[#2E386E] leading-[1.05] mb-6"
        >
          Ton business a besoin
          <br />
          <span className="hero-text-gradient">d&apos;un cerveau.</span>
        </motion.h1>

        {/* Sub-headline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.35 }}
          className="text-lg sm:text-xl text-[#2E386E]/60 max-w-2xl mx-auto mb-10 leading-relaxed"
        >
          Tipote memorise ton business, structure ta strategie, genere tes contenus
          et publie sur 7 reseaux. Un seul endroit pour tout faire tourner.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <a
            href="#cta"
            className="group inline-flex items-center gap-2 rounded-full bg-[#5D6CDB] text-white font-semibold px-8 py-4 text-base hover:bg-[#4A59C8] transition-all shadow-lg shadow-[#5D6CDB]/25 hover:shadow-xl hover:shadow-[#5D6CDB]/30 hover:scale-[1.02]"
          >
            Essayer gratuitement
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </a>
          <a
            href="#comment-ca-marche"
            className="inline-flex items-center gap-2 rounded-full border border-[#2E386E]/15 text-[#2E386E]/70 font-medium px-8 py-4 text-base hover:bg-[#2E386E]/5 transition-all"
          >
            Voir comment ca marche
          </a>
        </motion.div>

        {/* Floating UI Preview */}
        <motion.div
          initial={{ opacity: 0, y: 60, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1, delay: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="mt-16 sm:mt-20 relative"
        >
          <div className="relative mx-auto max-w-4xl">
            {/* Browser chrome */}
            <div className="rounded-2xl border border-black/10 bg-white shadow-2xl shadow-[#5D6CDB]/10 overflow-hidden">
              {/* Title bar */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-black/5 bg-[#F6F7FB]">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
                  <div className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
                  <div className="w-3 h-3 rounded-full bg-[#28C840]" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="rounded-md bg-white border border-black/10 px-12 py-1 text-xs text-[#2E386E]/40">
                    app.tipote.com
                  </div>
                </div>
              </div>

              {/* Dashboard mockup */}
              <div className="p-6 bg-[#F6F7FB]">
                <div className="grid grid-cols-12 gap-4">
                  {/* Sidebar mock */}
                  <div className="col-span-3 hidden sm:block">
                    <div className="space-y-2">
                      {["Dashboard", "Strategie", "Contenus", "Publication", "Analytics"].map((item, i) => (
                        <div
                          key={item}
                          className={`rounded-lg px-3 py-2 text-xs font-medium ${
                            i === 0
                              ? "bg-[#5D6CDB]/10 text-[#5D6CDB]"
                              : "text-[#2E386E]/40"
                          }`}
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Main content mock */}
                  <div className="col-span-12 sm:col-span-9 space-y-4">
                    {/* Banner */}
                    <div className="rounded-xl bg-gradient-to-r from-[#5D6CDB] to-[#2E3A6E] p-4 text-white">
                      <div className="text-sm font-semibold">Bonjour, Marie</div>
                      <div className="text-xs text-white/70 mt-1">3 taches prioritaires aujourd&apos;hui</div>
                    </div>

                    {/* Cards row */}
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "Leads", value: "127", trend: "+23%" },
                        { label: "Contenus", value: "48", trend: "+12" },
                        { label: "Vues", value: "3.2k", trend: "+18%" },
                      ].map((card) => (
                        <div key={card.label} className="rounded-xl bg-white border border-black/5 p-3">
                          <div className="text-[10px] text-[#2E386E]/50">{card.label}</div>
                          <div className="text-lg font-bold text-[#2E386E] mt-1">{card.value}</div>
                          <div className="text-[10px] text-emerald-500 font-medium">{card.trend}</div>
                        </div>
                      ))}
                    </div>

                    {/* Chart placeholder */}
                    <div className="rounded-xl bg-white border border-black/5 p-4 h-24 flex items-end gap-1">
                      {[30, 45, 35, 60, 50, 75, 65, 80, 70, 90, 85, 95].map((h, i) => (
                        <motion.div
                          key={i}
                          initial={{ height: 0 }}
                          animate={{ height: `${h}%` }}
                          transition={{ duration: 0.5, delay: 1.2 + i * 0.05 }}
                          className="flex-1 bg-[#5D6CDB]/20 rounded-t"
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating badges */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.5, duration: 0.5 }}
              className="absolute -left-4 top-1/3 hidden lg:block"
            >
              <div className="rounded-xl bg-white shadow-lg border border-black/5 p-3 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#C1FF6F]/20 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-[#5D6CDB]" />
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-[#2E386E]">Contenu genere</div>
                  <div className="text-[9px] text-[#2E386E]/50">Post LinkedIn pret</div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.8, duration: 0.5 }}
              className="absolute -right-4 top-1/2 hidden lg:block"
            >
              <div className="rounded-xl bg-white shadow-lg border border-black/5 p-3 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-500 text-xs font-bold">
                  +1
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-[#2E386E]">Nouveau lead</div>
                  <div className="text-[9px] text-[#2E386E]/50">Via page de capture</div>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Trust line */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2, duration: 0.6 }}
          className="mt-10 text-xs text-[#2E386E]/40 font-medium"
        >
          Gratuit pour commencer &middot; Aucune carte requise &middot; Pret en 5 minutes
        </motion.p>
      </div>
    </section>
  );
}
