import { AnimatedSection } from '../ui/AnimatedSection';

export function ProblemStatement() {
  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto max-w-[1280px] px-4 md:px-8">
        <AnimatedSection>
          <div className="mx-auto max-w-3xl text-center">
            <h2
              className="heading mb-6 text-3xl md:text-4xl lg:text-5xl"
              style={{ lineHeight: 1.15 }}
            >
              The most honest brand conversations are happening beneath the surface.
            </h2>
            <p className="body-text mx-auto max-w-2xl text-base md:text-lg">
              Traditional social listening catches curated posts and brand mentions on
              Twitter and Instagram. But on Reddit, people share unfiltered opinions —
              detailed comparisons, brutally honest reviews, and real community sentiment
              that never makes it to your dashboard. Until now.
            </p>
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
