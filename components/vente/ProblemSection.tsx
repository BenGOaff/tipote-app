"use client";

import { AnimatedSection, StaggerContainer, StaggerItem } from "./AnimatedSection";
import { motion } from "framer-motion";
import { AlertCircle, Clock, Layers, Brain, TrendingDown, Shuffle } from "lucide-react";

const painPoints = [
  {
    icon: Shuffle,
    title: "La dispersion",
    desc: "Tu passes d'une strategie a l'autre sans jamais finir ce que tu commences.",
  },
  {
    icon: Layers,
    title: "Trop d'outils",
    desc: "8 a 12 abonnements qui ne se parlent pas. Tu geres plus d'outils que de clients.",
  },
  {
    icon: Brain,
    title: "L'IA generique",
    desc: "ChatGPT ne connait ni ton business, ni ton audience. Tu repars de zero a chaque fois.",
  },
  {
    icon: Clock,
    title: "Le contenu qui prend des heures",
    desc: "3 heures pour un post. 3 likes. Tu merites mieux.",
  },
  {
    icon: TrendingDown,
    title: "Beaucoup de travail, peu de resultats",
    desc: "Tu travailles autant qu'un salarie. Mais les revenus ne suivent pas.",
  },
  {
    icon: AlertCircle,
    title: "12 formations, 0 systeme",
    desc: "Tu sais quoi faire. Mais tu n'as toujours pas de systeme coherent.",
  },
];

export default function ProblemSection() {
  return (
    <section className="relative py-24 sm:py-32 bg-white">
      <div className="mx-auto max-w-6xl px-6">
        <AnimatedSection className="text-center mb-16">
          <p className="text-sm font-semibold text-[#5D6CDB] tracking-wide uppercase mb-4">
            Le vrai probleme
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#2E386E] tracking-tight leading-tight">
            Tu travailles beaucoup.
            <br />
            <span className="text-[#2E386E]/40">Mais rien ne decolle.</span>
          </h2>
          <p className="mt-6 text-lg text-[#2E386E]/60 max-w-2xl mx-auto leading-relaxed">
            Ce n&apos;est pas un probleme de motivation. C&apos;est un probleme de systeme.
            Tu accumules les outils, les formations et les strategies
            sans jamais avoir une vision claire de ce qui va fonctionner.
          </p>
        </AnimatedSection>

        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {painPoints.map((point) => (
            <StaggerItem key={point.title}>
              <div className="group relative rounded-2xl border border-black/5 bg-[#F6F7FB]/50 p-6 hover:bg-white hover:shadow-lg hover:border-[#5D6CDB]/10 transition-all duration-300 h-full">
                <div className="w-10 h-10 rounded-xl bg-[#5D6CDB]/8 flex items-center justify-center mb-4 group-hover:bg-[#5D6CDB]/12 transition-colors">
                  <point.icon className="w-5 h-5 text-[#5D6CDB]" />
                </div>
                <h3 className="text-base font-semibold text-[#2E386E] mb-2">{point.title}</h3>
                <p className="text-sm text-[#2E386E]/55 leading-relaxed">{point.desc}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>

        {/* Emotional quote */}
        <AnimatedSection className="mt-16 text-center" delay={0.2}>
          <motion.blockquote
            whileInView={{ scale: [0.98, 1] }}
            viewport={{ once: true }}
            className="relative max-w-3xl mx-auto"
          >
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-6xl text-[#5D6CDB]/10 font-serif">
              &ldquo;
            </div>
            <p className="text-xl sm:text-2xl text-[#2E386E]/70 italic leading-relaxed pt-6">
              Pourquoi ca ne decolle pas alors que je travaille autant ?
            </p>
            <p className="mt-4 text-sm text-[#2E386E]/40 font-medium">
              — La question que tu te poses chaque soir
            </p>
          </motion.blockquote>
        </AnimatedSection>
      </div>
    </section>
  );
}
