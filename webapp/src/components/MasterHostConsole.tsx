import React, { useEffect, useRef, useState } from 'react';
import { LeaderboardEntry, MissionStep, StoredGameRecord } from '../types';
import {
  Activity,
  Bluetooth,
  Check,
  Copy,
  Gamepad2,
  Gauge,
  Lock,
  OctagonAlert,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Save,
  ShieldAlert,
  Sparkles,
  Square,
  Timer,
  Trash2,
  Trophy,
  Wifi,
  Zap,
} from 'lucide-react';

interface MasterHostConsoleProps {
  isAuthenticated: boolean;
  onLogin: (pw: string) => Promise<boolean>;
  paused: boolean;
  simulationMode: boolean;
  onToggleSimulationMode: () => void;
  onRunSimulatedMissionStep: (action: 'launch' | 'gate1' | 'dock' | 'finish') => void;
  carCount: number;
  gateState: string;
  ultrasonicCm: number | null;
  lockoutSec: number;
  bleConnected: boolean;
  espConnected: boolean;
  espHost: string;
  setEspHost: (val: string) => void;
  onConnectBle: () => void;
  onUnlockBle?: () => void;
  lockedRoverName?: string | null;
  onSendBleChar: (ch: string) => void;
  onSendBleText?: (text: string) => void;
  onConnectEsp: () => void;
  onSendEspCmd: (cmd: string) => void;
  onTriggerAllStop: () => void;
  onStopMission?: () => void;
  onTogglePause: () => void;
  onResetLapAndGate1: () => void;
  onResetCarCount: () => void;
  onJumpStep: (step: MissionStep) => void;
  launchToGate1Sec: number;
  gate2ToFinishSec: number;
  onSaveSegmentTimers: (launchSec: number, finishSec: number) => void;
  leaderboard: LeaderboardEntry[];
  onDeleteScore: (id: string) => void;
  onClearLeaderboard: () => void;
  gameHistory: StoredGameRecord[];
  onRefreshHistory: () => void;
  onClearHistory: () => void;
  onGenerateDemoRun: () => void;
  logs: string[];
  theme?: 'dark' | 'light';
}

export const MasterHostConsole: React.FC<MasterHostConsoleProps> = ({
  isAuthenticated,
  onLogin,
  paused,
  simulationMode,
  onToggleSimulationMode,
  onRunSimulatedMissionStep,
  carCount,
  gateState,
  ultrasonicCm,
  lockoutSec,
  bleConnected,
  espConnected,
  espHost,
  setEspHost,
  onConnectBle,
  onUnlockBle,
  lockedRoverName,
  onSendBleChar,
  onSendBleText,
  onConnectEsp,
  onSendEspCmd,
  onTriggerAllStop,
  onStopMission,
  onTogglePause,
  onResetLapAndGate1,
  onResetCarCount,
  onJumpStep,
  launchToGate1Sec,
  gate2ToFinishSec,
  onSaveSegmentTimers,
  leaderboard,
  onDeleteScore,
  onClearLeaderboard,
  gameHistory,
  onRefreshHistory,
  onClearHistory,
  onGenerateDemoRun,
  logs,
  theme = 'dark',
}) => {
  const [password, setPassword] = useState('');
  const [loginErr, setLoginErr] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isConnectingEsp, setIsConnectingEsp] = useState(false);

  // Dynamic Segment Animation Timers
  const [inputLaunchSec, setInputLaunchSec] = useState<string>(String(launchToGate1Sec));
  const [inputFinishSec, setInputFinishSec] = useState<string>(String(gate2ToFinishSec));
  const [timersSavedFeedback, setTimersSavedFeedback] = useState(false);

  useEffect(() => {
    setInputLaunchSec(String(launchToGate1Sec));
  }, [launchToGate1Sec]);

  useEffect(() => {
    setInputFinishSec(String(gate2ToFinishSec));
  }, [gate2ToFinishSec]);

  const handleSaveTimers = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const l = parseFloat(inputLaunchSec);
    const f = parseFloat(inputFinishSec);
    const validL = Number.isFinite(l) && l > 0 ? l : 2.0;
    const validF = Number.isFinite(f) && f > 0 ? f : 3.0;
    onSaveSegmentTimers(validL, validF);
    setTimersSavedFeedback(true);
    setTimeout(() => setTimersSavedFeedback(false), 2000);
  };

  // Custom RGB LED States & active override mode
  const [customR, setCustomR] = useState(0);
  const [customG, setCustomG] = useState(200);
  const [customB, setCustomB] = useState(255);
  const [activeLedOverride, setActiveLedOverride] = useState<string>('p');

  const applyCustomRGB = (r = customR, g = customG, b = customB) => {
    setActiveLedOverride('custom');
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(Number.isNaN(v) ? 0 : v)));
    const cr = clamp(r);
    const cg = clamp(g);
    const cb = clamp(b);
    const toHex = (v: number) => v.toString(16).padStart(2, '0').toUpperCase();
    const hex = `#${toHex(cr)}${toHex(cg)}${toHex(cb)}`;
    if (onSendBleText) {
      onSendBleText(hex);
    } else {
      for (let i = 0; i < hex.length; i++) {
        onSendBleChar(hex[i]);
      }
    }
  };

  const isDark = theme === 'dark';

  const socCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const tempCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const voltCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const heatCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (gameHistory.length > 0 && !selectedRunId) {
      setSelectedRunId(gameHistory[0].id);
    }
  }, [gameHistory, selectedRunId]);

  const selectedRun = gameHistory.find((g) => g.id === selectedRunId) || gameHistory[0] || null;

  // Operating Mode tracking (Mode 1: Autonomous Line Follower, Mode 2: Manual Control)
  const [currentMode, setCurrentMode] = useState<'1' | '2'>('2');

  // Manual Speed tracking (Firmware default is 100, range [40, 255])
  const [manualSpeed, setManualSpeed] = useState<number>(100);

  // Safety Interlock toggles (Firmware defaults are all enabled = true)
  const [boundaryEnabled, setBoundaryEnabled] = useState<boolean>(true);
  const [barrierEnabled, setBarrierEnabled] = useState<boolean>(true);
  const [bumpersEnabled, setBumpersEnabled] = useState<boolean>(true);

  const handleSwitchMode = (m: '1' | '2') => {
    setCurrentMode(m);
    setActiveKey(m);
    onSendBleChar(m);
    if (m === '2') {
      // Send an immediate halt pulse so any running autonomous motor drive zeroes out
      window.setTimeout(() => onSendBleChar(' '), 50);
    }
    window.setTimeout(() => {
      setActiveKey((curr) => (curr === m ? null : curr));
    }, 220);
  };

  // Single-action button press feedback helper (highlights button for 220ms)
  const triggerKeyAction = (k: string) => {
    setActiveKey(k);
    onSendBleChar(k);
    window.setTimeout(() => {
      setActiveKey((curr) => (curr === k ? null : curr));
    }, 220);
  };

  const handleSpeedAction = (key: 'j' | 'k' | 'u') => {
    if (key === 'j') {
      setManualSpeed((prev) => Math.max(40, prev - 10));
    } else if (key === 'u') {
      setManualSpeed((prev) => Math.min(255, prev + 10));
    } else if (key === 'k') {
      setManualSpeed(100);
    }
    triggerKeyAction(key);
  };

  const handleToggleSensor = (key: '8' | '9' | 'b' | 't') => {
    if (key === '8') {
      setBoundaryEnabled((prev) => !prev);
    } else if (key === '9') {
      setBarrierEnabled((prev) => !prev);
    } else if (key === 'b') {
      setBumpersEnabled((prev) => !prev);
    } else if (key === 't') {
      const anyActive = boundaryEnabled || barrierEnabled || bumpersEnabled;
      setBoundaryEnabled(!anyActive);
      setBarrierEnabled(!anyActive);
      setBumpersEnabled(!anyActive);
    }
    triggerKeyAction(key);
  };

  const handleToggleLed = (c: string) => {
    if (activeLedOverride === c && c !== 'r') {
      setActiveLedOverride('r');
      triggerKeyAction('r');
    } else {
      setActiveLedOverride(c);
      triggerKeyAction(c);
    }
  };

  // Keyboard navigation & controls when authenticated on Page 2
  useEffect(() => {
    if (!isAuthenticated) return;
    const driveKeys = ['w', 'a', 's', 'd', ' '];
    const actionKeys = ['1', '2', 'j', 'k', 'u', '8', '9', 'b', 't', 'l', 'c', 'g', 'v', 'f', 'p', 'r'];
    const validKeys = [...driveKeys, ...actionKeys];

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (validKeys.includes(k)) {
        e.preventDefault();
        if (k === '1' || k === '2') {
          handleSwitchMode(k as '1' | '2');
        } else if (k === 'j' || k === 'k' || k === 'u') {
          handleSpeedAction(k as 'j' | 'k' | 'u');
        } else if (k === '8' || k === '9' || k === 'b' || k === 't') {
          handleToggleSensor(k as '8' | '9' | 'b' | 't');
        } else if (k === 'c' || k === 'g' || k === 'v' || k === 'f' || k === 'p' || k === 'r') {
          handleToggleLed(k);
        } else if (activeKey !== k) {
          setActiveKey(k);
          onSendBleChar(k);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (validKeys.includes(k)) {
        e.preventDefault();
        if (driveKeys.includes(k)) {
          setActiveKey(null);
          if (k !== ' ') onSendBleChar(' ');
        } else {
          // Keep action button highlighted briefly so quick taps are clearly visible
          window.setTimeout(() => {
            setActiveKey((curr) => (curr === k ? null : curr));
          }, 180);
        }
      }
    };

    const onBlur = () => {
      setActiveKey(null);
      onSendBleChar(' ');
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [isAuthenticated, activeKey, onSendBleChar, boundaryEnabled, barrierEnabled, bumpersEnabled, activeLedOverride]);

  // Draw the 4 Stored Per-Game Physics Graphs whenever selectedRun changes
  useEffect(() => {
    if (!isAuthenticated || !selectedRun || !selectedRun.series?.length) return;
    const series = selectedRun.series;
    const maxTime = Math.max(
      selectedRun.target_minutes || 30,
      series[series.length - 1].sim_time_min || 1
    );

    const drawChart = (
      canvas: HTMLCanvasElement | null,
      cfg: {
        title: string;
        yMin: number;
        yMax: number;
        yUnit: string;
        limitLine?: { value: number; color: string };
        lines: Array<{
          label: string;
          color: string;
          getPoint: (p: any) => { x: number; y: number };
        }>;
      }
    ) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const rect = canvas.getBoundingClientRect();
      const cssW = Math.max(320, rect.width || 520);
      const cssH = Math.max(180, rect.height || 220);
      const W = 520;
      const H = 220;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);

      const scale = Math.min(cssW / W, cssH / H);
      const offsetX = (cssW - W * scale) / 2;
      const offsetY = (cssH - H * scale) / 2;

      ctx.save();
      ctx.scale(dpr, dpr);

      ctx.fillStyle = isDark ? '#070B14' : '#ffffff';
      ctx.fillRect(0, 0, cssW, cssH);

      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);

      const pad = { l: 46, r: 18, t: 38, b: 28 };
      const pw = W - pad.l - pad.r;
      const ph = H - pad.t - pad.b;

      ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a';
      ctx.font = '800 12px "Plus Jakarta Sans", Inter, sans-serif';
      ctx.fillText(cfg.title, pad.l, 18);

      let lx = pad.l;
      ctx.font = '700 10.5px Inter, sans-serif';
      for (const l of cfg.lines) {
        ctx.fillStyle = l.color;
        ctx.fillText(`● ${l.label}`, lx, 32);
        lx += ctx.measureText(`● ${l.label}`).width + 16;
      }

      ctx.strokeStyle = isDark ? 'rgba(148, 163, 209, 0.12)' : 'rgba(100, 116, 139, 0.2)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = pad.t + (ph * i) / 4;
        ctx.beginPath();
        ctx.moveTo(pad.l, y);
        ctx.lineTo(pad.l + pw, y);
        ctx.stroke();

        const val = cfg.yMax - ((cfg.yMax - cfg.yMin) * i) / 4;
        ctx.fillStyle = isDark ? '#94a3b8' : '#334155';
        ctx.font = '800 10px JetBrains Mono, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${val.toFixed(1)}${cfg.yUnit}`, pad.l - 6, y + 3);
      }

      if (cfg.limitLine) {
        const ly =
          pad.t + ph * (1 - (cfg.limitLine.value - cfg.yMin) / (cfg.yMax - cfg.yMin));
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = cfg.limitLine.color;
        ctx.beginPath();
        ctx.moveTo(pad.l, ly);
        ctx.lineTo(pad.l + pw, ly);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      for (const l of cfg.lines) {
        ctx.strokeStyle = l.color;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        series.forEach((pt, idx) => {
          const { x, y } = l.getPoint(pt);
          const px = pad.l + (x / maxTime) * pw;
          const py = pad.t + ph * (1 - (y - cfg.yMin) / (cfg.yMax - cfg.yMin));
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
      }

      ctx.fillStyle = isDark ? '#94a3b8' : '#334155';
      ctx.font = '800 10.5px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Simulated Charging Time (0 → ${maxTime.toFixed(0)} min)`, pad.l + pw / 2, H - 8);
      ctx.restore();
    };

    drawChart(socCanvasRef.current, {
      title: '1. State of Charge SOC (%) vs. Time',
      yMin: 0,
      yMax: 105,
      yUnit: '%',
      limitLine: { value: 100, color: '#34d399' },
      lines: [{ label: 'SOC (%)', color: '#34d399', getPoint: (p) => ({ x: p.sim_time_min, y: p.soc_pct }) }],
    });

    drawChart(tempCanvasRef.current, {
      title: '2. Coupled 3-Node Temperatures (T1 Core, T2 Surface, T∞ Coolant)',
      yMin: 20,
      yMax: 75,
      yUnit: '°C',
      limitLine: { value: 61.85, color: '#ef4444' },
      lines: [
        { label: 'T1 Core (°C)', color: '#ef4444', getPoint: (p) => ({ x: p.sim_time_min, y: p.T1_C }) },
        { label: 'T2 Surface (°C)', color: '#f59e0b', getPoint: (p) => ({ x: p.sim_time_min, y: p.T2_C }) },
        { label: 'T∞ Coolant (°C)', color: '#60a5fa', getPoint: (p) => ({ x: p.sim_time_min, y: p.T_inf_C }) },
      ],
    });

    drawChart(voltCanvasRef.current, {
      title: '3. Terminal Voltage Vt vs. Open-Circuit Voltage Vocv (V)',
      yMin: 3.1,
      yMax: 4.2,
      yUnit: 'V',
      lines: [
        { label: 'Vt = Vocv + I·Rs', color: '#60a5fa', getPoint: (p) => ({ x: p.sim_time_min, y: p.V_term }) },
        { label: 'Vocv (SOC-OCV.xlsx)', color: '#34d399', getPoint: (p) => ({ x: p.sim_time_min, y: p.V_ocv }) },
      ],
    });

    const maxQ = Math.max(5, ...series.map((p) => p.Q_heat_W || 0)) * 1.15;
    drawChart(heatCanvasRef.current, {
      title: '4. Electro-Thermal Heat Generation Q = Rs·I² - dOCV·I·T1 (W)',
      yMin: 0,
      yMax: maxQ,
      yUnit: 'W',
      lines: [{ label: 'Heat Q (Watts)', color: '#f59e0b', getPoint: (p) => ({ x: p.sim_time_min, y: p.Q_heat_W }) }],
    });
  }, [isAuthenticated, selectedRun, isDark]);

  if (!isAuthenticated) {
    return (
      <div
        className={`max-w-md mx-auto my-20 p-8 rounded-3xl border text-center space-y-5 transition-colors ${
          isDark
            ? 'bg-[#11182D] border-slate-800 shadow-2xl text-white'
            : 'bg-white border-slate-200 shadow-xl text-slate-900'
        }`}
      >
        <div
          className={`w-16 h-16 mx-auto rounded-2xl border flex items-center justify-center ${
            isDark
              ? 'bg-blue-500/15 border-blue-400/30 text-blue-400'
              : 'bg-blue-50 border-blue-200 text-blue-600'
          }`}
        >
          <Lock className="w-8 h-8" />
        </div>
        <div>
          <h2 className={`text-2xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
            Table Host Master Console
          </h2>
          <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Enter password to unlock Simulation Mode, Web Bluetooth manual driving, emergency all-stop, and per-game battery physics graphs.
          </p>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await onLogin(password);
            setLoginErr(!ok);
          }}
          className="space-y-3"
        >
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter host password..."
            className={`w-full px-4 py-3.5 rounded-2xl border font-bold text-center focus:outline-none focus:border-blue-500 transition-colors ${
              isDark
                ? 'bg-slate-950 border-slate-700 text-white placeholder-slate-500'
                : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
            }`}
          />
          {loginErr && (
            <div className={`text-xs font-extrabold ${isDark ? 'text-red-400' : 'text-red-600'}`}>
              Incorrect password. Please try again.
            </div>
          )}
          <button
            type="submit"
            className="w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black transition cursor-pointer shadow-lg shadow-blue-600/25"
          >
            Unlock Master Console
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-[1520px] mx-auto px-4 sm:px-6 pt-2.5 pb-6 space-y-4">
      {/* Emergency All-Stop, Simulation Mode & Global Multi-PC Sync Bar */}
      <div
        className={`p-5 rounded-3xl border flex flex-wrap items-center justify-between gap-4 shadow-xl transition-colors ${
          isDark
            ? 'bg-gradient-to-r from-red-500/15 via-slate-900 to-slate-900 border-red-500/35'
            : 'bg-gradient-to-r from-red-500/10 via-white to-white border-red-200 shadow-sm'
        }`}
      >
        <div className="flex items-center gap-3.5">
          <div
            className={`w-12 h-12 rounded-2xl border flex items-center justify-center ${
              isDark
                ? 'bg-red-500/20 border-red-400/40 text-red-400'
                : 'bg-red-100 border-red-300 text-red-600'
            }`}
          >
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h2 className={`text-lg font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Master Station Override &amp; Simulation Mode
            </h2>
            <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              Test the entire track &amp; gates in Simulation Mode without hardware, or control the live rover &amp; Student Kiosk.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* SIMULATION MODE TOGGLE BUTTON */}
          <button
            type="button"
            onClick={onToggleSimulationMode}
            className={`px-5 py-3 rounded-2xl font-black text-sm flex items-center gap-2 transition cursor-pointer border ${
              simulationMode
                ? 'bg-purple-600 hover:bg-purple-500 text-white border-purple-300 shadow-lg shadow-purple-600/30'
                : isDark
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-600'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300 shadow-sm'
            }`}
          >
            <Gamepad2 className="w-4 h-4" />
            {simulationMode ? '🎮 Simulation Mode: ON (No Car Needed)' : '🎮 Enable Simulation Mode'}
          </button>

          <button
            type="button"
            onClick={() => {
              setCurrentMode('2');
              onSendBleChar('2');
              onSendBleChar(' ');
              onTriggerAllStop();
            }}
            className="px-5 py-3 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-black text-sm shadow-lg shadow-red-600/30 flex items-center gap-2 transition cursor-pointer"
            title="Immediately halt all motors and force rover into Mode 2 (Manual)"
          >
            <OctagonAlert className="w-4 h-4" /> ALL-STOP (Mode 2)
          </button>

          {onStopMission && (
            <button
              type="button"
              onClick={() => {
                setCurrentMode('2');
                onSendBleChar('2');
                onSendBleChar(' ');
                onStopMission();
              }}
              className="px-5 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm shadow-lg shadow-amber-500/25 flex items-center gap-2 transition cursor-pointer"
              title="Stop student mission, switch rover to Mode 2 (Manual control), and reset station to Phase 1"
            >
              <Square className="w-4 h-4 fill-slate-950" /> Stop Mission &amp; Mode 2
            </button>
          )}

          <button
            type="button"
            onClick={onTogglePause}
            className="px-5 py-3 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm flex items-center gap-2 transition cursor-pointer shadow-md"
          >
            {paused ? <Play className="w-4 h-4 fill-slate-950" /> : <Pause className="w-4 h-4 fill-slate-950" />}
            {paused ? 'Resume Station' : 'Pause Station'}
          </button>

          <button
            type="button"
            onClick={() => {
              setCurrentMode('2');
              onSendBleChar('2');
              onSendBleChar(' ');
              onResetLapAndGate1();
            }}
            className={`px-4 py-3 rounded-2xl border font-extrabold text-sm flex items-center gap-2 transition cursor-pointer ${
              isDark
                ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-100'
                : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800 shadow-sm'
            }`}
            title="Reset UI to Phase 1, stop all motors, and force rover into Mode 2 (Manual)"
          >
            <RefreshCw className="w-4 h-4" /> Reset Station (Phase 1 &amp; Mode 2)
          </button>
        </div>
      </div>

      {/* 2-Column Hardware & Infrastructure Control Grid (Spread Out for Balanced Space Utilization) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Column 1: Direct Web Bluetooth mBot Mega Rover Cockpit & Lighting */}
        <div
          className={`p-6 rounded-3xl border transition-colors flex flex-col justify-between ${
            isDark
              ? 'bg-[#11182D] border-slate-800/90'
              : 'bg-white border-slate-200 shadow-md'
          }`}
        >
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-700/40 mb-4">
              <div>
                <h3 className={`text-base font-black flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  <Bluetooth className="w-4 h-4 text-blue-400" /> mBot Mega Direct BLE
                </h3>
                {lockedRoverName && (
                  <span className={`text-[11px] font-bold flex items-center gap-1 mt-0.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                    🔒 Pinned Rover: {lockedRoverName}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {lockedRoverName && onUnlockBle && (
                  <button
                    type="button"
                    onClick={onUnlockBle}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      isDark
                        ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
                        : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700 shadow-sm'
                    }`}
                    title="Unlock and switch to a different mBot in the room"
                  >
                    Unlock / Switch
                  </button>
                )}
                <button
                  type="button"
                  onClick={onConnectBle}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold border transition cursor-pointer ${
                    bleConnected
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                      : 'bg-blue-600 hover:bg-blue-500 text-white border-blue-400 shadow-sm'
                  }`}
                >
                  {bleConnected ? '● BLE Connected' : 'Connect BLE'}
                </button>
              </div>
            </div>

            {/* Sub-grid for Rover: Driving & Safeties on Left, Lighting Studio on Right */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Left Sub-Column: Teleoperation & Sensor Safeties */}
              <div className="space-y-3.5">
                <div className={`text-[11px] font-extrabold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Operating Mode
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSwitchMode('1')}
                    className={`py-2 px-3 rounded-xl border text-xs font-black cursor-pointer transition flex items-center justify-center gap-1.5 ${
                      currentMode === '1'
                        ? 'bg-blue-600 text-white border-blue-400 shadow-md ring-2 ring-blue-400'
                        : isDark
                        ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
                        : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700 shadow-sm'
                    }`}
                  >
                    {currentMode === '1' && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
                    <span>Mode 1 · Auto</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchMode('2')}
                    className={`py-2 px-3 rounded-xl border text-xs font-black cursor-pointer transition flex items-center justify-center gap-1.5 ${
                      currentMode === '2'
                        ? 'bg-blue-600 text-white border-blue-400 shadow-md ring-2 ring-blue-400'
                        : isDark
                        ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
                        : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700 shadow-sm'
                    }`}
                  >
                    {currentMode === '2' && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
                    <span>Mode 2 · Manual</span>
                  </button>
                </div>

                {onStopMission && (
                  <button
                    type="button"
                    onClick={() => {
                      handleSwitchMode('2');
                      onStopMission();
                    }}
                    className={`w-full py-2 px-3 rounded-xl border text-xs font-black cursor-pointer transition flex items-center justify-center gap-2 ${
                      isDark
                        ? 'border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300'
                        : 'border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-900 shadow-sm'
                    }`}
                    title="Stop student mission, switch rover to Mode 2 Manual control, and reset station"
                  >
                    <Square className="w-3.5 h-3.5 fill-current text-amber-500" /> Stop Mission &amp; Regain Manual Control
                  </button>
                )}

                <div className={`text-[11px] font-extrabold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Zero-Latency Mecanum Drive (WASD)
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div />
                  <button
                    type="button"
                    onMouseDown={() => onSendBleChar('w')}
                    onMouseUp={() => onSendBleChar(' ')}
                    onTouchStart={(e) => { e.preventDefault(); onSendBleChar('w'); }}
                    onTouchEnd={(e) => { e.preventDefault(); onSendBleChar(' '); }}
                    className={`h-12 rounded-xl border font-black text-base flex flex-col items-center justify-center transition cursor-pointer select-none ${
                      activeKey === 'w'
                        ? 'bg-blue-600 text-white border-white shadow-md'
                        : isDark
                        ? 'bg-slate-900 hover:bg-slate-800 text-white border-slate-700'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-900 border-slate-300 shadow-sm'
                    }`}
                  >
                    <span>▲</span>
                    <span className={`text-[10px] font-black ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>W · Fwd</span>
                  </button>
                  <div />
                  {[
                    { k: 'a', icon: '◄', sub: 'A · Strafe L' },
                    { k: ' ', icon: '■', sub: 'Space · Halt', halt: true },
                    { k: 'd', icon: '►', sub: 'D · Strafe R' },
                  ].map((b) => (
                    <button
                      key={b.k}
                      type="button"
                      onMouseDown={() => onSendBleChar(b.k)}
                      onMouseUp={() => b.k !== ' ' && onSendBleChar(' ')}
                      onTouchStart={(e) => { e.preventDefault(); onSendBleChar(b.k); }}
                      onTouchEnd={(e) => { e.preventDefault(); if (b.k !== ' ') onSendBleChar(' '); }}
                      className={`h-12 rounded-xl border font-black text-base flex flex-col items-center justify-center transition cursor-pointer select-none ${
                        activeKey === b.k
                          ? 'bg-blue-600 text-white border-white shadow-md'
                          : b.halt
                          ? isDark
                            ? 'bg-red-500/15 hover:bg-red-500/25 text-red-300 border-red-400/40'
                            : 'bg-red-50 hover:bg-red-100 text-red-700 border-red-300 shadow-sm'
                          : isDark
                          ? 'bg-slate-900 hover:bg-slate-800 text-white border-slate-700'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-900 border-slate-300 shadow-sm'
                      }`}
                    >
                      <span>{b.icon}</span>
                      <span className={`text-[10px] font-black ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{b.sub}</span>
                    </button>
                  ))}
                  <div />
                  <button
                    type="button"
                    onMouseDown={() => onSendBleChar('s')}
                    onMouseUp={() => onSendBleChar(' ')}
                    onTouchStart={(e) => { e.preventDefault(); onSendBleChar('s'); }}
                    onTouchEnd={(e) => { e.preventDefault(); onSendBleChar(' '); }}
                    className={`h-12 rounded-xl border font-black text-base flex flex-col items-center justify-center transition cursor-pointer select-none ${
                      activeKey === 's'
                        ? 'bg-blue-600 text-white border-white shadow-md'
                        : isDark
                        ? 'bg-slate-900 hover:bg-slate-800 text-white border-slate-700'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-900 border-slate-300 shadow-sm'
                    }`}
                  >
                    <span>▼</span>
                    <span className={`text-[10px] font-black ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>S · Back</span>
                  </button>
                  <div />
                </div>

                <div className="flex items-center justify-between">
                  <div className={`text-[11px] font-extrabold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Speed Adjustments
                  </div>
                  <div
                    className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg border text-xs font-black tabular-nums transition ${
                      isDark
                        ? 'bg-blue-600/20 text-blue-300 border-blue-400/40 shadow-sm'
                        : 'bg-blue-50 text-blue-800 border-blue-200 shadow-sm'
                    }`}
                  >
                    <Gauge className="w-3.5 h-3.5 text-blue-400" />
                    <span>Speed: <strong className="text-sm font-black text-blue-400">{manualSpeed}</strong> PWM</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { k: 'j' as const, lbl: '[J] Slower (-10)' },
                    { k: 'k' as const, lbl: '[K] Reset (100)' },
                    { k: 'u' as const, lbl: '[U] Faster (+10)' },
                  ].map((s) => (
                    <button
                      key={s.k}
                      type="button"
                      onClick={() => handleSpeedAction(s.k)}
                      className={`py-2 px-1 rounded-xl border text-[11px] font-black cursor-pointer transition ${
                        activeKey === s.k
                          ? 'bg-blue-600 text-white border-white shadow-md ring-2 ring-blue-400'
                          : isDark
                          ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
                          : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800 shadow-sm'
                      }`}
                    >
                      {s.lbl}
                    </button>
                  ))}
                </div>

                <div className={`text-[11px] font-extrabold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Safety Interlock Toggles (Tabletop)
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { k: '8' as const, lbl: '[8] Boundary', active: boundaryEnabled },
                    { k: '9' as const, lbl: '[9] Barrier', active: barrierEnabled },
                    { k: 'b' as const, lbl: '[B] Bumpers', active: bumpersEnabled },
                  ].map((st) => (
                    <button
                      key={st.k}
                      type="button"
                      onClick={() => handleToggleSensor(st.k)}
                      className={`py-2 px-1 rounded-xl border text-[11px] font-black cursor-pointer transition flex items-center justify-center gap-1.5 ${
                        st.active
                          ? 'bg-blue-600 text-white border-blue-400 shadow-md ring-2 ring-blue-400'
                          : isDark
                          ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
                          : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700 shadow-sm'
                      }`}
                      title={st.active ? `${st.lbl} is ON (Click to mute)` : `${st.lbl} is MUTED (Click to enable)`}
                    >
                      {st.active && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
                      <span>{st.lbl}</span>
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleSensor('t')}
                    className={`col-span-2 py-2 px-2 rounded-xl border text-[11px] font-black cursor-pointer transition flex items-center justify-center gap-1.5 ${
                      !boundaryEnabled && !barrierEnabled && !bumpersEnabled
                        ? 'bg-amber-600 text-white border-amber-300 shadow-md ring-2 ring-amber-400'
                        : isDark
                        ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-400/40 text-amber-200'
                        : 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-800 shadow-sm'
                    }`}
                    title="Toggle all 3 safety interlocks simultaneously"
                  >
                    {!boundaryEnabled && !barrierEnabled && !bumpersEnabled && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    )}
                    <span>
                      [T] Tabletop Master {!boundaryEnabled && !barrierEnabled && !bumpersEnabled ? '· Muted' : ''}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerKeyAction('l')}
                    className={`py-2 px-1 rounded-xl border text-[11px] font-black cursor-pointer transition flex items-center justify-center gap-1.5 ${
                      activeKey === 'l'
                        ? 'bg-blue-600 text-white border-white shadow-md ring-2 ring-blue-400'
                        : isDark
                        ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
                        : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700 shadow-sm'
                    }`}
                    title="Query raw infrared line sensor reflectance values"
                  >
                    {activeKey === 'l' && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
                    <span>[L] Line Raw</span>
                  </button>
                </div>
              </div>

              {/* Right Sub-Column: Smart Lighting & Custom RGB Studio */}
              <div className="space-y-3.5">
                <div className={`text-[11px] font-extrabold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  LED State Overrides
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { c: 'c', lbl: 'Cyan' },
                    { c: 'g', lbl: 'Charge' },
                    { c: 'v', lbl: 'Rainbow' },
                    { c: 'f', lbl: 'Fault' },
                    { c: 'p', lbl: 'Color Cycle' },
                    { c: 'r', lbl: 'Reset/Off' },
                  ].map((l) => {
                    const isActive = activeLedOverride === l.c;
                    return (
                      <button
                        key={l.c}
                        type="button"
                        onClick={() => handleToggleLed(l.c)}
                        className={`py-2 px-1 rounded-xl border text-[11px] font-black cursor-pointer transition flex items-center justify-center gap-1.5 ${
                          isActive
                            ? 'bg-blue-600 text-white border-blue-400 shadow-md ring-2 ring-blue-400'
                            : isDark
                            ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
                            : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700 shadow-sm'
                        }`}
                        title={`Activate ${l.lbl} LED Mode`}
                      >
                        {isActive && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
                        <span>{l.lbl}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Custom RGB Color Controller */}
                <div
                  className={`p-3 rounded-2xl border space-y-2.5 ${
                    isDark
                      ? 'bg-slate-900/70 border-slate-800'
                      : 'bg-slate-50 border-slate-200 shadow-inner'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-extrabold uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      Custom RGB Studio
                    </span>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-5 h-5 rounded-full border border-white/40 shadow-sm"
                        style={{ backgroundColor: `rgb(${customR}, ${customG}, ${customB})` }}
                        title={`RGB(${customR}, ${customG}, ${customB})`}
                      />
                      <span className={`text-xs font-mono font-bold ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>
                        #{customR.toString(16).padStart(2, '0').toUpperCase()}
                        {customG.toString(16).padStart(2, '0').toUpperCase()}
                        {customB.toString(16).padStart(2, '0').toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {/* R, G, B slider & input rows */}
                  <div className="space-y-1.5">
                    {[
                      { label: 'R', val: customR, set: setCustomR, color: 'text-red-500', bar: 'accent-red-500' },
                      { label: 'G', val: customG, set: setCustomG, color: 'text-emerald-500', bar: 'accent-emerald-500' },
                      { label: 'B', val: customB, set: setCustomB, color: 'text-blue-500', bar: 'accent-blue-500' },
                    ].map((c) => (
                      <div key={c.label} className="flex items-center gap-2 text-xs">
                        <span className={`w-3 font-black ${c.color}`}>{c.label}</span>
                        <input
                          type="range"
                          min="0"
                          max="255"
                          value={c.val}
                          onChange={(e) => c.set(Number(e.target.value))}
                          className={`flex-1 h-1.5 rounded-lg cursor-pointer ${c.bar}`}
                        />
                        <input
                          type="number"
                          min="0"
                          max="255"
                          value={c.val}
                          onChange={(e) => {
                            const num = parseInt(e.target.value, 10);
                            c.set(Number.isNaN(num) ? 0 : Math.max(0, Math.min(255, num)));
                          }}
                          className={`w-12 px-1 py-0.5 rounded-lg border text-center font-mono font-bold text-xs ${
                            isDark
                              ? 'bg-slate-950 border-slate-700 text-white'
                              : 'bg-white border-slate-300 text-slate-900 shadow-sm'
                          }`}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Quick color preset chips */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {[
                      { name: 'Cyan', r: 0, g: 200, b: 255 },
                      { name: 'Green', r: 0, g: 255, b: 0 },
                      { name: 'Red', r: 255, g: 0, b: 0 },
                      { name: 'Blue', r: 0, g: 80, b: 255 },
                      { name: 'Amber', r: 255, g: 140, b: 0 },
                      { name: 'Purple', r: 180, g: 0, b: 255 },
                      { name: 'White', r: 255, g: 255, b: 255 },
                      { name: 'Off', r: 0, g: 0, b: 0 },
                    ].map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => {
                          setCustomR(p.r);
                          setCustomG(p.g);
                          setCustomB(p.b);
                          applyCustomRGB(p.r, p.g, p.b);
                        }}
                        className={`px-2 py-0.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 cursor-pointer transition ${
                          isDark
                            ? 'bg-slate-950 hover:bg-slate-800 border-slate-700 text-slate-300'
                            : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-800 shadow-sm'
                        }`}
                      >
                        <span
                          className="w-2 h-2 rounded-full inline-block"
                          style={{ backgroundColor: `rgb(${p.r}, ${p.g}, ${p.b})` }}
                        />
                        {p.name}
                      </button>
                    ))}
                  </div>

                  {/* Apply button */}
                  <button
                    type="button"
                    onClick={() => applyCustomRGB()}
                    className="w-full py-2 rounded-xl border border-blue-400/40 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black shadow-md cursor-pointer transition flex items-center justify-center gap-2"
                  >
                    <span>Apply Custom RGB to Rover</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Column 2: Combined Track Infrastructure, Gate Servos & Mission Simulation */}
        <div
          className={`p-6 rounded-3xl border transition-colors flex flex-col justify-between ${
            isDark
              ? 'bg-[#11182D] border-slate-800/90'
              : 'bg-white border-slate-200 shadow-md'
          }`}
        >
          <div>
            {/* Header: ESP32 + Connect Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-700/40 mb-4">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-400" />
                <div>
                  <h3 className={`text-base font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    Track Infrastructure &amp; Mission Simulation
                  </h3>
                  <span className={`text-[11px] font-bold block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Track ID: <b className="text-emerald-400">Track-01</b> · Security: <b className="text-purple-400">Token-Protected</b>
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-extrabold border ${
                    espConnected
                      ? isDark
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                        : 'bg-emerald-100 text-emerald-800 border-emerald-300 shadow-sm'
                      : isDark
                      ? 'bg-purple-500/20 text-purple-200 border-purple-400/40'
                      : 'bg-purple-100 text-purple-800 border-purple-300 shadow-sm'
                  }`}
                >
                  {espConnected ? '● ESP32 Linked' : '○ ESP32 Offline'}
                </span>
                <input
                  type="text"
                  value={espHost}
                  onChange={(e) => setEspHost(e.target.value)}
                  className={`w-36 px-2.5 py-1 rounded-xl border text-xs font-mono transition-colors ${
                    isDark
                      ? 'bg-slate-950 border-slate-700 text-white placeholder-slate-500'
                      : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                  }`}
                  placeholder="192.168.4.1:81"
                />
                <button
                  type="button"
                  disabled={isConnectingEsp}
                  onClick={() => {
                    setIsConnectingEsp(true);
                    onConnectEsp();
                    setTimeout(() => setIsConnectingEsp(false), 1500);
                  }}
                  className={`px-3 py-1 rounded-xl border text-xs font-black cursor-pointer transition flex items-center gap-1.5 ${
                    isConnectingEsp
                      ? 'bg-amber-500/20 text-amber-300 border-amber-400/40 animate-pulse'
                      : espConnected
                      ? 'bg-emerald-500/25 hover:bg-emerald-500/35 border-emerald-400/50 text-emerald-300'
                      : isDark
                      ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-400/40 text-emerald-300'
                      : 'bg-emerald-100 hover:bg-emerald-200 border-emerald-300 text-emerald-800 shadow-sm'
                  }`}
                >
                  {isConnectingEsp ? 'Probing...' : espConnected ? 'Re-Connect' : 'Connect'}
                </button>
              </div>
            </div>

            {/* Quick-IP Preset Badge */}
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-[11px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Active Network:
              </span>
              <button
                type="button"
                onClick={() => setEspHost('192.168.4.1:81')}
                className="px-2.5 py-0.5 rounded-lg border text-[11px] font-mono font-bold cursor-pointer transition bg-emerald-500/25 text-emerald-300 border-emerald-400/50 ring-1 ring-emerald-400/40"
                title="Direct SoftAP connection to ESP32 gate controller"
              >
                192.168.4.1:81 (SoftAP)
              </button>
            </div>

            {/* ESP32 SoftAP Wireless Connection Credentials Card */}
            <div
              className={`mb-4 p-3.5 rounded-2xl border transition-colors flex flex-wrap items-center justify-between gap-3 ${
                isDark
                  ? 'bg-gradient-to-r from-emerald-950/40 via-slate-900/90 to-slate-900/90 border-emerald-500/35'
                  : 'bg-gradient-to-r from-emerald-50 via-slate-50 to-white border-emerald-200 shadow-sm'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                    isDark
                      ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-300'
                      : 'bg-emerald-100 border-emerald-300 text-emerald-800'
                  }`}
                >
                  <Wifi className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-emerald-500">
                      ESP32 SoftAP Credentials
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        isDark
                          ? 'bg-emerald-900/40 border-emerald-500/30 text-emerald-300'
                          : 'bg-white border-emerald-200 text-emerald-700 shadow-xs'
                      }`}
                    >
                      SoftAP Only
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-semibold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        SSID / User:
                      </span>
                      <code
                        className={`font-mono font-black px-1.5 py-0.5 rounded border select-all ${
                          isDark
                            ? 'bg-slate-950 border-slate-700 text-emerald-300'
                            : 'bg-white border-emerald-300 text-emerald-900 shadow-xs'
                        }`}
                      >
                        ESP32_Gate_Network
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText('ESP32_Gate_Network');
                          setCopiedField('ssid');
                          setTimeout(() => setCopiedField(null), 1800);
                        }}
                        className={`p-1 rounded-lg transition cursor-pointer ${
                          isDark
                            ? 'hover:bg-slate-800 text-slate-400 hover:text-white'
                            : 'hover:bg-slate-200 text-slate-600 hover:text-slate-900'
                        }`}
                        title="Copy SSID"
                      >
                        {copiedField === 'ssid' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className={`font-semibold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        Password:
                      </span>
                      <code
                        className={`font-mono font-black px-1.5 py-0.5 rounded border select-all ${
                          isDark
                            ? 'bg-slate-950 border-slate-700 text-amber-300'
                            : 'bg-white border-amber-300 text-amber-900 shadow-xs'
                        }`}
                      >
                        gate1234
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText('gate1234');
                          setCopiedField('pass');
                          setTimeout(() => setCopiedField(null), 1800);
                        }}
                        className={`p-1 rounded-lg transition cursor-pointer ${
                          isDark
                            ? 'hover:bg-slate-800 text-slate-400 hover:text-white'
                            : 'hover:bg-slate-200 text-slate-600 hover:text-slate-900'
                        }`}
                        title="Copy Password"
                      >
                        {copiedField === 'pass' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className={`font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        AP IP:
                      </span>
                      <code
                        className={`font-mono font-bold px-1.5 py-0.5 rounded border ${
                          isDark
                            ? 'bg-slate-950 border-slate-800 text-slate-300'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        192.168.4.1:81
                      </code>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEspHost('192.168.4.1:81');
                  }}
                  className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                    isDark
                      ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
                      : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700 shadow-xs'
                  }`}
                  title="Fill Host input with default SoftAP address 192.168.4.1:81"
                >
                  Fill AP IP
                </button>
              </div>
            </div>

            {/* Sub-grid: Combined Gate Telemetry & Servos (Left) + Simulation & Scores (Right) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Left Sub-Column: Cars Counted Telemetry & Hardware Servo Overrides */}
              <div className="space-y-3.5">
                <div
                  className={`p-3.5 rounded-2xl border flex items-center justify-between transition-colors ${
                    isDark
                      ? 'bg-slate-900/90 border-slate-800'
                      : 'bg-slate-50 border-slate-200 shadow-inner'
                  }`}
                >
                  <div>
                    <div className={`text-[11px] font-extrabold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      Completed Missions (Phases 1-4)
                    </div>
                    <div className={`text-3xl font-black tabular-nums mt-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      {carCount}
                    </div>
                    <div className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      Lockout: <b className={isDark ? 'text-slate-200' : 'text-slate-900'}>{lockoutSec > 0 ? `${lockoutSec.toFixed(0)}s` : 'Ready (0s)'}</b>
                    </div>
                  </div>
                  <div className="text-right space-y-1.5 text-xs">
                    <div
                      className={`px-2.5 py-1 rounded-xl border ${
                        isDark
                          ? 'bg-slate-950 border-slate-800 text-slate-300'
                          : 'bg-white border-slate-300 text-slate-800 shadow-sm'
                      }`}
                    >
                      Sonar: <b className={isDark ? 'text-white' : 'text-slate-950'}>{ultrasonicCm !== null ? `${ultrasonicCm.toFixed(1)} cm` : '-- cm'}</b>
                    </div>
                    <div
                      className={`px-2.5 py-1 rounded-xl border ${
                        isDark
                          ? 'bg-slate-950 border-slate-800 text-slate-300'
                          : 'bg-white border-slate-300 text-slate-800 shadow-sm'
                      }`}
                    >
                      State: <b className={isDark ? 'text-blue-300' : 'text-blue-700'}>{gateState}</b>
                    </div>
                  </div>
                </div>

                <div className={`text-[11px] font-extrabold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Gate 2 Remote Actuation &amp; Hardware Controls
                </div>

                <div className={`p-2.5 rounded-xl border text-[11px] font-semibold leading-snug ${
                  isDark ? 'bg-slate-900/60 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}>
                  <span className="font-black text-emerald-400">Gate 1:</span> Autonomous Sonar Only (opens via ultrasonic, auto-closes after 20s). No wireless controls.
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onSendEspCmd('OPEN_GATE2')}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-black cursor-pointer transition ${
                      isDark
                        ? 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-400/40 text-emerald-300'
                        : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-800 shadow-sm'
                    }`}
                  >
                    Open Gate 2 (10s Timer)
                  </button>
                  <button
                    type="button"
                    onClick={() => onSendEspCmd('CLOSE_GATE2')}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-black cursor-pointer transition ${
                      isDark
                        ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
                        : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800 shadow-sm'
                    }`}
                  >
                    Close Gate 2 Now
                  </button>
                  <button
                    type="button"
                    onClick={onResetCarCount}
                    className={`col-span-2 py-2 px-2.5 rounded-xl border text-xs font-black cursor-pointer transition ${
                      isDark
                        ? 'bg-red-500/15 hover:bg-red-500/25 border-red-400/40 text-red-300'
                        : 'bg-red-50 hover:bg-red-100 border-red-300 text-red-800 shadow-sm'
                    }`}
                  >
                    Zero Car Counter
                  </button>
                </div>
              </div>

              {/* Right Sub-Column: Simulation Events, Step Jumpers & Scores */}
              <div className="space-y-3.5">
                {/* Dynamic Lap Segment Movement Timers Card */}
                <div
                  className={`p-3.5 rounded-2xl border space-y-3 transition-colors ${
                    isDark
                      ? 'bg-blue-500/10 border-blue-400/30'
                      : 'bg-blue-50/80 border-blue-200 shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Timer className={`w-4 h-4 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
                      <span className={`text-[11px] font-black uppercase tracking-wider ${isDark ? 'text-blue-300' : 'text-blue-900'}`}>
                        ⏱️ Segment Movement Timers
                      </span>
                    </div>
                    {timersSavedFeedback && (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-400/40 animate-pulse">
                        <Check className="w-3 h-3" /> Saved!
                      </span>
                    )}
                  </div>

                  <div className={`text-[11px] leading-snug font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    Rover dynamically adjusts its movement animation speed to complete each segment in exactly these seconds before triggering the next state.
                  </div>

                  <form onSubmit={handleSaveTimers} className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-2.5">
                      {/* Timer 1: Launch to Gate 1 */}
                      <div className="space-y-1">
                        <label className={`text-[10px] font-extrabold uppercase tracking-wider block ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                          1. Launch → Gate 1 Arrival
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0.5"
                            max="60"
                            step="0.5"
                            value={inputLaunchSec}
                            onChange={(e) => setInputLaunchSec(e.target.value)}
                            className={`w-full pr-8 pl-2.5 py-1.5 rounded-xl border text-xs font-mono font-bold transition-colors ${
                              isDark
                                ? 'bg-slate-950 border-slate-700 text-white focus:border-blue-400 focus:ring-1 focus:ring-blue-400'
                                : 'bg-white border-slate-300 text-slate-900 shadow-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                            }`}
                            placeholder="2.0"
                            required
                          />
                          <span className={`absolute right-2 top-1.5 text-xs font-bold pointer-events-none ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            sec
                          </span>
                        </div>
                      </div>

                      {/* Timer 2: Gate 2 Open to Finish */}
                      <div className="space-y-1">
                        <label className={`text-[10px] font-extrabold uppercase tracking-wider block ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                          2. Gate 2 Open → Finish
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0.5"
                            max="60"
                            step="0.5"
                            value={inputFinishSec}
                            onChange={(e) => setInputFinishSec(e.target.value)}
                            className={`w-full pr-8 pl-2.5 py-1.5 rounded-xl border text-xs font-mono font-bold transition-colors ${
                              isDark
                                ? 'bg-slate-950 border-slate-700 text-white focus:border-blue-400 focus:ring-1 focus:ring-blue-400'
                                : 'bg-white border-slate-300 text-slate-900 shadow-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                            }`}
                            placeholder="3.0"
                            required
                          />
                          <span className={`absolute right-2 top-1.5 text-xs font-bold pointer-events-none ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            sec
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className={`w-full py-2 px-3 rounded-xl border text-xs font-black cursor-pointer transition flex items-center justify-center gap-1.5 shadow-sm ${
                        timersSavedFeedback
                          ? 'bg-emerald-500 text-white border-emerald-400'
                          : isDark
                          ? 'bg-blue-600 hover:bg-blue-500 border-blue-400/50 text-white'
                          : 'bg-blue-600 hover:bg-blue-700 border-blue-600 text-white'
                      }`}
                    >
                      {timersSavedFeedback ? (
                        <>
                          <Check className="w-3.5 h-3.5" /> Saved Successfully!
                        </>
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5" /> Save Timers
                        </>
                      )}
                    </button>
                  </form>
                </div>

                <div
                  className={`p-3 rounded-2xl border space-y-2 transition-colors ${
                    isDark
                      ? 'bg-purple-500/10 border-purple-400/30'
                      : 'bg-purple-50 border-purple-200 shadow-sm'
                  }`}
                >
                  <div className={`text-[11px] font-extrabold uppercase tracking-wider ${isDark ? 'text-purple-300' : 'text-purple-900'}`}>
                    🎮 Simulated Track Events
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: 'launch', label: '1. Sim Launch Lap' },
                      { id: 'gate1', label: '2. Sim Gate 1 Sonar' },
                      { id: 'dock', label: '3. Sim Charger Dock' },
                      { id: 'finish', label: '4. Sim Finish Rainbow' },
                    ].map((act) => (
                      <button
                        key={act.id}
                        type="button"
                        onClick={() => onRunSimulatedMissionStep(act.id as any)}
                        className={`py-1.5 px-2 rounded-xl border text-xs font-black cursor-pointer transition ${
                          isDark
                            ? 'bg-purple-600/30 hover:bg-purple-600/45 border-purple-400/40 text-white'
                            : 'bg-purple-100 hover:bg-purple-200 border-purple-300 text-purple-900 shadow-sm'
                        }`}
                      >
                        {act.label}
                      </button>
                    ))}
                  </div>

                  <div className="pt-1">
                    <div className={`text-[10px] font-extrabold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      Jump UI to Step
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {([1, 2, 3, 4] as MissionStep[]).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => onJumpStep(s)}
                          className={`py-1 rounded-lg border text-xs font-black cursor-pointer transition ${
                            isDark
                              ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-white'
                              : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-800 shadow-sm'
                          }`}
                        >
                          Step {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Recorded Lap Times */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className={`text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      <Trophy className="w-3.5 h-3.5 text-amber-500" /> Scorecard Leaderboard ({leaderboard.length})
                    </div>
                    <button
                      type="button"
                      onClick={onClearLeaderboard}
                      className={`px-2 py-0.5 rounded-lg border text-[11px] font-black cursor-pointer transition ${
                        isDark
                          ? 'bg-red-500/15 hover:bg-red-500/25 border-red-400/35 text-red-300'
                          : 'bg-red-50 hover:bg-red-100 border-red-300 text-red-800 shadow-sm'
                      }`}
                    >
                      Clear
                    </button>
                  </div>

                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                    {leaderboard.length === 0 ? (
                      <div
                        className={`text-xs text-center py-4 border border-dashed rounded-xl ${
                          isDark ? 'text-slate-500 border-slate-800' : 'text-slate-500 border-slate-300 bg-slate-50'
                        }`}
                      >
                        No completed runs recorded yet.
                      </div>
                    ) : (
                      leaderboard.map((row, idx) => (
                        <div
                          key={row.id}
                          className={`px-2.5 py-1.5 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                            isDark
                              ? 'bg-slate-900/90 border-slate-800'
                              : 'bg-slate-50 border-slate-200 hover:border-slate-300 shadow-sm'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`w-5 h-5 rounded-md text-[11px] font-black flex items-center justify-center shrink-0 ${
                              isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-800'
                            }`}>
                              #{idx + 1}
                            </span>
                            <div>
                              <div className={`font-extrabold text-[11px] leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                {row.name || 'STEM Explorer'}
                              </div>
                              <div className={`text-[9px] ${isDark ? 'text-slate-400' : 'text-slate-600 font-semibold'}`}>
                                Try #{row.attempt_num ?? 1} · {row.current_mA ?? 3000} mA · {row.charge_time_min ?? 30}m · {Number(row.peak_temp_C ?? 42).toFixed(1)}°C
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={`font-black tabular-nums text-xs ${
                              idx === 0
                                ? 'text-amber-400'
                                : isDark
                                ? 'text-emerald-400'
                                : 'text-emerald-600'
                            }`}>
                              {row.total_points ?? 500} pts
                            </span>
                            <button
                              type="button"
                              onClick={() => onDeleteScore(row.id)}
                              className={`cursor-pointer transition ${isDark ? 'text-slate-500 hover:text-red-400' : 'text-slate-400 hover:text-red-600'}`}
                              title="Delete run"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stored Per-Game Battery Dynamics & 4-Graph Inspector (Full Engineering Detail Kept Here!) */}
      <div
        className={`p-6 rounded-3xl border space-y-5 transition-colors ${
          isDark
            ? 'bg-[#11182D] border-slate-800/90'
            : 'bg-white border-slate-200 shadow-md'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className={`text-[11px] font-extrabold uppercase tracking-wider ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
              Coupled Electro-Thermal Differential Equations (server/battery_physics.py)
            </div>
            <h3 className={`text-xl font-black flex items-center gap-2 mt-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <Activity className="w-5 h-5 text-blue-400" /> Stored Per-Game Battery Dynamics &amp; Graph Inspector
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onGenerateDemoRun}
              className={`px-3.5 py-2 rounded-xl border text-xs font-black flex items-center gap-1.5 cursor-pointer transition ${
                isDark
                  ? 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-400/40 text-amber-200'
                  : 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900 shadow-sm'
              }`}
            >
              <Zap className="w-3.5 h-3.5" /> Generate Sample Run
            </button>
            <button
              type="button"
              onClick={onRefreshHistory}
              className={`px-3.5 py-2 rounded-xl border text-xs font-black cursor-pointer transition ${
                isDark
                  ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                  : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800 shadow-sm'
              }`}
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={onClearHistory}
              className={`px-3.5 py-2 rounded-xl border text-xs font-black cursor-pointer transition ${
                isDark
                  ? 'bg-red-500/15 hover:bg-red-500/25 border-red-400/35 text-red-300'
                  : 'bg-red-50 hover:bg-red-100 border-red-300 text-red-800 shadow-sm'
              }`}
            >
              Clear Archive
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedRun?.id || ''}
            onChange={(e) => setSelectedRunId(e.target.value)}
            className={`flex-1 min-w-[280px] px-4 py-2.5 rounded-xl border text-sm font-bold transition-colors ${
              isDark
                ? 'bg-slate-950 border-slate-700 text-white'
                : 'bg-white border-slate-300 text-slate-900 shadow-sm'
            }`}
          >
            {gameHistory.length === 0 ? (
              <option value="">No student charging runs stored yet — click "Generate Sample Run"</option>
            ) : (
              gameHistory.map((g, i) => (
                <option key={g.id || i} value={g.id}>
                  Run #{gameHistory.length - i} · {g.student_name || 'STEM Explorer'} · {g.current_mA ?? 3000} mA ({g.target_minutes ?? 30} min window) →{' '}
                  {g.success ? 'SUCCESS (100%)' : g.failure_reason || 'FAILED'} · Peak T1: {Number(g.peak_T1_C ?? 42).toFixed(1)}°C
                </option>
              ))
            )}
          </select>

          {selectedRun && (
            <div className="flex flex-wrap gap-2 text-xs">
              <span
                className={`px-3 py-1.5 rounded-full border font-bold ${
                  isDark
                    ? 'bg-slate-900 border-slate-800 text-slate-300'
                    : 'bg-slate-100 border-slate-300 text-slate-700 shadow-sm'
                }`}
              >
                Driver: <b className={isDark ? 'text-white' : 'text-slate-900'}>{selectedRun.student_name || 'STEM Explorer'}</b>
              </span>
              <span
                className={`px-3 py-1.5 rounded-full border font-bold ${
                  isDark
                    ? 'bg-slate-900 border-slate-800 text-slate-300'
                    : 'bg-amber-50 border-amber-200 text-amber-900 shadow-sm'
                }`}
              >
                Current: <b className={isDark ? 'text-amber-300' : 'text-amber-800'}>{selectedRun.current_mA ?? 3000} mA</b>
              </span>
              <span
                className={`px-3 py-1.5 rounded-full border font-bold ${
                  isDark
                    ? 'bg-slate-900 border-slate-800 text-slate-300'
                    : 'bg-red-50 border-red-200 text-red-900 shadow-sm'
                }`}
              >
                Peak Core T1: <b className={isDark ? 'text-red-300' : 'text-red-700'}>{Number(selectedRun.peak_T1_C ?? 42).toFixed(1)}°C</b>
              </span>
              <span
                className={`px-3 py-1.5 rounded-full font-black border ${
                  selectedRun.success
                    ? isDark
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/40'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-sm'
                    : isDark
                    ? 'bg-red-500/15 text-red-300 border-red-400/40'
                    : 'bg-red-50 text-red-800 border-red-300 shadow-sm'
                }`}
              >
                {selectedRun.success ? '✅ 100% Charged Safely' : `❌ ${selectedRun.failure_reason}`}
              </span>
            </div>
          )}
        </div>

        {/* 4 Physics Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className={`rounded-2xl overflow-hidden border ${isDark ? 'border-slate-800 bg-[#070B14]' : 'border-slate-200 bg-white shadow-sm'}`}>
            <canvas ref={socCanvasRef} className="w-full h-[220px] block" />
          </div>
          <div className={`rounded-2xl overflow-hidden border ${isDark ? 'border-slate-800 bg-[#070B14]' : 'border-slate-200 bg-white shadow-sm'}`}>
            <canvas ref={tempCanvasRef} className="w-full h-[220px] block" />
          </div>
          <div className={`rounded-2xl overflow-hidden border ${isDark ? 'border-slate-800 bg-[#070B14]' : 'border-slate-200 bg-white shadow-sm'}`}>
            <canvas ref={voltCanvasRef} className="w-full h-[220px] block" />
          </div>
          <div className={`rounded-2xl overflow-hidden border ${isDark ? 'border-slate-800 bg-[#070B14]' : 'border-slate-200 bg-white shadow-sm'}`}>
            <canvas ref={heatCanvasRef} className="w-full h-[220px] block" />
          </div>
        </div>
      </div>

      {/* Hardware Log Drawer */}
      <details
        className={`rounded-2xl border overflow-hidden transition-colors ${
          isDark
            ? 'bg-[#11182D] border-slate-800'
            : 'bg-white border-slate-200 shadow-md'
        }`}
      >
        <summary
          className={`px-5 py-3.5 text-xs font-extrabold cursor-pointer transition ${
            isDark ? 'text-slate-300 hover:bg-slate-800/40' : 'text-slate-700 hover:bg-slate-50'
          }`}
        >
          🖥️ Live Hardware Serial &amp; WebSocket Telemetry Log ({logs.length} events)
        </summary>
        <pre
          className={`p-4 text-[11px] font-mono max-h-56 overflow-y-auto whitespace-pre-wrap border-t ${
            isDark
              ? 'bg-slate-950 text-slate-300 border-slate-800'
              : 'bg-slate-900 text-slate-200 border-slate-200'
          }`}
        >
          {logs.join('\n')}
        </pre>
      </details>
    </div>
  );
};
