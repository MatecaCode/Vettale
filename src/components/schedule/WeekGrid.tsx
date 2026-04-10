import React from 'react';
import DayColumn from './DayColumn';

export interface WeekGridProps {
  hourLabels: string[];
  days: Array<{
    dateISO: string;
    label: string;
    staff: Array<{ id: string; name: string }>;
    byStaffAppointments: Record<string, any[]>;
  }>;
  compact?: boolean;
  onClickAppointment?: (id: string) => void;
}

const PIXELS_PER_MINUTE = 2;
const DAY_START_MINUTE = 9 * 60;
const SLOT_HEIGHT_PX = 60; // 30 min × 2px/min = 60px per slot row

const WeekGrid: React.FC<WeekGridProps> = ({ hourLabels, days, compact = false, onClickAppointment }) => {
  const totalMinutes = hourLabels.length * 30;
  const gridHeight = totalMinutes * PIXELS_PER_MINUTE;
  const todayISO = new Date().toISOString().split('T')[0];

  return (
    <div className="overflow-x-auto">
      <div
        className="grid"
        style={{ gridTemplateColumns: `56px repeat(7, minmax(140px, 1fr))`, minWidth: '1040px' }}
      >
        {/* ── Hour rail ───────────────────────────────── */}
        <div className="border-r bg-gray-50/60">
          {/* Spacer for day header + staff sub-header */}
          <div className="h-[52px] border-b" />

          <div className="relative" style={{ height: gridHeight }}>
            {hourLabels.map((h, i) => (
              <div
                key={h}
                className="absolute w-full flex items-start justify-end pr-2 text-[10px] text-gray-400 tabular-nums"
                style={{ top: i * SLOT_HEIGHT_PX, height: SLOT_HEIGHT_PX }}
              >
                {h}
              </div>
            ))}
          </div>
        </div>

        {/* ── Day columns ─────────────────────────────── */}
        {days.map(day => (
          <div key={day.dateISO} className="border-r relative">
            <DayColumn
              dateLabel={day.label}
              staff={day.staff}
              byStaffAppointments={day.byStaffAppointments as any}
              compact={compact}
              containerHeightPx={gridHeight}
              pixelsPerMinute={PIXELS_PER_MINUTE}
              dayStartMinute={DAY_START_MINUTE}
              isToday={day.dateISO === todayISO}
              onClickAppointment={onClickAppointment}
            />

            {/* Horizontal gridlines */}
            <div className="absolute left-0 right-0 pointer-events-none" style={{ top: 52 }}>
              {hourLabels.map((_, i) => (
                <div
                  key={i}
                  className="border-b border-gray-100"
                  style={{ height: SLOT_HEIGHT_PX }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WeekGrid;
