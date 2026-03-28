import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  ArrowLeft,
  Plus,
  X,
  Check,
  Sparkles,
  Search,
  Users,
  Rocket,
} from 'lucide-react';
import { createProject } from '../api';

// ── Subreddit suggestions by category ────────────────────────────────────

const SUBREDDIT_SUGGESTIONS: Record<string, string[]> = {
  skincare: ['SkincareAddiction', '30PlusSkinCare', 'AsianBeauty', 'Skincare_Addiction', 'beauty'],
  'food & beverage': ['fastfood', 'FoodReviews', 'Cooking', 'food', 'Coffee', 'beer'],
  tech: ['technology', 'gadgets', 'apple', 'Android', 'programming', 'HomeAutomation'],
  fashion: ['malefashionadvice', 'femalefashionadvice', 'streetwear', 'Sneakers', 'fashion'],
  fitness: ['Fitness', 'Supplements', 'GYM', 'running', 'bodybuilding', 'nutrition'],
  automotive: ['cars', 'electricvehicles', 'Autos', 'MechanicAdvice', 'whatcarshouldIbuy'],
  gaming: ['gaming', 'pcgaming', 'Games', 'PS5', 'NintendoSwitch', 'Steam'],
  finance: ['personalfinance', 'CreditCards', 'investing', 'FinancialPlanning'],
  other: [],
};

const CATEGORIES = Object.keys(SUBREDDIT_SUGGESTIONS);

// ── Types ────────────────────────────────────────────────────────────────

interface BrandEntry {
  name: string;
  aliases: string;
  is_competitor: boolean;
}

interface OnboardingState {
  brandName: string;
  brandAliases: string;
  category: string;
  subreddits: string[];
  customSubreddit: string;
  competitors: BrandEntry[];
}

const INITIAL_STATE: OnboardingState = {
  brandName: '',
  brandAliases: '',
  category: '',
  subreddits: [],
  customSubreddit: '',
  competitors: [],
};

// ── Step components ──────────────────────────────────────────────────────

function StepBrand({
  state,
  onChange,
}: {
  state: OnboardingState;
  onChange: (patch: Partial<OnboardingState>) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-accent-500/10 text-accent-500">
          <Sparkles size={20} />
        </div>
        <div>
          <h2 className="heading text-xl">Your Brand</h2>
          <p className="text-sm text-[var(--text-muted)]">Tell us what to track</p>
        </div>
      </div>

      <div>
        <label className="section-label mb-1.5 block">Brand Name</label>
        <input
          type="text"
          value={state.brandName}
          onChange={(e) => onChange({ brandName: e.target.value })}
          placeholder="e.g. CeraVe"
          className="w-full rounded-[var(--radius-btn)] border border-[var(--border-default)] bg-[var(--surface-1)] px-4 py-2.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 transition-colors"
        />
      </div>

      <div>
        <label className="section-label mb-1.5 block">Aliases</label>
        <input
          type="text"
          value={state.brandAliases}
          onChange={(e) => onChange({ brandAliases: e.target.value })}
          placeholder="e.g. cerave, cera ve, cerave.com"
          className="w-full rounded-[var(--radius-btn)] border border-[var(--border-default)] bg-[var(--surface-1)] px-4 py-2.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 transition-colors"
        />
        <p className="mt-1.5 text-xs text-[var(--text-muted)]">
          Comma-separated. Other names people use for this brand.
        </p>
      </div>

      <div>
        <label className="section-label mb-1.5 block">Category</label>
        <select
          value={state.category}
          onChange={(e) => onChange({ category: e.target.value, subreddits: [] })}
          className="w-full rounded-[var(--radius-btn)] border border-[var(--border-default)] bg-[var(--surface-1)] px-4 py-2.5 text-[var(--text-primary)] focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 transition-colors"
        >
          <option value="">Select a category...</option>
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function StepSubreddits({
  state,
  onChange,
}: {
  state: OnboardingState;
  onChange: (patch: Partial<OnboardingState>) => void;
}) {
  const suggestions = SUBREDDIT_SUGGESTIONS[state.category] || [];

  const toggleSub = (sub: string) => {
    const current = state.subreddits;
    if (current.includes(sub)) {
      onChange({ subreddits: current.filter((s) => s !== sub) });
    } else if (current.length < 2) {
      onChange({ subreddits: [...current, sub] });
    }
  };

  const addCustom = () => {
    const sub = state.customSubreddit.trim().replace(/^r\//, '');
    if (sub && !state.subreddits.includes(sub) && state.subreddits.length < 2) {
      onChange({
        subreddits: [...state.subreddits, sub],
        customSubreddit: '',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-accent-500/10 text-accent-500">
          <Search size={20} />
        </div>
        <div>
          <h2 className="heading text-xl">Where to Listen</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Pick 1-2 subreddits where your brand is discussed
          </p>
        </div>
      </div>

      {suggestions.length > 0 && (
        <div>
          <label className="section-label mb-2 block">Suggested for {state.category}</label>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((sub) => {
              const selected = state.subreddits.includes(sub);
              const disabled = !selected && state.subreddits.length >= 2;
              return (
                <button
                  key={sub}
                  onClick={() => toggleSub(sub)}
                  disabled={disabled}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all ${
                    selected
                      ? 'bg-accent-500 text-white'
                      : disabled
                        ? 'bg-[var(--surface-1)] text-[var(--text-muted)] opacity-50 cursor-not-allowed'
                        : 'bg-[var(--surface-1)] text-[var(--text-secondary)] hover:bg-[var(--surface-card)] hover:text-[var(--text-primary)] cursor-pointer'
                  }`}
                >
                  {selected && <Check size={14} />}
                  r/{sub}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <label className="section-label mb-1.5 block">Custom Subreddit</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm">r/</span>
            <input
              type="text"
              value={state.customSubreddit}
              onChange={(e) => onChange({ customSubreddit: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && addCustom()}
              placeholder="subreddit name"
              className="w-full rounded-[var(--radius-btn)] border border-[var(--border-default)] bg-[var(--surface-1)] pl-8 pr-4 py-2.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 transition-colors"
            />
          </div>
          <button
            onClick={addCustom}
            disabled={!state.customSubreddit.trim() || state.subreddits.length >= 2}
            className="flex items-center gap-1.5 rounded-[var(--radius-btn)] bg-[var(--surface-1)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-card)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Plus size={16} /> Add
          </button>
        </div>
      </div>

      {state.subreddits.length > 0 && (
        <div>
          <label className="section-label mb-2 block">
            Selected ({state.subreddits.length}/2)
          </label>
          <div className="flex flex-wrap gap-2">
            {state.subreddits.map((sub) => (
              <span
                key={sub}
                className="inline-flex items-center gap-1.5 rounded-full bg-accent-500/10 px-3.5 py-1.5 text-sm font-medium text-accent-500"
              >
                r/{sub}
                <button
                  onClick={() =>
                    onChange({ subreddits: state.subreddits.filter((s) => s !== sub) })
                  }
                  className="hover:text-accent-300 transition-colors"
                >
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-[var(--text-muted)]">
        We'll analyze brand conversations in these communities weekly.
      </p>
    </div>
  );
}

function StepCompetitors({
  state,
  onChange,
}: {
  state: OnboardingState;
  onChange: (patch: Partial<OnboardingState>) => void;
}) {
  const addCompetitor = () => {
    if (state.competitors.length >= 2) return;
    onChange({
      competitors: [
        ...state.competitors,
        { name: '', aliases: '', is_competitor: true },
      ],
    });
  };

  const updateCompetitor = (idx: number, field: keyof BrandEntry, value: string) => {
    const updated = state.competitors.map((c, i) =>
      i === idx ? { ...c, [field]: value } : c,
    );
    onChange({ competitors: updated });
  };

  const removeCompetitor = (idx: number) => {
    onChange({ competitors: state.competitors.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-accent-500/10 text-accent-500">
          <Users size={20} />
        </div>
        <div>
          <h2 className="heading text-xl">Competitors</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Optional — track how you compare
          </p>
        </div>
      </div>

      {state.competitors.map((comp, idx) => (
        <div key={idx} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
              Competitor {idx + 1}
            </span>
            <button
              onClick={() => removeCompetitor(idx)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              <X size={16} />
            </button>
          </div>
          <input
            type="text"
            value={comp.name}
            onChange={(e) => updateCompetitor(idx, 'name', e.target.value)}
            placeholder="Brand name"
            className="w-full rounded-[var(--radius-btn)] border border-[var(--border-default)] bg-[var(--surface-0)] px-4 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-accent-500 focus:outline-none transition-colors"
          />
          <input
            type="text"
            value={comp.aliases}
            onChange={(e) => updateCompetitor(idx, 'aliases', e.target.value)}
            placeholder="Aliases (comma-separated)"
            className="w-full rounded-[var(--radius-btn)] border border-[var(--border-default)] bg-[var(--surface-0)] px-4 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-accent-500 focus:outline-none transition-colors"
          />
        </div>
      ))}

      {state.competitors.length < 2 && (
        <button
          onClick={addCompetitor}
          className="flex items-center gap-2 rounded-[var(--radius-btn)] border border-dashed border-[var(--border-default)] px-4 py-3 text-sm text-[var(--text-secondary)] hover:border-accent-500 hover:text-accent-500 transition-colors w-full justify-center"
        >
          <Plus size={16} /> Add Competitor
        </button>
      )}

      <p className="text-xs text-[var(--text-muted)]">
        You can add or change competitors later from settings.
      </p>
    </div>
  );
}

function StepReview({
  state,
  isSubmitting,
  error,
}: {
  state: OnboardingState;
  isSubmitting: boolean;
  error: string;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-accent-500/10 text-accent-500">
          <Rocket size={20} />
        </div>
        <div>
          <h2 className="heading text-xl">Review & Launch</h2>
          <p className="text-sm text-[var(--text-muted)]">Everything look right?</p>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] divide-y divide-[var(--border-subtle)]">
        <div className="p-4">
          <span className="section-label">Brand</span>
          <p className="text-[var(--text-primary)] font-medium mt-1">{state.brandName}</p>
          {state.brandAliases && (
            <p className="text-sm text-[var(--text-muted)] mt-0.5">
              Aliases: {state.brandAliases}
            </p>
          )}
        </div>

        <div className="p-4">
          <span className="section-label">Category</span>
          <p className="text-[var(--text-primary)] font-medium mt-1 capitalize">
            {state.category}
          </p>
        </div>

        <div className="p-4">
          <span className="section-label">Subreddits</span>
          <div className="flex gap-2 mt-1.5">
            {state.subreddits.map((sub) => (
              <span
                key={sub}
                className="inline-flex rounded-full bg-accent-500/10 px-3 py-1 text-sm font-medium text-accent-500"
              >
                r/{sub}
              </span>
            ))}
          </div>
        </div>

        {state.competitors.length > 0 && (
          <div className="p-4">
            <span className="section-label">Competitors</span>
            <div className="space-y-1 mt-1.5">
              {state.competitors.map((c, i) => (
                <p key={i} className="text-[var(--text-primary)] text-sm">
                  {c.name}
                  {c.aliases && (
                    <span className="text-[var(--text-muted)]"> ({c.aliases})</span>
                  )}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {isSubmitting && (
        <div className="text-center text-sm text-[var(--text-muted)]">
          Setting up your project...
        </div>
      )}
    </div>
  );
}

// ── Main wizard ──────────────────────────────────────────────────────────

const STEPS = ['Brand', 'Subreddits', 'Competitors', 'Review'] as const;

export function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<OnboardingState>(INITIAL_STATE);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [createdProject, setCreatedProject] = useState<{ project_id: string; brand_id: string } | null>(null);

  const onChange = (patch: Partial<OnboardingState>) => {
    setState((prev) => ({ ...prev, ...patch }));
    setError('');
  };

  const canProceed = (): boolean => {
    switch (step) {
      case 0:
        return !!state.brandName.trim() && !!state.category;
      case 1:
        return state.subreddits.length >= 1;
      case 2:
        return true; // Competitors are optional
      case 3:
        return !isSubmitting;
      default:
        return false;
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError('');

    try {
      const aliases = state.brandAliases
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);

      const brands = [
        {
          brand_name: state.brandName.trim(),
          aliases,
          is_competitor: false,
        },
        ...state.competitors
          .filter((c) => c.name.trim())
          .map((c) => ({
            brand_name: c.name.trim(),
            aliases: c.aliases
              .split(',')
              .map((a) => a.trim())
              .filter(Boolean),
            is_competitor: true,
          })),
      ];

      const result = await createProject({
        project_name: `${state.brandName} Tracking`,
        category: state.category,
        brands,
        subreddits: state.subreddits,
      });

      setCreatedProject({
        project_id: result.project_id,
        brand_id: result.brands?.[0]?.brand_id || '',
      });
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  const next = () => {
    if (step === STEPS.length - 1) {
      handleSubmit();
    } else {
      setStep((s) => s + 1);
    }
  };

  const back = () => setStep((s) => Math.max(0, s - 1));

  // ── Success state ────────────────────────────────────────────────────

  if (done && createdProject) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="space-y-6"
        >
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-500/10">
            <Check size={32} className="text-accent-500" />
          </div>
          <h2 className="heading text-2xl">You're all set!</h2>
          <p className="text-[var(--text-secondary)]">
            Your brand is configured. Your first analysis will be ready within 24 hours.
            In the meantime, explore the demo projects to see what to expect.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              onClick={() =>
                navigate(
                  `/dashboard?project=${createdProject.project_id}&brand=${createdProject.brand_id}`,
                )
              }
              className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-btn)] bg-accent-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-accent-600 transition-colors"
            >
              Go to Dashboard <ArrowRight size={16} />
            </button>
            <button
              onClick={() => navigate('/brands')}
              className="inline-flex items-center justify-center rounded-[var(--radius-btn)] border border-[var(--border-default)] px-6 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-1)] transition-colors"
            >
              Browse All Brands
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Wizard ───────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-lg py-10">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          {STEPS.map((label, i) => (
            <button
              key={label}
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              className={`text-xs font-medium transition-colors ${
                i === step
                  ? 'text-accent-500'
                  : i < step
                    ? 'text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] cursor-not-allowed'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="h-1 rounded-full bg-[var(--surface-1)] overflow-hidden">
          <motion.div
            className="h-full bg-accent-500 rounded-full"
            animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Step content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          <div className="paper-card p-6">
            {step === 0 && <StepBrand state={state} onChange={onChange} />}
            {step === 1 && <StepSubreddits state={state} onChange={onChange} />}
            {step === 2 && (
              <StepCompetitors state={state} onChange={onChange} />
            )}
            {step === 3 && (
              <StepReview state={state} isSubmitting={isSubmitting} error={error} />
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="mt-6 flex items-center justify-between">
        <button
          onClick={back}
          disabled={step === 0}
          className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-0 transition-all"
        >
          <ArrowLeft size={16} /> Back
        </button>

        <button
          onClick={next}
          disabled={!canProceed()}
          className="flex items-center gap-1.5 rounded-[var(--radius-btn)] bg-accent-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-accent-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {step === STEPS.length - 1 ? (
            isSubmitting ? 'Creating...' : 'Create Project'
          ) : (
            <>
              Continue <ArrowRight size={16} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
