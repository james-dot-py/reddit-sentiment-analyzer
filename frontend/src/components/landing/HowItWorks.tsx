import { MessageSquare, Brain, LayoutDashboard } from 'lucide-react';
import { AnimatedSection } from '../ui/AnimatedSection';

const steps = [
  {
    num: '01',
    title: 'Collect',
    description: 'We pull conversations from relevant Reddit communities every week — posts, comments, and the discussions that reveal real brand sentiment.',
    icon: MessageSquare,
  },
  {
    num: '02',
    title: 'Analyze',
    description: 'AI scores every mention for sentiment, theme, and intensity. We map community values and track how your brand aligns with what each community cares about.',
    icon: Brain,
  },
  {
    num: '03',
    title: 'Surface',
    description: 'You get a live brand intelligence dashboard — composite scores, competitive context, trending themes, and the key evidence posts driving perception.',
    icon: LayoutDashboard,
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 md:py-28">
      <div className="mx-auto max-w-[1280px] px-4 md:px-8">
        <AnimatedSection>
          <div className="mb-14 text-center">
            <h2 className="heading mb-3 text-2xl md:text-3xl">
              How it works
            </h2>
            <p className="body-text mx-auto max-w-xl text-base">
              A pre-computed intelligence pipeline — not a self-serve tool. We do the heavy lifting so you get insights, not raw data.
            </p>
          </div>
        </AnimatedSection>

        {/* Desktop: horizontal pipeline */}
        <div className="hidden md:grid md:grid-cols-3 gap-8 relative">
          {/* Connecting line */}
          <div
            className="absolute top-[52px] left-[16.6%] right-[16.6%] h-px"
            style={{ background: 'var(--border-default)' }}
          />

          {steps.map((step, i) => (
            <AnimatedSection key={step.num} delay={i * 0.15}>
              <div className="relative text-center">
                {/* Numbered circle */}
                <div className="relative z-10 mx-auto mb-6 flex h-[104px] w-[104px] items-center justify-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-accent-500/30 bg-[var(--surface-card)]">
                    <step.icon size={28} className="text-accent-500" />
                  </div>
                </div>

                <span className="data-text mb-2 block text-xs text-accent-500">{step.num}</span>
                <h3 className="heading mb-3 text-xl">{step.title}</h3>
                <p className="body-text text-sm leading-relaxed">{step.description}</p>
              </div>
            </AnimatedSection>
          ))}
        </div>

        {/* Mobile: vertical commit-history style */}
        <div className="md:hidden relative pl-12">
          {/* Vertical line */}
          <div
            className="absolute left-[19px] top-0 bottom-0 w-px"
            style={{ background: 'var(--border-default)' }}
          />

          {steps.map((step, i) => (
            <AnimatedSection key={step.num} delay={i * 0.1}>
              <div className={`relative ${i < steps.length - 1 ? 'pb-10' : ''}`}>
                {/* Circle on the line */}
                <div className="absolute left-[-32px] flex h-10 w-10 items-center justify-center rounded-full border-2 border-accent-500/30 bg-[var(--surface-card)]">
                  <step.icon size={18} className="text-accent-500" />
                </div>

                <span className="data-text mb-1 block text-xs text-accent-500">{step.num}</span>
                <h3 className="heading mb-2 text-lg">{step.title}</h3>
                <p className="body-text text-sm leading-relaxed">{step.description}</p>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </div>
    </section>
  );
}
