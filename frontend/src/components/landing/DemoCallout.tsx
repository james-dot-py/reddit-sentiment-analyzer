import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles, Utensils } from 'lucide-react';
import { AnimatedSection } from '../ui/AnimatedSection';

const demos = [
  {
    icon: Sparkles,
    project: 'demo-skincare',
    title: 'Skincare Brand Tracking',
    brands: ['CeraVe', 'Cetaphil', 'The Ordinary'],
    description: 'Sentiment analysis across r/SkincareAddiction and r/30PlusSkinCare — see how these brands are really perceived by the community.',
  },
  {
    icon: Utensils,
    project: 'demo-fastfood',
    title: 'Fast Food Brand Tracking',
    brands: ["McDonald's", "Chick-fil-A", "Wendy's"],
    description: 'Brand perception across r/fastfood and r/ChickFilA — competitive intelligence in one of the most discussed categories on Reddit.',
  },
];

export function DemoCallout() {
  return (
    <section id="demo" className="py-20 md:py-28 bg-[var(--surface-1)]">
      <div className="mx-auto max-w-[1280px] px-4 md:px-8">
        <AnimatedSection>
          <div className="mb-12 text-center">
            <h2 className="heading mb-3 text-2xl md:text-3xl">
              Your brand is already being discussed on Reddit.
            </h2>
            <p className="body-text mx-auto max-w-xl text-base">
              See what the conversations look like — explore our live demo data.
            </p>
          </div>
        </AnimatedSection>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 mx-auto max-w-3xl">
          {demos.map((demo, i) => (
            <AnimatedSection key={demo.project} delay={i * 0.1}>
              <Link
                to={`/brands`}
                className="card block p-6 no-underline group h-full"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent-500/10">
                  <demo.icon size={22} className="text-accent-500" />
                </div>

                <h3 className="heading mb-2 text-lg">{demo.title}</h3>
                <p className="body-text mb-4 text-sm leading-relaxed">{demo.description}</p>

                <div className="mb-4 flex flex-wrap gap-2">
                  {demo.brands.map((brand) => (
                    <span
                      key={brand}
                      className="inline-flex items-center rounded-full bg-[var(--surface-1)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)] border border-[var(--border-subtle)]"
                    >
                      {brand}
                    </span>
                  ))}
                </div>

                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-500 group-hover:text-accent-400 transition-colors">
                  Explore <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </AnimatedSection>
          ))}
        </div>
      </div>
    </section>
  );
}
