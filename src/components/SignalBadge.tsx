import { signalLabels, signalColors } from '../lib/arabic';

export default function SignalBadge({ signal }: { signal: string | null }) {
  if (!signal) return <span className="text-gray-500 text-xs">—</span>;
  const label = signalLabels[signal] || signal;
  const color = signalColors[signal] || 'bg-gray-500';

  return (
    <span className={`${color} text-white text-xs px-2 py-0.5 rounded-full font-arabic`}>
      {label}
    </span>
  );
}
