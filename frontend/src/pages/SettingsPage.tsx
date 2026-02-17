import { ArrowLeft, BarChart3, BookOpen, Layers, MessageSquare, Search, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';

const FEATURES = [
  {
    icon: TrendingUp,
    title: 'Sentiment Analysis',
    description:
      'Every post and comment is scored on a continuous scale from \u22121 to +1 using NLP classification models, revealing the emotional tone beneath the surface.',
  },
  {
    icon: Layers,
    title: 'The Sentiment Landscape',
    description:
      'Topics are mapped by polarity and frequency to show what a community celebrates, rejects, or fights over — the unwritten rules of the group.',
  },
  {
    icon: Search,
    title: 'Concept Explorer',
    description:
      'Search for any idea using comma-separated synonyms and see how the community feels about it, with context snippets and sentiment breakdowns.',
  },
  {
    icon: MessageSquare,
    title: 'Keyword Valence',
    description:
      'Compare how specific words shift the emotional temperature of a conversation — do posts mentioning a topic skew more positive or negative?',
  },
  {
    icon: BookOpen,
    title: 'Language & NLP Insights',
    description:
      'Named entities, recurring phrases, vocabulary richness, and reading level paint a linguistic portrait of each community.',
  },
  {
    icon: BarChart3,
    title: 'Community Comparison',
    description:
      'When multiple subreddits are analyzed together, see how their emotional baselines and language patterns differ side by side.',
  },
];

export function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl pb-20">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-8"
      >
        <ArrowLeft size={14} />
        Back to Analysis
      </Link>

      {/* Hero */}
      <header className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <BarChart3 size={28} className="text-[var(--text-primary)]" />
          <h1 className="heading text-3xl">Undercurrent</h1>
        </div>
        <p className="body-text text-base leading-relaxed">
          Undercurrent reveals the hidden patterns in online communities. Using preloaded
          Reddit data processed through sentiment analysis and natural language processing,
          it surfaces what people actually feel — the consensus, the friction, and the
          unspoken norms buried in how language is used.
        </p>
      </header>

      <hr className="editorial-divider" />

      {/* How it works */}
      <section className="mb-10">
        <h2 className="heading text-xl mb-4">How It Works</h2>
        <ol className="space-y-4 body-text text-sm leading-relaxed list-none">
          <li className="flex gap-3">
            <span className="flex-shrink-0 flex items-center justify-center h-6 w-6 rounded-full bg-[var(--surface-2)] text-xs font-bold text-[var(--text-primary)] border border-[var(--border-subtle)]">1</span>
            <span>
              <strong className="text-[var(--text-primary)]">Select a community.</strong>{' '}
              Choose from the featured pre-analyzed datasets on the home page, each containing
              hundreds of posts and comments already processed and ready to explore.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 flex items-center justify-center h-6 w-6 rounded-full bg-[var(--surface-2)] text-xs font-bold text-[var(--text-primary)] border border-[var(--border-subtle)]">2</span>
            <span>
              <strong className="text-[var(--text-primary)]">Read the synthesis.</strong>{' '}
              An AI-generated editorial summary gives you the big picture — key themes, emotional
              currents, and notable patterns in the discourse.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 flex items-center justify-center h-6 w-6 rounded-full bg-[var(--surface-2)] text-xs font-bold text-[var(--text-primary)] border border-[var(--border-subtle)]">3</span>
            <span>
              <strong className="text-[var(--text-primary)]">Explore interactively.</strong>{' '}
              Dive into the sentiment landscape, search for concepts, compare keywords,
              and trace how opinion shifts over time — all driven by the underlying data.
            </span>
          </li>
        </ol>
      </section>

      <hr className="editorial-divider" />

      {/* Features */}
      <section className="mb-10">
        <h2 className="heading text-xl mb-5">Features</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="paper-card rounded-xl p-5 space-y-2"
            >
              <div className="flex items-center gap-2">
                <Icon size={16} className="text-[var(--text-muted)]" />
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
              </div>
              <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{description}</p>
            </div>
          ))}
        </div>
      </section>

      <hr className="editorial-divider" />

      {/* Disclaimers */}
      <section>
        <h2 className="heading text-xl mb-4">Disclaimers</h2>
        <div className="space-y-3 text-sm leading-relaxed text-[var(--text-secondary)]">
          <p>
            <strong className="text-[var(--text-primary)]">Sentiment models are imperfect.</strong>{' '}
            Automated sentiment analysis cannot reliably detect sarcasm, irony, or cultural nuance.
            Scores reflect statistical patterns in language, not ground truth about how people feel.
            Treat all results as approximations, not definitive readings.
          </p>
          <p>
            <strong className="text-[var(--text-primary)]">This is not a representative sample.</strong>{' '}
            Reddit users are not representative of any broader population. The data analyzed here
            reflects the views of people who chose to post in specific communities during a specific
            window of time.
          </p>
          <p>
            <strong className="text-[var(--text-primary)]">No real-time data.</strong>{' '}
            All analysis is performed on preloaded, cached datasets. Results reflect a snapshot
            in time and may not represent current community sentiment.
          </p>
          <p>
            <strong className="text-[var(--text-primary)]">Not affiliated with Reddit.</strong>{' '}
            Undercurrent is an independent project. It is not endorsed by, affiliated with, or
            sponsored by Reddit, Inc.
          </p>
        </div>
      </section>
    </div>
  );
}
