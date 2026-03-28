import { Link } from 'react-router-dom';
import { Check, ArrowRight } from 'lucide-react';

interface PlanFeature {
  text: string;
  included: boolean;
}

interface Plan {
  name: string;
  price: string;
  period: string;
  description: string;
  features: PlanFeature[];
  cta: string;
  ctaLink: string;
  highlighted: boolean;
}

const PLANS: Plan[] = [
  {
    name: 'Free',
    price: '$0',
    period: '/month',
    description: 'Try brand intelligence on one brand.',
    features: [
      { text: '1 brand tracked', included: true },
      { text: '2 subreddits monitored', included: true },
      { text: 'Weekly analysis', included: true },
      { text: 'Current week score + findings', included: true },
      { text: 'Briefing view', included: true },
      { text: 'Score trend history', included: false },
      { text: 'Deep-dive analysis', included: false },
      { text: 'Competitive context', included: false },
      { text: 'PDF/HTML export', included: false },
      { text: 'Email alerts', included: false },
    ],
    cta: 'Start Free',
    ctaLink: '/sign-up',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$79',
    period: '/month',
    description: 'Full intelligence for growing brands.',
    features: [
      { text: '3 brands tracked', included: true },
      { text: '5 subreddits monitored', included: true },
      { text: 'Weekly analysis', included: true },
      { text: 'Full score trend history', included: true },
      { text: 'Briefing + deep-dive views', included: true },
      { text: '52 weeks of history', included: true },
      { text: 'Competitive context', included: true },
      { text: 'PDF/HTML export', included: true },
      { text: 'Email alerts', included: true },
      { text: '2 competitor brands', included: true },
    ],
    cta: 'Upgrade to Pro',
    ctaLink: '/sign-up',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For agencies and large brand portfolios.',
    features: [
      { text: 'Unlimited brands', included: true },
      { text: 'Unlimited subreddits', included: true },
      { text: 'Priority weekly analysis', included: true },
      { text: 'Unlimited history', included: true },
      { text: 'All view modes', included: true },
      { text: 'Unlimited competitors', included: true },
      { text: 'API access', included: true },
      { text: 'Custom reports', included: true },
      { text: 'Dedicated support', included: true },
      { text: 'White-label options', included: true },
    ],
    cta: 'Contact Us',
    ctaLink: 'mailto:hello@undercurrent.dev',
    highlighted: false,
  },
];

export function PricingPage() {
  return (
    <div className="mx-auto max-w-5xl py-12 px-4">
      <div className="text-center mb-12">
        <h1
          className="text-3xl md:text-4xl font-bold mb-3"
          style={{ fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.02em' }}
        >
          Simple, transparent pricing
        </h1>
        <p className="text-[var(--text-secondary)] max-w-lg mx-auto">
          Start free. Upgrade when you need competitive context, trend history, and deeper analysis.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`relative flex flex-col rounded-2xl border p-6 ${
              plan.highlighted
                ? 'border-accent-500 bg-[var(--surface-1)] shadow-lg'
                : 'border-[var(--border-subtle)] bg-[var(--surface-card)]'
            }`}
          >
            {plan.highlighted && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent-500 px-3 py-0.5 text-[10px] font-semibold text-white uppercase tracking-wider">
                Most Popular
              </div>
            )}

            <div className="mb-6">
              <h3 className="heading text-lg mb-1">{plan.name}</h3>
              <div className="flex items-baseline gap-0.5 mb-2">
                <span
                  className="text-3xl font-bold"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {plan.price}
                </span>
                {plan.period && (
                  <span className="text-sm text-[var(--text-muted)]">{plan.period}</span>
                )}
              </div>
              <p className="text-sm text-[var(--text-secondary)]">{plan.description}</p>
            </div>

            <ul className="flex-1 space-y-2.5 mb-6">
              {plan.features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Check
                    size={16}
                    className={`mt-0.5 shrink-0 ${
                      feature.included
                        ? 'text-accent-500'
                        : 'text-[var(--text-muted)] opacity-30'
                    }`}
                  />
                  <span className={feature.included ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] line-through'}>
                    {feature.text}
                  </span>
                </li>
              ))}
            </ul>

            <Link
              to={plan.ctaLink}
              className={`flex items-center justify-center gap-1.5 rounded-[var(--radius-btn)] px-6 py-2.5 text-sm font-medium transition-colors no-underline ${
                plan.highlighted
                  ? 'bg-accent-500 text-white hover:bg-accent-600'
                  : 'border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--surface-1)] hover:text-[var(--text-primary)]'
              }`}
            >
              {plan.cta} <ArrowRight size={14} />
            </Link>
          </div>
        ))}
      </div>

      <div className="mt-12 text-center text-sm text-[var(--text-muted)]">
        <p>All plans include weekly Reddit data collection and AI-powered analysis.</p>
        <p className="mt-1">Questions? <a href="mailto:hello@undercurrent.dev" className="text-accent-500 no-underline hover:underline">hello@undercurrent.dev</a></p>
      </div>
    </div>
  );
}
