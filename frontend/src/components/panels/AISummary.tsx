import { renderFormattedText } from '../../utils/formatText';
import { Card } from '../ui/Card';

export function AISummary({ text }: { text: string }) {
  return (
    <Card title="Synthesis" tooltip="A plain-English synthesis of the analysis findings, generated from computed statistics.">
      <div className="space-y-3">
        {renderFormattedText(text)}
      </div>
    </Card>
  );
}
