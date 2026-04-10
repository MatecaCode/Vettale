import React from 'react';

export interface ChipProps {
  petName: string;
  serviceName: string;
  staffName?: string;
  startTime: string;
  endTime: string;
  status?: string;
  compact?: boolean;
  onClick?: () => void;
}

const statusClasses = (status?: string) => {
  const s = (status || '').toLowerCase();
  if (s === 'pending') return 'bg-yellow-50 text-yellow-900 border-yellow-300';
  if (s === 'confirmed' || s === 'active') return 'bg-blue-50 text-blue-900 border-blue-300';
  if (s === 'completed' || s === 'finished') return 'bg-emerald-50 text-emerald-900 border-emerald-300';
  if (s === 'cancelled') return 'bg-red-50 text-red-900 border-red-300';
  return 'bg-gray-50 text-gray-800 border-gray-200';
};

export const Chip: React.FC<ChipProps> = ({
  petName,
  serviceName,
  startTime,
  endTime,
  status,
  compact = false,
  onClick,
}) => {
  const base = `w-full rounded-md border-l-[3px] overflow-hidden ${statusClasses(status)} ${onClick ? 'cursor-pointer hover:brightness-95 active:brightness-90 transition-all' : ''}`;

  if (compact) {
    return (
      <div className={`${base} px-1.5 py-0.5 text-[10px] leading-tight`} onClick={onClick}>
        <span className="font-semibold truncate block">{petName}</span>
        <span className="text-gray-500 tabular-nums">{startTime}–{endTime}</span>
      </div>
    );
  }

  return (
    <div className={`${base} px-2 py-1.5`} onClick={onClick}>
      <div className="flex items-baseline justify-between gap-1">
        <span className="font-semibold text-xs truncate">{petName}</span>
        <span className="text-[10px] tabular-nums text-gray-500 shrink-0">{startTime}–{endTime}</span>
      </div>
      <div className="text-[11px] text-gray-600 truncate">{serviceName}</div>
    </div>
  );
};

export default Chip;
