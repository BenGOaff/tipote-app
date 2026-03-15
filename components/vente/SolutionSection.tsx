"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AnimatedSection, StaggerContainer, StaggerItem } from "./AnimatedSection";
import {
  Target,
  PenTool,
  Send,
  BarChart3,
  ChevronRight,
  Brain,
  Zap,
  Shield,
} from "lucide-react";

const pillars = [
  {
    id: "strategie",
    icon: Target,
    color: "#5D6CDB",
    bgColor: "bg-[#5D6CDB]/8",
    title: "Strategie",
    headline: "Un plan clair, pas une to-do list infinie.",
    desc: "Tipote analyse ton business et genere un plan strategique sur 90 jours. Offres, positionnement, audience, objectifs — tout est structure pour toi.",
    details: [
      "Diagnostic business complet",
      "Plan strategique 90 jours personnalise",
      "Propositions d'offres alignees a ton audience",
      "Taches prioritaires identifiees automatiquement",
    ],
  },
  {
    id: "contenu",
    icon: PenTool,
    color: "#8B5CF6",
    bgColor: "bg-purple-500/8",
    title: "Contenu",
    headline: "Des contenus qui te ressemblent. En quelques clics.",
    desc: "L'IA de Tipote connait ton style, ton audience et tes offres. Elle genere des posts, emails, articles et scripts qui parlent vraiment a tes clients.",
    details: [
      "Posts reseaux sociaux adaptes a chaque plateforme",
      "Emails et newsletters personnalises",
      "Articles de blog et scripts video",
      "Strategie editoriale automatisee",
    ],
  },
  {
    id: "publication",
    icon: Send,
    color: "#059669",
    bgColor: "bg-emerald-500/8",
    title: "Publication",
    headline: "Publie partout. Depuis un seul endroit.",
    desc: "Connecte tes reseaux et publie en un clic sur LinkedIn, Instagram, Facebook, X, TikTok, Threads et Pinterest. Programme, publie, oublie.",
    details: [
      "Publication directe sur 7 reseaux sociaux",
      "Programmation et calendrier editorial",
      "Auto-commentaires et comment-to-DM",
      "Images, carousels, videos supportes",
    ],
  },
  {
    id: "analytics",
    icon: BarChart3,
    color: "#D97706",
    bgColor: "bg-amber-500/8",
    title: "Analytics",
    headline: "Comprends ce qui marche. Amplifie-le.",
    desc: "Tipote analyse tes resultats et te donne des recommandations concretes. Plus besoin de deviner — les donnees parlent pour toi.",
    details: [
      "Dashboard de performance centralise",
      "Diagnostic IA de tes resultats",
      "Suivi des leads et conversions",
      "Recommandations d'optimisation",
    ],
  },
];

export default function SolutionSection() {
  const [activePillar, setActivePillar] = useState(0);
  const active = pillars[activePillar];

  return (
    <section id="fonctionnalites" className="relative py-24 sm:py-32 bg-[#F6F7FB]">
      <div className="mx-auto max-w-6xl px-6">
        <AnimatedSection className="text-center mb-16">
          <p className="text-sm font-semibold text-[#5D6CDB] tracking-wide uppercase mb-4">
            La solution
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#2E386E] tracking-tight leading-tight">
            Un seul systeme.
            <br />
            <span className="hero-text-gradient">Quatre piliers.</span>
          </h2>
          <p className="mt-6 text-lg text-[#2E386E]/60 max-w-2xl mx-auto leading-relaxed">
            Les autres outils resolvent un morceau du probleme.
            Tipote les reunit dans un systeme coherent qui connait ton business.
          </p>
        </AnimatedSection>

        {/* The 3 key differentiators */}
        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-16">
          {[
            {
              icon: Brain,
              title: "Memoire business",
              desc: "Tipote se souvient de tout. Ton profil, tes offres, ton audience, ta strategie. Comme un medecin traitant du business.",
            },
            {
              icon: Zap,
              title: "Execution integree",
              desc: "Pas juste des conseils. Tipote genere, organise, publie et analyse. Tout est actionnable.",
            },
            {
              icon: Shield,
              title: "Anti-complexite",
              desc: "Un seul endroit pour faire tourner ton activite. Plus de jonglage entre 12 outils.",
            },
          ].map((diff) => (
            <StaggerItem key={diff.title}>
              <div className="rounded-2xl bg-white border border-black/5 p-6 text-center h-full">
                <div className="w-12 h-12 rounded-xl bg-[#5D6CDB]/8 flex items-center justify-center mx-auto mb-4">
                  <diff.icon className="w-6 h-6 text-[#5D6CDB]" />
                </div>
                <h3 className="text-base font-semibold text-[#2E386E] mb-2">{diff.title}</h3>
                <p className="text-sm text-[#2E386E]/55 leading-relaxed">{diff.desc}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>

        {/* Interactive pillar selector */}
        <AnimatedSection>
          <div className="rounded-3xl bg-white border border-black/5 shadow-lg overflow-hidden">
            {/* Tab bar */}
            <div className="flex border-b border-black/5 overflow-x-auto no-scrollbar">
              {pillars.map((pillar, i) => (
                <button
                  key={pillar.id}
                  onClick={() => setActivePillar(i)}
                  className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-6 py-4 text-sm font-medium transition-all relative ${
                    i === activePillar ? "text-[#2E386E]" : "text-[#2E386E]/40 hover:text-[#2E386E]/60"
                  }`}
                >
                  <pillar.icon className="w-4 h-4" />
                  {pillar.title}
                  {i === activePillar && (
                    <motion.div
                      layoutId="pillar-indicator"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#5D6CDB]"
                    />
                  )}
                </button>
              ))}
            </div>

            {/* Content area */}
            <div className="p-8 sm:p-10">
              <AnimatePresence mode="wait">
                <motion.div
                  key={active.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center"
                >
                  <div>
                    <div
                      className={`w-12 h-12 rounded-xl ${active.bgColor} flex items-center justify-center mb-5`}
                    >
                      <active.icon className="w-6 h-6" style={{ color: active.color }} />
                    </div>
                    <h3 className="text-2xl sm:text-3xl font-bold text-[#2E386E] mb-4 tracking-tight">
                      {active.headline}
                    </h3>
                    <p className="text-base text-[#2E386E]/60 leading-relaxed mb-6">{active.desc}</p>
                    <ul className="space-y-3">
                      {active.details.map((detail, i) => (
                        <motion.li
                          key={detail}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.08 }}
                          className="flex items-start gap-3"
                        >
                          <ChevronRight className="w-4 h-4 text-[#5D6CDB] mt-0.5 shrink-0" />
                          <span className="text-sm text-[#2E386E]/70">{detail}</span>
                        </motion.li>
                      ))}
                    </ul>
                  </div>

                  {/* Visual mockup per pillar */}
                  <div className="rounded-2xl bg-[#F6F7FB] border border-black/5 p-6 min-h-[280px] flex items-center justify-center">
                    <PillarVisual pillar={active.id} color={active.color} />
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}

function PillarVisual({ pillar, color }: { pillar: string; color: string }) {
  if (pillar === "strategie") {
    return (
      <div className="w-full space-y-3">
        <div className="rounded-xl bg-white border border-black/5 p-4">
          <div className="text-xs font-semibold text-[#2E386E]/40 mb-3">Plan Strategique 90 jours</div>
          {["Semaine 1-4 : Positionnement", "Semaine 5-8 : Acquisition", "Semaine 9-12 : Monetisation"].map(
            (phase, i) => (
              <motion.div
                key={phase}
                initial={{ width: 0 }}
                animate={{ width: `${60 + i * 15}%` }}
                transition={{ delay: 0.3 + i * 0.15, duration: 0.6 }}
                className="mb-2 last:mb-0"
              >
                <div className="rounded-lg bg-[#5D6CDB]/8 px-3 py-2 text-xs text-[#2E386E]/70">{phase}</div>
              </motion.div>
            ),
          )}
        </div>
      </div>
    );
  }

  if (pillar === "contenu") {
    return (
      <div className="w-full space-y-3">
        <div className="rounded-xl bg-white border border-black/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-full bg-[#0A66C2] flex items-center justify-center text-white text-[8px] font-bold">in</div>
            <span className="text-xs font-medium text-[#2E386E]/60">Post LinkedIn</span>
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-xs text-[#2E386E]/50 leading-relaxed"
          >
            La plupart des solobuilders travaillent 10h/jour...
            <br />sans systeme clair pour avancer.
            <br /><br />
            Voici ce que j&apos;ai change dans mon approche
            <span className="animate-pulse">|</span>
          </motion.div>
        </div>
        <div className="flex gap-2">
          {["Email", "Blog", "Script"].map((type) => (
            <div key={type} className="rounded-lg bg-white border border-black/5 px-3 py-2 text-[10px] text-[#2E386E]/50">
              {type}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (pillar === "publication") {
    return (
      <div className="w-full">
        <div className="grid grid-cols-4 gap-2">
          {[
            { name: "LinkedIn", color: "#0A66C2", status: "Publie" },
            { name: "Instagram", color: "#E4405F", status: "Programme" },
            { name: "X", color: "#000000", status: "Publie" },
            { name: "Facebook", color: "#1877F2", status: "En attente" },
            { name: "TikTok", color: "#000000", status: "Publie" },
            { name: "Threads", color: "#000000", status: "Programme" },
            { name: "Pinterest", color: "#BD081C", status: "Publie" },
            { name: "+", color: "#5D6CDB", status: "" },
          ].map((network, i) => (
            <motion.div
              key={network.name}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 + i * 0.06 }}
              className="rounded-xl bg-white border border-black/5 p-3 text-center"
            >
              <div
                className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center text-white text-[10px] font-bold"
                style={{ backgroundColor: network.color + "20", color: network.color }}
              >
                {network.name.charAt(0)}
              </div>
              <div className="text-[9px] text-[#2E386E]/40 truncate">{network.status}</div>
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  // analytics
  return (
    <div className="w-full space-y-3">
      <div className="rounded-xl bg-white border border-black/5 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-[#2E386E]/60">Performance</span>
          <span className="text-[10px] text-emerald-500 font-medium">+34% ce mois</span>
        </div>
        <div className="flex items-end gap-1 h-20">
          {[25, 35, 30, 45, 40, 55, 50, 65, 60, 75, 70, 85].map((h, i) => (
            <motion.div
              key={i}
              initial={{ height: 0 }}
              animate={{ height: `${h}%` }}
              transition={{ delay: 0.3 + i * 0.04, duration: 0.4 }}
              className="flex-1 rounded-t"
              style={{ backgroundColor: `${color}30` }}
            />
          ))}
        </div>
      </div>
      <div className="rounded-xl bg-white border border-black/5 p-3">
        <div className="text-[10px] text-[#2E386E]/40 mb-1">Recommandation IA</div>
        <div className="text-xs text-[#2E386E]/70">
          Tes posts LinkedIn performent 2x mieux le mardi. Programme tes contenus cles ce jour-la.
        </div>
      </div>
    </div>
  );
}
