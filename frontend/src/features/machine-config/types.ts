// Mirrors backend/app/schemas/machine_config.py

export interface MachineTarget {
  name: string;
  target: number | null;      // per hour; null = use the site default
}

export interface Shift {
  name: string;
  start: number;  // hour 0-23
  end: number;    // hour 0-23; earlier than start = ends next day
}

export interface ShiftInfo extends Shift {
  label: string;  // "08:00 - 17:00"
  hours: number;
}

export interface MachineConfig {
  site: string;
  sites: string[];
  default_target: number;
  shift_hours_per_day: number;  // day target with every shift on = hourly target × these hours
  shifts: ShiftInfo[];
  machines: MachineTarget[];
  updated_at: string | null;
}

export interface MachineConfigUpdate {
  default_target?: number;  // omitted = keep the saved fallback for new machines
  machines: MachineTarget[];
}
