import { Card } from '../ui/Card';

export function AISummary({ text }: { text: string }) {
  const paragraphs = text.split('\n\n').filter(Boolean);

  return (
    <Card title="Synthesis" tooltip="A plain-English synthesis of the analysis findings, generated from computed statistics.">
      <div className="space-y-3">
        {paragraphs.map((p, i) => (
          <p key={i} className="body-text text-sm">
            {p}
          </p>
        ))}
      </div>
    </Card>
  );
}
