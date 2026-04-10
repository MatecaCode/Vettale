import React, { useMemo } from 'react';
import Chip from './Chip';

export interface StaffLaneAppointment {
  id: string;
  pet_name: string;
  service_name: string;
  status: string;
  startHHMM: string;
  durationMin: number;
}

export interface StaffLaneProps {
  staffId: string;
  staffName: string;
  appointments: StaffLaneAppointment[];
  compact?: boolean;
  containerHeightPx?: number;
  pixelsPerMinute?: number;
  dayStartMinute?: number;
  onClickAppointment?: (id: string) => void;
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const StaffLane: React.FC<StaffLaneProps> = ({
  appointments,
  compact = false,
  containerHeightPx = 960,
  pixelsPerMinute = 2,
  dayStartMinute = 9 * 60,
  onClickAppointment,
}) => {
  const dayEndMinute = dayStartMinute + containerHeightPx / pixelsPerMinute;

  const positioned = useMemo(() => {
    return appointments.map(apt => {
      const start = Math.max(toMinutes(apt.startHHMM), dayStartMinute);
      const end = Math.min(start + apt.durationMin, dayEndMinute);
      const top = (start - dayStartMinute) * pixelsPerMinute;
      const height = Math.max((end - start) * pixelsPerMinute - 2, 18);
      const endHH = Math.floor(end / 60).toString().padStart(2, '0');
      const endMM = (end % 60).toString().padStart(2, '0');
      return { ...apt, top, height, endHHMM: `${endHH}:${endMM}` };
    });
  }, [appointments, pixelsPerMinute, dayStartMinute, dayEndMinute]);

  return (
    <div className="relative" style={{ height: containerHeightPx }}>
      {positioned.map(apt => (
        <div
          key={apt.id}
          className="absolute inset-x-0.5"
          style={{ top: apt.top, height: apt.height }}
        >
          <Chip
            petName={apt.pet_name}
            serviceName={apt.service_name}
            startTime={apt.startHHMM}
            endTime={apt.endHHMM}
            status={apt.status}
            compact={compact}
            onClick={onClickAppointment ? () => onClickAppointment(apt.id) : undefined}
          />
        </div>
      ))}
    </div>
  );
};

export default StaffLane;
