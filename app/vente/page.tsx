"use client";

import Navbar from "@/components/vente/Navbar";
import HeroSection from "@/components/vente/HeroSection";
import ProblemSection from "@/components/vente/ProblemSection";
import SolutionSection from "@/components/vente/SolutionSection";
import HowItWorksSection from "@/components/vente/HowItWorksSection";
import FeaturesCarousel from "@/components/vente/FeaturesCarousel";
import ComparisonSection from "@/components/vente/ComparisonSection";
import TransformationSection from "@/components/vente/TransformationSection";
import CtaSection from "@/components/vente/CtaSection";
import Footer from "@/components/vente/Footer";

export default function VentePage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <HeroSection />
      <ProblemSection />
      <SolutionSection />
      <HowItWorksSection />
      <FeaturesCarousel />
      <ComparisonSection />
      <TransformationSection />
      <CtaSection />
      <Footer />
    </div>
  );
}
