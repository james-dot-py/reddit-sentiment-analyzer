import { Card } from '../ui/Card';
import { Spinner } from '../ui/Spinner';
import { useWordCloud } from '../../hooks/useWordCloud';

interface Props {
  analysisId: string;
}

function WordCloudImage({ analysisId, sentiment, label }: { analysisId: string; sentiment: string; label: string }) {
  const { loading, data, error } = useWordCloud(analysisId, sentiment);

  return (
    <div className="flex-1">
      <h4 className="mb-2 text-center text-sm font-medium text-[var(--text-muted)]">{label}</h4>
      {loading && (
        <div className="flex h-48 items-center justify-center">
          <Spinner />
        </div>
      )}
      {error && (
        <div className="flex h-48 items-center justify-center text-xs text-[var(--text-muted)]">
          No data available
        </div>
      )}
      {data && (
        <div className="text-center">
          <img
            src={`data:image/png;base64,${data.image}`}
            alt={`${label} word cloud`}
            className="mx-auto max-h-56 rounded-lg"
          />
          <p className="mt-1 text-xs text-[var(--text-muted)]">{data.text_count} posts</p>
        </div>
      )}
    </div>
  );
}

export function WordClouds({ analysisId }: Props) {
  return (
    <Card
      title="Key Terms"
      tooltip="Most frequent words in positive vs. negative posts, with common stop words filtered out."
    >
      <div className="flex flex-col gap-4 sm:flex-row">
        <WordCloudImage analysisId={analysisId} sentiment="positive" label="Positive" />
        <WordCloudImage analysisId={analysisId} sentiment="negative" label="Negative" />
      </div>
    </Card>
  );
}
