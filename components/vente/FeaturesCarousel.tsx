"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AnimatedSection } from "./AnimatedSection";
import {
  Brain,
  Calendar,
  FileText,
  Users,
  MessageSquare,
  Lightbulb,
  BookOpen,
  Link2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const features = [
  {
    icon: Brain,
    title: "Coach IA contextuel",
    desc: "Un coach disponible 24/7 qui connait ton business, tes blocages et tes objectifs. Il ne donne pas des conseils generiques — il t'aide a debloquer TA situation.",
    tag: "Pro & Elite",
  },
  {
    icon: Calendar,
    title: "Calendrier editorial",
    desc: "Visualise tous tes contenus sur un calendrier. Programme, deplace, reorganise. Ta strategie de contenu, enfin claire et organisee.",
    tag: "Tous les plans",
  },
  {
    icon: FileText,
    title: "Pages de capture & vente",
    desc: "Cree des pages de capture, de vente ou de vitrine sans aucune competence technique. Le copywriting est genere par l'IA, adapte a ton audience.",
    tag: "Tous les plans",
  },
  {
    icon: Users,
    title: "Gestion des leads",
    desc: "Capture et gere tes prospects. Chiffrement AES-256 pour la securite. Suis chaque lead de la decouverte a la conversion.",
    tag: "Tous les plans",
  },
  {
    icon: MessageSquare,
    title: "Automatisations sociales",
    desc: "Auto-commentaires, comment-to-DM, comment-to-email. Engage ton audience automatiquement pendant que tu te concentres sur l'essentiel.",
    tag: "Pro & Elite",
  },
  {
    icon: Lightbulb,
    title: "Quiz interactifs",
    desc: "Cree des quiz engageants qui capturent des leads qualifies. L'IA genere les questions adaptees a ton audience et ta thematique.",
    tag: "Tous les plans",
  },
  {
    icon: BookOpen,
    title: "Templates Systeme.io",
    desc: "Accede a une bibliotheque de templates pour accelerer la mise en place de tes tunnels de vente et automatisations.",
    tag: "Pro & Elite",
  },
  {
    icon: Link2,
    title: "Multi-projets",
    desc: "Gere plusieurs activites depuis un seul compte. Chaque projet a sa propre strategie, ses contenus et ses analytics.",
    tag: "Elite",
  },
];

export default function FeaturesCarousel() {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(0);
  const itemsPerView = 3;
  const maxIndex = Math.max(0, features.length - itemsPerView);

  const next = useCallback(() => {
    setDirection(1);
    setCurrent((c) => Math.min(c + 1, maxIndex));
  }, [maxIndex]);

  const prev = useCallback(() => {
    setDirection(-1);
    setCurrent((c) => Math.max(c - 1, 0));
  }, []);

  // Auto-advance
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((c) => {
        setDirection(1);
        return c >= maxIndex ? 0 : c + 1;
      });
    }, 5000);
    return () => clearInterval(timer);
  }, [maxIndex]);

  return (
    <section className="relative py-24 sm:py-32 bg-[#F6F7FB] overflow-hidden">
      <div className="mx-auto max-w-6xl px-6">
        <AnimatedSection className="text-center mb-12">
          <p className="text-sm font-semibold text-[#5D6CDB] tracking-wide uppercase mb-4">
            Et bien plus encore
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#2E386E] tracking-tight">
            Tout ce dont tu as besoin.
            <br />
            <span className="text-[#2E386E]/40">Rien de superflu.</span>
          </h2>
        </AnimatedSection>

        {/* Carousel */}
        <AnimatedSection>
          <div className="relative">
            {/* Navigation buttons */}
            <div className="flex justify-end gap-2 mb-6">
              <button
                onClick={prev}
                disabled={current === 0}
                className="w-10 h-10 rounded-full border border-black/10 bg-white flex items-center justify-center text-[#2E386E]/60 hover:text-[#5D6CDB] hover:border-[#5D6CDB]/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={next}
                disabled={current >= maxIndex}
                className="w-10 h-10 rounded-full border border-black/10 bg-white flex items-center justify-center text-[#2E386E]/60 hover:text-[#5D6CDB] hover:border-[#5D6CDB]/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Cards container */}
            <div className="overflow-hidden">
              <motion.div
                animate={{ x: `-${current * (100 / itemsPerView)}%` }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="flex"
              >
                {features.map((feature) => (
                  <div key={feature.title} className="w-1/3 shrink-0 px-2 min-w-[300px] sm:min-w-0">
                    <div className="group rounded-2xl bg-white border border-black/5 p-6 h-full hover:shadow-lg hover:border-[#5D6CDB]/10 transition-all duration-300 cursor-default">
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl bg-[#5D6CDB]/8 flex items-center justify-center group-hover:bg-[#5D6CDB]/12 transition-colors">
                          <feature.icon className="w-5 h-5 text-[#5D6CDB]" />
                        </div>
                        <span className="text-[10px] font-medium text-[#5D6CDB]/60 bg-[#5D6CDB]/5 rounded-full px-2.5 py-1">
                          {feature.tag}
                        </span>
                      </div>
                      <h3 className="text-base font-semibold text-[#2E386E] mb-2">{feature.title}</h3>
                      <p className="text-sm text-[#2E386E]/55 leading-relaxed">{feature.desc}</p>
                    </div>
                  </div>
                ))}
              </motion.div>
            </div>

            {/* Progress dots */}
            <div className="flex justify-center gap-1.5 mt-6">
              {Array.from({ length: maxIndex + 1 }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setDirection(i > current ? 1 : -1);
                    setCurrent(i);
                  }}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === current ? "w-6 bg-[#5D6CDB]" : "w-1.5 bg-[#2E386E]/15"
                  }`}
                />
              ))}
            </div>
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
