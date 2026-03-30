export default function ScoreBar({ score, label }: { score: number | null; label?: string }) {
  const value = score ?? 0;
  const color =
    value >= 7 ? 'bg-emerald-500' : value >= 5 ? 'bg-yellow-500' : value >= 3 ? 'bg-orange-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-xs text-gray-400 w-16 text-start">{label}</span>}
      <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${value * 10}%` }} />
      </div>
      <span className="text-xs text-gray-300 w-8 text-end">{score?.toFixed(1) ?? '—'}</span>
    </div>
  );
}
