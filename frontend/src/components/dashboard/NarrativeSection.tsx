interface Props {
  narrative: string;
  narrativeDelta?: string;
}

function renderMarkdown(text: string) {
  return text.split('\n').map((line, i) => {
    if (!line.trim()) return <br key={i} />;
    // Handle bullet points
    if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
      return (
        <li key={i} className="ml-4 list-disc">
          {line.trim().replace(/^[*-]\s/, '')}
        </li>
      );
    }
    return <p key={i} className="mb-3 last:mb-0">{line}</p>;
  });
}

export function NarrativeSection({ narrative, narrativeDelta }: Props) {
  return (
    <div className="paper-card p-6">
      <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)] mb-4">
        Narrative Intelligence
      </h3>
      <div className="body-text text-sm leading-relaxed">
        {renderMarkdown(narrative)}
      </div>
      {narrativeDelta && (
        <>
          <hr className="my-4 border-[var(--border-subtle)]" />
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)] mb-3">
            What Changed This Week
          </h4>
          <div className="body-text text-sm leading-relaxed text-[var(--text-secondary)]">
            {renderMarkdown(narrativeDelta)}
          </div>
        </>
      )}
    </div>
  );
}
