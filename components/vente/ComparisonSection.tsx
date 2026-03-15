"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AnimatedSection } from "./AnimatedSection";
import { Check, X, Minus, ChevronDown } from "lucide-react";

const competitors = [
  {
    name: "Formations",
    what: "Connaissance",
    pros: ["Pedagogie", "Cadre strategique"],
    cons: ["Beaucoup de theorie", "Pas d'execution", "Depend de ta motivation"],
    result: "12 formations achetees. 0 systeme coherent.",
  },
  {
    name: "Outils SaaS",
    what: "Execution technique",
    pros: ["Automatisation", "Fonctionnalites specialisees"],
    cons: ["8-12 outils a gerer", "Ne se parlent pas", "Couteux"],
    result: "Tu geres plus d'outils que de clients.",
  },
  {
    name: "IA generiques",
    what: "Production contenu",
    pros: ["Rapidite", "Polyvalence"],
    cons: ["Repartent de zero", "Reponses generiques", "Aucune memoire"],
    result: "Contenu peu differencie, strategie inexistante.",
  },
  {
    name: "Coachs business",
    what: "Strategie",
    pros: ["Vision strategique", "Adaptation humaine"],
    cons: ["500 a 3000 euros/mois", "Disponibilite limitee", "Dependance"],
    result: "Pas la quand tu bloques a 23h sur ta page de vente.",
  },
];

const comparisonPoints = [
  { label: "Strategie personnalisee", tipote: true, formations: "partial", outils: false, ia: false, coachs: true },
  { label: "Memoire business", tipote: true, formations: false, outils: false, ia: false, coachs: "partial" },
  { label: "Generation de contenu", tipote: true, formations: false, outils: "partial", ia: true, coachs: false },
  { label: "Publication directe", tipote: true, formations: false, outils: "partial", ia: false, coachs: false },
  { label: "Analytics integres", tipote: true, formations: false, outils: "partial", ia: false, coachs: false },
  { label: "Disponible 24/7", tipote: true, formations: true, outils: true, ia: true, coachs: false },
  { label: "Prix accessible", tipote: true, formations: "partial", outils: false, ia: true, coachs: false },
  { label: "Systeme tout-en-un", tipote: true, formations: false, outils: false, ia: false, coachs: false },
];

function StatusIcon({ value }: { value: boolean | string }) {
  if (value === true) return <Check className="w-4 h-4 text-emerald-500" />;
  if (value === "partial") return <Minus className="w-4 h-4 text-amber-400" />;
  return <X className="w-4 h-4 text-red-300" />;
}

export default function ComparisonSection() {
  const [expandedCard, setExpandedCard] = useState<number | null>(null);

  return (
    <section className="relative py-24 sm:py-32 bg-white">
      <div className="mx-auto max-w-6xl px-6">
        <AnimatedSection className="text-center mb-16">
          <p className="text-sm font-semibold text-[#5D6CDB] tracking-wide uppercase mb-4">
            Pourquoi Tipote
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#2E386E] tracking-tight leading-tight">
            Tu as deja tout essaye.
            <br />
            <span className="text-[#2E386E]/40">Separement.</span>
          </h2>
          <p className="mt-6 text-lg text-[#2E386E]/60 max-w-2xl mx-auto leading-relaxed">
            Formations, outils, IA, coachs — chacun resout un morceau du probleme.
            Personne ne combine les quatre. Sauf Tipote.
          </p>
        </AnimatedSection>

        {/* Expandable competitor cards (mobile-friendly) */}
        <AnimatedSection className="mb-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {competitors.map((comp, i) => (
              <motion.div
                key={comp.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="rounded-2xl border border-black/5 bg-[#F6F7FB]/50 overflow-hidden"
              >
                <button
                  onClick={() => setExpandedCard(expandedCard === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-left"
                >
                  <div>
                    <h3 className="text-base font-semibold text-[#2E386E]">{comp.name}</h3>
                    <p className="text-xs text-[#2E386E]/40 mt-0.5">Resolvent : {comp.what}</p>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-[#2E386E]/30 transition-transform ${
                      expandedCard === i ? "rotate-180" : ""
                    }`}
                  />
                </button>

                <AnimatePresence>
                  {expandedCard === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5 space-y-3">
                        <div>
                          <div className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wider mb-1">
                            Forces
                          </div>
                          <ul className="space-y-1">
                            {comp.pros.map((pro) => (
                              <li key={pro} className="flex items-center gap-2 text-xs text-[#2E386E]/60">
                                <Check className="w-3 h-3 text-emerald-400" />
                                {pro}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <div className="text-[10px] font-semibold text-red-400 uppercase tracking-wider mb-1">
                            Limites
                          </div>
                          <ul className="space-y-1">
                            {comp.cons.map((con) => (
                              <li key={con} className="flex items-center gap-2 text-xs text-[#2E386E]/60">
                                <X className="w-3 h-3 text-red-300" />
                                {con}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="pt-2 border-t border-black/5">
                          <p className="text-xs text-[#2E386E]/50 italic">{comp.result}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </AnimatedSection>

        {/* Comparison table */}
        <AnimatedSection delay={0.2}>
          <div className="rounded-2xl border border-black/5 bg-white shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-black/5">
                  <th className="text-left px-5 py-4 text-xs font-medium text-[#2E386E]/40 uppercase tracking-wider">
                    Fonctionnalite
                  </th>
                  <th className="px-4 py-4 text-xs font-semibold text-[#5D6CDB] uppercase tracking-wider">
                    Tipote
                  </th>
                  <th className="px-4 py-4 text-xs font-medium text-[#2E386E]/30 uppercase tracking-wider">
                    Formations
                  </th>
                  <th className="px-4 py-4 text-xs font-medium text-[#2E386E]/30 uppercase tracking-wider">
                    Outils
                  </th>
                  <th className="px-4 py-4 text-xs font-medium text-[#2E386E]/30 uppercase tracking-wider">
                    IA
                  </th>
                  <th className="px-4 py-4 text-xs font-medium text-[#2E386E]/30 uppercase tracking-wider">
                    Coachs
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonPoints.map((point, i) => (
                  <tr key={point.label} className={i < comparisonPoints.length - 1 ? "border-b border-black/3" : ""}>
                    <td className="px-5 py-3 text-sm text-[#2E386E]/70">{point.label}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center">
                        <div className="w-6 h-6 rounded-full bg-emerald-50 flex items-center justify-center">
                          <StatusIcon value={point.tipote} />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center"><StatusIcon value={point.formations} /></div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center"><StatusIcon value={point.outils} /></div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center"><StatusIcon value={point.ia} /></div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center"><StatusIcon value={point.coachs} /></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
