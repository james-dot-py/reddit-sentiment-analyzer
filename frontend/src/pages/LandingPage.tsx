import { LandingNav } from '../components/landing/LandingNav';
import { Hero } from '../components/landing/Hero';
import { ProblemStatement } from '../components/landing/ProblemStatement';
import { FeaturesGrid } from '../components/landing/FeaturesGrid';
import { ProductDemo } from '../components/landing/ProductDemo';
import { HowItWorks } from '../components/landing/HowItWorks';
import { DemoCallout } from '../components/landing/DemoCallout';
import { CtaSection } from '../components/landing/CtaSection';
import { Footer } from '../components/landing/Footer';

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--surface-0)] text-[var(--text-primary)]">
      <LandingNav />
      <Hero />
      <ProblemStatement />
      <FeaturesGrid />
      <ProductDemo />
      <HowItWorks />
      <DemoCallout />
      <CtaSection />
      <Footer />
    </div>
  );
}
