import { BookOpen, X } from 'lucide-react';
import { useState } from 'react';

const TERMS: { term: string; definition: string }[] = [
  {
    term: 'Sentiment Score / Compound Score',
    definition:
      'A continuous value from -1 (maximally negative) to +1 (maximally positive) that represents the overall emotional tone of a piece of text. Calculated as P(positive) minus P(negative) from the model\'s output probabilities.',
  },
  {
    term: 'Positive / Negative / Neutral',
    definition:
      'The three discrete sentiment categories. Each post or comment is classified into the category with the highest probability from the model.',
  },
  {
    term: 'Confidence Score',
    definition:
      'The probability (0 to 1) that the model assigns to its chosen sentiment label. Higher values indicate the model is more certain of its classification.',
  },
  {
    term: 'Named Entity Recognition (NER)',
    definition:
      'An NLP technique that identifies and classifies proper nouns in text — people (PERSON), organizations (ORG), places (GPE), nationalities (NORP), events, products, and works of art.',
  },
  {
    term: 'N-gram',
    definition:
      'A contiguous sequence of N words from a text. Unigrams are single words, bigrams are two-word pairs (e.g., "climate change"), and trigrams are three-word sequences.',
  },
  {
    term: 'Bigram / Trigram',
    definition:
      'Specific types of n-grams. Bigrams capture frequent two-word phrases; trigrams capture three-word phrases. These reveal common topics and collocations in the corpus.',
  },
  {
    term: 'Standard Deviation',
    definition:
      'A measure of how spread out sentiment scores are from the mean. Low standard deviation means most content has similar sentiment; high values indicate polarized or varied opinions.',
  },
  {
    term: 'Vocabulary Richness',
    definition:
      'The ratio of unique words to total words (type-token ratio). Higher values suggest more diverse language; lower values suggest repetitive or formulaic discourse.',
  },
  {
    term: 'Reading Level',
    definition:
      'An estimate of the U.S. school grade level needed to understand the text, based on the Flesch-Kincaid formula. Uses average sentence length and syllable count.',
  },
  {
    term: 'Word Cloud',
    definition:
      'A visual representation where word size corresponds to frequency. Words that appear more often in positive (or negative) posts are displayed larger.',
  },
  {
    term: 'Stop Words',
    definition:
      'Common words (e.g., "the", "is", "and") that are filtered out before analysis because they carry little semantic meaning. Custom stop words can also be added.',
  },
  {
    term: 'Polarity Distribution',
    definition:
      'A histogram showing how sentiment scores are distributed across all analyzed text. Reveals whether a community skews positive, negative, or is polarized across both extremes.',
  },
];

export function Glossary() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full accent-gradient px-4 py-2.5 text-sm font-medium text-white shadow-lg glow transition-all hover:scale-105"
        title="Glossary"
      >
        <BookOpen size={16} />
        Glossary
      </button>

      {/* Slide-out panel */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          {/* Panel */}
          <div className="fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto bg-[var(--surface-0)] border-l border-[var(--border-subtle)] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-0)] p-5">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">Glossary</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
              >
                <X size={18} />
              </button>
            </div>
            <div className="divide-y divide-[var(--border-subtle)] p-5">
              {TERMS.map((entry) => (
                <div key={entry.term} className="py-4 first:pt-0 last:pb-0">
                  <dt className="text-sm font-semibold text-[var(--text-primary)]">{entry.term}</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">{entry.definition}</dd>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
