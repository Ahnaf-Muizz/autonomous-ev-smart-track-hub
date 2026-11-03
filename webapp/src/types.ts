export type RoverPhase =
  | 'STANDBY'
  | 'COUNTDOWN'
  | 'DRIVING_TO_GATE1'
  | 'WAITING_GATE1'
  | 'DRIVING_TO_CHARGE'
  | 'READY_TO_CHARGE'
  | 'CHARGING'
  | 'CHARGED'
  | 'CHARGE_FAILED'
  | 'DRIVING_TO_FINISH'
  | 'FINISH_CELEBRATION';

export type MissionStep = 1 | 2 | 3 | 4;

export interface PhysicsPoint {
  real_sec: number;
  sim_time_s: number;
  sim_time_min: number;
  soc: number;
  soc_pct: number;
  T1_K: number;
  T2_K: number;
  T_inf_K: number;
  T1_C: number;
  T2_C: number;
  T_inf_C: number;
  V_ocv: number;
  V_term: number;
  Q_heat_W: number;
  current_mA: number;
}

export interface SimulationSummary {
  success: boolean;
  overheated: boolean;
  timed_out: boolean;
  failure_reason: 'NONE' | 'OVERHEATED' | 'TIME_EXPIRED';
  status_code: 'SUCCESS' | 'FAIL_OVERHEAT' | 'FAIL_TIMEOUT';
  led_command: 'v' | 'f';
  final_soc_pct: number;
  peak_T1_C: number;
  peak_T2_C: number;
  max_safe_T1_C: number;
  final_V_term: number;
  time_to_full_min: number | null;
  time_to_full_real_sec: number | null;
  ideal_min_current_mA: number;
  max_safe_current_mA: number;
  sweet_spot_mA: [number, number];
}

export interface SimulationResult {
  ok: boolean;
  inputs: {
    current_mA: number;
    current_A: number;
    target_minutes: number;
    real_duration_sec: number;
    initial_soc: number;
    target_soc: number;
    capacity_mAh: number;
  };
  summary: SimulationSummary;
  equations: Record<string, string>;
  series: PhysicsPoint[];
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  lap_time_sec?: number;
  charge_time_min: number;
  current_mA: number;
  peak_temp_C: number;
  final_soc_pct: number;
  timestamp: string;
  total_points?: number;
  attempt_num?: number;
  attempt_points?: number;
  time_bonus_points?: number;
  target_minutes?: number;
}

export interface StoredGameRecord {
  id: string;
  timestamp: string;
  student_name: string;
  lap_time_sec: number | null;
  current_mA: number;
  target_minutes: number;
  success: boolean;
  failure_reason: string;
  status_code: string;
  final_soc_pct: number;
  peak_T1_C: number;
  peak_T2_C: number;
  final_V_term: number;
  time_to_full_min: number | null;
  sweet_spot_mA: [number, number];
  equations: Record<string, string>;
  series: PhysicsPoint[];
}

export interface ServerState {
  paused: boolean;
  all_stop: boolean;
  simulation_mode: boolean;
  car_count: number;
  active_phase: RoverPhase;
  student_name: string;
  target_charge_minutes: number;
  esp32_ip: string;
  gate1_open: boolean;
  gate2_open: boolean;
  gate1_lockout_sec: number;
  lap_elapsed_sec: number;
  last_event: string;
}

export type MbotPartId =
  | 'mecanum'
  | 'linesensors'
  | 'frontir'
  | 'rgbleds'
  | 'megapi'
  | 'ble'
  | 'bumpers';

export interface MbotPartSpec {
  id: MbotPartId;
  number: number;
  name: string;
  shortTitle: string;
  category: 'Locomotion' | 'Optical Sensing' | 'Visual Feedback' | 'Compute & Control' | 'Wireless Comms' | 'Safety Hardware';
  pinout: string;
  tagPosition: { x: number; y: number }; // percentage on SVG container
  summary: string;
  kidExplanation: string;
  howItWorks: string[];
  firmwareDetails: string;
  formula: string;
  funFact: string;
}

export type GatePartId =
  | 'esp32'
  | 'servos'
  | 'ultrasonic'
  | 'rgbleds'
  | 'buzzer'
  | 'wifi';

export interface GatePartSpec {
  id: GatePartId;
  number: number;
  name: string;
  shortTitle: string;
  category: 'Master Compute' | 'Robotic Actuators' | 'Echo Sensing' | 'Visual Signals' | 'Audio Feedback' | 'Wireless Telemetry';
  pinout: string;
  tagPosition: { x: number; y: number };
  summary: string;
  kidExplanation: string;
  howItWorks: string[];
  firmwareDetails: string;
  formula: string;
  funFact: string;
}
