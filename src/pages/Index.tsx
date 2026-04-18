import { useEffect } from "react";
import AnimatedBackground from "@/components/landing/AnimatedBackground";
import LandingNavbar from "@/components/landing/LandingNavbar";
import HeroScene from "@/components/landing/HeroScene";
import StarfieldBackground from "@/components/landing/StarfieldBackground";
import TrustedBySection from "@/components/landing/TrustedBySection";
import FeaturesSection from "@/components/landing/FeaturesSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import StatsSection from "@/components/landing/StatsSection";
import BeforeAfterSection from "@/components/landing/BeforeAfterSection";
import IntegrationEcosystemSection from "@/components/landing/IntegrationEcosystemSection";
import LiveTranscriptSection from "@/components/landing/LiveTranscriptSection";
import AIProcessingPipelineSection from "@/components/landing/AIProcessingPipelineSection";
import AIChatDemoSection from "@/components/landing/AIChatDemoSection";
import LanguageSupportSection from "@/components/landing/LanguageSupportSection";
import DeviceShowcaseSection from "@/components/landing/DeviceShowcaseSection";
import MobileWaitlistSection from "@/components/landing/MobileWaitlistSection";
import DemoSection from "@/components/landing/DemoSection";
import ProToolsSection from "@/components/landing/ProToolsSection";
import TimeSavingsCalculator from "@/components/landing/TimeSavingsCalculator";
import TestimonialsSection from "@/components/landing/TestimonialsSection";
import PricingSection from "@/components/landing/PricingSection";
import FAQSection from "@/components/landing/FAQSection";
import ContactSection from "@/components/landing/ContactSection";
import CTASection from "@/components/landing/CTASection";
import Footer from "@/components/landing/Footer";

export default function LandingPage() {
  useEffect(() => {
    document.documentElement.style.scrollBehavior = "smooth";
    return () => {
      document.documentElement.style.scrollBehavior = "";
    };
  }, []);

  return (
    <div className="dark bg-transparent text-foreground min-h-screen overflow-x-hidden relative">
      <AnimatedBackground />
      <div style={{ position: "relative", zIndex: 1 }}>
        <StarfieldBackground />
        <LandingNavbar />
        <HeroScene />
        <TrustedBySection />
        <FeaturesSection />
        <StatsSection />
        <BeforeAfterSection />
        <HowItWorksSection />
        <AIProcessingPipelineSection />
        <LiveTranscriptSection />
        <AIChatDemoSection />
        <DeviceShowcaseSection />
        <MobileWaitlistSection />
        <DemoSection />
        <ProToolsSection />
        <LanguageSupportSection />
        <IntegrationEcosystemSection />
        <TimeSavingsCalculator />
        <TestimonialsSection />
        <PricingSection />
        <FAQSection />
        <ContactSection />
        <CTASection />
        <Footer />
      </div>
    </div>
  );
}
