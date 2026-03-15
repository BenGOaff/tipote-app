"use client";

import { AnimatedSection, StaggerContainer, StaggerItem } from "./AnimatedSection";
import { motion } from "framer-motion";
import { UserCheck, Cpu, Rocket } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: UserCheck,
    title: "Raconte ton business",
    desc: "En 10 minutes, Tipote capture tout : ton activite, ton audience, tes offres, tes objectifs. Cette memoire alimente chaque action future.",
    detail: "Onboarding guide avec IA",
  },
  {
    number: "02",
    icon: Cpu,
    title: "Tipote construit ton systeme",
    desc: "Strategie 90 jours, contenus personnalises, calendrier editorial — tout est genere automatiquement et adapte a ta situation.",
    detail: "Plan + contenus en quelques clics",
  },
  {
    number: "03",
    icon: Rocket,
    title: "Publie et mesure",
    desc: "Publie sur 7 reseaux en un clic, suis tes resultats et ajuste ta strategie grace aux recommandations IA.",
    detail: "Resultats des la premiere semaine",
  },
];

export default function HowItWorksSection() {
  return (
    <section id="comment-ca-marche" className="relative py-24 sm:py-32 bg-white overflow-hidden">
      {/* Subtle background gradient */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-[#5D6CDB]/3 rounded-full blur-[200px]" />

      <div className="relative mx-auto max-w-6xl px-6">
        <AnimatedSection className="text-center mb-16">
          <p className="text-sm font-semibold text-[#5D6CDB] tracking-wide uppercase mb-4">
            Comment ca marche
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#2E386E] tracking-tight leading-tight">
            Pret en 3 etapes.
            <br />
            <span className="text-[#2E386E]/40">Pas 30.</span>
          </h2>
        </AnimatedSection>

        <StaggerContainer className="relative">
          {/* Connecting line */}
          <div className="absolute top-0 bottom-0 left-1/2 w-px bg-gradient-to-b from-[#5D6CDB]/20 via-[#5D6CDB]/10 to-transparent hidden lg:block" />

          <div className="space-y-12 lg:space-y-0 lg:grid lg:grid-cols-3 lg:gap-8">
            {steps.map((step, i) => (
              <StaggerItem key={step.number}>
                <div className="relative text-center lg:text-left">
                  {/* Step number */}
                  <motion.div
                    whileInView={{ scale: [0.8, 1] }}
                    viewport={{ once: true }}
                    className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#5D6CDB] to-[#2E3A6E] text-white font-bold text-lg shadow-lg shadow-[#5D6CDB]/20 mb-6"
                  >
                    {step.number}
                  </motion.div>

                  <h3 className="text-xl font-bold text-[#2E386E] mb-3 tracking-tight">{step.title}</h3>
                  <p className="text-sm text-[#2E386E]/55 leading-relaxed mb-4">{step.desc}</p>

                  <span className="inline-flex items-center rounded-full bg-[#5D6CDB]/8 px-3 py-1 text-xs font-medium text-[#5D6CDB]">
                    {step.detail}
                  </span>
                </div>
              </StaggerItem>
            ))}
          </div>
        </StaggerContainer>
      </div>
    </section>
  );
}
