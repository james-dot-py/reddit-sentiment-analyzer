export function SectionVerdict({ verdict }: { verdict?: string }) {
  if (!verdict) return null;
  return (
    <div className="verdict-box text-sm mb-4">
      {verdict}
    </div>
  );
}
