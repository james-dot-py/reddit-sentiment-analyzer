import { TrendingUp, Target, Shield } from 'lucide-react';
import { AnimatedSection } from '../ui/AnimatedSection';

const features = [
  {
    icon: TrendingUp,
    title: 'Sentiment Analysis',
    description:
      'AI-scored brand perception across subreddits. Track how communities feel about your brand week over week with composite scores that capture sentiment mix, intensity, and trajectory.',
  },
  {
    icon: Target,
    title: 'Brand Mention Tracking',
    description:
      'Every mention classified by theme and intensity. Surface the conversations that matter most — from product complaints to organic advocacy — with evidence-linked insights.',
  },
  {
    icon: Shield,
    title: 'Competitive Intelligence',
    description:
      'Side-by-side brand comparison within the same communities. See where you lead on community alignment and where competitors are gaining ground.',
  },
];

export function FeaturesGrid() {
  return (
    <section id="features" className="py-20 md:py-28">
      <div className="mx-auto max-w-[1280px] px-4 md:px-8">
        <AnimatedSection>
          <div className="mb-14 text-center">
            <h2 className="heading mb-3 text-2xl md:text-3xl">
              Brand intelligence, not just data
            </h2>
            <p className="body-text mx-auto max-w-xl text-base">
              Three layers of analysis that turn raw Reddit conversations into actionable brand perception insights.
            </p>
          </div>
        </AnimatedSection>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {features.map((feature, i) => (
            <AnimatedSection key={feature.title} delay={i * 0.1}>
              <div className="card p-8 h-full">
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-accent-500/10">
                  <feature.icon size={22} className="text-accent-500" />
                </div>
                <h3 className="heading mb-3 text-lg">{feature.title}</h3>
                <p className="body-text text-sm leading-relaxed">{feature.description}</p>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </div>
    </section>
  );
}
