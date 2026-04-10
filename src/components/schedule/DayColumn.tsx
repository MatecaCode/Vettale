import React from 'react';
import StaffLane, { StaffLaneAppointment } from './StaffLane';

export interface DayColumnProps {
  dateLabel: string;
  staff: Array<{ id: string; name: string }>;
  byStaffAppointments: Record<string, StaffLaneAppointment[]>;
  compact?: boolean;
  containerHeightPx?: number;
  pixelsPerMinute?: number;
  dayStartMinute?: number;
  isToday?: boolean;
  onClickAppointment?: (id: string) => void;
}

const STAFF_COLORS = [
  'border-blue-400',
  'border-purple-400',
  'border-amber-400',
  'border-emerald-400',
  'border-rose-400',
  'border-cyan-400',
];

const STAFF_BG = [
  'bg-blue-50/50',
  'bg-purple-50/50',
  'bg-amber-50/50',
  'bg-emerald-50/50',
  'bg-rose-50/50',
  'bg-cyan-50/50',
];

const DayColumn: React.FC<DayColumnProps> = ({
  dateLabel,
  staff,
  byStaffAppointments,
  compact = false,
  containerHeightPx = 960,
  pixelsPerMinute = 2,
  dayStartMinute = 9 * 60,
  isToday = false,
  onClickAppointment,
}) => {
  const activeStaff = staff.filter(s => (byStaffAppointments[s.id] || []).length > 0);
  const displayStaff = activeStaff.length > 0 ? activeStaff : staff;

  return (
    <div className="flex flex-col h-full">
      {/* Day header */}
      <div
        className={`sticky top-0 z-10 border-b px-2 py-1.5 text-center text-xs font-medium ${
          isToday
            ? 'bg-blue-50 text-blue-700 border-blue-200'
            : 'bg-white/90 backdrop-blur text-gray-700'
        }`}
      >
        {dateLabel}
      </div>

      {/* Staff sub-columns header */}
      <div className="flex border-b bg-gray-50/80">
        {displayStaff.map((s, idx) => (
          <div
            key={s.id}
            className={`flex-1 text-center text-[10px] font-medium py-0.5 truncate border-t-2 ${STAFF_COLORS[idx % STAFF_COLORS.length]}`}
            title={s.name}
          >
            {s.name.split(' ')[0]}
          </div>
        ))}
      </div>

      {/* Staff lanes side-by-side */}
      <div className="flex flex-1">
        {displayStaff.map((s, idx) => (
          <div
            key={s.id}
            className={`flex-1 border-r last:border-r-0 ${STAFF_BG[idx % STAFF_BG.length]}`}
          >
            <StaffLane
              staffId={s.id}
              staffName={s.name}
              appointments={byStaffAppointments[s.id] || []}
              compact={compact}
              containerHeightPx={containerHeightPx}
              pixelsPerMinute={pixelsPerMinute}
              dayStartMinute={dayStartMinute}
              onClickAppointment={onClickAppointment}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default DayColumn;
