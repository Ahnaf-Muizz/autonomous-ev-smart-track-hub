import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  GatePartId,
  LeaderboardEntry,
  MbotPartId,
  MissionStep,
  PhysicsPoint,
  RoverPhase,
  SimulationResult,
  SimulationSummary,
  StoredGameRecord,
} from './types';
import { SCIENCE_TOPICS } from './data/mbotParts';
import { Esp32GateClient, MbotBleClient } from './services/hardware';
import { calculateSpeedBonusPoints, runClientBatterySimulation } from './services/batteryPhysics';
import { CircularTrackCanvas } from './components/CircularTrackCanvas';
import { MbotAnatomyModal } from './components/MbotAnatomyModal';
import { GateAnatomyModal } from './components/GateAnatomyModal';
import { GameOverviewDiagram } from './components/GameOverviewDiagram';
import { BatterySuperchargerView } from './components/BatterySuperchargerView';
import { MasterHostConsole } from './components/MasterHostConsole';
import {
  BatteryCharging,
  Bot,
  Car,
  Check,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Flame,
  Gamepad2,
  Gauge,
  Moon,
  OctagonAlert,
  Play,
  Radio,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Sun,
  Timer,
  Trophy,
  X,
  Zap,
} from 'lucide-react';

// Curated mission presets varying BOTH Battery Capacity Needed (1,150 to 2,070 mAh) and Time Window (15 to 60 min)
const MISSION_PRESETS: Array<{ initialSoc: number; targetMinutes: number }> = [
  { initialSoc: 0.10, targetMinutes: 20 }, // 2,070 mAh in 20m (0.33h) -> Min 6,210 mA
  { initialSoc: 0.10, targetMinutes: 30 }, // 2,070 mAh in 30m (0.50h) -> Min 4,140 mA
  { initialSoc: 0.10, targetMinutes: 45 }, // 2,070 mAh in 45m (0.75h) -> Min 2,760 mA
  { initialSoc: 0.20, targetMinutes: 20 }, // 1,840 mAh in 20m (0.33h) -> Min 5,520 mA
  { initialSoc: 0.20, targetMinutes: 25 }, // 1,840 mAh in 25m (0.42h) -> Min 4,416 mA
  { initialSoc: 0.20, targetMinutes: 40 }, // 1,840 mAh in 40m (0.67h) -> Min 2,760 mA
  { initialSoc: 0.20, targetMinutes: 60 }, // 1,840 mAh in 60m (1.00h) -> Min 1,840 mA
  { initialSoc: 0.30, targetMinutes: 20 }, // 1,610 mAh in 20m (0.33h) -> Min 4,830 mA
  { initialSoc: 0.30, targetMinutes: 35 }, // 1,610 mAh in 35m (0.58h) -> Min 2,760 mA
  { initialSoc: 0.30, targetMinutes: 50 }, // 1,610 mAh in 50m (0.83h) -> Min 1,932 mA
  { initialSoc: 0.40, targetMinutes: 15 }, // 1,380 mAh in 15m (0.25h) -> Min 5,520 mA
  { initialSoc: 0.40, targetMinutes: 30 }, // 1,380 mAh in 30m (0.50h) -> Min 2,760 mA
  { initialSoc: 0.40, targetMinutes: 45 }, // 1,380 mAh in 45m (0.75h) -> Min 1,840 mA
  { initialSoc: 0.50, targetMinutes: 20 }, // 1,150 mAh in 20m (0.33h) -> Min 3,450 mA
  { initialSoc: 0.50, targetMinutes: 35 }, // 1,150 mAh in 35m (0.58h) -> Min 1,971 mA
];

// Helper: Pick a randomized starting slider value outside the mission's [minRequired, minRequired+1200] window!
function pickRandomizedSliderMa(targetMin: number = 24, initSoc: number = 0.20): number {
  const neededMah = Math.round((1 - initSoc) * 2300);
  const minReq = Math.round(neededMah / (targetMin / 60));
  const maxSafe = minReq + 1200;
  const candidates: number[] = [];
  for (let m = 700; m <= 7800; m += 50) {
    // Keep at least 350 mA away from the winning [minReq, maxSafe] window
    if (m < minReq - 350 || m > maxSafe + 350) {
      candidates.push(m);
    }
  }
  return candidates[Math.floor(Math.random() * candidates.length)] || 1500;
}

export const App: React.FC = () => {
  const [route, setRoute] = useState<'student' | 'master'>(() =>
    window.location.pathname.includes('master') || window.location.hash.includes('master')
      ? 'master'
      : 'student'
  );
  const [masterAuthed, setMasterAuthed] = useState(false);

  const switchRoute = useCallback((nextRoute: 'student' | 'master') => {
    setRoute(nextRoute);
    const targetPath = nextRoute === 'master' ? '/master' : '/';
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setRoute(
        window.location.pathname.includes('master') || window.location.hash.includes('master')
          ? 'master'
          : 'student'
      );
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Mission & Track State
  const [step, setStep] = useState<MissionStep>(1);
  const [phase, setPhase] = useState<RoverPhase>('STANDBY');
  const [studentName, setStudentName] = useState('');
  const [countdownSec, setCountdownSec] = useState<number | null>(null);
  const [lapSeconds, setLapSeconds] = useState(0);
  const [lapRunning, setLapRunning] = useState(false);

  // Global Hardware, Simulation Mode & Sync State (Default simulationMode = false for real field sync)
  const [serverOnline, setServerOnline] = useState(false);
  const [bleConnected, setBleConnected] = useState(false);
  const [remoteBleConnected, setRemoteBleConnected] = useState(false);
  const [roverDeviceName, setRoverDeviceName] = useState('mBot Mega');
  const [clientId] = useState(() => 'client_' + Math.random().toString(36).slice(2, 9) + '_' + Date.now().toString(36));
  const [espConnected, setEspConnected] = useState(false);
  const [espHost, setEspHost] = useState('192.168.4.1:81');
  const [simulationMode, setSimulationMode] = useState(false);
  const [paused, setPaused] = useState(false);
  const [allStopActive, setAllStopActive] = useState(false);

  // Dashboard Completed Missions Counter (Strictly dashboard-based, increments only when phases 1-4 complete)
  const [carCount, setCarCount] = useState<number>(() => {
    const saved = localStorage.getItem('dashboard_car_count');
    const n = saved ? parseInt(saved, 10) : NaN;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  });
  const carCountRef = useRef<number>(carCount);
  useEffect(() => {
    carCountRef.current = carCount;
  }, [carCount]);
  const [gate1Open, setGate1Open] = useState(false);
  const [gate2Open, setGate2Open] = useState(false);
  const [trafficLight, setTrafficLight] = useState<'RED' | 'YELLOW' | 'GREEN'>('RED');
  const [gateStateText, setGateStateText] = useState('IDLE');
  const [ultrasonicCm, setUltrasonicCm] = useState<number | null>(null);
  const [lockoutSec, setLockoutSec] = useState(0);

  // Dynamic Segment Animation Timers (Explicit seconds control)
  const [launchToGate1Sec, setLaunchToGate1Sec] = useState<number>(() => {
    const saved = localStorage.getItem('sim_launch_to_gate1_sec');
    const n = saved ? parseFloat(saved) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 2.0;
  });
  const [gate2ToFinishSec, setGate2ToFinishSec] = useState<number>(() => {
    const saved = localStorage.getItem('sim_gate2_to_finish_sec');
    const n = saved ? parseFloat(saved) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 3.0;
  });
  const launchToGate1SecRef = useRef<number>(launchToGate1Sec);
  const gate2ToFinishSecRef = useRef<number>(gate2ToFinishSec);

  useEffect(() => {
    launchToGate1SecRef.current = launchToGate1Sec;
  }, [launchToGate1Sec]);

  useEffect(() => {
    gate2ToFinishSecRef.current = gate2ToFinishSec;
  }, [gate2ToFinishSec]);

  // Step 3: 10s EV Battery Supercharging Game State (Randomized capacity, time & starting slider!)
  const [initialSoc, setInitialSoc] = useState(0.20);
  const [targetMinutes, setTargetMinutes] = useState(24);
  const [currentMa, setCurrentMa] = useState<number>(() => pickRandomizedSliderMa(24, 0.20));
  const [isCharging, setIsCharging] = useState(false);
  const [livePoint, setLivePoint] = useState<PhysicsPoint | null>(null);
  const [liveSeries, setLiveSeries] = useState<PhysicsPoint[]>([]);
  const [lastSummary, setLastSummary] = useState<SimulationSummary | null>(null);

  // 5-Attempt Scorecard System State (Attempts 1 to 5)
  const [attemptCount, setAttemptCount] = useState<number>(1);
  const attemptCountRef = useRef<number>(1);

  useEffect(() => {
    attemptCountRef.current = attemptCount;
  }, [attemptCount]);

  // Synchronized refs to prevent stale closure bugs in async timers & BLE event handlers
  const lastSummaryRef = useRef<SimulationSummary | null>(null);
  const currentMaRef = useRef<number>(currentMa);
  const targetMinutesRef = useRef<number>(targetMinutes);
  const initialSocRef = useRef<number>(initialSoc);
  const studentNameRef = useRef<string>(studentName);

  useEffect(() => {
    lastSummaryRef.current = lastSummary;
  }, [lastSummary]);

  useEffect(() => {
    currentMaRef.current = currentMa;
  }, [currentMa]);

  useEffect(() => {
    targetMinutesRef.current = targetMinutes;
  }, [targetMinutes]);

  useEffect(() => {
    initialSocRef.current = initialSoc;
  }, [initialSoc]);

  useEffect(() => {
    studentNameRef.current = studentName;
  }, [studentName]);

  const handleUpdateCurrentMa = useCallback(
    (val: number) => {
      setCurrentMa(val);
      if (!isCharging) {
        setLastSummary(null);
        setLivePoint(null);
        setLiveSeries([]);
      }
    },
    [isCharging]
  );

  // Theme Toggle (Dark Mode vs Light Theme with local persistence)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('share_lab_theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    localStorage.setItem('share_lab_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.body.style.backgroundColor = '#070B14';
      document.body.style.color = '#F1F5F9';
    } else {
      document.documentElement.classList.remove('dark');
      document.body.style.backgroundColor = '#F8FAFC';
      document.body.style.color = '#0F172A';
    }
  }, [theme]);

  // Modals: 2-Level mBot Mega Explorer, Supercharger Gate Explorer & Science Topic Modal
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [explorerInitialPart, setExplorerInitialPart] = useState<MbotPartId | null>(null);
  const [gateExplorerOpen, setGateExplorerOpen] = useState(false);
  const [gateInitialPart, setGateInitialPart] = useState<GatePartId | null>(null);
  const [scienceTopic, setScienceTopic] = useState<'ultrasonic' | 'battery' | 'thermal' | null>(
    null
  );

  // Leaderboard & Stored Per-Game Physics History
  const [leaderboardModalOpen, setLeaderboardModalOpen] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [gameHistory, setGameHistory] = useState<StoredGameRecord[]>([]);
  const [logs, setLogs] = useState<string[]>([
    '[SYS] Texas Tech SHARE Lab React + TypeScript interface ready.',
  ]);

  const bleRef = useRef<MbotBleClient | null>(null);
  const espRef = useRef<Esp32GateClient | null>(null);
  const chargeTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const lapStartRef = useRef<number | null>(null);
  const lastHandledEventRef = useRef<string | null>(null);

  const appendLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${ts}] ${msg}`, ...prev.slice(0, 149)]);
  }, []);

  const pushServerState = useCallback(async (patch: Record<string, any>) => {
    try {
      await fetch('/api/state/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    } catch {
      // ignore offline
    }
  }, []);

  // Unified Rover Command Dispatcher:
  // If THIS browser holds the active Web Bluetooth connection (Host Laptop), transmit directly with 0ms latency.
  // Otherwise (e.g. Student Kiosk laptop), relay command to the server so the Host Laptop sends it via BLE!
  const dispatchRoverChar = useCallback((ch: string) => {
    if (bleRef.current?.connected) {
      void bleRef.current.sendChar(ch);
    } else {
      fetch('/api/rover/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: ch, clientId }),
      }).catch((e) => appendLog(`[Relay TX Err] ${e?.message || e}`));
    }
  }, [clientId, appendLog]);

  const dispatchRoverText = useCallback((txt: string) => {
    if (bleRef.current?.connected) {
      void bleRef.current.sendText(txt);
    } else {
      fetch('/api/rover/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: txt, clientId }),
      }).catch((e) => appendLog(`[Relay TX Err] ${e?.message || e}`));
    }
  }, [clientId, appendLog]);

  const dispatchRoverEmergencyStop = useCallback(() => {
    if (bleRef.current?.connected) {
      void bleRef.current.emergencyStop();
    } else {
      fetch('/api/rover/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'emergency_stop', clientId }),
      }).catch((e) => appendLog(`[Relay TX Err] ${e?.message || e}`));
    }
  }, [clientId, appendLog]);

  const handleSaveSegmentTimers = useCallback((launchSec: number, finishSec: number) => {
    const lSec = Math.max(0.5, Math.min(60, Number(launchSec) || 2.0));
    const fSec = Math.max(0.5, Math.min(60, Number(finishSec) || 3.0));
    setLaunchToGate1Sec(lSec);
    setGate2ToFinishSec(fSec);
    launchToGate1SecRef.current = lSec;
    gate2ToFinishSecRef.current = fSec;
    localStorage.setItem('sim_launch_to_gate1_sec', lSec.toString());
    localStorage.setItem('sim_gate2_to_finish_sec', fSec.toString());
    pushServerState({
      sim_launch_to_gate1_sec: lSec,
      sim_gate2_to_finish_sec: fSec,
      last_event: 'TIMERS_UPDATED',
    });
    appendLog(`[TIMERS] Saved: Launch->Gate 1: ${lSec}s | Gate 2->Finish: ${fSec}s`);
  }, [pushServerState, appendLog]);

  const fetchLeaderboardAndHistory = useCallback(async () => {
    try {
      const [lbRes, histRes] = await Promise.all([
        fetch('/api/leaderboard'),
        fetch('/api/games/history?include_series=1&limit=50'),
      ]);
      if (lbRes.ok) {
        const lbData = await lbRes.json();
        const rawEntries: LeaderboardEntry[] = Array.isArray(lbData.entries) ? lbData.entries : [];
        const sorted = [...rawEntries].sort((a, b) => (b.total_points ?? 0) - (a.total_points ?? 0));
        setLeaderboard(sorted);
      }
      if (histRes.ok) {
        const histData = await histRes.json();
        setGameHistory(histData.games || []);
      }
    } catch {
      // ignore
    }
  }, []);

  // Finish Line Handler: saves score, resets Gate 1 lockout timer, plays 7s chasing rainbow, then Standby
  const handleLapFinished = useCallback(async () => {
    setLapRunning(false);
    setPhase('FINISH_CELEBRATION');
    setStep(4);

    espRef.current?.sendCommand('RESET_LOCKOUT');
    espRef.current?.sendCommand('RESET_GATES');
    setGate1Open(false);
    setGate2Open(false);
    setLockoutSec(0);

    const finalLapSec = lapStartRef.current
      ? Math.max(5.0, (performance.now() - lapStartRef.current) / 1000)
      : Math.max(12.4, lapSeconds);
    setLapSeconds(finalLapSec);

    const sName = studentNameRef.current.trim() || 'STEM Explorer';
    const cMa = currentMaRef.current;
    const tMin = targetMinutesRef.current;
    const initSoc = initialSocRef.current;

    let peakTemp = lastSummaryRef.current?.peak_T1_C;
    let finalSoc = lastSummaryRef.current?.final_soc_pct ?? 100;
    let chargeTime = lastSummaryRef.current?.time_to_full_min ?? tMin;

    // Dynamically calculate exact physics temperature if missing or stuck at legacy 42.0 default
    if (typeof peakTemp !== 'number' || peakTemp <= 0 || Math.abs(peakTemp - 42.0) < 0.01) {
      const sim = runClientBatterySimulation(cMa, tMin, initSoc, 10.0);
      peakTemp = sim.summary.peak_T1_C;
      finalSoc = sim.summary.final_soc_pct;
      chargeTime = sim.summary.time_to_full_min ?? tMin;
    }

    // Increment dashboard completed mission count (Phase 1-4 completed)
    const nextCount = (carCountRef.current || 0) + 1;
    setCarCount(nextCount);
    localStorage.setItem('dashboard_car_count', nextCount.toString());

    pushServerState({
      active_phase: 'FINISH_CELEBRATION',
      car_count: nextCount,
      gate1_open: false,
      gate2_open: false,
      gate1_lockout_sec: 0,
      lap_elapsed_sec: finalLapSec,
      last_event: 'LAP_FINISH_RAINBOW',
    });

    // Calculate Points-Based Scorecard (5 Attempts Scale + Speed Efficiency Bonus up to +250 Pts)
    const attNum = Math.min(5, Math.max(1, attemptCountRef.current));
    const attPts = Math.max(0, 600 - attNum * 100);
    const { timeSavedMin: timeSaved, timeBonusPoints: timeBonus } = calculateSpeedBonusPoints(
      tMin,
      chargeTime,
      initSoc
    );
    const totalPts = attPts + timeBonus;

    try {
      await fetch('/api/leaderboard/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: sName,
          lap_time_sec: Number(finalLapSec.toFixed(2)),
          charge_time_min: chargeTime,
          current_mA: cMa,
          peak_temp_C: peakTemp,
          final_soc_pct: finalSoc,
          total_points: totalPts,
          attempt_num: attNum,
          attempt_points: attPts,
          time_bonus_points: timeBonus,
          target_minutes: tMin,
        }),
      });
      fetchLeaderboardAndHistory();
    } catch {
      // ignore
    }

    // Hold the finish screen indefinitely until the student clicks the complete button!
  }, [
    lapSeconds,
    studentName,
    lastSummary,
    targetMinutes,
    currentMa,
    livePoint,
    pushServerState,
    fetchLeaderboardAndHistory,
  ]);

  const handleLapFinishedRef = useRef(handleLapFinished);
  useEffect(() => {
    handleLapFinishedRef.current = handleLapFinished;
  });

  const handleRoverEventTag = useCallback(
    (tag: string, fromRelay = false) => {
      if (tag === 'COUNTDOWN' || tag === 'COUNTDOWN_START' || tag.startsWith('CD:')) {
        setPhase('COUNTDOWN');
        setStep(2);
      } else if (tag === 'LAUNCH') {
        setPhase('DRIVING_TO_GATE1');
        setStep(2);
      } else if (tag === 'OBS_CLEAR' || tag === 'PATROL_RESUME') {
        setPhase((prev) => {
          if (prev === 'WAITING_GATE1' || prev === 'DRIVING_TO_GATE1') {
            setGate1Open(true);
            setTrafficLight('GREEN');
            // Automatically advance to Step 3 (Charging Game) once rover pulls into charging station
            window.setTimeout(() => {
              setPhase((curr) => {
                if (curr === 'DRIVING_TO_CHARGE' || curr === 'WAITING_GATE1' || curr === 'DRIVING_TO_GATE1') {
                  setStep(3);
                  if (!fromRelay) {
                    dispatchRoverChar('c');
                  }
                  pushServerState({ active_phase: 'READY_TO_CHARGE' });
                  return 'READY_TO_CHARGE';
                }
                return curr;
              });
            }, 3000);
            return 'DRIVING_TO_CHARGE';
          }
          if (prev === 'CHARGED') {
            return 'DRIVING_TO_FINISH';
          }
          return prev;
        });
      } else if (tag === 'OBS_STOP') {
        setPhase((prev) => {
          if (prev === 'DRIVING_TO_GATE1' || prev === 'WAITING_GATE1') {
            return 'WAITING_GATE1';
          }
          setStep(3);
          if (!fromRelay) {
            dispatchRoverChar('c');
          }
          return 'READY_TO_CHARGE';
        });
      } else if (tag === 'FINISH') {
        handleLapFinishedRef.current();
      } else if (tag === 'STANDBY_READY' || tag === 'MODE_2') {
        setPhase('STANDBY');
        setStep(1);
      }
    },
    [dispatchRoverChar, pushServerState]
  );

  const handleRoverEventTagRef = useRef(handleRoverEventTag);
  useEffect(() => {
    handleRoverEventTagRef.current = handleRoverEventTag;
  });

  useEffect(() => {
    bleRef.current = new MbotBleClient({
      onStatus: (conn, name) => {
        setBleConnected(conn);
        if (conn && name) setRoverDeviceName(name);
        fetch('/api/rover/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connected: conn,
            name: name || bleRef.current?.lockedDeviceName || 'mBot Mega',
          }),
        }).catch(() => {});
      },
      onLog: appendLog,
      onEvent: (tag) => {
        handleRoverEventTagRef.current(tag, false);
        fetch('/api/rover/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag, clientId }),
        }).catch(() => {});
      },
    });

    espRef.current = new Esp32GateClient({
      onStatus: (conn) => setEspConnected(conn),
      onLog: appendLog,
      onTelemetry: (data) => {
        if (data.distanceCm !== undefined) setUltrasonicCm(data.distanceCm);
        if (data.lockoutSec !== undefined) setLockoutSec(data.lockoutSec);
        if (data.gateState) {
          setGateStateText(data.gateState);
          if (data.gateState === 'RED') {
            setTrafficLight('RED');
            setPhase((prev) => (prev === 'DRIVING_TO_GATE1' ? 'WAITING_GATE1' : prev));
          } else if (data.gateState === 'YELLOW') {
            setTrafficLight('YELLOW');
          } else if (data.gateState === 'GREEN_OPEN' || data.gateState === 'GATE1_OPEN') {
            setTrafficLight('GREEN');
            setGate1Open(true);
            // 1. 2.0s delay between Gate 1 opening and car moving forward to charger
            window.setTimeout(() => {
              setPhase('DRIVING_TO_CHARGE');
            }, 2000);

            // 2. Automatically advance to Step 3 (Charging Game) 1.0s after car moves (3.0s total)
            window.setTimeout(() => {
              setPhase((prev) => {
                if (prev === 'DRIVING_TO_CHARGE' || prev === 'WAITING_GATE1' || prev === 'DRIVING_TO_GATE1') {
                  setStep(3);
                  dispatchRoverChar('c');
                  pushServerState({ active_phase: 'READY_TO_CHARGE' });
                  return 'READY_TO_CHARGE';
                }
                return prev;
              });
            }, 3000);
          } else if (data.gateState === 'GATE2_OPEN') {
            setGate2Open(true);
            const t2 = gate2ToFinishSecRef.current;
            setPhase((prev) => (prev === 'CHARGED' || prev === 'READY_TO_CHARGE' ? 'DRIVING_TO_FINISH' : prev));
            // Advance to Phase 4 (Finish Celebration) dynamically after t2 seconds
            window.setTimeout(() => {
              setPhase((curr) => {
                if (curr === 'DRIVING_TO_FINISH') {
                  handleLapFinishedRef.current();
                  return 'FINISH_CELEBRATION';
                }
                return curr;
              });
            }, t2 * 1000);
            // Gate 2 automatically closes after exactly 10.0s on the ESP32 hardware timer
            window.setTimeout(() => {
              setGate2Open(false);
            }, 10000);
          } else if (data.gateState === 'IDLE') {
            setTrafficLight('RED');
            setGate1Open(false);
            setGate2Open(false);
          }
        }
      },
    });

    // Automatically establish direct WebSocket connection to ESP32 SoftAP (matching websocket.html)
    espRef.current.connect(espHost);

    fetch('/api/state')
      .then((r) => r.json())
      .then((d) => {
        setServerOnline(true);
        if (d.state) {
          setPaused(Boolean(d.state.paused));
          setAllStopActive(Boolean(d.state.all_stop));
          if (typeof d.state.rover_ble_connected === 'boolean') {
            setRemoteBleConnected(d.state.rover_ble_connected);
          }
          if (d.state.rover_name) {
            setRoverDeviceName(d.state.rover_name);
          }
          if (typeof d.state.simulation_mode === 'boolean') {
            setSimulationMode(d.state.simulation_mode);
          }
          if (typeof d.state.sim_launch_to_gate1_sec === 'number') {
            setLaunchToGate1Sec(d.state.sim_launch_to_gate1_sec);
            launchToGate1SecRef.current = d.state.sim_launch_to_gate1_sec;
          }
          if (typeof d.state.sim_gate2_to_finish_sec === 'number') {
            setGate2ToFinishSec(d.state.sim_gate2_to_finish_sec);
            gate2ToFinishSecRef.current = d.state.sim_gate2_to_finish_sec;
          }
          setCarCount(d.state.car_count ?? 0);
          if (d.state.esp32_ip) setEspHost(d.state.esp32_ip);
          if (typeof d.state.esp32_online === 'boolean' && d.state.esp32_online) {
            setEspConnected(true);
          }
        }
      })
      .catch(() => setServerOnline(false));

    fetchLeaderboardAndHistory();

    const es = new EventSource('/api/events');
    es.onopen = () => setServerOnline(true);
    es.onerror = () => setServerOnline(false);
    es.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'state_sync' && msg.payload) {
          const st = msg.payload;
          setPaused(Boolean(st.paused));
          setAllStopActive(Boolean(st.all_stop));
          if (typeof st.rover_ble_connected === 'boolean') {
            setRemoteBleConnected(st.rover_ble_connected);
          }
          if (st.rover_name) {
            setRoverDeviceName(st.rover_name);
          }
          if (typeof st.simulation_mode === 'boolean') {
            setSimulationMode(st.simulation_mode);
          }
          if (typeof st.sim_launch_to_gate1_sec === 'number') {
            setLaunchToGate1Sec(st.sim_launch_to_gate1_sec);
            launchToGate1SecRef.current = st.sim_launch_to_gate1_sec;
          }
          if (typeof st.sim_gate2_to_finish_sec === 'number') {
            setGate2ToFinishSec(st.sim_gate2_to_finish_sec);
            gate2ToFinishSecRef.current = st.sim_gate2_to_finish_sec;
          }
          if (typeof st.car_count === 'number') setCarCount(st.car_count);
          if (typeof st.esp32_online === 'boolean') {
            setEspConnected(st.esp32_online || Boolean(espRef.current?.connected));
          }
          
          const currentEvt = st.last_event;
          const isAbortEvt =
            currentEvt === 'MASTER_ALL_STOP' ||
            currentEvt === 'MISSION_ABORT' ||
            currentEvt === 'GLOBAL_ESTOP' ||
            currentEvt === 'MASTER_STOP';

          // Edge-triggered: ONLY process stop if this is a fresh new abort event, NOT a stale broadcast!
          if (isAbortEvt && currentEvt !== lastHandledEventRef.current) {
            lastHandledEventRef.current = currentEvt;
            // Instant Hardware Halt via BLE
            bleRef.current?.emergencyStop();
            try {
              void espRef.current?.sendCommand('RESET_GATES').catch(() => {});
            } catch {}
            setLapRunning(false);
            setIsCharging(false);
            setCountdownSec(null);
            setStep(1);
            setPhase('STANDBY');
            if (chargeTimerRef.current) {
              window.clearInterval(chargeTimerRef.current);
              chargeTimerRef.current = null;
            }
            if (countdownTimerRef.current) {
              window.clearInterval(countdownTimerRef.current);
              countdownTimerRef.current = null;
            }
          } else if (currentEvt && currentEvt !== lastHandledEventRef.current) {
            lastHandledEventRef.current = currentEvt;
          }
        } else if (msg.type === 'rover_command' && msg.payload) {
          // If THIS browser holds the active BLE link (Host Laptop), transmit command to mBot Mega!
          if (bleRef.current?.connected && msg.payload.clientId !== clientId) {
            const p = msg.payload;
            if (p.action === 'emergency_stop') {
              void bleRef.current.emergencyStop();
            } else if (p.cmd) {
              void bleRef.current.sendChar(p.cmd);
            } else if (p.text) {
              void bleRef.current.sendText(p.text);
            }
          }
        } else if (msg.type === 'rover_event' && msg.payload?.tag) {
          // If this event was broadcast by Host Laptop BLE, update Kiosk UI in real-time
          if (msg.payload.clientId !== clientId) {
            handleRoverEventTagRef.current(msg.payload.tag, true);
          }
        } else if (msg.type === 'leaderboard_sync' && msg.payload) {
          const rawEntries: LeaderboardEntry[] = Array.isArray(msg.payload) ? msg.payload : [];
          const sorted = [...rawEntries].sort((a, b) => (b.total_points ?? 0) - (a.total_points ?? 0));
          setLeaderboard(sorted);
        } else if (msg.type === 'game_history_sync') {
          fetchLeaderboardAndHistory();
        }
      } catch {
        // ignore
      }
    };

    return () => {
      es.close();
      espRef.current?.destroy();
      bleRef.current?.unlockRover();
    };
  }, []);

  // Live Lap Stopwatch
  useEffect(() => {
    if (!lapRunning || paused || allStopActive) return;
    const id = window.setInterval(() => {
      if (lapStartRef.current) {
        setLapSeconds((performance.now() - lapStartRef.current) / 1000);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [lapRunning, paused, allStopActive]);

  // Global Emergency Key Controls (Space, '2', or 'x' immediately halts rover & switches to Mode 2 from Student screen)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      // Do not intercept if on Master Console (Master Console handles teleop & mode switching directly)
      if (route === 'master') return;

      if (e.key === ' ' || e.key === '2' || e.key === 'x' || e.key === 'X') {
        if (e.key === ' ') {
          e.preventDefault();
        }
        dispatchRoverEmergencyStop();
        dispatchRoverChar('2');
        dispatchRoverChar(' ');
        handleResetNextStudent();
        setStep(1);
        setPhase('STANDBY');
        pushServerState({
          active_phase: 'STANDBY',
          last_event: 'GLOBAL_ESTOP',
        });
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [route]);

  // Step 1 -> Step 2: Student presses Start Mission
  const handleStartMission = () => {
    // Pick a preset with a DIFFERENT targetMinutes than current to guarantee varied missions
    const candidates = MISSION_PRESETS.filter((p) => p.targetMinutes !== targetMinutes);
    const preset = candidates.length > 0
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : MISSION_PRESETS[Math.floor(Math.random() * MISSION_PRESETS.length)];

    setInitialSoc(preset.initialSoc);
    setTargetMinutes(preset.targetMinutes);
    // Randomize slider outside the right answer so students must figure out and move the slider!
    setCurrentMa(pickRandomizedSliderMa(preset.targetMinutes, preset.initialSoc));
    setLastSummary(null);
    setLivePoint(null);
    setLiveSeries([]);
    setGate1Open(false);
    setGate2Open(false);

    dispatchRoverChar('1');
    espRef.current?.sendCommand('RESET_LOCKOUT');

    setStep(2);
    setPhase('COUNTDOWN');
    setCountdownSec(5);

    // Lap timer remains 0 and starts when the student begins the Phase 3 supercharger game
    setLapSeconds(0);
    setLapRunning(false);
    lapStartRef.current = null;

    pushServerState({
      active_phase: 'COUNTDOWN',
      student_name: studentName.trim() || 'STEM Explorer',
      target_charge_minutes: preset.targetMinutes,
      last_event: 'MISSION_START',
    });

    let c = 5;
    if (countdownTimerRef.current) window.clearInterval(countdownTimerRef.current);
    const cdId = window.setInterval(() => {
      c -= 1;
      if (c > 0) {
        setCountdownSec(c);
      } else {
        window.clearInterval(cdId);
        countdownTimerRef.current = null;
        setCountdownSec(null);
        setPhase('DRIVING_TO_GATE1');

        // ONLY auto-animate Gate 1 -> Charger if Simulation Mode is explicitly ON!
        // In Real Field Mode (simulationMode === false), wait for actual ESP32 & mBot BLE events.
        if (simulationMode) {
          const t1 = launchToGate1SecRef.current;
          // 1. Rover reaches Gate 1 dynamically in exactly t1 seconds
          window.setTimeout(() => {
            setPhase('WAITING_GATE1');
            setTrafficLight('RED');
            setUltrasonicCm(3.8);
          }, t1 * 1000);

          // 2. Gate 1 open trigger takes 2.0s (1.0s Red -> 1.0s Yellow -> Green & Open)
          window.setTimeout(() => setTrafficLight('YELLOW'), (t1 + 1.0) * 1000);
          window.setTimeout(() => {
            setTrafficLight('GREEN');
            setGate1Open(true);
          }, (t1 + 2.0) * 1000);

          // 3. Gate 1 open delay: 2.0s before car moves forward
          window.setTimeout(() => {
            setPhase('DRIVING_TO_CHARGE');
          }, (t1 + 4.0) * 1000);

          // 4. Car movement: 1.0s to pull into charger bay & transition to Step 3
          window.setTimeout(() => {
            setPhase('READY_TO_CHARGE');
            setStep(3);
          }, (t1 + 5.0) * 1000);
        }
      }
    }, 1000);
    countdownTimerRef.current = cdId;
  };

  const handleDockAtChargerNow = () => {
    setGate1Open(true);
    setTrafficLight('GREEN');
    setPhase('READY_TO_CHARGE');
    setStep(3);
    dispatchRoverChar('c');
  };

  // Called when student begins Phase 3 supercharger game (clicking "Got It — Play Game!" or starting charge)
  const handleStartSuperchargerGame = useCallback(() => {
    if (!lapRunning && lapSeconds === 0) {
      setLapSeconds(0);
      setLapRunning(true);
      lapStartRef.current = performance.now();
    }
  }, [lapRunning, lapSeconds]);

  // Step 3: Run 10-Second EV Battery Supercharging Simulation
  const handleStartSupercharge = async () => {
    // Start lap timer if student starts charge directly
    if (!lapRunning && lapSeconds === 0) {
      setLapSeconds(0);
      setLapRunning(true);
      lapStartRef.current = performance.now();
    }
    if (isCharging) return;
    setIsCharging(true);
    setLastSummary(null);
    setLiveSeries([]);
    setPhase('CHARGING');

    dispatchRoverChar('g');

    // Compute exact calibrated physics locally so UI & Safe Window [minReq, minReq+1200] ALWAYS match 100%,
    // while also posting to /api/battery/simulate to store the run in server/game_history.json!
    const localSim = runClientBatterySimulation(currentMa, targetMinutes, initialSoc, 10.0);
    let data: SimulationResult = localSim;

    try {
      const res = await fetch('/api/battery/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_mA: currentMa,
          target_minutes: targetMinutes,
          real_duration_sec: 10.0,
          initial_soc: initialSoc,
          target_soc: 1.0,
          student_name: studentName.trim() || 'STEM Explorer',
          lap_time_sec: Number(lapSeconds.toFixed(2)),
          record_history: true,
        }),
      });
      if (res.ok) {
        const srvData: SimulationResult = await res.json();
        // Use server response if its calibrated window matches localSim; otherwise keep localSim!
        if (
          srvData?.summary?.max_safe_current_mA === localSim.summary.max_safe_current_mA &&
          srvData?.summary?.success === localSim.summary.success
        ) {
          data = srvData;
        }
      }
    } catch {
      // Offline or standalone — use localSim seamlessly
    }

    const series = data.series || [];
    const summary = data.summary;

    let idx = 0;
    if (chargeTimerRef.current) window.clearInterval(chargeTimerRef.current);

    chargeTimerRef.current = window.setInterval(() => {
      if (idx < series.length) {
        const pt = series[idx];
        setLivePoint(pt);
        setLiveSeries((prev) => [...prev, pt]);
        idx += 1;

        const reachedFull = pt.soc_pct >= 99.9 && summary.success;
        const overheatedNow = pt.T1_C >= 61.85 && summary.overheated;
        if (!reachedFull && !overheatedNow && idx < series.length) {
          return;
        }
      }

      if (chargeTimerRef.current) window.clearInterval(chargeTimerRef.current);
      setIsCharging(false);
      lastSummaryRef.current = summary;
      setLastSummary(summary);
      fetchLeaderboardAndHistory();

      if (summary.success) {
        setPhase('CHARGED');
        dispatchRoverChar('e');
        espRef.current?.sendCommand('OPEN_GATE2');
        setGate2Open(true);

        const t2 = gate2ToFinishSecRef.current;
        // Dynamically adjust movement animation to exactly t2 seconds before transitioning to finish state!
        setPhase('DRIVING_TO_FINISH');
        window.setTimeout(() => {
          setPhase((curr) => {
            if (curr === 'DRIVING_TO_FINISH') {
              handleLapFinishedRef.current();
              return 'FINISH_CELEBRATION';
            }
            return curr;
          });
        }, t2 * 1000);

        // Gate 2 automatically closes after exactly 10.0s on the ESP32 hardware timer
        window.setTimeout(() => {
          setGate2Open(false);
        }, 10000);
      } else {
        setPhase('CHARGE_FAILED');
        dispatchRoverChar('f');
        const nextAtt = attemptCountRef.current + 1;
        setAttemptCount(nextAtt);
        attemptCountRef.current = nextAtt;
      }
    }, 100);
  };

  const handleResetNextStudent = () => {
    // 1. Direct hardware BLE emergency halt FIRST & force Mode 2 (Zero delay, non-blocking)
    dispatchRoverEmergencyStop();
    dispatchRoverChar('2');
    dispatchRoverChar(' ');

    // 2. Clear timers and local tracking
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (chargeTimerRef.current) {
      window.clearInterval(chargeTimerRef.current);
      chargeTimerRef.current = null;
    }
    setIsCharging(false);
    setLapRunning(false);
    setLapSeconds(0);
    setCountdownSec(null);
    setStudentName(''); // Clear name for next student!
    setStep(1);
    setAttemptCount(1);
    attemptCountRef.current = 1;
    setPhase('STANDBY');
    setGate1Open(false);
    setGate2Open(false);
    setTrafficLight('RED');
    setLivePoint(null);
    setLiveSeries([]);
    setLastSummary(null);

    pushServerState({
      active_phase: 'STANDBY',
      gate1_open: false,
      gate2_open: false,
      gate1_lockout_sec: 0,
      lap_elapsed_sec: 0,
      last_event: 'NEXT_STUDENT_RESET',
    });

    // 3. Optional background ESP32 reset (fire-and-forget, never delays rover halt)
    try {
      void espRef.current?.sendCommand('RESET_LOCKOUT').catch(() => {});
      void espRef.current?.sendCommand('RESET_GATES').catch(() => {});
    } catch {
      // offline
    }
  };

  // Master Console Simulator Step Trigger
  const handleRunSimulatedMissionStep = (action: 'launch' | 'gate1' | 'dock' | 'finish') => {
    setSimulationMode(true);
    pushServerState({ simulation_mode: true });
    if (action === 'launch') {
      switchRoute('student');
      handleStartMission();
    } else if (action === 'gate1') {
      switchRoute('student');
      setStep(2);
      setPhase('WAITING_GATE1');
      setTrafficLight('RED');
      window.setTimeout(() => setTrafficLight('YELLOW'), 1000);
      window.setTimeout(() => {
        setTrafficLight('GREEN');
        setGate1Open(true);
        // 2.0s delay between Gate 1 opening and car moving forward to charger
        window.setTimeout(() => {
          setPhase('DRIVING_TO_CHARGE');
          // Car movement: 1.0s to dock at charger
          window.setTimeout(() => {
            setPhase('READY_TO_CHARGE');
            setStep(3);
          }, 1000);
        }, 2000);
      }, 2000);
    } else if (action === 'dock') {
      switchRoute('student');
      handleDockAtChargerNow();
    } else if (action === 'finish') {
      switchRoute('student');
      setGate2Open(true);
      setPhase('DRIVING_TO_FINISH');
      const t2 = gate2ToFinishSecRef.current;
      window.setTimeout(() => {
        handleLapFinished();
      }, t2 * 1000);
    }
  };

  const activeScience = scienceTopic ? SCIENCE_TOPICS[scienceTopic] : null;

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors ${
        theme === 'dark' ? 'bg-[#070B14] text-slate-100' : 'bg-slate-100 text-slate-900'
      }`}
    >
      {/* ====================================================================
          GLOBAL PAUSE / ALL-STOP OVERLAY
          ==================================================================== */}
      {(paused || allStopActive) && route === 'student' && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
          <div className="w-20 h-20 rounded-3xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-4xl mb-4">
            {allStopActive ? '🛑' : '⏸️'}
          </div>
          <h2 className="text-3xl font-black text-white">
            {allStopActive ? 'All-Stop Active' : 'Game Paused by Host'}
          </h2>
          <p className="text-slate-300 max-w-md mt-2">
            Hang tight! The host is getting the rover ready on the track.
          </p>
        </div>
      )}

      {/* ====================================================================
          STICKY TOPBAR
          ==================================================================== */}
      <header
        className={`sticky top-0 z-40 h-15 px-3 sm:px-5 backdrop-blur-xl border-b flex items-center justify-between gap-2 lg:gap-4 transition-colors shrink-0 flex-nowrap ${
          theme === 'dark'
            ? 'bg-[#070B14]/85 border-slate-800/80 text-white'
            : 'bg-white/90 border-slate-200 text-slate-900 shadow-sm'
        }`}
      >
        <div className="flex items-center gap-2.5 shrink-0">
          <img
            src="/ttu_logo.png"
            alt="Texas Tech Double T"
            className="w-9 h-9 object-contain drop-shadow shrink-0"
          />
          <div className="shrink-0 min-w-0">
            <div
              className={`font-black text-sm sm:text-base tracking-tight leading-tight whitespace-nowrap ${
                theme === 'dark' ? 'text-white' : 'text-slate-900'
              }`}
            >
              Texas Tech SHARE Lab
            </div>
            <div className="text-[10px] sm:text-[11px] font-semibold text-slate-400 whitespace-nowrap">
              mBot Mega &amp; Supercharger Exhibit
            </div>
          </div>
        </div>

        {/* 4-Step Progress Stepper (Non-wrapping & Responsive) */}
        {route === 'student' && (
          <nav className="hidden lg:flex items-center gap-1.5 xl:gap-2 shrink-0 flex-nowrap">
            {[
              { n: 1 as MissionStep, full: 'Launch', short: 'Launch' },
              { n: 2 as MissionStep, full: 'Self-Driving Car', short: 'Self-Driving' },
              { n: 3 as MissionStep, full: 'Supercharger Game', short: 'Supercharger' },
              { n: 4 as MissionStep, full: 'Return to base', short: 'Return to base' },
            ].map((item, idx) => {
              const isCurrent = step === item.n;
              const isDone = step > item.n;
              return (
                <React.Fragment key={item.n}>
                  {idx > 0 && (
                    <div
                      className={`w-3 xl:w-5 h-0.5 rounded-full shrink-0 ${
                        isDone || isCurrent ? 'bg-blue-500' : theme === 'dark' ? 'bg-slate-800' : 'bg-slate-300'
                      }`}
                    />
                  )}
                  <div
                    className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1 rounded-full text-xs font-black select-none shrink-0 whitespace-nowrap ${
                      isCurrent
                        ? 'bg-blue-500/20 text-blue-500 border border-blue-400/40'
                        : isDone
                        ? 'text-emerald-500'
                        : 'text-slate-400'
                    }`}
                  >
                    <span
                      className={`w-4.5 h-4.5 rounded-full text-[10px] flex items-center justify-center font-black shrink-0 ${
                        isCurrent
                          ? 'bg-blue-500 text-white'
                          : isDone
                          ? 'bg-emerald-500 text-slate-950'
                          : theme === 'dark' ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {isDone ? <Check className="w-3 h-3 stroke-[3]" /> : item.n}
                    </span>
                    <span className="hidden xl:inline">{item.full}</span>
                    <span className="xl:hidden">{item.short}</span>
                  </div>
                </React.Fragment>
              );
            })}
          </nav>
        )}

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-nowrap">
          {/* Security Protocol Status Badge (HTTPS / TLS 1.3 Secure Context) */}
          <div
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-bold shrink-0 whitespace-nowrap ${
              typeof window !== 'undefined' && window.location.protocol === 'https:'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-400/30'
                : 'bg-amber-500/10 text-amber-400 border-amber-400/30'
            }`}
            title={
              typeof window !== 'undefined' && window.location.protocol === 'https:'
                ? 'Secure Context Active: HTTPS TLS Encryption enabled (Web Bluetooth over LAN & Anti-Interference Isolation fully active)'
                : 'Insecure Context: Served over HTTP. Start server with start_dashboard.bat to enable HTTPS.'
            }
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="hidden 2xl:inline">
              {typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'HTTPS Secured' : 'HTTP'}
            </span>
          </div>

          <div
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-bold shrink-0 whitespace-nowrap ${
              theme === 'dark'
                ? 'bg-slate-900 border-slate-800 text-slate-300'
                : 'bg-slate-100 border-slate-200 text-slate-700'
            }`}
            title="Total Cars Counted by Gate 1"
          >
            <Car className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="hidden sm:inline">Cars:</span>
            <b className={`text-xs tabular-nums ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{carCount}</b>
          </div>


          {/* Labeled ESP32 & mBot BLE Connection Status Badges on Both Pages */}
          <button
            type="button"
            onClick={async () => {
              await espRef.current?.connect(espHost);
              await espRef.current?.probe();
            }}
            title={`ESP32 Gate Controller (${espHost}) — Click to Connect / Probe`}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-extrabold transition cursor-pointer shrink-0 whitespace-nowrap ${
              espConnected
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-400/40'
                : theme === 'dark' ? 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                espConnected ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-rose-400'
              }`}
            />
            <span className="hidden xl:inline">ESP32: {espConnected ? 'Connected' : 'Offline'}</span>
            <span className="xl:hidden">ESP32</span>
          </button>

          {/* Rover BLE Status Badge: Exclusive Host Laptop Web Bluetooth with Kiosk Relay Mode */}
          <button
            type="button"
            onClick={() => {
              if (bleConnected) {
                appendLog(`[Rover BLE] Host connection active (${roverDeviceName}).`);
              } else if (remoteBleConnected) {
                appendLog(`[Rover Relay] mBot Mega is connected exclusively via Host Laptop BLE relay (${roverDeviceName}).`);
              } else if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || route === 'master')) {
                bleRef.current?.connect();
              } else {
                appendLog('[Rover Info] mBot Mega is controlled exclusively by the Host Laptop. Please pair mBot on the Host Laptop Master Console.');
              }
            }}
            title={
              bleConnected
                ? `Direct Host Web Bluetooth active (${roverDeviceName}) — Click for info`
                : remoteBleConnected
                ? `Host BLE Relay Active (${roverDeviceName}) — Kiosk signals relay via Server`
                : typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || route === 'master')
                ? 'Host Web Bluetooth — Click to Pair/Connect mBot Mega'
                : 'mBot Mega Offline — Connect exclusively on Host Laptop Master Console'
            }
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-extrabold transition cursor-pointer shrink-0 whitespace-nowrap ${
              bleConnected
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-400/40'
                : remoteBleConnected
                ? 'bg-cyan-500/15 text-cyan-400 border-cyan-400/40'
                : theme === 'dark'
                ? 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                bleConnected
                  ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                  : remoteBleConnected
                  ? 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]'
                  : 'bg-rose-400'
              }`}
            />
            <span className="hidden xl:inline">
              mBot:{' '}
              {bleConnected
                ? 'Host BLE'
                : remoteBleConnected
                ? 'Relay Active'
                : 'Offline'}
            </span>
            <span className="xl:hidden">mBot</span>
          </button>

          {/* Theme Toggle Button */}
          <button
            type="button"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            className={`p-1.5 rounded-xl border transition cursor-pointer flex items-center justify-center shrink-0 ${
              theme === 'dark'
                ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-amber-400'
                : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
            }`}
            title={`Switch to ${theme === 'dark' ? 'Light Theme' : 'Dark Mode'}`}
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => switchRoute(route === 'student' ? 'master' : 'student')}
            className={`px-3 py-1 rounded-xl border text-xs font-black flex items-center gap-1.5 transition cursor-pointer shrink-0 whitespace-nowrap ${
              theme === 'dark'
                ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
                : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>{route === 'student' ? 'Host Console' : '← Student'}</span>
          </button>
        </div>
      </header>

      {/* ====================================================================
          PAGE 1: CLEAN, FUN KID-FRIENDLY STUDENT DASHBOARD
          ==================================================================== */}
      {route === 'student' ? (
        <main className="max-w-[1520px] w-full mx-auto px-4 sm:px-6 pt-2.5 pb-6 space-y-4 flex-1">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 7 Cols: Interactive Track on top, Balanced Leaderboard below */}
            <div className="lg:col-span-7 flex flex-col gap-3.5 w-full">
              {/* 1. Interactive Rounded-Rectangle Track Canvas */}
              <div className="flex w-full">
                <CircularTrackCanvas
                  phase={phase}
                  driverName={studentName.trim() || 'STEM Explorer'}
                  lapSeconds={lapSeconds}
                  lapRunning={lapRunning}
                  gate1Open={gate1Open}
                  gate2Open={gate2Open}
                  trafficLight={trafficLight}
                  socPct={livePoint?.soc_pct ?? (phase === 'CHARGED' ? 100 : Math.round(initialSoc * 100))}
                  tempC={livePoint?.T1_C ?? 26.85}
                  simulationMode={simulationMode}
                  launchToGate1Sec={launchToGate1Sec}
                  gate2ToFinishSec={gate2ToFinishSec}
                  theme={theme}
                  onInspectRover={(partId) => {
                    setExplorerInitialPart((partId as MbotPartId) || null);
                    setExplorerOpen(true);
                  }}
                  onInspectGate={(partId) => {
                    setGateInitialPart(partId || null);
                    setGateExplorerOpen(true);
                  }}
                  onOpenScience={(topic) => setScienceTopic(topic)}
                />
              </div>

              {/* 2. Balanced Top-3 Leaderboard Card Below Track */}
              <div
                className={`p-5 sm:p-5.5 rounded-3xl border transition-colors ${
                  theme === 'dark'
                    ? 'bg-[#11182D] border-slate-800/90'
                    : 'bg-white border-slate-200 shadow-md shadow-slate-200/50'
                }`}
              >
                {/* Header row */}
                <div className="flex items-center justify-between gap-2 mb-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-400/35 flex items-center justify-center text-amber-500 shrink-0 shadow-sm">
                      <Trophy className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-[11px] font-extrabold uppercase tracking-wider text-amber-500">
                        STEM Night Leaderboard
                      </div>
                      <h3 className={`text-base font-black ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                        Top 3 Supercharger Champions
                      </h3>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div
                      className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-extrabold border ${
                        theme === 'dark'
                          ? 'bg-slate-900/90 border-slate-800 text-slate-300'
                          : 'bg-slate-100 border-slate-200 text-slate-700'
                      }`}
                    >
                      <Car className="w-3.5 h-3.5 text-blue-400" />
                      <span>{carCount} Total Cars</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setLeaderboardModalOpen(true)}
                      className={`flex items-center gap-1 px-3.5 py-1.5 rounded-xl text-xs font-black border transition cursor-pointer ${
                        theme === 'dark'
                          ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-amber-400 hover:border-amber-400/40'
                          : 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900 shadow-sm'
                      }`}
                      title="Click to view full all games scorecard"
                    >
                      <span>All Scores ({leaderboard.length})</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Top 3 Podium Cards */}
                {leaderboard.length === 0 ? (
                  <div
                    onClick={() => setLeaderboardModalOpen(true)}
                    className={`py-8 px-6 text-center text-xs sm:text-sm font-semibold border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer transition ${
                      theme === 'dark'
                        ? 'text-slate-400 border-slate-800 bg-slate-950/40 hover:border-slate-700'
                        : 'text-slate-500 border-slate-200 bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-500 text-xl">
                      🏁
                    </div>
                    <div className="font-extrabold text-sm text-slate-200">Ready for Drivers!</div>
                    <div>Complete a mission lap to claim #1 on the STEM Night Podium! (Click to view full scorecard)</div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[0, 1, 2].map((slotIdx) => {
                      const entry = leaderboard[slotIdx];
                      if (!entry) {
                        return (
                          <div
                            key={`empty-${slotIdx}`}
                            onClick={() => setLeaderboardModalOpen(true)}
                            className={`p-3.5 sm:p-4 rounded-2xl border border-dashed flex flex-col justify-between gap-2.5 text-xs cursor-pointer transition ${
                              theme === 'dark'
                                ? 'border-slate-800 bg-slate-950/30 text-slate-400 opacity-70 hover:border-slate-700'
                                : 'border-slate-300 bg-slate-50 text-slate-600 hover:border-slate-400'
                            }`}
                            title="Click to view all games scorecard"
                          >
                            <div className="flex items-center gap-2.5">
                              <span
                                className={`w-8 h-8 rounded-xl text-xs font-black border border-dashed flex items-center justify-center shrink-0 ${
                                  theme === 'dark' ? 'border-slate-700 text-slate-400' : 'border-slate-300 text-slate-700'
                                }`}
                              >
                                {slotIdx === 0 ? '1st' : slotIdx === 1 ? '2nd' : '3rd'}
                              </span>
                              <div>
                                <div className="font-bold text-sm">Open Spot</div>
                                <div className="text-[10px] text-slate-500">Race to claim!</div>
                              </div>
                            </div>
                            <div className="pt-2 border-t border-dashed border-slate-800 text-[10px] text-slate-500">
                              ⚡ Fast-charge &amp; race clean to rank!
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div
                          key={entry.id}
                          onClick={() => setLeaderboardModalOpen(true)}
                          className={`p-3.5 sm:p-4 rounded-2xl border flex flex-col justify-between gap-2.5 cursor-pointer transition ${
                            theme === 'dark'
                              ? 'bg-slate-900/90 border-slate-800 hover:border-amber-500/50 hover:bg-slate-800'
                              : 'bg-slate-50 border-slate-200 hover:border-amber-400 hover:bg-amber-50/30 shadow-sm'
                          }`}
                          title="Click to view full race telemetry scorecard"
                        >
                          {/* Top Row: Rank Badge + Driver Name + Lap Time */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`w-8 h-8 rounded-xl text-xs font-black tracking-tight flex items-center justify-center shrink-0 ${
                                  slotIdx === 0
                                    ? theme === 'dark'
                                      ? 'bg-amber-400/25 text-amber-300 border border-amber-400/50 shadow-sm'
                                      : 'bg-amber-100 text-amber-800 border border-amber-300'
                                    : slotIdx === 1
                                    ? theme === 'dark'
                                      ? 'bg-slate-400/20 text-slate-200 border border-slate-400/40'
                                      : 'bg-slate-200 text-slate-800 border border-slate-300'
                                    : theme === 'dark'
                                    ? 'bg-amber-700/25 text-amber-400 border border-amber-700/50'
                                    : 'bg-amber-100 text-amber-900 border border-amber-300'
                                }`}
                              >
                                {slotIdx === 0 ? '1st' : slotIdx === 1 ? '2nd' : '3rd'}
                              </span>
                              <div className="min-w-0">
                                <div className={`text-sm font-black truncate ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                                  {entry.name || 'STEM Explorer'}
                                </div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                  {slotIdx === 0 ? '🏆 Leader' : slotIdx === 1 ? '🥈 2nd Place' : '🥉 3rd Place'}
                                </div>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <div
                                className={`px-2.5 py-1 rounded-xl text-xs sm:text-sm font-black tabular-nums border ${
                                  slotIdx === 0
                                    ? theme === 'dark'
                                      ? 'bg-amber-400/20 border-amber-400/50 text-amber-300'
                                      : 'bg-amber-100 border-amber-300 text-amber-900'
                                    : slotIdx === 1
                                    ? theme === 'dark'
                                      ? 'bg-slate-300/20 border-slate-400/40 text-slate-200'
                                      : 'bg-slate-200 border-slate-300 text-slate-800'
                                    : theme === 'dark'
                                    ? 'bg-amber-700/20 border-amber-600/40 text-amber-400'
                                    : 'bg-amber-50 border-amber-300 text-amber-800'
                                }`}
                              >
                                {entry.total_points ?? 500} pts
                              </div>
                              <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                                Try #{entry.attempt_num ?? 1}
                              </div>
                            </div>
                          </div>

                          {/* Bottom Row: Telemetry Stats Badges */}
                          <div className={`pt-2 border-t flex items-center justify-between text-[11px] font-bold ${
                            theme === 'dark' ? 'border-slate-800/80 text-slate-400' : 'border-slate-200 text-slate-600'
                          }`}>
                            <div className="flex items-center gap-1">
                              <Zap className="w-3 h-3 text-amber-400" />
                              <span>{entry.current_mA ?? 3000} mA</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Timer className="w-3 h-3 text-blue-400" />
                              <span>{entry.charge_time_min ?? 30}m</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Flame className="w-3 h-3 text-red-400" />
                              <span>{Number(entry.peak_temp_C ?? 42).toFixed(1)}°C</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Bottom Ticker Bar */}
                <div className={`mt-3.5 pt-3 border-t flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold ${
                  theme === 'dark' ? 'border-slate-800/80 text-slate-400' : 'border-slate-200 text-slate-600'
                }`}>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Live Timing · Auto-updates upon crossing Finish Line</span>
                  </div>
                  <div className="flex items-center gap-1 text-amber-500">
                    <Trophy className="w-3 h-3" />
                    <span>Click any driver to view full scorecard</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right 5 Cols: Focused, Low-Text Step-by-Step Mission Panel */}
            <div
              className={`lg:col-span-5 p-6 sm:p-7 rounded-3xl border shadow-2xl flex flex-col justify-between min-h-[540px] transition-colors ${
                theme === 'dark'
                  ? 'bg-[#11182D] border-slate-800/90'
                  : 'bg-white border-slate-200 shadow-slate-200/50'
              }`}
            >
              {/* STEP 1: LAUNCH */}
              {step === 1 && (
                <div className="flex flex-col justify-between h-full space-y-5 animate-fadeIn">
                  <div className="space-y-2.5">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/15 border border-blue-400/30 text-[11px] font-extrabold uppercase tracking-wider text-blue-500">
                      Ready to Race!
                    </div>
                    <h1
                      className={`text-2xl sm:text-3xl font-black tracking-tight leading-tight ${
                        theme === 'dark' ? 'text-white' : 'text-slate-900'
                      }`}
                    >
                      Drive &amp; Supercharge the Rover!
                    </h1>
                    <p className={`text-sm leading-relaxed ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>
                      Texas Tech SHARE Lab • Send the robot car around the track, trigger the sound-wave gate, and fast-charge its battery safely!
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      className={`text-xs font-extrabold ${
                        theme === 'dark' ? 'text-slate-300' : 'text-slate-700'
                      }`}
                    >
                      Your Name or Team Name
                    </label>
                    <input
                      type="text"
                      maxLength={24}
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      placeholder="Type your name here..."
                      className={`w-full px-4 py-3.5 rounded-2xl border font-bold text-base focus:outline-none focus:border-blue-500 transition ${
                        theme === 'dark'
                          ? 'bg-slate-950/90 border-slate-700/80 text-white'
                          : 'bg-slate-50 border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>

                  {/* VISUAL GAME OVERVIEW DIAGRAM */}
                  <GameOverviewDiagram theme={theme} />

                  <button
                    type="button"
                    onClick={handleStartMission}
                    className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-base shadow-xl shadow-blue-600/30 flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Play className="w-5 h-5 fill-white" /> 🚀 Start Rover Mission!
                  </button>
                </div>
              )}

              {/* STEP 2: AUTONOMOUS DRIVE & GATE 1 */}
              {step === 2 && (
                <div className="flex flex-col justify-between h-full space-y-5 animate-fadeIn">
                  <div>
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-blue-500">
                      On the Track
                    </div>
                    <h2
                      className={`text-2xl font-black mt-1 ${
                        theme === 'dark' ? 'text-white' : 'text-slate-900'
                      }`}
                    >
                      {countdownSec !== null
                        ? `Launching in ${countdownSec}...`
                        : phase === 'WAITING_GATE1'
                        ? 'Stopped at Supercharger Gate 1!'
                        : 'Cruising to the Charger!'}
                    </h2>
                  </div>

                  <div className="flex flex-col items-center justify-center py-6">
                    <div className="w-32 h-32 rounded-full bg-blue-500/15 border-2 border-blue-400/50 flex items-center justify-center text-5xl font-black shadow-inner">
                      {countdownSec !== null ? countdownSec : '🤖'}
                    </div>
                    <p
                      className={`text-sm text-center max-w-sm mt-4 leading-relaxed ${
                        theme === 'dark' ? 'text-slate-300' : 'text-slate-600'
                      }`}
                    >
                      {countdownSec !== null
                        ? 'Put the rover on the white track at the Start Line!'
                        : 'Watch the rover steer itself around the corners and trigger Gate 1’s ultrasonic sound sensor!'}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-400/25 space-y-1">
                    <div className="text-xs font-extrabold text-blue-500 flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-amber-500" /> Supercharger Gate 1 Active!
                    </div>
                    <p
                      className={`text-xs leading-relaxed ${
                        theme === 'dark' ? 'text-slate-300' : 'text-slate-700'
                      }`}
                    >
                      Gate 1 bounces ultrasonic sound waves off the car, detects vehicle arrival, and turns the light <b>Red → Yellow → Green</b>!
                    </p>
                  </div>

                  <div
                    className={`p-3.5 rounded-2xl border flex items-center justify-center gap-2.5 text-xs font-extrabold ${
                      theme === 'dark'
                        ? 'bg-slate-900/60 border-slate-800 text-blue-400'
                        : 'bg-slate-50 border-slate-200 text-blue-600'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                    <span>Live Tracking: Autonomous line-following in progress...</span>
                  </div>
                </div>
              )}

              {/* STEP 3: 10s EV BATTERY SUPERCHARGER GAME */}
              {step === 3 && (
                <BatterySuperchargerView
                  initialSoc={initialSoc}
                  targetMinutes={targetMinutes}
                  currentMa={currentMa}
                  setCurrentMa={handleUpdateCurrentMa}
                  isCharging={isCharging}
                  livePoint={livePoint}
                  liveSeries={liveSeries}
                  lastSummary={lastSummary}
                  theme={theme}
                  attemptCount={attemptCount}
                  onStartCharge={handleStartSupercharge}
                  onPlayGame={handleStartSuperchargerGame}
                />
              )}

              {/* STEP 4: FINISH LINE POINTS SCORECARD & CELEBRATION */}
              {step === 4 && (() => {
                const attNum = Math.min(5, Math.max(1, attemptCountRef.current));
                const attPts = Math.max(0, 600 - attNum * 100);
                const peakTemp = Number(
                  lastSummary?.peak_T1_C ??
                    lastSummaryRef.current?.peak_T1_C ??
                    runClientBatterySimulation(currentMa, targetMinutes, initialSoc, 10.0).summary.peak_T1_C
                );
                const chargeTime =
                  lastSummary?.time_to_full_min ?? lastSummaryRef.current?.time_to_full_min ?? targetMinutes;
                const { timeSavedMin: timeSaved, timeBonusPoints: timeBonus } = calculateSpeedBonusPoints(
                  targetMinutes,
                  chargeTime,
                  initialSoc
                );
                const totalPts = attPts + timeBonus;

                return (
                  <div className="flex flex-col justify-between h-full space-y-4 text-center animate-fadeIn">
                    <div className="space-y-1.5">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-3xl bg-gradient-to-br from-amber-400/25 to-purple-500/25 border border-amber-400/40 flex items-center justify-center text-4xl shadow-lg shadow-amber-500/20">
                        🏆
                      </div>
                      <div className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-500">
                        Mission Complete · Finish Line Crossed!
                      </div>
                      <h2
                        className={`text-xl sm:text-2xl font-black ${
                          theme === 'dark' ? 'text-white' : 'text-slate-900'
                        }`}
                      >
                        Awesome Job, {studentName.trim() || 'STEM Explorer'}!
                      </h2>
                    </div>

                    {/* HERO SCORECARD DISPLAY */}
                    <div
                      className={`p-4 sm:p-5 rounded-3xl border transition-colors ${
                        theme === 'dark'
                          ? 'bg-gradient-to-br from-amber-500/15 via-slate-900 to-purple-500/15 border-amber-400/35'
                          : 'bg-gradient-to-br from-amber-50 via-white to-purple-50 border-amber-300 shadow-md'
                      }`}
                    >
                      <div className={`text-xs font-black uppercase tracking-wider ${theme === 'dark' ? 'text-amber-400' : 'text-amber-700'}`}>
                        Total Scorecard Points
                      </div>
                      <div
                        className={`text-5xl sm:text-6xl font-black tabular-nums mt-1 leading-none ${
                          theme === 'dark' ? 'text-amber-300' : 'text-amber-900'
                        }`}
                      >
                        {totalPts}
                        <span className={`text-2xl ml-2 font-black ${theme === 'dark' ? 'text-amber-400/80' : 'text-amber-600'}`}>
                          Pts
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-center gap-2">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-black border ${
                            totalPts >= 600
                              ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-sm'
                              : totalPts >= 450
                              ? 'bg-blue-600 text-white border-blue-400'
                              : 'bg-emerald-600 text-white border-emerald-400'
                          }`}
                        >
                          {totalPts >= 650
                            ? '🌟 Gold Tier STEM Champion!'
                            : totalPts >= 450
                            ? '🚀 Silver Tier High Efficiency!'
                            : '⚡ Bronze Tier Finisher!'}
                        </span>
                      </div>
                    </div>

                    {/* SCORE BREAKDOWN GRID */}
                    <div className="grid grid-cols-2 gap-2.5 text-left">
                      {/* Attempt Points */}
                      <div
                        className={`p-3 rounded-2xl border ${
                          theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200 shadow-sm'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-bold uppercase ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                            🎯 Attempt Score
                          </span>
                          <span className={`text-[10px] font-extrabold ${theme === 'dark' ? 'text-amber-400' : 'text-amber-600'}`}>
                            Try #{attNum} of 5
                          </span>
                        </div>
                        <div className={`text-xl font-black mt-1 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                          {attPts} <span className="text-xs text-slate-400">pts</span>
                        </div>
                      </div>

                      {/* Time Bonus */}
                      <div
                        className={`p-3 rounded-2xl border ${
                          theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200 shadow-sm'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-bold uppercase ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                            ⏱️ Speed Bonus
                          </span>
                          <span className="text-[10px] font-extrabold text-emerald-500">
                            +{timeSaved.toFixed(1)}m saved
                          </span>
                        </div>
                        <div className="text-xl font-black text-emerald-500 mt-1">
                          +{timeBonus} <span className="text-xs text-emerald-600">pts</span>
                        </div>
                      </div>

                      {/* Battery Full */}
                      <div
                        className={`p-3 rounded-2xl border ${
                          theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200 shadow-sm'
                        }`}
                      >
                        <div className={`text-[10px] font-bold uppercase ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                          🔋 Charge Delivered
                        </div>
                        <div className="text-base font-black text-blue-500 mt-1 truncate">
                          100% Full ({currentMa} mA)
                        </div>
                      </div>

                      {/* Peak Heat */}
                      <div
                        className={`p-3 rounded-2xl border ${
                          theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200 shadow-sm'
                        }`}
                      >
                        <div className={`text-[10px] font-bold uppercase ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                          🌡️ Peak Heat
                        </div>
                        <div className={`text-base font-black mt-1 ${peakTemp < 58 ? 'text-emerald-500' : 'text-amber-500'}`}>
                          {peakTemp.toFixed(1)}°C <span className="text-[10px] font-bold text-slate-400">(&lt; 61.9°C)</span>
                        </div>
                      </div>
                    </div>

                    <div
                      className={`p-3 rounded-2xl border text-left flex items-center justify-between text-xs ${
                        theme === 'dark'
                          ? 'bg-purple-500/10 border-purple-400/30 text-purple-300'
                          : 'bg-purple-50 border-purple-200 text-purple-900 shadow-sm'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span>🏁</span>
                        <span className="font-extrabold">Lap Celebration Active!</span>
                      </div>
                      <span className="font-bold opacity-80">Charging Time: {lapSeconds.toFixed(1)}s</span>
                    </div>

                    <button
                      type="button"
                      onClick={handleResetNextStudent}
                      className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white font-black text-base flex items-center justify-center gap-2.5 transition cursor-pointer shadow-lg shadow-emerald-500/25 active:scale-[0.99]"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                      <span>Complete Mission</span>
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* ==================================================================
              FULL-WIDTH BOTTOM: HOW DOES THE SYSTEM WORK? (INTERACTIVE STEM CARDS)
              ================================================================== */}
          <div
            className={`p-6 sm:p-7 rounded-3xl border space-y-5 transition-colors ${
              theme === 'dark'
                ? 'bg-[#11182D] border-slate-800/90'
                : 'bg-white border-slate-200 shadow-xl shadow-slate-200/50'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-blue-500">
                  Texas Tech SHARE Lab • Tap &amp; Discover Interactive Deep Views
                </div>
                <h3
                  className={`text-xl font-black ${
                    theme === 'dark' ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  How Does the System Work?
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setExplorerInitialPart(null);
                    setExplorerOpen(true);
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold border transition cursor-pointer ${
                    theme === 'dark'
                      ? 'bg-blue-600/20 hover:bg-blue-600/30 border-blue-400/40 text-blue-400'
                      : 'bg-blue-50 hover:bg-blue-100 border-blue-300 text-blue-700 shadow-sm'
                  }`}
                >
                  🤖 Inside Car Deep View
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGateInitialPart(null);
                    setGateExplorerOpen(true);
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold border transition cursor-pointer ${
                    theme === 'dark'
                      ? 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-400/40 text-amber-500'
                      : 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-800 shadow-sm'
                  }`}
                >
                  ⚡ Inside Gate Deep View
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <button
                type="button"
                onClick={() => {
                  setExplorerInitialPart(null);
                  setExplorerOpen(true);
                }}
                className={`p-5 rounded-2xl border text-left transition group cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-slate-900/85 hover:bg-slate-800/90 border-slate-800 hover:border-blue-500/50'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200 hover:border-blue-400 shadow-sm'
                }`}
              >
                <div className="w-11 h-11 rounded-xl bg-blue-500/15 border border-blue-400/30 flex items-center justify-center text-blue-500 mb-3.5">
                  <Cpu className="w-6 h-6" />
                </div>
                <div
                  className={`text-base font-extrabold group-hover:text-blue-400 ${
                    theme === 'dark' ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  Inside the Car
                </div>
                <p className={`text-xs mt-1.5 leading-relaxed ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                  Explore the 7 sensors, MegaPi brain, crab-slide mecanum wheels &amp; rainbow LEDs!
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setGateInitialPart(null);
                  setGateExplorerOpen(true);
                }}
                className={`p-5 rounded-2xl border text-left transition group cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-slate-900/85 hover:bg-slate-800/90 border-slate-800 hover:border-amber-500/50'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200 hover:border-amber-400 shadow-sm'
                }`}
              >
                <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-500 mb-3.5">
                  <Zap className="w-6 h-6" />
                </div>
                <div
                  className={`text-base font-extrabold group-hover:text-amber-500 ${
                    theme === 'dark' ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  Supercharger Gate
                </div>
                <p className={`text-xs mt-1.5 leading-relaxed ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                  ESP32 CPU, ultrasonic bat sonar, dual barrier servos, signal LEDs &amp; WiFi!
                </p>
              </button>

              <button
                type="button"
                onClick={() => setScienceTopic('battery')}
                className={`p-5 rounded-2xl border text-left transition group cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-slate-900/85 hover:bg-slate-800/90 border-slate-800 hover:border-amber-500/50'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200 hover:border-amber-400 shadow-sm'
                }`}
              >
                <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-500 mb-3.5">
                  <Gauge className="w-6 h-6" />
                </div>
                <div
                  className={`text-base font-extrabold group-hover:text-amber-500 ${
                    theme === 'dark' ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  Battery Tank Math
                </div>
                <p className={`text-xs mt-1.5 leading-relaxed ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                  How to calculate current (mA), capacity (mAh), and charge time to beat the clock!
                </p>
              </button>

              <button
                type="button"
                onClick={() => setScienceTopic('thermal')}
                className={`p-5 rounded-2xl border text-left transition group cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-slate-900/85 hover:bg-slate-800/90 border-slate-800 hover:border-red-500/50'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200 hover:border-red-400 shadow-sm'
                }`}
              >
                <div className="w-11 h-11 rounded-xl bg-red-500/15 border border-red-400/30 flex items-center justify-center text-red-500 mb-3.5">
                  <Flame className="w-6 h-6" />
                </div>
                <div
                  className={`text-base font-extrabold group-hover:text-red-500 ${
                    theme === 'dark' ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  Beat the Heat!
                </div>
                <p className={`text-xs mt-1.5 leading-relaxed ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                  Internal resistance I²R heating: why charging too fast overheats the battery!
                </p>
              </button>
            </div>
          </div>
        </main>
      ) : (
        /* ==================================================================
            PAGE 2: MASTER MANUAL OVERRIDE, SIMULATION MODE & ANALYTICS CONSOLE
            ================================================================== */
        <MasterHostConsole
          isAuthenticated={masterAuthed}
          onLogin={async (pw) => {
            if (pw.trim() === 'mbot26') {
              setMasterAuthed(true);
              return true;
            }
            try {
              const r = await fetch('/api/master/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: pw.trim() }),
              });
              const d = await r.json();
              if (d.ok) {
                setMasterAuthed(true);
                return true;
              }
            } catch {
              // ignore
            }
            return false;
          }}
          paused={paused}
          simulationMode={simulationMode}
          onToggleSimulationMode={() => {
            const next = !simulationMode;
            setSimulationMode(next);
            pushServerState({ simulation_mode: next });
            appendLog(`[SIM] Simulation Mode turned ${next ? 'ON' : 'OFF'}`);
          }}
          onRunSimulatedMissionStep={handleRunSimulatedMissionStep}
          carCount={carCount}
          gateState={gateStateText}
          ultrasonicCm={ultrasonicCm}
          lockoutSec={lockoutSec}
          bleConnected={bleConnected || remoteBleConnected}
          espConnected={espConnected}
          espHost={espHost}
          setEspHost={setEspHost}
          onConnectBle={() => bleRef.current?.connect()}
          onUnlockBle={() => bleRef.current?.unlockRover()}
          lockedRoverName={bleRef.current?.lockedDeviceName || (remoteBleConnected ? roverDeviceName : null)}
          onSendBleChar={(ch) => dispatchRoverChar(ch)}
          onSendBleText={(txt) => dispatchRoverText(txt)}
          onConnectEsp={async () => {
            await espRef.current?.connect(espHost);
            await espRef.current?.probe();
          }}
          onSendEspCmd={async (cmd) => {
            const ok = await espRef.current?.sendCommand(cmd);
            if (ok) setEspConnected(true);
          }}
          onTriggerAllStop={() => {
            dispatchRoverEmergencyStop();
            dispatchRoverChar('2');
            dispatchRoverChar(' ');
            try {
              void espRef.current?.sendCommand('RESET_GATES').catch(() => {});
            } catch {}
            setAllStopActive(true);
            setPaused(true);
            setLapRunning(false);
            pushServerState({
              all_stop: true,
              paused: true,
              last_event: 'MASTER_ALL_STOP',
            });
          }}
          onStopMission={() => {
            dispatchRoverEmergencyStop();
            dispatchRoverChar('2');
            dispatchRoverChar(' ');
            handleResetNextStudent();
            setStep(1);
            setPhase('STANDBY');
            pushServerState({
              active_phase: 'STANDBY',
              gate1_open: false,
              gate2_open: false,
              last_event: 'MISSION_ABORT',
            });
          }}
          onTogglePause={() => {
            const next = !paused;
            setPaused(next);
            if (!next) setAllStopActive(false);
            if (next) dispatchRoverChar(' ');
            pushServerState({
              paused: next,
              all_stop: false,
              last_event: next ? 'MASTER_PAUSE' : 'MASTER_RESUME',
            });
          }}
          onResetLapAndGate1={() => {
            setPaused(false);
            setAllStopActive(false);
            dispatchRoverEmergencyStop();
            dispatchRoverChar('2');
            dispatchRoverChar(' ');
            handleResetNextStudent();
            setStep(1);
            setPhase('STANDBY');
            try {
              void espRef.current?.sendCommand('RESET_LOCKOUT').catch(() => {});
              void espRef.current?.sendCommand('RESET_GATES').catch(() => {});
            } catch {}
            pushServerState({
              paused: false,
              all_stop: false,
              active_phase: 'STANDBY',
              gate1_open: false,
              gate2_open: false,
              gate1_lockout_sec: 0,
              lap_elapsed_sec: 0,
              last_event: 'MASTER_RESET',
            });
          }}
          onResetCarCount={() => {
            setCarCount(0);
            carCountRef.current = 0;
            localStorage.setItem('dashboard_car_count', '0');
            pushServerState({ car_count: 0 });
          }}
          onJumpStep={(s) => setStep(s)}
          launchToGate1Sec={launchToGate1Sec}
          gate2ToFinishSec={gate2ToFinishSec}
          onSaveSegmentTimers={handleSaveSegmentTimers}
          leaderboard={leaderboard}
          onDeleteScore={async (id) => {
            await fetch('/api/leaderboard/delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id }),
            });
            fetchLeaderboardAndHistory();
          }}
          onClearLeaderboard={async () => {
            await fetch('/api/leaderboard/clear', { method: 'POST', body: '{}' });
            fetchLeaderboardAndHistory();
          }}
          gameHistory={gameHistory}
          onRefreshHistory={fetchLeaderboardAndHistory}
          onClearHistory={async () => {
            await fetch('/api/games/clear', { method: 'POST', body: '{}' });
            fetchLeaderboardAndHistory();
          }}
          onGenerateDemoRun={async () => {
            await fetch('/api/battery/simulate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                current_mA: 3800,
                target_minutes: 30,
                real_duration_sec: 10.0,
                student_name: 'Sample Physics Run',
                lap_time_sec: 21.4,
                record_history: true,
              }),
            });
            fetchLeaderboardAndHistory();
          }}
          logs={logs}
          theme={theme}
        />
      )}

      {/* ====================================================================
          ALL GAMES SCORECARD MODAL (Reveals all runs when top-3 strip is clicked)
          ==================================================================== */}
      {leaderboardModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-fadeIn">
          <div
            className={`w-full max-w-2xl rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[85vh] transition-colors ${
              theme === 'dark'
                ? 'bg-[#11182D] border-slate-800 text-slate-100'
                : 'bg-white border-slate-200 text-slate-900 shadow-slate-300/50'
            }`}
          >
            {/* Modal Header */}
            <div
              className={`p-5 sm:p-6 border-b flex items-center justify-between gap-4 ${
                theme === 'dark' ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-500 shrink-0">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-amber-500">
                    STEM Night Hall of Fame
                  </div>
                  <h3 className={`text-xl font-black ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                    All Games Scorecard ({leaderboard.length} Missions)
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setLeaderboardModalOpen(false)}
                className={`w-9 h-9 rounded-xl border flex items-center justify-center transition cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                    : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                }`}
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Summary Pill Bar */}
            <div
              className={`px-6 py-3 border-b flex flex-wrap items-center justify-between gap-3 text-xs font-bold ${
                theme === 'dark'
                  ? 'bg-slate-950/60 border-slate-800/80 text-slate-300'
                  : 'bg-slate-100/60 border-slate-200 text-slate-700'
              }`}
            >
              <span>🚗 Total Completed Cars: <b className={theme === 'dark' ? 'text-white' : 'text-slate-900'}>{carCount}</b></span>
              <span>
                🏆 High Score:{' '}
                <b className="text-amber-400 font-black">
                  {leaderboard.length > 0 ? `${leaderboard[0].total_points ?? 500} pts` : '--'}
                </b>
              </span>
              <span>
                🥇 #1 Leader:{' '}
                <b className={theme === 'dark' ? 'text-amber-400' : 'text-amber-600'}>
                  {leaderboard.length > 0 ? (leaderboard[0].name || 'STEM Explorer') : 'None yet'}
                </b>
              </span>
            </div>

            {/* Scrollable Scores List */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-2.5 flex-1">
              {leaderboard.length === 0 ? (
                <div
                  className={`py-12 text-center text-xs font-semibold border border-dashed rounded-2xl ${
                    theme === 'dark' ? 'text-slate-400 border-slate-800 bg-slate-950/40' : 'text-slate-500 border-slate-200 bg-slate-50'
                  }`}
                >
                  <Trophy className="w-8 h-8 text-amber-500 mx-auto mb-2 opacity-50" />
                  No completed runs recorded yet! Send the rover around the track to set the first score!
                </div>
              ) : (
                leaderboard.map((entry, idx) => (
                  <div
                    key={entry.id}
                    className={`px-4 py-3 rounded-2xl border flex items-center justify-between gap-3 transition-colors ${
                      theme === 'dark'
                        ? 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                        : 'bg-slate-50 border-slate-200 hover:border-slate-300 shadow-sm'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-9 h-8 rounded-xl text-xs font-black flex items-center justify-center shrink-0 ${
                          idx === 0
                            ? 'bg-amber-400 text-slate-950 shadow-sm'
                            : idx === 1
                            ? 'bg-slate-300 text-slate-950 shadow-sm'
                            : idx === 2
                            ? 'bg-amber-700 text-white shadow-sm'
                            : theme === 'dark'
                            ? 'bg-slate-800 text-slate-300'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {idx === 0 ? '1st' : idx === 1 ? '2nd' : idx === 2 ? '3rd' : `#${idx + 1}`}
                      </span>
                      <div className="min-w-0">
                        <div
                          className={`text-sm font-extrabold truncate ${
                            theme === 'dark' ? 'text-white' : 'text-slate-900'
                          }`}
                        >
                          {entry.name || 'STEM Explorer'}
                        </div>
                        <div className={`text-xs flex flex-wrap items-center gap-1.5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                          <span>Attempt #{entry.attempt_num ?? 1}</span>
                          <span>•</span>
                          <span className="text-emerald-500 font-bold">+{entry.time_bonus_points ?? 0} time bonus</span>
                          <span>•</span>
                          <span>{entry.charge_time_min ?? 30}m charge</span>
                          <span>•</span>
                          <span>{Number(entry.peak_temp_C ?? 42).toFixed(1)}°C peak</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 pl-3">
                      <div
                        className={`text-lg font-black tabular-nums ${
                          idx === 0
                            ? 'text-amber-400'
                            : idx === 1
                            ? 'text-slate-200'
                            : idx === 2
                            ? 'text-amber-500'
                            : theme === 'dark'
                            ? 'text-emerald-400'
                            : 'text-emerald-600'
                        }`}
                      >
                        {entry.total_points ?? 500}
                        <span className="text-xs ml-1 font-bold">pts</span>
                      </div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Total Score
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div
              className={`p-4 border-t flex items-center justify-end ${
                theme === 'dark' ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <button
                type="button"
                onClick={() => setLeaderboardModalOpen(false)}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs transition cursor-pointer shadow-md"
              >
                Close Scorecard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          2-LEVEL INTERACTIVE mBot MEGA HARDWARE EXPLORER MODAL
          ==================================================================== */}
      <MbotAnatomyModal
        isOpen={explorerOpen}
        initialPartId={explorerInitialPart}
        onClose={() => setExplorerOpen(false)}
        theme={theme}
      />

      {/* ====================================================================
          SUPERCHARGER GATE HARDWARE EXPLORER MODAL (ESP32, SERVOS, SONAR, LEDS, BUZZER, WIFI)
          ==================================================================== */}
      <GateAnatomyModal
        isOpen={gateExplorerOpen}
        initialPartId={gateInitialPart}
        onClose={() => setGateExplorerOpen(false)}
        theme={theme}
      />

      {/* ====================================================================
          SHORT, FUN SCIENCE POPUP MODAL (Ultrasonic / Battery / Thermal)
          LANDSCAPE 2-COLUMN DEEP VIEW WITH SOLVE MATH ON THE RIGHT
          ==================================================================== */}
      {activeScience && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) setScienceTopic(null);
          }}
        >
          <div
            className={`relative w-full max-w-4xl lg:max-w-5xl p-6 sm:p-8 rounded-3xl border shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto ${
              theme === 'dark'
                ? 'bg-[#0D1326] border-slate-700 text-white'
                : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setScienceTopic(null)}
              className={`absolute top-5 right-5 w-9 h-9 rounded-xl flex items-center justify-center transition cursor-pointer z-10 ${
                theme === 'dark'
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header */}
            <div className="pr-12">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-500">
                {activeScience.badge}
              </span>
              <h2 className="text-xl sm:text-2xl font-black mt-1">{activeScience.title}</h2>
              <p className={`text-xs sm:text-sm mt-1 font-semibold ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                {activeScience.subtitle}
              </p>
            </div>

            {/* Landscape 2-Column Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
              {/* Left Column: Concept, Steps, Formula & Fun Fact */}
              <div className="flex flex-col justify-between space-y-4">
                <p
                  className={`text-sm leading-relaxed ${
                    theme === 'dark' ? 'text-slate-200' : 'text-slate-600'
                  }`}
                >
                  {activeScience.lead}
                </p>

                <div className="space-y-2.5">
                  {activeScience.steps.map((s, idx) => (
                    <div
                      key={idx}
                      className={`p-3.5 rounded-2xl border flex gap-3 text-xs font-semibold leading-relaxed ${
                        theme === 'dark'
                          ? 'bg-slate-900/90 border-slate-800 text-slate-200'
                          : 'bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                    >
                      <span className="w-5 h-5 rounded-lg bg-blue-500/20 text-blue-500 font-black flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span>{s}</span>
                    </div>
                  ))}
                </div>

                <div
                  className={`p-3.5 rounded-2xl border font-extrabold text-xs text-center ${
                    theme === 'dark'
                      ? 'bg-slate-950 border-slate-800 text-blue-400'
                      : 'bg-blue-50 border-blue-200 text-blue-700'
                  }`}
                >
                  ⚡ {activeScience.formula}
                </div>

                <div
                  className={`p-3.5 rounded-2xl border text-xs ${
                    theme === 'dark'
                      ? 'bg-amber-500/10 border-amber-400/30 text-amber-200'
                      : 'bg-amber-50 border-amber-300 text-amber-900'
                  }`}
                >
                  <b>💡 Fun Fact:</b> {activeScience.fact}
                </div>
              </div>

              {/* Right Column: Step-by-Step Solve Math Card */}
              {activeScience.solveExample && (
                <div
                  className={`p-5 rounded-2xl border text-xs flex flex-col justify-between space-y-3 ${
                    theme === 'dark'
                      ? 'bg-slate-900/95 border-amber-500/40 text-slate-200'
                      : 'bg-amber-50/70 border-amber-300 text-slate-800'
                  }`}
                >
                  <div className="font-extrabold text-xs flex items-center justify-between text-amber-500">
                    <span className="flex items-center gap-1.5 text-sm">
                      <span>📐</span>
                      <span>{activeScience.solveExample.title}</span>
                    </span>
                    <span className="text-[10px] uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-black">
                      Solve Math
                    </span>
                  </div>

                  <p className={`text-xs leading-relaxed italic ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>
                    "{activeScience.solveExample.scenario}"
                  </p>

                  <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/25 font-mono text-xs text-blue-400 font-bold">
                    ⚡ Formula: {activeScience.solveExample.formula}
                  </div>

                  <div className="space-y-1 text-xs">
                    <div className={`font-bold ${theme === 'dark' ? 'text-slate-200' : 'text-slate-700'}`}>Given Values:</div>
                    {activeScience.solveExample.given.map((g, gIdx) => (
                      <div key={gIdx} className={`pl-2 border-l-2 border-blue-500/40 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>
                        • {g}
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1 text-xs">
                    <div className={`font-bold ${theme === 'dark' ? 'text-slate-200' : 'text-slate-700'}`}>Calculation Steps:</div>
                    {activeScience.solveExample.steps.map((st, sIdx) => (
                      <div key={sIdx} className="font-mono text-emerald-400 pl-2 font-semibold">
                        ➔ {st}
                      </div>
                    ))}
                  </div>

                  <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold text-xs sm:text-sm">
                    ✅ {activeScience.solveExample.result}
                  </div>

                  <p className={`text-[11px] leading-relaxed ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                    💡 <b>Takeaway:</b> {activeScience.solveExample.takeaway}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
